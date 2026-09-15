// 페이즈 상태기계·실행·자동 봉인 (docs/WEBSITE_SPEC.md §8). 서버 전용.
import { nextRoundOf, prevRoundOf, type Phase } from '@/lib/contracts';
import type { Block, GameMap, ScoreLine, Step } from '@/lib/engine';
import { countBlocks, run as runEngine, score, validate } from '@/lib/engine';
import { all, one, run, tx } from '../db';
import { badRequest, conflict } from '../http';
import type { SessionUser } from '../session';
import { emitGame, emitProgram, emitResult, emitStandings, emitTeams } from './events';
import { emitLobby } from './lobbyFeed';
import {
  docOf, gameById, mapOf, programOf, programsOf, requireHost, resultOf, roundsOf, teamsOf,
  type GameRow, type ProgramRow,
} from './rows';

export interface TeamRun {
  outcome: 'goal' | 'error' | 'dead' | 'stuck';
  message: string;
  ticks: number;
  blocks: number;
  mice: number;
  trace: Step[];
  score: number;
  lines: ScoreLine[];
}

/** 한 팀 실행: validate 실패면 컴파일 에러(초기 프레임 1개, 0점), 통과면 run → score */
export function runTeamProgram(map: GameMap, doc: Block[], ctx: { firstSubmit: boolean; usedPatch: boolean }): TeamRun {
  const check = validate(doc, map);
  if (!check.ok) {
    const initial = runEngine(map, []).trace.slice(0, 1);
    const lines: ScoreLine[] = [{ label: '컴파일 에러', points: 0 }];
    if (ctx.usedPatch) lines.push({ label: '패치권 사용', points: -10 });
    return {
      outcome: 'error',
      message: `컴파일 에러: ${check.errors.join(', ')}`,
      ticks: 0,
      blocks: countBlocks(doc),
      mice: 0,
      trace: initial,
      score: 0,
      lines,
    };
  }
  const r = runEngine(map, doc);
  const s = score(r, { cap: map.cap, firstSubmit: ctx.firstSubmit, usedPatch: ctx.usedPatch });
  return {
    outcome: r.outcome, message: r.message, ticks: r.ticks, blocks: r.blocks, mice: r.mice,
    trace: r.trace, score: s.total, lines: s.lines,
  };
}

function isFirstSubmit(p: ProgramRow | undefined): boolean {
  return !!p && p.submit_order === 1 && p.sealed_by === 'architect';
}

/**
 * 전이 표: 앞으로 가기와 한 단계 되돌리기. 라운드는 고른 라운드 목록 안에서만 움직인다 (FEATURE_V4 §1):
 * scored → coding은 다음 선택 라운드가 있을 때, scored → finished는 마지막 선택 라운드일 때,
 * coding → lobby는 첫 선택 라운드일 때, coding → scored(되돌리기)는 이전 선택 라운드가 있을 때.
 */
function allowed(game: GameRow, to: Phase): boolean {
  const rounds = roundsOf(game);
  const i = rounds.indexOf(game.round);
  const hasPrev = i > 0;
  const hasNext = i >= 0 && i < rounds.length - 1;
  const isLast = i === rounds.length - 1;
  switch (game.phase) {
    case 'lobby': return to === 'coding';
    case 'coding': return to === 'sealed' || (to === 'lobby' && !hasPrev) || (to === 'scored' && hasPrev);
    case 'sealed': return to === 'running' || to === 'coding';
    case 'running': return to === 'scored' || to === 'sealed';
    case 'scored': return (to === 'coding' && hasNext) || (to === 'finished' && isLast) || to === 'running';
    case 'finished': return to === 'scored';
  }
}

function secondsLeft(game: GameRow, nowMs: number): number {
  if (game.timer_ends_at) return Math.max(0, Math.ceil((Date.parse(game.timer_ends_at) - nowMs) / 1000));
  return Math.max(0, game.timer_remaining ?? 0);
}

function enterCoding(game: GameRow, round: number, nowMs: number): void {
  const map = mapOf({ round: round as GameRow['round'] });
  for (const t of teamsOf(game.id)) {
    run(`insert or ignore into programs (team_id, round, game_id) values (?, ?, ?)`, t.id, round, game.id);
  }
  run(`update games set phase = 'coding', round = ?, timer_ends_at = ?, timer_remaining = null, running_team_id = null,
        shown_up_to = 0 where id = ?`, round, new Date(nowMs + map.seconds * 1000).toISOString(), game.id);
}

function enterSealed(game: GameRow, nowMs: number): void {
  const at = new Date(nowMs).toISOString();
  let next = (one<{ m: number | null }>(
    'select max(submit_order) as m from programs where game_id = ? and round = ?', game.id, game.round,
  )?.m ?? 0);
  // 미제출 팀은 현재 doc 그대로 자동 봉인, 제출 순서는 뒤에 (자리 순)
  const open = all<ProgramRow & { seat: number }>(
    `select p.*, t.seat from programs p join teams t on t.id = p.team_id
      where p.game_id = ? and p.round = ? and p.submitted_at is null order by t.seat`, game.id, game.round);
  for (const p of open) {
    next += 1;
    run(`update programs set submitted_at = ?, submit_order = ?, sealed_by = 'auto' where team_id = ? and round = ?`,
      at, next, p.team_id, p.round);
  }
  run(`update games set phase = 'sealed', timer_remaining = ?, timer_ends_at = null where id = ?`,
    secondsLeft(game, nowMs), game.id);
}

function enterRunning(game: GameRow): void {
  const map = mapOf(game);
  const seat = new Map(teamsOf(game.id).map((t) => [t.id, t.seat]));
  const programs = programsOf(game.id, game.round).filter((p) => seat.has(p.team_id)).sort(
    (a, b) => (a.submit_order ?? 1e9) - (b.submit_order ?? 1e9) || (seat.get(a.team_id)! - seat.get(b.team_id)!),
  );
  run('delete from results where game_id = ? and round = ?', game.id, game.round);
  programs.forEach((p, i) => {
    const doc = docOf(p);
    const r = runTeamProgram(map, doc, { firstSubmit: isFirstSubmit(p), usedPatch: false });
    // doc = 실제로 실행한 코드 (보드가 trace와 같은 코드를 보여 준다)
    run(`insert into results (team_id, round, game_id, outcome, message, ticks, blocks, mice, trace, used_patch,
           score, score_lines, bonus, bonus_note, run_order, doc, reran)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, '', ?, ?, 0)`,
      p.team_id, game.round, game.id, r.outcome, r.message, r.ticks, r.blocks, r.mice,
      JSON.stringify(r.trace), r.score, JSON.stringify(r.lines), i + 1, JSON.stringify(doc));
  });
  run(`update games set phase = 'running', running_team_id = ?, shown_up_to = ? where id = ?`,
    programs[0]?.team_id ?? null, programs.length > 0 ? 1 : 0, game.id);
}

/** coding을 취소할 때: 이 라운드의 제출·봉인 기록을 지운다 (다시 coding에 들어오면 새로 시작) */
function resetRoundSubmissions(game: GameRow): void {
  run(`update programs set submitted_at = null, submit_order = null, sealed_by = null, prepatch_doc = null
        where game_id = ? and round = ?`, game.id, game.round);
}

/** sealed → coding: 자동 봉인만 풀고 타이머는 일시정지 상태로 (최소 30초) */
function undoSealed(game: GameRow): void {
  run(`update programs set submitted_at = null, submit_order = null, sealed_by = null
        where game_id = ? and round = ? and sealed_by = 'auto'`, game.id, game.round);
  run(`update games set phase = 'coding', timer_ends_at = null, timer_remaining = ? where id = ?`,
    Math.max(30, game.timer_remaining ?? 0), game.id);
}

/**
 * running → sealed: 이 라운드 결과(이벤트 점수 포함) 삭제, 이 라운드에 쓴 패치권은 돌려준다.
 * 패치권을 돌려주는 팀은 패치 중에 고친 코드도 패치 전 코드로 되돌린다 (공짜 패치 방지).
 */
function undoRunning(game: GameRow, nowMs: number): void {
  const patched = all<{ team_id: string }>(
    'select team_id from results where game_id = ? and round = ? and used_patch = 1', game.id, game.round);
  for (const r of patched) {
    run('update teams set patch_left = 1 where id = ?', r.team_id);
    const p = programOf(r.team_id, game.round);
    if (p && p.prepatch_doc !== null) {
      const before = docOf({ ...p, doc: p.prepatch_doc });
      run(`update programs set doc = ?, blocks = ?, version = version + 1, prepatch_doc = null
            where team_id = ? and round = ?`, p.prepatch_doc, countBlocks(before), r.team_id, game.round);
    }
  }
  run('update programs set prepatch_doc = null where game_id = ? and round = ?', game.id, game.round);
  run(`update programs set submitted_at = ? where game_id = ? and round = ? and submitted_at is null`,
    new Date(nowMs).toISOString(), game.id, game.round);
  run('delete from results where game_id = ? and round = ?', game.id, game.round);
  run(`update games set phase = 'sealed', running_team_id = null, shown_up_to = 0 where id = ?`, game.id);
}

/** 패치를 허용했지만 아직 재실행하지 않은 팀 수 (이번 라운드) */
export function pendingPatchCount(gameId: string, round: number): number {
  return one<{ n: number }>(
    'select count(*) as n from results where game_id = ? and round = ? and used_patch = 1 and reran = 0', gameId, round,
  )?.n ?? 0;
}

/**
 * 조건부 전이: 현재 페이즈가 expect일 때만 적용한다. 적용했으면 true.
 * 진행자 요청(transitionPhase)과 타이머 틱커(tickAutoSeal)가 함께 쓴다.
 */
export function applyTransition(gameId: string, to: Phase, expect: Phase, nowMs = Date.now()): boolean {
  const done = tx(() => {
    const game = gameById(gameId);
    if (game.phase !== expect) return null;
    if (!allowed(game, to)) throw badRequest('그 단계로는 바로 갈 수 없습니다.', 'bad_transition');
    const rounds = roundsOf(game);
    const from = game.phase;
    if (from === 'lobby' && to === 'coding') enterCoding(game, rounds[0], nowMs);
    else if (from === 'scored' && to === 'coding') enterCoding(game, nextRoundOf(rounds, game.round)!, nowMs);
    else if (from === 'coding' && to === 'sealed') enterSealed(game, nowMs);
    else if (from === 'sealed' && to === 'running') enterRunning(game);
    else if (from === 'sealed' && to === 'coding') undoSealed(game);
    else if (from === 'running' && to === 'sealed') undoRunning(game, nowMs);
    else if (from === 'coding' && to === 'lobby') {
      resetRoundSubmissions(game);
      run(`update games set phase = 'lobby', timer_ends_at = null, timer_remaining = null where id = ?`, game.id);
    } else if (from === 'coding' && to === 'scored') {
      resetRoundSubmissions(game);
      // 이전 라운드는 보드가 모든 팀을 보여 준 채 끝났다: 공개 상태(shown_up_to·마지막 재생 팀)를 되살려
      // scored → running으로 한 번 더 되돌려도 팀 화면이 이미 본 결과를 다시 숨기지 않게 한다
      const prev = prevRoundOf(rounds, game.round)!;
      const last = one<{ team_id: string; run_order: number }>(
        'select team_id, run_order from results where game_id = ? and round = ? order by run_order desc limit 1', game.id, prev);
      run(`update games set phase = 'scored', round = ?, timer_ends_at = null, timer_remaining = null,
            running_team_id = ?, shown_up_to = ? where id = ?`,
        prev, last?.team_id ?? null, last?.run_order ?? 0, game.id);
    } else if (from === 'finished' && to === 'scored') {
      // 끝난 게임의 팀원은 다시 대기 중이라 새 게임에 배정됐을 수 있다 → 되돌리면 두 게임의 팀원이 된다 (막는다)
      const busy = one(
        `select 1 from members m join members m2 on m2.user_id = m.user_id join games g2 on g2.id = m2.game_id
          where m.game_id = ? and m2.game_id <> ? and g2.phase <> 'finished' limit 1`, game.id, game.id);
      if (busy) {
        throw conflict('이 게임의 팀원이 이미 다른 게임에 참가 중이라 되돌릴 수 없습니다.', 'members_in_other_game');
      }
      run("update games set phase = 'scored' where id = ?", game.id);
    } else if (from === 'running' && to === 'scored') {
      // 패치를 허용하고 재실행하지 않은 채 확정하면 패치권만 사라지고 옛 결과가 '패치 사용'으로 남는다 → 막는다
      if (pendingPatchCount(game.id, game.round) > 0) {
        throw conflict(
          '패치를 허용한 팀이 아직 재실행되지 않았습니다. 재실행하거나 이전 페이즈로 되돌린 뒤 점수를 확정하세요.',
          'patch_pending',
        );
      }
      run("update games set phase = 'scored' where id = ?", game.id);
    } else {
      // scored → running, scored → finished: 페이즈만 바뀐다
      run('update games set phase = ? where id = ?', to, game.id);
    }
    return { fromRound: game.round };
  });
  if (!done) return false;
  const game = gameById(gameId);
  emitGame(gameId);
  emitTeams(gameId);
  // 대기실의 "열린 게임"·대기 명단(끝난 게임 팀원은 다시 대기)이 바뀔 수 있다
  emitLobby();
  // coding → scored 되돌리기면 취소한 라운드(전이 전 라운드)의 프로그램을 알린다
  const programRound = to === 'scored' && expect === 'coding' ? done.fromRound : game.round;
  if (to === 'sealed' || (expect === 'sealed' && to === 'coding') || expect === 'running') {
    for (const t of teamsOf(gameId)) emitProgram(gameId, t.id, programRound);
  }
  if (to === 'running' || (expect === 'running' && to === 'sealed')) {
    for (const t of teamsOf(gameId)) if (to === 'sealed' || resultOf(t.id, game.round)) emitResult(gameId, t.id);
    emitStandings(gameId);
  }
  if (to === 'scored' || to === 'finished') emitStandings(gameId);
  return true;
}

/** POST /phase: 진행자만. expect가 안 맞으면 409 (두 탭 이중 전이 방지) */
export function transitionPhase(game: GameRow, user: SessionUser, to: Phase, expect: Phase): void {
  requireHost(game, user);
  if (!applyTransition(game.id, to, expect)) {
    throw conflict('이미 다른 곳에서 단계가 바뀌었습니다. 화면을 새로 고쳤어요.', 'phase_changed');
  }
}

/** 1초 틱커: coding 중 타이머가 끝난 게임을 자동 봉인한다. 봉인한 게임 id 목록을 돌려준다. */
export function tickAutoSeal(nowMs = Date.now()): string[] {
  const due = all<{ id: string }>(
    `select id from games where phase = 'coding' and timer_ends_at is not null and timer_ends_at <= ?`,
    new Date(nowMs).toISOString());
  const sealed: string[] = [];
  for (const g of due) {
    try {
      if (applyTransition(g.id, 'sealed', 'coding', nowMs)) sealed.push(g.id);
    } catch (err) {
      console.error('[game] auto-seal', g.id, err);
    }
  }
  return sealed;
}
