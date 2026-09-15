// 게임 만들기·목록·참가·이탈·내보내기 (docs/WEBSITE_SPEC.md §3, §5, FEATURE_V4 §1–§3). 서버 전용.
import { randomInt } from 'node:crypto';
import {
  DEFAULT_ROUNDS, GAME_ROLES, LIMITS, TEAM_PRESETS, isRoundList,
  type AssignMode, type GameRole, type GameSummary, type RoundNo,
} from '@/lib/contracts';
import { all, newId, nowIso, one, run, tx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { setSubscriberTeam } from '../realtime';
import type { SessionUser } from '../session';
import { emitRemoved, emitTeams } from './events';
import { emitLobby } from './lobbyFeed';
import {
  availableRounds, gameById, inOtherUnfinishedGame, membershipOf, requireHost, roundsOf, teamHeadcount, teamOf,
  type GameRow, type MemberRow,
} from './rows';

function pickCode(): string {
  const taken = (code: string) => !!one<{ id: string }>('select id from games where code = ?', code);
  for (let i = 0; i < 60; i += 1) {
    const code = String(randomInt(1000, 10000));
    if (!taken(code)) return code;
  }
  // 거의 다 찼으면 순서대로 빈 코드를 찾는다
  const used = new Set(all<{ code: string }>('select code from games').map((r) => r.code));
  for (let n = 1000; n <= 9999; n += 1) if (!used.has(String(n))) return String(n);
  throw conflict('만들 수 있는 게임 코드가 없습니다. 끝난 게임을 지운 뒤 다시 시도해 주세요.', 'no_code');
}

/** 라운드 선택 검사: 1~7 중 1개 이상·오름차순·중복 없음(400 invalid_rounds), 엔진에 있는 라운드만(400 round_unavailable) */
export function checkRounds(input: readonly number[] | undefined): RoundNo[] {
  const rounds: unknown = input === undefined ? [...DEFAULT_ROUNDS] : [...input];
  if (!isRoundList(rounds)) {
    throw badRequest('라운드는 1~7 중에서 1개 이상, 작은 번호부터 중복 없이 골라 주세요.', 'invalid_rounds');
  }
  const have = new Set(availableRounds());
  const missing = rounds.filter((r) => !have.has(r));
  if (missing.length > 0) {
    throw badRequest(`아직 준비되지 않은 라운드입니다 (R${missing.join(', R')}).`, 'round_unavailable');
  }
  return rounds;
}

export interface CreateGameOptions {
  /** 없으면 [1,2,3,4,5] */
  rounds?: readonly number[];
  /** 없으면 'self' (대기실 배정은 waiting.ts의 createGameFromLobby가 한다) */
  mode?: AssignMode;
}

/** 새 게임: 팀 2~10개, 요청자가 진행자. 현재 라운드 = 고른 라운드의 첫 번째 */
export function createGame(user: SessionUser, teamCount: number, opts: CreateGameOptions = {}): GameRow {
  if (user.role !== 'host' && user.role !== 'admin') throw forbidden('진행자만 게임을 만들 수 있습니다.');
  if (!Number.isInteger(teamCount) || teamCount < LIMITS.minTeams || teamCount > LIMITS.maxTeams) {
    throw badRequest(`팀 수는 ${LIMITS.minTeams}~${LIMITS.maxTeams}개입니다.`, 'invalid_input');
  }
  const rounds = checkRounds(opts.rounds);
  const mode = opts.mode ?? 'self';
  if (mode !== 'auto' && mode !== 'self') throw badRequest('배정 방식은 auto 또는 self입니다.', 'invalid_input');
  const game = tx(() => {
    const id = newId();
    const code = pickCode();
    const now = nowIso();
    run('insert into games (id, code, host_id, round, rounds, mode, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      id, code, user.id, rounds[0], JSON.stringify(rounds), mode, now);
    TEAM_PRESETS.slice(0, teamCount).forEach((p, seat) => {
      run('insert into teams (id, game_id, name, color, seat) values (?, ?, ?, ?, ?)', newId(), id, p.name, p.color, seat);
    });
    return one<GameRow>('select * from games where id = ?', id)!;
  });
  emitLobby();
  return game;
}

/** 진행자의 게임 목록 (최신순) */
export function listGamesFor(user: SessionUser): GameSummary[] {
  return all<{
    code: string; host_name: string; round: GameSummary['round']; rounds: string; mode: AssignMode;
    phase: GameSummary['phase']; teams: number; members: number; created_at: string;
  }>(
    `select g.code, u.display_name as host_name, g.round, g.rounds, g.mode, g.phase, g.created_at,
            (select count(*) from teams t where t.game_id = g.id) as teams,
            (select count(distinct m.user_id) from members m where m.game_id = g.id) as members
       from games g join users u on u.id = g.host_id
      where g.host_id = ?
      order by g.created_at desc`,
    user.id,
  ).map((r) => ({
    code: r.code, hostName: r.host_name, round: r.round, rounds: roundsOf(r), mode: r.mode, phase: r.phase,
    teams: r.teams, members: r.members, createdAt: r.created_at,
  }));
}

const TEAM_FULL = `이 팀은 가득 찼습니다 (최대 ${LIMITS.maxMembersPerTeam}명). 다른 팀을 골라 주세요.`;

/** 팀 꽉 참 오류 (409 team_full) */
export function teamFull() {
  return conflict(TEAM_FULL, 'team_full');
}

/** 진행자가 이 게임에서 내보낸 사람인가 (스스로 다시 들어오지 못한다. 진행자가 데려오기·옮기기로만 되돌린다) */
export function kickedFrom(gameId: string, userId: string): boolean {
  return !!one("select 1 from game_exits where game_id = ? and user_id = ? and reason = 'kicked'", gameId, userId);
}

/** 내보낸 사람이 스스로 다시 참가하려 할 때 (409 kicked) */
export function kickedError() {
  return conflict('진행자가 이 게임에서 내보냈어요. 다시 참가하려면 진행자에게 넣어 달라고 하세요.', 'kicked');
}

/** 대기실로 돌아간 사람 표시: 자동 배정(늦게 온 사람·더 데려오기)이 이 게임으로 다시 넣지 않는다 */
export function markExit(gameId: string, userId: string, reason: 'kicked' | 'left'): void {
  run(`insert into game_exits (game_id, user_id, reason, at) values (?, ?, ?, ?)
       on conflict (game_id, user_id) do update set reason = excluded.reason, at = excluded.at`,
    gameId, userId, reason, nowIso());
}

/**
 * 팀 참가: 역할 여러 개 가능, 역할 공유 가능(같은 역할을 여러 명이), 한 게임에 한 팀만, lobby·coding 중에만.
 * 팀의 서로 다른 사람이 이미 6명이면 409 team_full.
 * 다른 끝나지 않은 게임의 팀원이면 409 in_other_game (한 사람은 끝나지 않은 게임 하나에만: assign·참가 버튼·자동 배정과 같은 규칙).
 */
export function joinGame(game: GameRow, user: SessionUser, teamId: string, roles: GameRole[]): { teamId: string; roles: GameRole[] } {
  if (game.phase !== 'lobby' && game.phase !== 'coding') {
    throw conflict('지금은 참가할 수 없습니다. 대기실이나 코딩 중에만 참가할 수 있어요.', 'join_closed');
  }
  const wanted = [...new Set(roles)];
  if (wanted.length === 0 || wanted.some((r) => !GAME_ROLES.includes(r))) throw badRequest('역할을 하나 이상 골라 주세요.', 'invalid_input');
  const team = teamOf(game, teamId);
  const result = tx(() => {
    // 요청 본문을 읽는 사이 페이즈가 바뀌었을 수 있으니 트랜잭션 안에서 다시 읽는다
    const g = gameById(game.id);
    if (g.phase !== 'lobby' && g.phase !== 'coding') {
      throw conflict('지금은 참가할 수 없습니다. 대기실이나 코딩 중에만 참가할 수 있어요.', 'join_closed');
    }
    const mine = membershipOf(game.id, user.id);
    // 한 사람은 끝나지 않은 게임 하나에만 (FEATURE_V4 §3: 로그인·/me·대기 판정이 모두 "그" 게임 하나를 가정한다).
    // 이미 이 게임의 팀원이면 역할을 더 맡는 것이라 검사하지 않는다.
    if (!mine.teamId && inOtherUnfinishedGame(user.id, g.id)) {
      throw conflict('이미 다른 게임에 참가 중입니다. 지금 게임이 끝난 뒤에 참가할 수 있어요.', 'in_other_game');
    }
    if (mine.teamId && mine.teamId !== team.id) {
      throw conflict('이미 다른 팀에 참가했습니다. 먼저 역할을 반납해 주세요.', 'other_team');
    }
    // 진행자가 내보낸 사람은 스스로 다시 들어오지 못한다 (FEATURE_V4 §3.6: 대기실로 돌아간다)
    if (!mine.teamId && kickedFrom(game.id, user.id)) throw kickedError();
    // 게임이 시작된 뒤에는 처음 들어간 팀에만 다시 들어갈 수 있다 (다른 팀으로 옮겨 코드를 보거나 지우는 것 방지)
    if (g.phase !== 'lobby') {
      const bound = one<{ team_id: string }>(
        'select team_id from game_players where game_id = ? and user_id = ?', game.id, user.id);
      if (bound && bound.team_id !== team.id) {
        throw conflict('게임이 시작된 뒤에는 처음 참가한 팀에만 들어갈 수 있습니다.', 'other_team');
      }
    }
    // 인원 검사는 트랜잭션 안에서: 이미 이 팀이면 인원이 늘지 않는다
    if (mine.teamId !== team.id && teamHeadcount(team.id, user.id) >= LIMITS.maxMembersPerTeam) throw teamFull();
    const now = nowIso();
    for (const r of wanted) {
      if (mine.roles.includes(r)) continue;
      run('insert into members (id, game_id, team_id, user_id, role, joined_at) values (?, ?, ?, ?, ?, ?)',
        newId(), game.id, team.id, user.id, r, now);
    }
    // 이 게임에서 속한 팀 기록 (members 행이 지워져도 남는다). 대기실에서는 팀을 바꿀 수 있다.
    run(`insert into game_players (game_id, user_id, team_id) values (?, ?, ?)
         on conflict (game_id, user_id) do update set team_id = excluded.team_id`, game.id, user.id, team.id);
    run('delete from game_exits where game_id = ? and user_id = ?', game.id, user.id);
    return membershipOf(game.id, user.id);
  });
  setSubscriberTeam(game.id, user.id, result.teamId);
  emitTeams(game.id);
  emitLobby();
  return { teamId: team.id, roles: result.roles };
}

/** 내 역할 전부 반납: 대기실에서만 (게임이 시작된 뒤 팀을 옮겨 다니지 못하게). 대기실로 돌아간다 */
export function leaveGame(game: GameRow, user: SessionUser): void {
  tx(() => {
    const g = gameById(game.id);
    if (g.phase !== 'lobby') throw conflict('대기실에서만 역할을 반납할 수 있습니다.', 'leave_closed');
    const res = run('delete from members where game_id = ? and user_id = ?', game.id, user.id);
    if (res.changes === 0) throw notFound('이 게임에 참가하지 않았습니다.');
    run('delete from game_players where game_id = ? and user_id = ?', game.id, user.id);
    markExit(game.id, user.id, 'left');
  });
  setSubscriberTeam(game.id, user.id, null);
  emitTeams(game.id);
  emitLobby();
}

/**
 * 진행자: 팀원 내보내기. 문자열 또는 {memberId} = 역할 1개, {userId} = 그 사람의 역할 전부.
 * 역할이 하나도 남지 않으면 대기실로 돌아가고(자동 배정은 이 게임을 건너뜀) 게임 채널에 'removed'가 간다.
 */
export function kickMember(game: GameRow, user: SessionUser, target: string | { memberId?: string; userId?: string }): void {
  requireHost(game, user);
  const t = typeof target === 'string' ? { memberId: target } : target;
  let userId: string;
  let ids: string[];
  if (t.memberId) {
    const m = one<MemberRow>('select * from members where id = ? and game_id = ?', t.memberId, game.id);
    if (!m) throw notFound('팀원을 찾을 수 없습니다.');
    userId = m.user_id;
    ids = [m.id];
  } else if (t.userId) {
    const rows = all<MemberRow>('select * from members where game_id = ? and user_id = ?', game.id, t.userId);
    if (rows.length === 0) throw notFound('팀원을 찾을 수 없습니다.');
    userId = t.userId;
    ids = rows.map((r) => r.id);
  } else {
    throw badRequest('내보낼 팀원을 골라 주세요.', 'invalid_input');
  }
  const gone = tx(() => {
    for (const id of ids) run('delete from members where id = ?', id);
    const empty = membershipOf(game.id, userId).teamId === null;
    if (empty) {
      // 대기실에서 역할이 모두 없어지면 팀 기록도 지운다. 게임이 시작된 뒤에는 남겨서 다른 팀으로 못 옮기게 한다.
      if (gameById(game.id).phase === 'lobby') run('delete from game_players where game_id = ? and user_id = ?', game.id, userId);
      markExit(game.id, userId, 'kicked');
    }
    return empty;
  });
  setSubscriberTeam(game.id, userId, membershipOf(game.id, userId).teamId);
  if (gone) emitRemoved(game.id, userId);
  emitTeams(game.id);
  emitLobby();
}
