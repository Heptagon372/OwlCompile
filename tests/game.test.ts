// 게임 서버 테스트 (docs/WEBSITE_SPEC.md §10): 역할 검사, 버전 충돌, 제출 순서, 조건부 전이, 자동 봉인, 실행·점수, 패치.
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameRole } from '@/lib/contracts';
import { MAPS, ROUND_EXTRAS, SOLUTIONS, type Block } from '@/lib/engine';
import { newId, nowIso, one, resetDb, run } from '@/lib/server/db';
import { HttpError } from '@/lib/server/http';
import { subscribe, type BusEvent } from '@/lib/server/realtime';
import type { SessionUser } from '@/lib/server/session';
import { parseDoc } from '@/lib/server/docSchema';
import {
  addBonus, allowPatch, applyTransition, computeStandings, controlTimer, createGame, gameById, joinGame,
  kickMember, leaveGame, programOf, rerunTeam, resultOf, saveProgram, submitProgram, teamsOf, tickAutoSeal,
  transitionPhase, type GameRow,
} from '@/lib/server/game';
import { buildView } from '@/lib/server/views';
import { selectRunningTeam } from '@/lib/server/game/ops';
import { resultRevealed } from '@/components/play/reveal';

const ALL: GameRole[] = ['runner', 'turner', 'controller', 'architect'];

function mkUser(role: SessionUser['role'] = 'player', name = `u${Math.random().toString(36).slice(2, 8)}`): SessionUser {
  const id = newId();
  run(`insert into users (id, username, display_name, password_hash, role, created_at) values (?, ?, ?, 'x', ?, ?)`,
    id, name, name, role, nowIso());
  return { id, username: name, displayName: name, role, status: 'active', mustChangePassword: false };
}

/** 에러 코드·상태를 꺼낸다 */
function caught(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err;
    throw err;
  }
  throw new Error('예외가 나지 않았다');
}

const fresh = (g: GameRow) => gameById(g.id);

function save(g: GameRow, u: SessionUser, doc: Block[]) {
  const game = fresh(g);
  const m = one<{ team_id: string }>('select team_id from members where game_id = ? and user_id = ?', game.id, u.id)!;
  const p = programOf(m.team_id, game.round)!;
  return saveProgram(game, u, doc, p.version);
}

/** 진행자 1명, 팀 4개. A팀은 한 사람이 역할 4개, B팀도 한 사람이 역할 4개 */
function setup() {
  const host = mkUser('host', 'host');
  const game = createGame(host, 4);
  const teams = teamsOf(game.id);
  const a = mkUser('player', 'alice');
  const b = mkUser('player', 'bob');
  joinGame(game, a, teams[0].id, ALL);
  joinGame(game, b, teams[1].id, ALL);
  return { host, game, teams, a, b };
}

/** 라운드 n의 coding까지 진행 */
function advanceTo(game: GameRow, round: number, nowMs = Date.now()) {
  applyTransition(game.id, 'coding', 'lobby', nowMs);
  while (fresh(game).round < round) {
    applyTransition(game.id, 'sealed', 'coding', nowMs);
    applyTransition(game.id, 'running', 'sealed', nowMs);
    applyTransition(game.id, 'scored', 'running', nowMs);
    applyTransition(game.id, 'coding', 'scored', nowMs);
  }
}

beforeEach(() => {
  resetDb();
});

describe('게임 만들기·참가', () => {
  it('팀 2~10개, 4자리 코드, 프리셋 이름·색', () => {
    const host = mkUser('host');
    const g = createGame(host, 6);
    expect(g.code).toMatch(/^\d{4}$/);
    expect(teamsOf(g.id).map((t) => t.name)).toEqual(['수리부엉이', '올빼미', '소쩍새', '흰올빼미', '금눈쇠올빼미', '칡부엉이']);
    expect(teamsOf(createGame(host, 2).id)).toHaveLength(2);
    expect(caught(() => createGame(host, 1)).status).toBe(400);
    expect(caught(() => createGame(host, 11)).status).toBe(400);
    expect(caught(() => createGame(mkUser('player'), 4)).status).toBe(403);
  });

  it('한 게임에 한 팀만, 역할 공유 가능(role_taken 없음), 여러 역할 가능', () => {
    const { game, teams, a } = setup();
    const c = mkUser();
    expect(caught(() => joinGame(game, a, teams[2].id, ['runner'])).code).toBe('other_team');
    // 앨리스가 이미 러너인 팀에 두 번째 러너로 들어갈 수 있다
    expect(joinGame(game, c, teams[0].id, ['runner']).roles).toEqual(['runner']);
    leaveGame(game, c);
    const joined = joinGame(game, c, teams[2].id, ['runner', 'architect']);
    expect(joined.roles).toEqual(['runner', 'architect']);
    leaveGame(game, c);
    expect(buildView(fresh(game), c).me.teamId).toBeNull();
  });

  it('진행자는 팀원을 내보낼 수 있고 참가자는 못 한다', () => {
    const { game, host, a, b } = setup();
    const member = one<{ id: string }>('select id from members where user_id = ? and role = ?', a.id, 'runner')!;
    expect(caught(() => kickMember(game, b, member.id)).status).toBe(403);
    kickMember(game, host, member.id);
    expect(buildView(fresh(game), a).me.roles).toEqual(['turner', 'controller', 'architect']);
  });

  it('sealed 이후에는 참가할 수 없다', () => {
    const { game, teams } = setup();
    advanceTo(game, 1);
    applyTransition(game.id, 'sealed', 'coding');
    expect(caught(() => joinGame(fresh(game), mkUser(), teams[3].id, ['runner'])).code).toBe('join_closed');
  });
});

describe('프로그램 저장', () => {
  it('역할 검사: 새로 놓기는 자기 역할만, 이동·삭제는 누구나', () => {
    const { game, teams } = setup();
    const runner = mkUser();
    const turner = mkUser();
    joinGame(game, runner, teams[2].id, ['runner']);
    joinGame(game, turner, teams[2].id, ['turner']);
    advanceTo(game, 1);
    expect(save(game, runner, [{ id: 'forward' }]).version).toBe(1);
    const denied = caught(() => save(game, runner, [{ id: 'forward' }, { id: 'left' }]));
    expect(denied.status).toBe(403);
    expect(denied.code).toBe('role_block');
    // 터너가 러너 블록을 옮기고(자기 블록 추가) 지우는 것은 된다
    expect(save(game, turner, [{ id: 'left' }, { id: 'forward' }]).version).toBe(2);
    expect(save(game, turner, [{ id: 'left' }]).blocks).toBe(1);
  });

  it('버전 충돌이면 409와 서버 doc/version/blocks', () => {
    const { game, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, [{ id: 'forward' }]);
    const err = caught(() => saveProgram(fresh(game), a, [{ id: 'jump' }], 0));
    expect(err.status).toBe(409);
    expect(err.code).toBe('version_conflict');
    expect(err.extra).toEqual({ doc: [{ id: 'forward' }], version: 1, blocks: 1 });
    expect(programOf(teams[0].id, 1)!.version).toBe(1);
  });

  it('coding이 아니면 저장할 수 없다, 팀원이 아니면 403', () => {
    const { game, host, a } = setup();
    expect(caught(() => saveProgram(fresh(game), a, [], 0)).code).toBe('not_editable');
    advanceTo(game, 1);
    expect(caught(() => saveProgram(fresh(game), host, [], 0)).code).toBe('not_member');
  });

  it('doc 스키마·한도 검사', () => {
    expect(parseDoc([{ id: 'repeat', n: 3, body: [{ id: 'forward', uid: 'x1' }] }])).toHaveLength(1);
    expect(caught(() => parseDoc([{ id: 'repeat', n: 10, body: [] }])).code).toBe('invalid_doc');
    expect(caught(() => parseDoc([{ id: 'fly' }])).code).toBe('invalid_doc');
    expect(caught(() => parseDoc([{ id: 'forward', uid: 'x'.repeat(41) }])).code).toBe('invalid_doc');
    expect(caught(() => parseDoc(Array.from({ length: 81 }, () => ({ id: 'forward' })))).code).toBe('doc_too_large');
    let deep: unknown[] = [{ id: 'forward' }];
    for (let i = 0; i < 8; i += 1) deep = [{ id: 'repeat', n: 2, body: deep }];
    expect(caught(() => parseDoc(deep)).code).toBe('doc_too_deep');
  });
});

describe('제출', () => {
  it('아키텍트만, validate 통과해야, 순서는 max+1', () => {
    const { game, teams, a, b } = setup();
    const runner = mkUser();
    joinGame(game, runner, teams[2].id, ['runner']);
    advanceTo(game, 1);
    save(game, runner, [{ id: 'forward' }]);
    expect(caught(() => submitProgram(fresh(game), runner)).code).toBe('not_architect');
    const empty = caught(() => submitProgram(fresh(game), a));
    expect(empty.code).toBe('invalid_program');
    expect(empty.extra.errors).toEqual(['블록이 하나도 없다']);
    save(game, b, SOLUTIONS.r1[0]);
    save(game, a, SOLUTIONS.r1[0]);
    expect(submitProgram(fresh(game), b).submitOrder).toBe(1);
    expect(submitProgram(fresh(game), a).submitOrder).toBe(2);
    expect(programOf(teams[1].id, 1)!.sealed_by).toBe('architect');
    expect(caught(() => save(game, a, [])).code).toBe('sealed');
  });
});

describe('페이즈', () => {
  it('조건부 전이: expect가 다르면 409, 진행자만, 없는 전이는 400', () => {
    const { game, host, a } = setup();
    expect(caught(() => transitionPhase(game, a, 'coding', 'lobby')).status).toBe(403);
    transitionPhase(game, host, 'coding', 'lobby');
    expect(fresh(game).phase).toBe('coding');
    expect(caught(() => transitionPhase(fresh(game), host, 'coding', 'lobby')).code).toBe('phase_changed');
    expect(applyTransition(game.id, 'sealed', 'lobby')).toBe(false);
    expect(caught(() => applyTransition(game.id, 'running', 'coding')).code).toBe('bad_transition');
  });

  it('coding 진입: 타이머와 모든 팀 programs 행', () => {
    const { game, teams } = setup();
    const t0 = Date.parse('2026-09-11T10:00:00.000Z');
    applyTransition(game.id, 'coding', 'lobby', t0);
    const g = fresh(game);
    expect(g.timer_ends_at).toBe(new Date(t0 + MAPS[1].seconds * 1000).toISOString());
    for (const t of teams) expect(programOf(t.id, 1)).toMatchObject({ doc: '[]', version: 0 });
  });

  it('자동 봉인: 타이머가 끝나면 미제출 팀을 auto로, 순서는 뒤에', () => {
    const { game, teams, b } = setup();
    const t0 = Date.parse('2026-09-11T10:00:00.000Z');
    applyTransition(game.id, 'coding', 'lobby', t0);
    save(game, b, SOLUTIONS.r1[0]);
    submitProgram(fresh(game), b);
    expect(tickAutoSeal(t0 + 1000)).toEqual([]);
    expect(tickAutoSeal(t0 + MAPS[1].seconds * 1000)).toEqual([game.id]);
    expect(fresh(game).phase).toBe('sealed');
    const orders = teams.map((t) => programOf(t.id, 1)!);
    expect(orders.map((p) => [p.submit_order, p.sealed_by])).toEqual([[2, 'auto'], [1, 'architect'], [3, 'auto'], [4, 'auto']]);
    expect(tickAutoSeal(t0 + 999_999)).toEqual([]);
  });

  it('일시정지된 타이머는 봉인되지 않고, 재개·추가가 된다', () => {
    const { game, host } = setup();
    const t0 = Date.parse('2026-09-11T10:00:00.000Z');
    applyTransition(game.id, 'coding', 'lobby', t0);
    controlTimer(fresh(game), host, 'pause', undefined, t0 + 100_000);
    expect(fresh(game)).toMatchObject({ timer_ends_at: null, timer_remaining: MAPS[1].seconds - 100 });
    expect(tickAutoSeal(t0 + 10_000_000)).toEqual([]);
    controlTimer(fresh(game), host, 'add', 30, t0 + 200_000);
    controlTimer(fresh(game), host, 'resume', undefined, t0 + 200_000);
    expect(fresh(game).timer_ends_at).toBe(new Date(t0 + 200_000 + (MAPS[1].seconds - 70) * 1000).toISOString());
  });

  it('R5 scored 다음은 finished, 되돌리기는 한 단계씩', () => {
    const { game } = setup();
    advanceTo(game, 5);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    expect(resultOf(teamsOf(game.id)[0].id, 5)).toBeDefined();
    applyTransition(game.id, 'sealed', 'running');
    expect(resultOf(teamsOf(game.id)[0].id, 5)).toBeUndefined();
    applyTransition(game.id, 'running', 'sealed');
    applyTransition(game.id, 'scored', 'running');
    expect(caught(() => applyTransition(game.id, 'coding', 'scored')).code).toBe('bad_transition');
    applyTransition(game.id, 'finished', 'scored');
    expect(fresh(game).phase).toBe('finished');
  });
});

describe('실행·점수', () => {
  it('R3 SOLUTIONS.r3[0] → goal·20틱·쥐 2·150점, 최초 제출 팀은 +10', () => {
    const { game, teams, a, b } = setup();
    advanceTo(game, 3);
    save(game, b, SOLUTIONS.r3[0]);
    submitProgram(fresh(game), b); // 1번 아키텍트 제출 → 최초 제출
    save(game, a, SOLUTIONS.r3[0]); // a팀은 자동 봉인 → 가산점 없음
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const g = fresh(game);
    expect(g.running_team_id).toBe(teams[1].id);
    const ra = resultOf(teams[0].id, 3)!;
    expect(ra).toMatchObject({ outcome: 'goal', ticks: 20, mice: 2, blocks: 5, score: 150, run_order: 2 });
    expect(JSON.parse(ra.trace)).toHaveLength(21);
    const rb = resultOf(teams[1].id, 3)!;
    expect(rb).toMatchObject({ outcome: 'goal', score: 160, run_order: 1 });
    expect(JSON.parse(rb.score_lines)).toContainEqual({ label: '최초 제출', points: 10 });
    // 빈 프로그램 팀: 컴파일 에러, 초기 프레임 1개, 0점
    const rc = resultOf(teams[2].id, 3)!;
    expect(rc.outcome).toBe('error');
    expect(rc.message).toBe('컴파일 에러: 블록이 하나도 없다');
    expect(rc.ticks).toBe(0);
    expect(JSON.parse(rc.trace)).toHaveLength(1);
    expect(rc.score).toBe(0);
  });

  it('R5 패치: noSleep → 18틱 (7,4) 사망 0점 → 패치 → 정답 → goal·37틱·135점', () => {
    const { game, host, teams, a, b } = setup();
    advanceTo(game, 5);
    save(game, a, ROUND_EXTRAS.r5.noSleep);
    submitProgram(fresh(game), a);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const dead = resultOf(teams[0].id, 5)!;
    expect(dead).toMatchObject({ outcome: 'dead', ticks: 18, score: 0 });
    expect(dead.message).toContain('고양이');
    const last = JSON.parse(dead.trace).at(-1);
    expect(last.owl).toMatchObject({ x: 7, y: 4 });

    expect(caught(() => allowPatch(fresh(game), a, teams[0].id)).status).toBe(403);
    expect(caught(() => rerunTeam(fresh(game), host, teams[0].id)).code).toBe('no_patch');
    allowPatch(fresh(game), host, teams[0].id);
    const view = buildView(fresh(game), a);
    expect(view.myProgram).toMatchObject({ editable: true, patchActive: true, submittedAt: null });
    expect(view.teams[0]).toMatchObject({ patchLeft: 0, patchActive: true });
    // 다른 팀은 여전히 못 고친다
    expect(caught(() => save(game, b, [])).code).toBe('not_editable');

    save(game, a, SOLUTIONS.r5[0]);
    const resub = submitProgram(fresh(game), a);
    expect(resub.submitOrder).toBe(1);
    rerunTeam(fresh(game), host, teams[0].id);
    const fixed = resultOf(teams[0].id, 5)!;
    expect(fixed).toMatchObject({ outcome: 'goal', ticks: 37, mice: 2, score: 135, used_patch: 1, run_order: 1 });
    expect(JSON.parse(fixed.score_lines)).toContainEqual({ label: '패치권 사용', points: -10 });
    expect(caught(() => allowPatch(fresh(game), host, teams[0].id)).code).toBe('patch_not_needed');
    // 패치권은 게임 전체 1장: 되돌렸다가 다시 실행하면 돌려받는다
    applyTransition(game.id, 'sealed', 'running');
    expect(teamsOf(game.id)[0].patch_left).toBe(1);
  });

  it('보너스는 bonus로 따로 오고(한 번만 더해진다) 순위에 반영된다', () => {
    const { game, host, teams, a, b } = setup();
    advanceTo(game, 1);
    save(game, a, SOLUTIONS.r1[0]);
    save(game, b, SOLUTIONS.r1[0]);
    expect(caught(() => addBonus(fresh(game), host, teams[0].id, 5, '코드 리뷰')).code).toBe('no_result');
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    addBonus(fresh(game), host, teams[0].id, 5, '코드 리뷰');
    const r = buildView(fresh(game), host).results.find((x) => x.teamId === teams[0].id)!;
    expect(r.bonus).toBe(5);
    expect(r.bonusNote).toBe('코드 리뷰');
    // score = 엔진 점수만 (scoreLines 합), 이벤트 줄은 scoreLines에 없다 → 화면의 score + bonus가 한 번만 더한 값
    const engine = resultOf(teams[0].id, 1)!.score;
    expect(r.score).toBe(engine);
    expect(r.scoreLines.reduce((s, l) => s + l.points, 0)).toBe(engine);
    expect(r.scoreLines.some((l) => l.label.includes('이벤트'))).toBe(false);
    // 라운드 칸(score + bonus)과 누적(standings)이 같다
    const st0 = computeStandings(game.id).find((s) => s.teamId === teams[0].id)!;
    expect(st0.rounds[0]).toBe(r.score + r.bonus);
    expect(st0.total).toBe(r.score + r.bonus);
    const st = computeStandings(game.id);
    expect(st[0].teamId).toBe(teams[0].id);
    expect(st[0].rank).toBe(1);
    expect(st[1].teamId).toBe(teams[1].id);
    // 3·4위는 둘 다 0점·0도착·0틱 → 같은 등수
    expect(st[2].rank).toBe(3);
    expect(st[3].rank).toBe(3);
  });

  it('동점이면 도착 라운드 수, 그다음 총 틱 적은 팀', () => {
    const { game, teams } = setup();
    const ins = (teamId: string, round: number, outcome: string, ticks: number, points: number) =>
      run(`insert into results (team_id, round, game_id, outcome, message, ticks, blocks, mice, trace, score, score_lines, run_order)
           values (?, ?, ?, ?, '', ?, 0, 0, '[]', ?, '[]', 1)`, teamId, round, game.id, outcome, ticks, points);
    ins(teams[0].id, 1, 'stuck', 10, 100);
    ins(teams[1].id, 1, 'goal', 30, 100);
    ins(teams[2].id, 1, 'goal', 20, 100);
    const st = computeStandings(game.id);
    expect(st.map((s) => s.teamId)).toEqual([teams[2].id, teams[1].id, teams[0].id, teams[3].id]);
    expect(st[0].rounds).toEqual([100, null, null, null, null]);
  });
});

describe('권한·되돌리기·재생 회차', () => {
  const ids = (doc: string) => (JSON.parse(doc) as Block[]).map((b) => b.id);

  it('player로 강등된 진행자는 자기 게임의 진행자 권한과 정답·다른 팀 코드를 잃는다', () => {
    const { game, host } = setup();
    advanceTo(game, 1);
    const demoted: SessionUser = { ...host, role: 'player' };
    expect(caught(() => controlTimer(fresh(game), demoted, 'add', 5)).code).toBe('not_host');
    expect(caught(() => transitionPhase(fresh(game), demoted, 'sealed', 'coding')).code).toBe('not_host');
    const v = buildView(fresh(game), demoted);
    expect(v.me.isHost).toBe(false);
    expect(v.solutions).toBeUndefined();
    expect(v.programs).toBeUndefined();
    // host 역할이면 그대로, 관리자는 어느 게임이든
    controlTimer(fresh(game), host, 'add', 5);
    expect(buildView(fresh(game), mkUser('admin')).me.isHost).toBe(true);
  });

  it('패치 뒤 running→sealed 되돌리기는 패치권과 함께 패치 전 코드를 돌려준다 (공짜 패치 없음)', () => {
    const { game, host, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, [{ id: 'forward' }]);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const first = resultOf(teams[0].id, 1)!;
    expect(first.outcome).toBe('stuck');
    allowPatch(fresh(game), host, teams[0].id);
    save(game, a, SOLUTIONS.r1[0]);
    const vPatched = programOf(teams[0].id, 1)!.version;

    applyTransition(game.id, 'sealed', 'running');
    expect(teamsOf(game.id)[0].patch_left).toBe(1);
    const p = programOf(teams[0].id, 1)!;
    expect(ids(p.doc)).toEqual(['forward']);
    expect(p.blocks).toBe(1);
    expect(p.version).toBeGreaterThan(vPatched);
    expect(p.prepatch_doc).toBeNull();
    expect(p.submitted_at).not.toBeNull();

    applyTransition(game.id, 'running', 'sealed');
    const again = resultOf(teams[0].id, 1)!;
    expect(again).toMatchObject({ outcome: first.outcome, ticks: first.ticks, score: first.score, used_patch: 0 });
    expect(teamsOf(game.id)[0].patch_left).toBe(1);
  });

  it('보드 재생 회차: 패치 허용은 그대로, 재실행·다시 고르기는 올라간다', () => {
    const { game, host, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, [{ id: 'forward' }]);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const seq = () => buildView(fresh(game), host).results.find((r) => r.teamId === teams[0].id)!.runSeq;
    expect(seq()).toBe(0);
    allowPatch(fresh(game), host, teams[0].id);
    expect(seq()).toBe(0);
    rerunTeam(fresh(game), host, teams[0].id); // 고치지 않고 재실행해도 다시 재생
    expect(seq()).toBe(1);
    selectRunningTeam(fresh(game), host, teams[0].id);
    expect(seq()).toBe(2);
    expect(fresh(game).running_team_id).toBe(teams[0].id);
  });

  it('coding을 취소했다가 다시 시작하면 이전 제출·봉인이 남지 않는다', () => {
    const { game, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, SOLUTIONS.r1[0]);
    submitProgram(fresh(game), a);
    expect(programOf(teams[0].id, 1)!.submit_order).toBe(1);
    applyTransition(game.id, 'lobby', 'coding');
    applyTransition(game.id, 'coding', 'lobby');
    const p = programOf(teams[0].id, 1)!;
    expect(p).toMatchObject({ submitted_at: null, submit_order: null, sealed_by: null });
    expect(buildView(fresh(game), a).myProgram?.editable).toBe(true);
  });
});

describe('뷰모델·실시간', () => {
  it('참가자는 다른 팀 코드·trace·정답을 못 받는다, 비참가자는 로비 수준', () => {
    const { game, host, teams, a, b } = setup();
    advanceTo(game, 3);
    save(game, a, SOLUTIONS.r3[0]);
    save(game, b, SOLUTIONS.r3[0]);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const pa = buildView(fresh(game), a);
    expect(pa.solutions).toBeUndefined();
    expect(pa.programs).toBeUndefined();
    expect(pa.myProgram?.teamId).toBe(teams[0].id);
    expect(pa.results.find((r) => r.teamId === teams[0].id)!.trace).not.toBeNull();
    expect(pa.results.find((r) => r.teamId === teams[1].id)!.trace).toBeNull();
    // 자기 팀 myProgram 말고는 어떤 doc도 오지 않는다
    expect(JSON.stringify({ ...pa, myProgram: null })).not.toContain('"doc"');
    const outsider = buildView(fresh(game), mkUser());
    expect(outsider.myProgram).toBeNull();
    expect(outsider.results.every((r) => r.trace === null)).toBe(true);
    expect(outsider.teams[0].members[0].displayName).toBe('alice');
    const hv = buildView(fresh(game), host);
    expect(hv.me.isHost).toBe(true);
    expect(hv.solutions?.length).toBe(SOLUTIONS.r3.length);
    expect(hv.programs?.[teams[0].id].text).toContain('반복 4 {');
    expect(hv.results.every((r) => r.trace !== null)).toBe(true);
  });

  it('program 이벤트는 그 팀과 진행자에게만', () => {
    const { game, host, teams, a, b } = setup();
    advanceTo(game, 1);
    const got: Record<string, BusEvent[]> = { a: [], b: [], host: [] };
    const offs = [
      subscribe({ gameId: game.id, userId: a.id, teamId: teams[0].id, isHost: false, send: (e) => got.a.push(e) }),
      subscribe({ gameId: game.id, userId: b.id, teamId: teams[1].id, isHost: false, send: (e) => got.b.push(e) }),
      subscribe({ gameId: game.id, userId: host.id, teamId: null, isHost: true, send: (e) => got.host.push(e) }),
    ];
    save(game, a, [{ id: 'forward' }]);
    offs.forEach((off) => off());
    expect(got.a.some((e) => e.type === 'program' && e.version === 1)).toBe(true);
    expect(got.host.some((e) => e.type === 'program')).toBe(true);
    expect(got.b.some((e) => e.type === 'program')).toBe(false);
  });
});

describe('리뷰 수정: 팀 옮기기·패치 확정·재생 코드·결과 공개', () => {
  it('게임이 시작되면 역할 반납은 409, 내보내진 사람도 다른 팀에는 못 들어간다', () => {
    const { game, host, teams, b } = setup();
    advanceTo(game, 1);
    // 팀 B 사람이 반납하고 팀 A 빈 역할로 옮겨 A의 코드를 보려는 시도
    expect(caught(() => leaveGame(fresh(game), b)).code).toBe('leave_closed');
    expect(buildView(fresh(game), b).me.teamId).toBe(teams[1].id);
    // 진행자가 내보낸 사람은 스스로 다시 들어오지 못한다 (다른 팀은 물론 처음 팀에도). 진행자가 넣으면 처음 팀으로
    for (const m of [...new Set(ALL)]) {
      const row = one<{ id: string }>('select id from members where user_id = ? and role = ?', b.id, m);
      if (row) kickMember(fresh(game), host, row.id);
    }
    expect(buildView(fresh(game), b).me.teamId).toBeNull();
    expect(caught(() => joinGame(fresh(game), b, teams[2].id, ['runner'])).code).toBe('kicked');
    expect(caught(() => joinGame(fresh(game), b, teams[1].id, ['runner'])).code).toBe('kicked');
    // 코딩 중 처음 참가하는 사람은 그대로 참가할 수 있다
    expect(joinGame(fresh(game), mkUser(), teams[3].id, ['runner']).teamId).toBe(teams[3].id);
  });

  it('대기실에서는 반납하고 다른 팀으로 옮길 수 있다', () => {
    const { game, teams, b } = setup();
    leaveGame(fresh(game), b);
    expect(joinGame(fresh(game), b, teams[2].id, ['runner']).teamId).toBe(teams[2].id);
    advanceTo(game, 1);
    expect(caught(() => joinGame(fresh(game), b, teams[1].id, ['runner'])).code).toBe('other_team');
  });

  it('패치를 허용하고 재실행하지 않으면 점수 확정은 409 patch_pending, 재실행 뒤에는 된다', () => {
    const { game, host, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, [{ id: 'forward' }]);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    allowPatch(fresh(game), host, teams[0].id);
    expect(caught(() => transitionPhase(fresh(game), host, 'scored', 'running')).code).toBe('patch_pending');
    expect(fresh(game).phase).toBe('running');
    expect(teamsOf(game.id)[0].patch_left).toBe(0);
    save(game, a, SOLUTIONS.r1[0]);
    submitProgram(fresh(game), a);
    rerunTeam(fresh(game), host, teams[0].id);
    transitionPhase(fresh(game), host, 'scored', 'running');
    expect(fresh(game).phase).toBe('scored');
    expect(resultOf(teams[0].id, 1)!.outcome).toBe('goal');
  });

  it('보드용 결과에는 실제로 실행한 doc이 붙고, 패치 중 고친 코드는 섞이지 않는다', () => {
    const { game, host, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, [{ id: 'forward' }, { id: 'right' }, { id: 'forward' }]);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const docOfResult = () => buildView(fresh(game), host).results.find((r) => r.teamId === teams[0].id)!.doc!
      .map((blk) => blk.id);
    expect(docOfResult()).toEqual(['forward', 'right', 'forward']);
    allowPatch(fresh(game), host, teams[0].id);
    save(game, a, [{ id: 'left' }, { id: 'left' }, { id: 'forward' }]);
    // 재실행 전: 보드는 실행했던 코드 그대로 (programs에는 고친 코드가 있어도)
    expect(docOfResult()).toEqual(['forward', 'right', 'forward']);
    expect(buildView(fresh(game), host).programs![teams[0].id].doc.map((blk) => blk.id)).toEqual(['left', 'left', 'forward']);
    rerunTeam(fresh(game), host, teams[0].id);
    expect(docOfResult()).toEqual(['left', 'left', 'forward']);
    // 참가자에게는 결과 doc을 주지 않는다
    expect(buildView(fresh(game), a).results.every((r) => r.doc === undefined)).toBe(true);
  });

  it('앞 팀을 재실행·다시 골라도 이미 본 뒤 팀의 결과는 다시 숨지 않는다', () => {
    const { game, host, teams } = setup();
    const c = mkUser();
    joinGame(game, c, teams[2].id, ['runner']);
    advanceTo(game, 1);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const mineOf = (u: SessionUser) => {
      const v = buildView(fresh(game), u);
      return { v, mine: v.results.find((r) => r.teamId === v.me.teamId)! };
    };
    expect(mineOf(c).mine.runOrder).toBe(3);
    expect(resultRevealed(mineOf(c).v, mineOf(c).mine)).toBe(false);
    for (const t of [teams[1], teams[2], teams[3]]) selectRunningTeam(fresh(game), host, t.id);
    expect(fresh(game).shown_up_to).toBe(4);
    // B를 다시 고르기 → C는 그대로 공개
    selectRunningTeam(fresh(game), host, teams[1].id);
    expect(resultRevealed(mineOf(c).v, mineOf(c).mine)).toBe(true);
    // B 패치 후 재실행 → 재생 팀이 B(2번째)로 가도 C는 공개
    allowPatch(fresh(game), host, teams[1].id);
    rerunTeam(fresh(game), host, teams[1].id);
    const { v, mine } = mineOf(c);
    expect(v.game.runningTeamId).toBe(teams[1].id);
    expect(v.game.shownUpTo).toBe(4);
    expect(resultRevealed(v, mine)).toBe(true);
    // 되돌리면 처음부터
    applyTransition(game.id, 'sealed', 'running');
    expect(fresh(game).shown_up_to).toBe(0);
  });
});

describe('후속 수정: 낡은 페이즈 경쟁·재생 팀 조건·참가 주소', () => {
  it('coding에서 읽은 game으로 저장·제출해도 그 사이 대기실로 되돌렸으면 409 not_editable (트랜잭션 안에서 다시 확인)', () => {
    const { game, teams, a } = setup();
    advanceTo(game, 1);
    save(game, a, SOLUTIONS.r1[0]);
    const stale = fresh(game); // 라우트가 요청 처음에 읽은 game
    const before = programOf(teams[0].id, 1)!;
    applyTransition(game.id, 'lobby', 'coding');
    expect(caught(() => saveProgram(stale, a, [], before.version)).code).toBe('not_editable');
    expect(caught(() => submitProgram(stale, a)).code).toBe('not_editable');
    const after = programOf(teams[0].id, 1)!;
    expect(after.version).toBe(before.version);
    expect(after.submitted_at).toBeNull();
  });

  it('라운드가 바뀐 뒤(R2 coding → scored 되돌리기) 낡은 game으로는 저장할 수 없다', () => {
    const { game, teams, a } = setup();
    advanceTo(game, 2);
    const stale = fresh(game);
    const v = programOf(teams[0].id, 2)!.version;
    applyTransition(game.id, 'scored', 'coding');
    expect(fresh(game).round).toBe(1);
    expect(caught(() => saveProgram(stale, a, [{ id: 'forward' }], v)).code).toBe('not_editable');
    expect(programOf(teams[0].id, 2)!.version).toBe(v);
  });

  it('아키텍트가 아니면 제출은 여전히 403 not_architect가 먼저', () => {
    const { game, teams } = setup();
    const runner = mkUser();
    joinGame(game, runner, teams[2].id, ['runner']);
    advanceTo(game, 1);
    expect(caught(() => submitProgram(fresh(game), runner)).code).toBe('not_architect');
  });

  it('재생 팀 지정: expectTeamId가 지금 재생 팀과 다르면 409 running_changed (진행자 탭 두 개의 이중 넘김 방지)', () => {
    const { game, host, teams } = setup();
    advanceTo(game, 1);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const first = fresh(game).running_team_id;
    expect(first).toBe(teams[0].id);
    // 두 탭이 같은 "지금 팀"을 보고 동시에 넘기려 한다 → 먼저 온 것만 적용
    selectRunningTeam(fresh(game), host, teams[1].id, first);
    expect(caught(() => selectRunningTeam(fresh(game), host, teams[1].id, first)).code).toBe('running_changed');
    expect(fresh(game).running_team_id).toBe(teams[1].id);
    expect(fresh(game).shown_up_to).toBe(2);
    // expectTeamId 없이 고르면 예전처럼 된다 (수동 선택)
    selectRunningTeam(fresh(game), host, teams[3].id);
    expect(fresh(game).running_team_id).toBe(teams[3].id);
    // 낡은 game(running)으로 골라도 실제 페이즈가 바뀌었으면 409 not_running
    const stale = fresh(game);
    applyTransition(game.id, 'sealed', 'running');
    expect(caught(() => selectRunningTeam(stale, host, teams[0].id)).code).toBe('not_running');
  });

  it('저장·제출에 실은 라운드가 지금 라운드와 다르면 409 not_editable (늦게 도착한 지난 라운드 요청)', () => {
    const { game, teams, a } = setup();
    advanceTo(game, 2);
    const g = fresh(game); // 라우트가 읽은 game도, 트랜잭션 안에서 다시 읽은 game도 R2
    expect(programOf(teams[0].id, 2)!.version).toBe(0);
    // R1에서 만든 첫 저장(baseVersion 0)이 R2 coding 뒤에 도착 → 새 라운드 프로그램에 들어가면 안 된다
    expect(caught(() => saveProgram(g, a, [{ id: 'forward' }], 0, 1)).code).toBe('not_editable');
    expect(programOf(teams[0].id, 2)!.version).toBe(0);
    expect(caught(() => submitProgram(g, a, 1)).code).toBe('not_editable');
    expect(programOf(teams[0].id, 2)!.submitted_at).toBeNull();
    // 라운드가 맞으면(또는 라운드를 안 보내면) 예전처럼 된다
    expect(saveProgram(fresh(game), a, SOLUTIONS.r2[0], 0, 2).version).toBe(1);
    expect(submitProgram(fresh(game), a, 2).submitOrder).toBe(1);
  });

  it('재생 팀 지정은 트랜잭션 안에서 다시 읽은 라운드로 run_seq·shown_up_to를 올린다', () => {
    const { game, host, teams } = setup();
    advanceTo(game, 1);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    const stale = fresh(game); // R1 running에서 읽은 game
    applyTransition(game.id, 'scored', 'running');
    applyTransition(game.id, 'coding', 'scored');
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    expect(fresh(game).round).toBe(2);
    const r1 = resultOf(teams[2].id, 1)!.run_seq;
    const r2 = resultOf(teams[2].id, 2)!.run_seq;
    selectRunningTeam(stale, host, teams[2].id);
    expect(resultOf(teams[2].id, 2)!.run_seq).toBe(r2 + 1);
    expect(resultOf(teams[2].id, 1)!.run_seq).toBe(r1);
    expect(fresh(game).shown_up_to).toBe(resultOf(teams[2].id, 2)!.run_order);
  });

  it('참가 주소 후보(joinUrls)는 진행자·보드 뷰에만, 참가자·비참가자에게는 만들지도 않는다', () => {
    const { game, host, a } = setup();
    const list = [{ url: 'http://192.168.0.12:3000', kind: 'lan' as const }];
    expect(buildView(fresh(game), host, { joinUrls: () => list }).joinUrls).toEqual(list);
    expect(buildView(fresh(game), host).joinUrls).toEqual([]);
    let calls = 0;
    const counted = () => { calls += 1; return list; };
    expect(buildView(fresh(game), a, { joinUrls: counted }).joinUrls).toBeUndefined();
    expect(buildView(fresh(game), mkUser(), { joinUrls: counted }).joinUrls).toBeUndefined();
    expect(calls).toBe(0);
  });
});
