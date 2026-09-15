// 진행자 조작: 타이머·재생 팀·autoplay·패치·재실행·보너스 (docs/WEBSITE_SPEC.md §5, §8). 서버 전용.
import { LIMITS } from '@/lib/contracts';
import { run, tx } from '../db';
import { badRequest, conflict } from '../http';
import type { SessionUser } from '../session';
import { emitGame, emitProgram, emitResult, emitStandings, emitTeams } from './events';
import { runTeamProgram } from './phase';
import { docOf, gameById, mapOf, programOf, requireHost, resultOf, teamOf, type GameRow } from './rows';

/** 타이머 일시정지·재개·추가 (coding 중에만) */
export function controlTimer(
  game: GameRow, user: SessionUser, action: 'pause' | 'resume' | 'add', seconds?: number, nowMs = Date.now(),
): void {
  requireHost(game, user);
  tx(() => {
    const g = gameById(game.id);
    if (g.phase !== 'coding') throw conflict('타이머는 코딩 중에만 조절할 수 있습니다.', 'not_coding');
    const running = g.timer_ends_at !== null;
    if (action === 'pause') {
      if (!running) return;
      const left = Math.max(0, Math.ceil((Date.parse(g.timer_ends_at!) - nowMs) / 1000));
      run('update games set timer_ends_at = null, timer_remaining = ? where id = ?', left, g.id);
    } else if (action === 'resume') {
      if (running) return;
      const left = Math.max(1, g.timer_remaining ?? 0);
      run('update games set timer_ends_at = ?, timer_remaining = null where id = ?',
        new Date(nowMs + left * 1000).toISOString(), g.id);
    } else {
      const s = seconds ?? 30;
      if (!Number.isInteger(s) || s < 1 || s > LIMITS.timerAddMaxSeconds) {
        throw badRequest(`추가 시간은 1~${LIMITS.timerAddMaxSeconds}초입니다.`, 'invalid_input');
      }
      if (running) {
        const base = Math.max(nowMs, Date.parse(g.timer_ends_at!));
        run('update games set timer_ends_at = ? where id = ?', new Date(base + s * 1000).toISOString(), g.id);
      } else {
        run('update games set timer_remaining = ? where id = ?', (g.timer_remaining ?? 0) + s, g.id);
      }
    }
  });
  emitGame(game.id);
}

/** 보드가 보여 준 가장 뒤 실행 순서를 이 팀까지 올린다 (줄지 않는다) */
function raiseShownUpTo(gameId: string, teamId: string, round: number): void {
  run(`update games set shown_up_to = max(shown_up_to,
         coalesce((select run_order from results where team_id = ? and round = ?), 0)) where id = ?`,
    teamId, round, gameId);
}

/**
 * 보드가 재생할 팀 지정 (running·scored).
 * expectTeamId를 주면 지금 재생 팀이 그 팀(null = 아직 없음)일 때만 바꾼다. 아니면 409 running_changed
 * (진행자 탭 두 개의 자동 진행이 한 팀을 두 번 넘기지 않게).
 */
export function selectRunningTeam(game: GameRow, user: SessionUser, teamId: string, expectTeamId?: string | null): void {
  requireHost(game, user);
  const team = teamOf(game, teamId);
  // 라운드는 트랜잭션 안에서 다시 읽은 g의 것을 쓴다 (라우트가 읽은 game은 본문을 읽는 사이 낡을 수 있다)
  const round = tx(() => {
    const g = gameById(game.id);
    if (g.phase !== 'running' && g.phase !== 'scored') {
      throw conflict('실행 단계에서만 재생할 팀을 고를 수 있습니다.', 'not_running');
    }
    if (expectTeamId !== undefined && g.running_team_id !== expectTeamId) {
      throw conflict('이미 다른 곳에서 재생 팀이 바뀌었습니다.', 'running_changed');
    }
    run('update games set running_team_id = ? where id = ?', team.id, g.id);
    raiseShownUpTo(g.id, team.id, g.round);
    // 같은 팀을 다시 골라도 보드가 처음부터 다시 재생하도록 재생 회차를 올린다
    run('update results set run_seq = run_seq + 1 where team_id = ? and round = ?', team.id, g.round);
    return g.round;
  });
  if (resultOf(team.id, round)) emitResult(game.id, team.id);
  emitGame(game.id);
}

/** 자동 넘김 켜기·끄기 */
export function setAutoplay(game: GameRow, user: SessionUser, on: boolean): void {
  requireHost(game, user);
  run('update games set autoplay = ? where id = ?', on ? 1 : 0, game.id);
  emitGame(game.id);
}

/** 패치 허용: running 중 error·dead·stuck이고 패치권이 남은 팀만. 봉인 해제 */
export function allowPatch(game: GameRow, user: SessionUser, teamId: string): void {
  requireHost(game, user);
  const team = teamOf(game, teamId);
  tx(() => {
    const g = gameById(game.id);
    if (g.phase !== 'running') throw conflict('패치는 실행 단계에서만 허용할 수 있습니다.', 'not_running');
    const t = teamOf(g, team.id);
    const r = resultOf(t.id, g.round);
    if (!r) throw conflict('아직 실행 결과가 없습니다.', 'no_result');
    if (!['error', 'dead', 'stuck'].includes(r.outcome)) {
      throw conflict('멈추거나 실패한 팀에만 패치를 허용할 수 있습니다.', 'patch_not_needed');
    }
    if (t.patch_left < 1) throw conflict('이 팀은 패치권을 이미 썼습니다.', 'no_patch_left');
    run('update teams set patch_left = 0 where id = ?', t.id);
    // 되돌리기(running→sealed)에서 패치권을 돌려줄 때 고치기 전 코드도 함께 되돌린다
    run('update programs set prepatch_doc = doc, submitted_at = null where team_id = ? and round = ?', t.id, g.round);
    run('update results set used_patch = 1, reran = 0 where team_id = ? and round = ?', t.id, g.round);
  });
  emitTeams(game.id);
  emitProgram(game.id, team.id, game.round);
  emitResult(game.id, team.id);
}

/**
 * 재실행 (패치 후): 결과를 덮어쓴다. usedPatch=true(−10), 최초 제출 가산점은 다시 주지 않는다.
 * 팀이 아직 다시 제출하지 않았으면 현재 doc으로 봉인한 뒤 실행한다. 보드도 이 팀을 재생한다.
 */
export function rerunTeam(game: GameRow, user: SessionUser, teamId: string, nowMs = Date.now()): void {
  requireHost(game, user);
  const team = teamOf(game, teamId);
  tx(() => {
    const g = gameById(game.id);
    if (g.phase !== 'running') throw conflict('재실행은 실행 단계에서만 할 수 있습니다.', 'not_running');
    const prev = resultOf(team.id, g.round);
    if (!prev || prev.used_patch !== 1) throw conflict('패치를 허용한 팀만 재실행할 수 있습니다.', 'no_patch');
    const p = programOf(team.id, g.round);
    if (!p) throw conflict('프로그램이 없습니다.', 'no_program');
    if (p.submitted_at === null) {
      run('update programs set submitted_at = ? where team_id = ? and round = ?',
        new Date(nowMs).toISOString(), team.id, g.round);
    }
    const doc = docOf(p);
    const r = runTeamProgram(mapOf(g), doc, { firstSubmit: false, usedPatch: true });
    run(`update results set outcome = ?, message = ?, ticks = ?, blocks = ?, mice = ?, trace = ?, used_patch = 1,
           score = ?, score_lines = ?, run_seq = run_seq + 1, doc = ?, reran = 1 where team_id = ? and round = ?`,
      r.outcome, r.message, r.ticks, r.blocks, r.mice, JSON.stringify(r.trace), r.score, JSON.stringify(r.lines),
      JSON.stringify(doc), team.id, g.round);
    run('update games set running_team_id = ? where id = ?', team.id, g.id);
    raiseShownUpTo(g.id, team.id, g.round);
  });
  emitProgram(game.id, team.id, game.round);
  emitTeams(game.id);
  emitResult(game.id, team.id);
  emitStandings(game.id);
  emitGame(game.id);
}

/** 이벤트 카드 수동 점수: 현재 라운드 결과에 더한다 */
export function addBonus(game: GameRow, user: SessionUser, teamId: string, points: number, note: string): void {
  requireHost(game, user);
  const team = teamOf(game, teamId);
  if (!Number.isInteger(points) || points === 0 || Math.abs(points) > LIMITS.bonusMaxAbs) {
    throw badRequest(`점수는 −${LIMITS.bonusMaxAbs}~${LIMITS.bonusMaxAbs} 사이 정수(0 제외)입니다.`, 'invalid_input');
  }
  const text = note.trim().slice(0, 40);
  tx(() => {
    const g = gameById(game.id);
    const r = resultOf(team.id, g.round);
    if (!r) throw conflict('이번 라운드 실행 결과가 있어야 점수를 줄 수 있습니다.', 'no_result');
    const joined = [r.bonus_note, text].filter((s) => s.length > 0).join(' · ');
    run('update results set bonus = bonus + ?, bonus_note = ? where team_id = ? and round = ?',
      points, joined, team.id, g.round);
  });
  emitResult(game.id, team.id);
  emitStandings(game.id);
}
