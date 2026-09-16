// FEATURE_V4 서버 규칙: 라운드 선택(§1), 팀 10·인원 6·역할 공유(§2), 대기실·자동 배정·늦게 온 사람·데려오기·옮기기(§3).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_ROUNDS, GAME_ROLES, LIMITS, TEAM_PRESETS, autoRoleSplit, autoRolesForNewcomer, autoTeamSizes, isRoundList,
  nextRoundOf, prevRoundOf, roundPosition, suggestedTeamCount, type GameRole, type LobbyEvent,
} from '@/lib/contracts';
import { MAPS, SOLUTIONS } from '@/lib/engine';
import { newId, nowIso, one, resetDb, run } from '@/lib/server/db';
import { HttpError } from '@/lib/server/http';
import { LOBBY_CHANNEL, subscribe, type BusEvent } from '@/lib/server/realtime';
import type { SessionUser } from '@/lib/server/session';
import { deleteGameById } from '@/lib/server/auth';
import {
  applyTransition, assignMember, availableRounds, computeStandings, createGame, createGameFromLobby, flushLobby, gameById,
  homePathFor, joinFromLobby, joinGame, kickMember, leaveGame, lobbyArrive, lobbySnapshot, programOf, pullFromLobby,
  saveProgram, submitProgram, teamsOf, tickAutoSeal, waitingUsers, type GameRow,
} from '@/lib/server/game';
import { buildView } from '@/lib/server/views';

const ALL: GameRole[] = ['runner', 'turner', 'controller', 'architect'];
/** 엔진에 맵이 있는 라운드 (오름차순). R8~R10이 아직 없으면 1~7 (docs/ROUNDS_8_10.md §4: 없는 라운드는 round_unavailable) */
const HAVE = availableRounds();
/** 계약(1~10)에는 있지만 엔진에는 아직 없는 라운드 (없으면 빈 배열) */
const MISSING = ALL_ROUNDS.filter((r) => !HAVE.includes(r));
let seq = 0;

function mkUser(role: SessionUser['role'] = 'player', name = `u${(seq += 1)}_${Math.random().toString(36).slice(2, 6)}`): SessionUser {
  const id = newId();
  run(`insert into users (id, username, display_name, password_hash, role, created_at) values (?, ?, ?, 'x', ?, ?)`,
    id, name, name, role, nowIso());
  return { id, username: name, displayName: name, role, status: 'active', mustChangePassword: false };
}

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

// ------------------------------------------------------------------ 대기실 연결 흉내 (라우트와 같은 순서: 구독 → 늦게 온 사람 처리)
interface Conn { user: SessionUser; events: BusEvent[]; off: () => void }
let conns: Conn[] = [];

function connect(user: SessionUser, opts: { watch?: boolean } = {}): Conn {
  const events: BusEvent[] = [];
  const off = subscribe({
    gameId: LOBBY_CHANNEL, userId: user.id, teamId: null, isHost: user.role !== 'player', watch: !!opts.watch,
    send: (e) => events.push(e),
  });
  const c = { user, events, off };
  conns.push(c);
  if (!opts.watch) lobbyArrive(user);
  return c;
}

function eventsOf<T extends LobbyEvent['type']>(c: Conn, type: T): Extract<LobbyEvent, { type: T }>[] {
  return c.events.filter((e): e is Extract<LobbyEvent, { type: T }> => e.type === type);
}

function peopleOf(game: GameRow, host: SessionUser) {
  return buildView(fresh(game), host).teams.map((t) => t.people.map((p) => ({ userId: p.userId, roles: p.roles })));
}

/** 라운드를 끝까지 돌며 coding에 들어간 라운드 번호를 모은다 */
function playThrough(game: GameRow): number[] {
  const seen: number[] = [];
  applyTransition(game.id, 'coding', 'lobby');
  for (;;) {
    seen.push(fresh(game).round);
    applyTransition(game.id, 'sealed', 'coding');
    applyTransition(game.id, 'running', 'sealed');
    applyTransition(game.id, 'scored', 'running');
    try {
      applyTransition(game.id, 'coding', 'scored');
    } catch (err) {
      expect((err as HttpError).code).toBe('bad_transition');
      break;
    }
  }
  applyTransition(game.id, 'finished', 'scored');
  return seen;
}

beforeEach(() => {
  resetDb();
});

afterEach(() => {
  for (const c of conns) c.off();
  conns = [];
});

// ------------------------------------------------------------------ 순수 규칙 (contracts)
describe('자동 배정·라운드 순수 규칙', () => {
  it('autoRoleSplit: 4명 미만은 앞사람부터 남는 역할을 더 맡아 4역할이 모두 찬다', () => {
    expect(autoRoleSplit(0)).toEqual([]);
    expect(autoRoleSplit(1)).toEqual([['runner', 'turner', 'controller', 'architect']]);
    expect(autoRoleSplit(2)).toEqual([['turner', 'architect'], ['runner', 'controller']]);
    expect(autoRoleSplit(3)).toEqual([['controller', 'architect'], ['runner'], ['turner']]);
    expect(autoRoleSplit(4)).toEqual([['architect'], ['runner'], ['turner'], ['controller']]);
    expect(autoRoleSplit(6)).toEqual([['architect'], ['runner'], ['turner'], ['controller'], ['architect'], ['runner']]);
    for (let n = 1; n <= 6; n += 1) {
      expect(new Set(autoRoleSplit(n).flat())).toEqual(new Set(GAME_ROLES));
    }
  });

  it('늦게 온 사람의 역할: 빠진 역할 전부, 없으면 k mod 4', () => {
    expect(autoRolesForNewcomer(0, [])).toEqual(ALL);
    expect(autoRolesForNewcomer(2, ['runner', 'architect'])).toEqual(['turner', 'controller']);
    expect(autoRolesForNewcomer(1, ALL)).toEqual(['runner']);
    expect(autoRolesForNewcomer(4, ALL)).toEqual(['architect']);
  });

  it('미리보기·추천 팀 수·라운드 표기', () => {
    expect(autoTeamSizes(5, 2)).toEqual({ sizes: [3, 2], placed: 5, leftWaiting: 0 });
    expect(autoTeamSizes(13, 2)).toEqual({ sizes: [6, 6], placed: 12, leftWaiting: 1 });
    expect(suggestedTeamCount(0)).toBe(2);
    expect(suggestedTeamCount(9)).toBe(3);
    expect(suggestedTeamCount(100)).toBe(10);
    expect(roundPosition([1, 2, 4, 5, 7], 4).label).toBe('R4 · 3/5 · 난이도 4');
    expect(nextRoundOf([1, 3, 5], 3)).toBe(5);
    expect(nextRoundOf([1, 3, 5], 5)).toBeNull();
    expect(prevRoundOf([1, 3, 5], 3)).toBe(1);
    expect(prevRoundOf([1, 3, 5], 1)).toBeNull();
    expect(isRoundList([1, 3, 5])).toBe(true);
    expect(ALL_ROUNDS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(isRoundList([...ALL_ROUNDS])).toBe(true);
    expect(isRoundList([8, 9, 10])).toBe(true);
    // 상한 10: 11은 거절, 0·중복·내림차순·정수 아님도 거절
    for (const bad of [[], [3, 1], [1, 1], [0], [11], [1.5], ['1'], null, [1, 2, 3, 4, 5, 6, 7, 7], [...ALL_ROUNDS, 11]]) {
      expect(isRoundList(bad)).toBe(false);
    }
  });
});

// ------------------------------------------------------------------ §1 라운드 선택
describe('라운드 선택', () => {
  it('잘못된 라운드 목록은 400 invalid_rounds, 기본은 [1,2,3,4,5]', () => {
    const host = mkUser('host');
    for (const bad of [[], [3, 1], [1, 1], [0], [11], [2.5]]) {
      expect(caught(() => createGame(host, 2, { rounds: bad })).code).toBe('invalid_rounds');
    }
    const g = createGame(host, 2);
    expect(buildView(g, host).game).toMatchObject({ rounds: [1, 2, 3, 4, 5], round: 1, roundIndex: 0, mode: 'self' });
    // 계약상 올바르지만 엔진에 아직 없는 라운드(예: R8~R10 설치 전)는 400 round_unavailable
    if (MISSING.length > 0) expect(caught(() => createGame(host, 2, { rounds: [1, MISSING[0]] })).code).toBe('round_unavailable');
  });

  it('[1,3,5]: 고른 라운드만 순서대로, 되돌리기는 이전 선택 라운드로, R5 다음은 finished', () => {
    const host = mkUser('host');
    const a = mkUser();
    const game = createGame(host, 2, { rounds: [1, 3, 5] });
    const teams = teamsOf(game.id);
    joinGame(game, a, teams[0].id, ALL);
    applyTransition(game.id, 'coding', 'lobby');
    expect(fresh(game).round).toBe(1);
    for (const to of ['sealed', 'running', 'scored'] as const) applyTransition(game.id, to, fresh(game).phase);
    applyTransition(game.id, 'coding', 'scored');
    expect(fresh(game).round).toBe(3);
    expect(programOf(teams[0].id, 3)).toBeDefined();
    const v3 = buildView(fresh(game), a);
    expect(v3.game).toMatchObject({ round: 3, rounds: [1, 3, 5], roundIndex: 1 });
    expect(v3.map.round).toBe(3);
    // R3 coding에서는 대기실로 못 가고, 되돌리기(scored)는 R1으로
    expect(caught(() => applyTransition(game.id, 'lobby', 'coding')).code).toBe('bad_transition');
    applyTransition(game.id, 'scored', 'coding');
    expect(fresh(game)).toMatchObject({ phase: 'scored', round: 1 });
    applyTransition(game.id, 'coding', 'scored');
    expect(fresh(game).round).toBe(3);
    // R3에 정답 → 순위표 두 번째 열
    const p = programOf(teams[0].id, 3)!;
    saveProgram(fresh(game), a, SOLUTIONS.r3[0], p.version);
    for (const to of ['sealed', 'running', 'scored'] as const) applyTransition(game.id, to, fresh(game).phase);
    const row = computeStandings(game.id).find((s) => s.teamId === teams[0].id)!;
    expect(row.rounds).toHaveLength(3);
    expect(row.rounds[1]).toBe(150);
    expect(row.rounds[2]).toBeNull();
    applyTransition(game.id, 'coding', 'scored');
    expect(fresh(game).round).toBe(5);
    for (const to of ['sealed', 'running', 'scored'] as const) applyTransition(game.id, to, fresh(game).phase);
    expect(caught(() => applyTransition(game.id, 'coding', 'scored')).code).toBe('bad_transition');
    applyTransition(game.id, 'finished', 'scored');
    expect(fresh(game).phase).toBe('finished');
    expect(buildView(fresh(game), host).standings[0].rounds).toHaveLength(3);
  });

  it('첫 선택 라운드가 1이 아니어도 된다 ([2,4]): 대기실 라운드 = 2, coding → lobby 되돌리기 가능', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { rounds: [2, 4] });
    expect(fresh(game).round).toBe(2);
    applyTransition(game.id, 'coding', 'lobby');
    expect(fresh(game).round).toBe(2);
    applyTransition(game.id, 'lobby', 'coding');
    expect(fresh(game).phase).toBe('lobby');
    expect(playThrough(game)).toEqual([2, 4]);
  });

  it('기본 5라운드 게임은 예전처럼 R1~R5', () => {
    const game = createGame(mkUser('host'), 2);
    expect(playThrough(game)).toEqual([1, 2, 3, 4, 5]);
  });

  it('엔진에 있는 라운드 전부로 만든 게임은 마지막 라운드까지 가고 그 다음은 finished', () => {
    // R8~R10이 설치되면 HAVE = 1~10 (전체 프리셋), 아직이면 1~7
    expect(HAVE.length).toBeGreaterThanOrEqual(7);
    const game = createGame(mkUser('host'), 2, { rounds: HAVE });
    expect(playThrough(game)).toEqual(HAVE);
    if (MISSING.length === 0) expect(playThrough(createGame(mkUser('host'), 2, { rounds: [...ALL_ROUNDS] }))).toEqual([...ALL_ROUNDS]);
  });

  it.skipIf(!(6 in MAPS && 7 in MAPS))('도전 프리셋 [4,5,6,7]: R4부터 R7까지', () => {
    const challenge = createGame(mkUser('host'), 2, { rounds: [4, 5, 6, 7] });
    expect(playThrough(challenge)).toEqual([4, 5, 6, 7]);
  });

  it.skipIf(!(8 in MAPS && 9 in MAPS && 10 in MAPS))('심화 프리셋 [8,9,10]: R8부터 R10까지', () => {
    const advanced = createGame(mkUser('host'), 2, { rounds: [8, 9, 10] });
    expect(playThrough(advanced)).toEqual([8, 9, 10]);
  });
});

// ------------------------------------------------------------------ §2 팀 10·인원 6·역할 공유
describe('팀 10개·팀당 6명·역할 공유', () => {
  it('팀 10개 프리셋 이름·색', () => {
    const g = createGame(mkUser('host'), 10);
    expect(teamsOf(g.id).map((t) => [t.name, t.color])).toEqual(TEAM_PRESETS.map((p) => [p.name, p.color]));
    expect(TEAM_PRESETS.map((p) => p.color)).toEqual([
      '#9B6BFF', '#5B8CFF', '#3FD6F2', '#E8E4FF', '#F5B94A', '#FF6B8B', '#3DDC97', '#C065E8', '#FF9A5A', '#7AA2C8',
    ]);
    expect(LIMITS).toMatchObject({ minTeams: 2, maxTeams: 10, maxMembersPerTeam: 6 });
  });

  it('한 팀에 서로 다른 사람 6명까지, 7번째는 409 team_full. 이미 팀원이면 역할을 더 맡을 수 있다', () => {
    const host = mkUser('host');
    const game = createGame(host, 2);
    const [t0, t1] = teamsOf(game.id);
    const users = Array.from({ length: 7 }, () => mkUser());
    const roles: GameRole[][] = [['runner'], ['runner'], ['turner'], ['controller'], ['architect'], ['architect', 'runner']];
    users.slice(0, 6).forEach((u, i) => joinGame(game, u, t0.id, roles[i]));
    const full = caught(() => joinGame(game, users[6], t0.id, ['runner']));
    expect(full.status).toBe(409);
    expect(full.code).toBe('team_full');
    expect(joinGame(game, users[0], t0.id, ['turner']).roles).toEqual(['runner', 'turner']);
    expect(joinGame(game, users[6], t1.id, ['runner']).teamId).toBe(t1.id);
    const v = buildView(fresh(game), host);
    expect(v.teams[0].people).toHaveLength(6);
    expect(v.teams[0].people[0]).toMatchObject({ userId: users[0].id, roles: ['runner', 'turner'] });
    expect(v.teams[0].people[5].roles).toEqual(['runner', 'architect']);
    expect(v.teams[0].people[5].memberIds.architect).toBeTruthy();
    expect(v.teams[0].members.filter((m) => m.role === 'runner')).toHaveLength(3);
    expect(v.teams[0].missingRoles).toEqual([]);
    expect(v.teams[1].missingRoles).toEqual(['turner', 'controller', 'architect']);
  });

  it('같은 역할 2명이 각자 블록을 놓고, 아키텍트 누구나 제출할 수 있다', () => {
    const host = mkUser('host');
    const game = createGame(host, 2);
    const [t0] = teamsOf(game.id);
    const r1 = mkUser();
    const r2 = mkUser();
    const a1 = mkUser();
    const a2 = mkUser();
    for (const [u, role] of [[r1, 'runner'], [r2, 'runner'], [a1, 'architect'], [a2, 'architect']] as const) {
      joinGame(game, u, t0.id, [role]);
    }
    applyTransition(game.id, 'coding', 'lobby');
    expect(saveProgram(fresh(game), r1, [{ id: 'forward' }], 0).version).toBe(1);
    expect(saveProgram(fresh(game), r2, [{ id: 'forward' }, { id: 'forward' }], 1).version).toBe(2);
    expect(submitProgram(fresh(game), a2).submitOrder).toBe(1);
    expect(caught(() => submitProgram(fresh(game), a1)).code).toBe('sealed');
  });

  it('아키텍트 없는 팀은 missingRoles에 architect, 타이머가 끝나면 자동 봉인', () => {
    const host = mkUser('host');
    const game = createGame(host, 2);
    const [t0] = teamsOf(game.id);
    joinGame(game, mkUser(), t0.id, ['runner']);
    expect(buildView(fresh(game), host).teams[0].missingRoles).toContain('architect');
    const t = Date.parse('2026-09-14T10:00:00.000Z');
    applyTransition(game.id, 'coding', 'lobby', t);
    expect(tickAutoSeal(t + 10_000_000)).toEqual([game.id]);
    expect(programOf(t0.id, 1)!.sealed_by).toBe('auto');
  });

  it('userId로 내보내면 역할이 모두 빠지고 게임 채널에 removed가 간다', () => {
    const host = mkUser('host');
    const game = createGame(host, 2);
    const [t0] = teamsOf(game.id);
    const u = mkUser();
    joinGame(game, u, t0.id, ALL);
    const got: BusEvent[] = [];
    const off = subscribe({ gameId: game.id, userId: u.id, teamId: t0.id, isHost: false, send: (e) => got.push(e) });
    expect(caught(() => kickMember(fresh(game), u, { userId: u.id })).status).toBe(403);
    kickMember(fresh(game), host, { userId: u.id });
    off();
    expect(buildView(fresh(game), u).me.teamId).toBeNull();
    expect(got).toContainEqual({ type: 'removed', userId: u.id });
    expect(one('select reason from game_exits where game_id = ? and user_id = ?', game.id, u.id)).toEqual({ reason: 'kicked' });
  });
});

// ------------------------------------------------------------------ §3 대기실
describe('대기실 명단', () => {
  it('대기 = 대기실 연결(구경 제외) + 끝나지 않은 게임의 팀원이 아님, 들어온 순서', () => {
    const host = mkUser('host');
    const [a, b, c] = [mkUser(), mkUser(), mkUser()];
    connect(host, { watch: true });
    const ca = connect(a);
    connect(b);
    connect(c);
    expect(waitingUsers().map((w) => w.userId)).toEqual([a.id, b.id, c.id]);
    // 다른 게임(직접 선택)의 팀원이 되면 빠진다, 그 게임이 끝나면 다시 대기
    const game = createGame(host, 2);
    joinGame(game, b, teamsOf(game.id)[0].id, ALL);
    expect(waitingUsers().map((w) => w.userId)).toEqual([a.id, c.id]);
    run("update games set phase = 'finished' where id = ?", game.id);
    expect(waitingUsers().map((w) => w.userId)).toEqual([a.id, b.id, c.id]);
    // 잠깐 끊겼다가 다시 붙어도 들어온 순서는 그대로 (유예 시간 안)
    ca.off();
    expect(waitingUsers().map((w) => w.userId)).toEqual([b.id, c.id]);
    connect(a);
    expect(waitingUsers().map((w) => w.userId)).toEqual([a.id, b.id, c.id]);
    // 공개 명단: 표시 이름·아이디·들어온 시각만
    const snap = lobbySnapshot(a);
    expect(snap.me).toMatchObject({ userId: a.id, waiting: true });
    expect(Object.keys(snap.waiting[0]).sort()).toEqual(['displayName', 'since', 'userId', 'username']);
    expect(lobbySnapshot(host).me.waiting).toBe(false);
    expect(JSON.stringify(snap)).not.toContain('password');
  });

  it("명단이 바뀌면 구독자에게 'lobby' 이벤트 (묶어서 보낸다)", async () => {
    const watcher = connect(mkUser('host'), { watch: true });
    const a = mkUser();
    connect(a);
    flushLobby();
    const last = eventsOf(watcher, 'lobby').at(-1)!;
    expect(last.waiting.map((w) => w.userId)).toEqual([a.id]);
    createGame(mkUser('host'), 2);
    await new Promise((r) => setTimeout(r, 120));
    expect(eventsOf(watcher, 'lobby').at(-1)!.openGames).toHaveLength(1);
  });
});

describe('자동 배정 게임 만들기', () => {
  it('대기 5명 → 팀 2개: i mod T, 팀 안 역할 규칙, 모든 팀 4역할, 각자에게 assigned (1초 안)', () => {
    const host = mkUser('host');
    const hostConn = connect(host, { watch: true });
    const users = Array.from({ length: 5 }, () => mkUser());
    const cs = users.map((u) => connect(u));
    const t0 = Date.now();
    const out = createGameFromLobby(host, { teams: 2, rounds: [1, 2, 3], mode: 'auto' });
    expect(out).toMatchObject({ assigned: 5, leftWaiting: 0 });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    expect(game).toMatchObject({ mode: 'auto', rounds: '[1,2,3]', round: 1, phase: 'lobby' });
    const teams = teamsOf(game.id);
    for (const [i, c] of cs.entries()) {
      const got = eventsOf(c, 'assigned');
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ code: out.code, teamId: teams[i % 2].id, teamName: teams[i % 2].name });
    }
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(eventsOf(hostConn, 'assigned')).toHaveLength(0);
    expect(peopleOf(game, host)).toEqual([
      [
        { userId: users[0].id, roles: ['controller', 'architect'] },
        { userId: users[2].id, roles: ['runner'] },
        { userId: users[4].id, roles: ['turner'] },
      ],
      [
        { userId: users[1].id, roles: ['turner', 'architect'] },
        { userId: users[3].id, roles: ['runner', 'controller'] },
      ],
    ]);
    expect(buildView(fresh(game), host).teams.every((t) => t.missingRoles.length === 0)).toBe(true);
    expect(eventsOf(cs[0], 'assigned')[0].roles).toEqual(['controller', 'architect']);
    expect(waitingUsers()).toEqual([]);
    expect(homePathFor(users[0])).toBe(`/play/${out.code}`);
  });

  it('자리가 모자라면 넘치는 사람은 대기실에 남는다 (13명 → 팀 2개 × 6명)', () => {
    const host = mkUser('host');
    const users = Array.from({ length: 13 }, () => mkUser());
    const cs = users.map((u) => connect(u));
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    expect(out).toMatchObject({ assigned: 12, leftWaiting: 1 });
    expect(eventsOf(cs[12], 'assigned')).toHaveLength(0);
    expect(waitingUsers().map((w) => w.userId)).toEqual([users[12].id]);
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    const v = buildView(game, host);
    expect(v.teams.map((t) => t.people.length)).toEqual([6, 6]);
    expect(v.teams[0].people.map((p) => p.roles)).toEqual(autoRoleSplit(6));
  });

  it("직접 선택(self)이면 대기 중인 사람에게 'game-open'만, 배정은 없다", () => {
    const host = mkUser('host');
    const watcher = connect(host, { watch: true });
    const cs = [mkUser(), mkUser()].map((u) => connect(u));
    const out = createGameFromLobby(host, { teams: 3, mode: 'self' });
    expect(out).toMatchObject({ assigned: 0, leftWaiting: 2 });
    for (const c of cs) expect(eventsOf(c, 'game-open')).toEqual([{ type: 'game-open', code: out.code }]);
    expect(eventsOf(watcher, 'game-open')).toHaveLength(0);
    expect(one('select count(*) as n from members')).toEqual({ n: 0 });
  });
});

describe('늦게 온 사람·참가 버튼', () => {
  it('열린 자동 배정 게임이 정확히 하나면 들어오자마자 사람이 가장 적은 팀으로', () => {
    const host = mkUser('host');
    const first = [mkUser(), mkUser(), mkUser()];
    first.forEach((u) => connect(u));
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    const teams = teamsOf(game.id);
    // 팀0 = 2명, 팀1 = 1명(4역할) → 늦게 온 사람은 팀1, 역할은 AUTO_ROLE_ORDER[1] = runner
    const late = mkUser();
    const c = connect(late);
    expect(eventsOf(c, 'assigned')).toEqual([
      { type: 'assigned', code: out.code, teamId: teams[1].id, teamName: teams[1].name, teamColor: teams[1].color, roles: ['runner'] },
    ]);
    // coding 중에도 된다
    applyTransition(game.id, 'coding', 'lobby');
    const later = connect(mkUser());
    expect(eventsOf(later, 'assigned')[0]?.teamId).toBe(teams[0].id);
  });

  it('열린 자동 게임이 둘이면 자동 참가하지 않고, 참가 버튼(joinFromLobby)으로 들어간다', () => {
    const host = mkUser('host');
    const g1 = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const g2 = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const u = mkUser();
    const c = connect(u);
    expect(eventsOf(c, 'assigned')).toHaveLength(0);
    const snap = lobbySnapshot(u);
    expect(snap.openGames.map((g) => g.code).sort()).toEqual([g1.code, g2.code].sort());
    expect(snap.openGames.every((g) => g.joinable && g.mode === 'auto')).toBe(true);
    const joined = joinFromLobby(u, g2.code);
    expect(joined.roles).toEqual(ALL);
    expect(eventsOf(c, 'assigned')[0]?.code).toBe(g2.code);
    const self = createGameFromLobby(host, { teams: 2, mode: 'self' });
    expect(caught(() => joinFromLobby(mkUser(), self.code)).code).toBe('self_mode');
  });

  it('직접 선택 게임·끝난 게임·꽉 찬 게임은 자동 참가 대상이 아니다', () => {
    const host = mkUser('host');
    createGameFromLobby(host, { teams: 2, mode: 'self' });
    const done = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    run("update games set phase = 'finished' where code = ?", done.code);
    const c = connect(mkUser());
    expect(eventsOf(c, 'assigned')).toHaveLength(0);
    expect(lobbyArrive(c.user)).toBeNull();
  });
});

describe('진행자 도구: 데려오기·옮기기·내보내기', () => {
  it('pull: 대기실 사람을 자동 배정 규칙으로, 진행자만, lobby·coding만', () => {
    const host = mkUser('host');
    const out = createGameFromLobby(host, { teams: 2, mode: 'self' });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    const users = [mkUser(), mkUser(), mkUser()];
    const cs = users.map((u) => connect(u));
    expect(caught(() => pullFromLobby(game, users[0])).status).toBe(403);
    const pulled = pullFromLobby(game, host, [users[2].id]);
    expect(pulled).toMatchObject({ assigned: 1, leftWaiting: 2 });
    expect(pulled.placements[0]).toMatchObject({ userId: users[2].id, roles: ALL });
    const rest = pullFromLobby(game, host);
    expect(rest).toMatchObject({ assigned: 2, leftWaiting: 0 });
    expect(cs.every((c) => eventsOf(c, 'assigned').length === 1)).toBe(true);
    expect(peopleOf(game, host)).toEqual([
      [{ userId: users[2].id, roles: ALL }, { userId: users[1].id, roles: ['runner'] }],
      [{ userId: users[0].id, roles: ALL }],
    ]);
    applyTransition(game.id, 'coding', 'lobby');
    applyTransition(game.id, 'sealed', 'coding');
    expect(caught(() => pullFromLobby(fresh(game), host)).code).toBe('join_closed');
  });

  it('assign: 대기 중인 사람을 넣고 팀원을 옮긴다 (역할 통째로), team_full·in_other_game', () => {
    const host = mkUser('host');
    const game = createGame(host, 2);
    const [t0, t1] = teamsOf(game.id);
    const u = mkUser();
    const c = connect(u);
    expect(caught(() => assignMember(game, u, u.id, t0.id, ['runner'])).status).toBe(403);
    expect(assignMember(game, host, u.id, t0.id, ['architect', 'runner'])).toEqual({ ok: true, teamId: t0.id, roles: ['runner', 'architect'] });
    expect(eventsOf(c, 'assigned')[0]).toMatchObject({ code: game.code, teamId: t0.id, roles: ['runner', 'architect'] });
    applyTransition(game.id, 'coding', 'lobby');
    assignMember(fresh(game), host, u.id, t1.id, ['turner']);
    expect(buildView(fresh(game), u).me).toMatchObject({ teamId: t1.id, roles: ['turner'] });
    // 코딩 중 옮긴 팀이 이제 "처음 팀"이 된다
    expect(joinGame(fresh(game), u, t1.id, ['runner']).roles).toEqual(['runner', 'turner']);
    for (let i = 0; i < 5; i += 1) joinGame(fresh(game), mkUser(), t0.id, ['runner']);
    joinGame(fresh(game), mkUser(), t0.id, ['runner']);
    expect(caught(() => assignMember(fresh(game), host, u.id, t0.id, ['runner'])).code).toBe('team_full');
    const other = createGame(host, 2);
    const busy = mkUser();
    joinGame(other, busy, teamsOf(other.id)[0].id, ['runner']);
    expect(caught(() => assignMember(fresh(game), host, busy.id, t1.id, ['runner'])).code).toBe('in_other_game');
  });

  it('내보낸 사람은 대기실로 돌아가고, 자동 배정은 그 게임으로 다시 넣지 않는다 (진행자가 직접 넣으면 된다)', () => {
    const host = mkUser('host');
    const u = mkUser();
    const c = connect(u);
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    expect(waitingUsers()).toEqual([]);
    kickMember(fresh(game), host, { userId: u.id });
    expect(waitingUsers().map((w) => w.userId)).toEqual([u.id]);
    expect(homePathFor(u)).toBe('/lobby');
    // 다시 들어와도(재연결) 이 게임으로 자동 참가하지 않는다
    c.off();
    connect(u);
    expect(lobbyArrive(u)).toBeNull();
    expect(pullFromLobby(fresh(game), host).assigned).toBe(0);
    expect(pullFromLobby(fresh(game), host, [u.id]).assigned).toBe(1);
    expect(buildView(fresh(game), u).me.teamId).not.toBeNull();
  });

  it('대기실 페이즈에서 스스로 반납해도 대기실로 돌아가고 자동 재참가 없음', () => {
    const host = mkUser('host');
    const u = mkUser();
    connect(u);
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    leaveGame(fresh(game), u);
    expect(waitingUsers().map((w) => w.userId)).toEqual([u.id]);
    expect(lobbyArrive(u)).toBeNull();
  });

  it('게임을 지우면 그 팀원은 다시 대기 중', () => {
    const host = mkUser('host');
    const u = mkUser();
    connect(u);
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    expect(waitingUsers()).toEqual([]);
    deleteGameById(one<{ id: string }>('select id from games where code = ?', out.code)!.id);
    expect(waitingUsers().map((w) => w.userId)).toEqual([u.id]);
  });
});

describe('리뷰 수정: 내보내기·팀 고정·되돌리기', () => {
  it('내보낸 사람은 joinGame·참가 버튼으로 스스로 돌아오지 못한다 (409 kicked), 진행자의 데려오기·옮기기는 된다', () => {
    const host = mkUser('host');
    const u = mkUser();
    connect(u);
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    const [t0, t1] = teamsOf(game.id);
    kickMember(fresh(game), host, { userId: u.id });
    expect(caught(() => joinGame(fresh(game), u, t0.id, ['runner'])).code).toBe('kicked');
    expect(caught(() => joinFromLobby(u, game.code)).code).toBe('kicked');
    expect(pullFromLobby(fresh(game), host, [u.id]).assigned).toBe(1);
    kickMember(fresh(game), host, { userId: u.id });
    expect(assignMember(fresh(game), host, u.id, t1.id, ['runner']).teamId).toBe(t1.id);
    // 스스로 반납(left)한 사람은 다시 참가할 수 있다
    const self = createGame(host, 2, { mode: 'self' });
    const v = mkUser();
    joinGame(self, v, teamsOf(self.id)[0].id, ['runner']);
    leaveGame(fresh(self), v);
    expect(joinGame(fresh(self), v, teamsOf(self.id)[1].id, ['runner']).teamId).toBe(teamsOf(self.id)[1].id);
  });

  it('게임이 시작된 뒤 데려오기는 처음 팀으로만 넣는다 (사람이 더 적은 다른 팀으로 옮겨지지 않는다)', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { mode: 'auto' });
    const [t0, t1] = teamsOf(game.id);
    const a = mkUser();
    joinGame(game, a, t0.id, ['architect']);
    joinGame(game, mkUser(), t0.id, ['runner']);
    joinGame(game, mkUser(), t0.id, ['turner']);
    joinGame(game, mkUser(), t1.id, ALL);
    applyTransition(game.id, 'coding', 'lobby');
    kickMember(fresh(game), host, { userId: a.id });
    connect(a);
    expect(caught(() => joinFromLobby(a, game.code)).code).toBe('kicked');
    const res = pullFromLobby(fresh(game), host, [a.id]);
    expect(res.placements.map((p) => p.teamId)).toEqual([t0.id]);
    expect(one('select team_id from game_players where game_id = ? and user_id = ?', game.id, a.id)).toEqual({ team_id: t0.id });
    expect(buildView(fresh(game), a).me.teamId).toBe(t0.id);
  });

  it('처음 팀이 꽉 차면 데려오기는 그 사람을 대기실에 남긴다', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { mode: 'auto' });
    const [t0] = teamsOf(game.id);
    const a = mkUser();
    joinGame(game, a, t0.id, ['architect']);
    applyTransition(game.id, 'coding', 'lobby');
    kickMember(fresh(game), host, { userId: a.id });
    for (let i = 0; i < LIMITS.maxMembersPerTeam; i += 1) joinGame(fresh(game), mkUser(), t0.id, ['runner']);
    connect(a);
    expect(pullFromLobby(fresh(game), host, [a.id]).assigned).toBe(0);
    expect(buildView(fresh(game), a).me.teamId).toBeNull();
  });

  it('진행자 본인은 대기 명단에 있어도 자기 게임에 배정되지 않는다', () => {
    const host = mkUser('host');
    connect(host);
    const u = mkUser();
    connect(u);
    const out = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    expect(out.placements.map((p) => p.userId)).toEqual([u.id]);
    const game = one<GameRow>('select * from games where code = ?', out.code)!;
    expect(buildView(fresh(game), host).teams.flatMap((t) => t.people.map((p) => p.userId))).not.toContain(host.id);
  });

  it('finished → scored 되돌리기: 팀원이 이미 다른 게임에 배정됐으면 409 members_in_other_game', () => {
    const host = mkUser('host');
    const u = mkUser();
    connect(u);
    const a = createGameFromLobby(host, { teams: 2, rounds: [1], mode: 'auto' });
    const gA = one<GameRow>('select * from games where code = ?', a.code)!;
    for (const [to, from] of [['coding', 'lobby'], ['sealed', 'coding'], ['running', 'sealed'], ['scored', 'running'], ['finished', 'scored']] as const) {
      applyTransition(gA.id, to, from);
    }
    // 끝난 게임 팀원은 다시 대기 → 새 게임에 배정되면 옛 게임은 되돌리지 못한다
    expect(waitingUsers().map((w) => w.userId)).toContain(u.id);
    expect(createGameFromLobby(host, { teams: 2, mode: 'auto' }).assigned).toBe(1);
    expect(caught(() => applyTransition(gA.id, 'scored', 'finished')).code).toBe('members_in_other_game');
    expect(fresh(gA).phase).toBe('finished');
    // 아무도 다른 게임에 없으면 되돌릴 수 있다
    const other = createGame(host, 2, { rounds: [1] });
    joinGame(other, mkUser(), teamsOf(other.id)[0].id, ALL);
    for (const [to, from] of [['coding', 'lobby'], ['sealed', 'coding'], ['running', 'sealed'], ['scored', 'running'], ['finished', 'scored']] as const) {
      applyTransition(other.id, to, from);
    }
    expect(applyTransition(other.id, 'scored', 'finished')).toBe(true);
  });

  it('coding → scored 되돌리기는 이전 라운드의 공개 상태(shown_up_to·마지막 재생 팀)를 되살린다', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { rounds: [1, 2] });
    const [t0, t1] = teamsOf(game.id);
    joinGame(game, mkUser(), t0.id, ALL);
    joinGame(game, mkUser(), t1.id, ALL);
    for (const [to, from] of [['coding', 'lobby'], ['sealed', 'coding'], ['running', 'sealed'], ['scored', 'running'], ['coding', 'scored']] as const) {
      applyTransition(game.id, to, from);
    }
    expect(fresh(game).shown_up_to).toBe(0);
    applyTransition(game.id, 'scored', 'coding');
    const g = fresh(game);
    expect(g.round).toBe(1);
    expect(g.shown_up_to).toBe(2);
    expect(g.running_team_id).toBe(one<{ team_id: string }>(
      'select team_id from results where game_id = ? and round = 1 order by run_order desc limit 1', game.id)!.team_id);
    applyTransition(game.id, 'running', 'scored');
    expect(buildView(fresh(game), host).game.shownUpTo).toBe(2);
  });
});

describe('리뷰 수정 2: 한 사람 한 게임·진행자 본인', () => {
  it('다른 끝나지 않은 게임의 팀원은 joinGame(/join)으로 두 번째 게임에 들어가지 못한다 (409 in_other_game)', () => {
    const host = mkUser('host');
    const p = mkUser();
    connect(p);
    const a = createGameFromLobby(host, { teams: 2, mode: 'auto' });
    const gA = one<GameRow>('select * from games where code = ?', a.code)!;
    const mine = a.placements.find((x) => x.userId === p.id)!;
    expect(mine).toBeDefined();
    const gB = createGame(mkUser('host'), 2, { mode: 'self' });
    const [b0] = teamsOf(gB.id);
    const unfinishedGamesOfP = () => one<{ n: number }>(
      `select count(distinct m.game_id) as n from members m join games g on g.id = m.game_id
        where m.user_id = ? and g.phase <> 'finished'`, p.id)!.n;
    // A가 대기실일 때도, 코딩 중일 때도
    expect(caught(() => joinGame(gB, p, b0.id, ['runner'])).code).toBe('in_other_game');
    applyTransition(gA.id, 'coding', 'lobby');
    expect(caught(() => joinGame(fresh(gB), p, b0.id, ['architect'])).code).toBe('in_other_game');
    expect(unfinishedGamesOfP()).toBe(1);
    expect(one('select 1 from members where game_id = ? and user_id = ?', gB.id, p.id)).toBeUndefined();
    expect(homePathFor(p)).toBe(`/play/${gA.code}`);
    // 이미 이 게임의 팀원이면 그대로 역할을 더 맡을 수 있다 (검사는 새로 들어올 때만)
    expect(joinGame(fresh(gA), p, mine.teamId, ['runner']).teamId).toBe(mine.teamId);
    // A가 끝나면 B에 들어갈 수 있다
    run("update games set phase = 'finished' where id = ?", gA.id);
    expect(joinGame(fresh(gB), p, b0.id, ['runner']).teamId).toBe(b0.id);
    expect(homePathFor(p)).toBe(`/play/${gB.code}`);
  });

  it('assign: 진행자 본인은 409 host_self, 대기 중도 이 게임 사람도 아니면 409 not_waiting', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { mode: 'self' });
    const [t0] = teamsOf(game.id);
    expect(caught(() => assignMember(game, host, host.id, t0.id, ['runner'])).code).toBe('host_self');
    const stranger = mkUser();
    expect(caught(() => assignMember(game, host, stranger.id, t0.id, ['runner'])).code).toBe('not_waiting');
    expect(caught(() => assignMember(game, host, mkUser('admin').id, t0.id, ['runner'])).code).toBe('not_waiting');
    expect(caught(() => assignMember(game, host, mkUser('host').id, t0.id, ['runner'])).code).toBe('not_waiting');
    expect(buildView(fresh(game), host).teams.flatMap((t) => t.people)).toEqual([]);
    expect(homePathFor(host)).toBe('/');
    // 대기실에 들어오면 넣을 수 있다
    connect(stranger);
    expect(assignMember(fresh(game), host, stranger.id, t0.id, ['runner']).teamId).toBe(t0.id);
  });

  it('참가 버튼: 진행자 본인이 자기 자동 게임에 누르면 team_full 이 아니라 409 host_self', () => {
    const host = mkUser('host');
    const game = createGame(host, 2, { mode: 'auto' });
    const err = caught(() => joinFromLobby(host, game.code));
    expect(err.code).toBe('host_self');
    expect(err.status).toBe(409);
  });
});

describe('로그인 뒤 갈 곳', () => {
  it('팀원이면 /play/<코드>, 참가자는 /lobby, 진행자·관리자는 /', () => {
    const host = mkUser('host');
    const u = mkUser();
    expect(homePathFor(u)).toBe('/lobby');
    expect(homePathFor(host)).toBe('/');
    expect(homePathFor(mkUser('admin'))).toBe('/');
    const game = createGame(host, 2);
    joinGame(game, u, teamsOf(game.id)[0].id, ['runner']);
    expect(homePathFor(u)).toBe(`/play/${game.code}`);
    run("update games set phase = 'finished' where id = ?", game.id);
    expect(homePathFor(u)).toBe('/lobby');
  });
});
