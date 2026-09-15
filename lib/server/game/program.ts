// 프로그램 저장·제출 (docs/WEBSITE_SPEC.md §5). 서버 전용.
import type { Block, BlockId } from '@/lib/engine';
import { BLOCKS, ROLES, countBlocks } from '@/lib/engine/blocks';
import { validate } from '@/lib/engine/validate';
import type { ProgramSaveResponse, SubmitResponse } from '@/lib/contracts';
import { nowIso, one, run, tx } from '../db';
import { badRequest, conflict, forbidden } from '../http';
import type { SessionUser } from '../session';
import { addedBlockIds } from '../docSchema';
import { emitProgram, emitTeams } from './events';
import {
  docOf, gameById, isPatchActive, mapOf, membershipOf, programOf, teamOf,
  type GameRow, type ProgramRow, type TeamRow,
} from './rows';

type GameRoleList = ReturnType<typeof membershipOf>['roles'];

function requireMember(game: GameRow, user: SessionUser): { team: TeamRow; roles: GameRoleList } {
  const m = membershipOf(game.id, user.id);
  if (!m.teamId) throw forbidden('이 게임의 팀원이 아닙니다.', 'not_member');
  return { team: teamOf(game, m.teamId), roles: m.roles };
}

/** 지금 이 팀이 프로그램을 고칠 수 있는가 (없으면 이유 HttpError) */
function assertEditable(game: GameRow, team: TeamRow, p: ProgramRow | undefined): ProgramRow {
  const patch = isPatchActive(game, team, p);
  if (!p || (game.phase !== 'coding' && !patch)) {
    throw conflict('지금은 프로그램을 고칠 수 없습니다.', 'not_editable');
  }
  if (p.submitted_at !== null) throw conflict('봉인된 프로그램은 고칠 수 없습니다.', 'sealed');
  return p;
}

/**
 * 트랜잭션 안에서 부른다: 게임·팀원·팀·프로그램을 DB에서 다시 읽는다.
 * 라우트가 읽어 온 game은 그 사이 낡을 수 있다(진행자가 페이즈를 바꿈·타이머 자동 봉인) →
 * 페이즈·라운드·봉인·패치 상태를 쓰기와 같은 트랜잭션에서 확인한다.
 */
function lockedEditable(stale: GameRow, user: SessionUser, opts: { architect?: boolean; round?: number } = {}) {
  const game = gameById(stale.id);
  const { team, roles } = requireMember(game, user);
  if (opts.architect && !roles.includes('architect')) throw forbidden('제출은 아키텍트만 할 수 있습니다.', 'not_architect');
  // round = 클라이언트가 이 저장·제출을 만든 라운드. 늦게 도착한 지난 라운드 요청이 새 라운드에 들어가지 않게 한다
  if (game.round !== stale.round || (opts.round !== undefined && game.round !== opts.round)) {
    throw conflict('지금은 프로그램을 고칠 수 없습니다.', 'not_editable');
  }
  const p = assertEditable(game, team, programOf(team.id, game.round));
  return { game, team, roles, p };
}

/** 역할 검사: 개수가 늘어난 블록 id는 요청자 역할의 블록이어야 한다 */
export function roleViolations(prev: Block[], next: Block[], roles: readonly string[]): BlockId[] {
  const allowed = new Set<BlockId>();
  for (const r of roles) for (const id of ROLES[r as keyof typeof ROLES]?.blocks ?? []) allowed.add(id);
  return addedBlockIds(prev, next).filter((id) => !allowed.has(id));
}

/** PUT /program: 버전이 맞을 때만 저장하고 version+1. expectRound가 있으면 지금 라운드와 같아야 한다 */
export function saveProgram(
  game: GameRow, user: SessionUser, doc: Block[], baseVersion: number, expectRound?: number,
): ProgramSaveResponse {
  const { teamId, round, ...saved } = tx(() => {
    const { game: g, team, roles, p } = lockedEditable(game, user, { round: expectRound });
    const prev = docOf(p);
    if (p.version !== baseVersion) {
      throw conflict('다른 팀원이 먼저 바꿨어요.', 'version_conflict', { doc: prev, version: p.version, blocks: p.blocks });
    }
    const bad = roleViolations(prev, doc, roles);
    if (bad.length > 0) {
      const names = bad.map((id) => BLOCKS[id].label).join(', ');
      throw forbidden(`내 역할이 아닌 블록은 새로 놓을 수 없습니다 (${names}).`, 'role_block');
    }
    const blocks = countBlocks(doc);
    const version = p.version + 1;
    // 조건절에 봉인·버전을 한 번 더 건다 (같은 트랜잭션이라 바뀔 일은 없지만 쓰기 자체도 안전하게)
    const res = run(
      `update programs set doc = ?, version = ?, blocks = ?
        where team_id = ? and round = ? and version = ? and submitted_at is null`,
      JSON.stringify(doc), version, blocks, team.id, g.round, p.version);
    if (res.changes !== 1) throw conflict('지금은 프로그램을 고칠 수 없습니다.', 'not_editable');
    return { teamId: team.id, round: g.round, version, blocks };
  });
  emitProgram(game.id, teamId, round);
  return saved;
}

/** POST /submit: architect만, validate 통과해야 봉인. expectRound가 있으면 지금 라운드와 같아야 한다 */
export function submitProgram(game: GameRow, user: SessionUser, expectRound?: number): SubmitResponse {
  const { teamId, round, ...out } = tx(() => {
    const { game: g, team, p } = lockedEditable(game, user, { architect: true, round: expectRound });
    const check = validate(docOf(p), mapOf(g));
    if (!check.ok) {
      throw badRequest('제출할 수 없는 프로그램입니다.', 'invalid_program', { errors: check.errors });
    }
    const submittedAt = nowIso();
    let order = p.submit_order;
    if (order === null) {
      order = (one<{ m: number | null }>(
        'select max(submit_order) as m from programs where game_id = ? and round = ?', g.id, g.round,
      )?.m ?? 0) + 1;
    }
    // 패치 재제출이면 원래 순서·봉인 주체를 유지한다
    const res = run(`update programs set submitted_at = ?, submit_order = ?, sealed_by = coalesce(sealed_by, 'architect')
          where team_id = ? and round = ? and submitted_at is null`, submittedAt, order, team.id, g.round);
    if (res.changes !== 1) throw conflict('봉인된 프로그램은 고칠 수 없습니다.', 'sealed');
    return { teamId: team.id, round: g.round, submittedAt, submitOrder: order };
  });
  emitProgram(game.id, teamId, round);
  emitTeams(game.id);
  return out;
}
