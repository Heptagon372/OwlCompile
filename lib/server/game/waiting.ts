// 대기실 → 게임 배정 (docs/FEATURE_V4.md §3). 서버 전용.
// 자동 배정: 대기 중인 사람을 들어온 순서대로 사람이 가장 적은 팀(같으면 앞자리)에 넣는다 = 빈 게임에서는 i mod T.
// 팀당 6명까지, 넘치면 대기실에 남는다. 빈 팀에 새로 들어가는 사람들의 역할 = autoRoleSplit (4역할 모두 채움),
// 이미 사람이 있는 팀에 들어가면 autoRolesForNewcomer (빠진 역할 전부, 없으면 k mod 4).
import {
  GAME_ROLES, LIMITS, autoRoleSplit, autoRolesForNewcomer, sortRoles,
  type AccountRole, type AssignMode, type AssignResponse, type CreateGameResponse, type GameRole, type LobbyJoinResponse,
  type LobbyPlacement, type LobbyResponse, type PullResponse,
} from '@/lib/contracts';
import { all, newId, nowIso, one, run, tx } from '../db';
import { badRequest, conflict, notFound } from '../http';
import { publishLobby, setSubscriberTeam } from '../realtime';
import type { SessionUser } from '../session';
import { emitTeams } from './events';
import { createGame, kickedError, kickedFrom, teamFull } from './lobby';
import { emitLobby, openGames, toLobbyUser, waitingUsers } from './lobbyFeed';
import {
  activeGameOf, gameByCode, gameById, inOtherUnfinishedGame, membersOf, membershipOf, requireHost, teamHeadcount,
  teamOf, teamsOf, type GameRow,
} from './rows';

const OPEN_PHASES: ReadonlySet<string> = new Set(['lobby', 'coding']);
const JOIN_CLOSED = '대기실이나 코딩 중인 게임에만 사람을 넣을 수 있습니다.';

function isOpen(game: GameRow): boolean {
  return OPEN_PHASES.has(game.phase);
}

function userActive(userId: string): boolean {
  return one<{ status: string }>('select status from users where id = ?', userId)?.status === 'active';
}

function exitedFrom(gameId: string, userId: string): boolean {
  return !!one('select 1 from game_exits where game_id = ? and user_id = ?', gameId, userId);
}

/** 역할 행 넣기 + 이 게임의 팀 기록 + 대기실 복귀 표시 지우기 (트랜잭션 안에서) */
function insertRoles(gameId: string, teamId: string, userId: string, roles: readonly GameRole[], now: string): void {
  for (const r of roles) {
    run('insert or ignore into members (id, game_id, team_id, user_id, role, joined_at) values (?, ?, ?, ?, ?, ?)',
      newId(), gameId, teamId, userId, r, now);
  }
  run(`insert into game_players (game_id, user_id, team_id) values (?, ?, ?)
       on conflict (game_id, user_id) do update set team_id = excluded.team_id`, gameId, userId, teamId);
  run('delete from game_exits where game_id = ? and user_id = ?', gameId, userId);
}

/**
 * 트랜잭션 안에서 부른다. userIds를 순서대로 자동 배정 규칙에 따라 넣는다.
 * 넣을 수 없는 사람(다른 끝나지 않은 게임의 팀원, 사용 중지, skipExited면 이 게임에서 나간 사람, 자리 없음)은 skipped.
 */
export function placeUsers(
  game: GameRow, userIds: readonly string[], opts: { skipExited: boolean },
): { placements: LobbyPlacement[]; skipped: string[] } {
  const teams = teamsOf(game.id);
  const people = new Map(teams.map((t) => [t.id, new Set<string>()]));
  const covered = new Map(teams.map((t) => [t.id, new Set<GameRole>()]));
  for (const m of membersOf(game.id)) {
    people.get(m.team_id)?.add(m.user_id);
    covered.get(m.team_id)?.add(m.role);
  }
  const incoming = new Map(teams.map((t) => [t.id, [] as string[]]));
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const uid of userIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    // 이 게임의 진행자 본인은 자기 게임의 팀원이 되지 않는다
    const eligible = uid !== game.host_id && userActive(uid) && activeGameOf(uid) === null
      && !(opts.skipExited && exitedFrom(game.id, uid));
    if (!eligible) {
      skipped.push(uid);
      continue;
    }
    // 게임이 시작된 뒤에는 처음 들어간 팀(game_players)에만 다시 넣는다 (joinGame과 같은 규칙:
    // 내보내진 사람이 다른 팀으로 옮겨 그 팀 코드를 보거나 지우지 못하게). 옮기기는 진행자의 assign만.
    const bound = game.phase !== 'lobby'
      ? one<{ team_id: string }>('select team_id from game_players where game_id = ? and user_id = ?', game.id, uid)?.team_id ?? null
      : null;
    // 사람이 가장 적은 팀 (6명 미만), 같으면 앞자리
    let best: string | null = null;
    let bestN = Infinity;
    for (const t of teams) {
      if (bound && people.has(bound) && t.id !== bound) continue;
      const n = people.get(t.id)!.size + incoming.get(t.id)!.length;
      if (n < LIMITS.maxMembersPerTeam && n < bestN) {
        best = t.id;
        bestN = n;
      }
    }
    if (!best) {
      skipped.push(uid);
      continue;
    }
    incoming.get(best)!.push(uid);
  }
  const now = nowIso();
  const byUser = new Map<string, LobbyPlacement>();
  for (const t of teams) {
    const list = incoming.get(t.id)!;
    if (list.length === 0) continue;
    const base = people.get(t.id)!.size;
    const cov = [...covered.get(t.id)!];
    const split = base === 0 ? autoRoleSplit(list.length) : null;
    list.forEach((uid, k) => {
      const roles = split ? split[k] : autoRolesForNewcomer(base + k, cov);
      if (!split) cov.push(...roles);
      insertRoles(game.id, t.id, uid, roles, now);
      byUser.set(uid, { userId: uid, teamId: t.id, teamName: t.name, teamColor: t.color, roles: sortRoles(roles) });
    });
  }
  const placements = userIds.map((u) => byUser.get(u)).filter((p): p is LobbyPlacement => !!p);
  return { placements, skipped };
}

/** 커밋 뒤: 배정된 사람의 대기실 연결에 'assigned', 게임 채널 teams, 대기실 명단 갱신 */
function announce(game: GameRow, placements: readonly LobbyPlacement[]): void {
  for (const p of placements) {
    setSubscriberTeam(game.id, p.userId, p.teamId);
    publishLobby(
      { type: 'assigned', code: game.code, teamId: p.teamId, teamName: p.teamName, teamColor: p.teamColor, roles: p.roles },
      { userId: p.userId },
    );
  }
  if (placements.length > 0) emitTeams(game.id);
  emitLobby();
}

/**
 * POST /api/games: 게임을 만들고, auto면 지금 대기 중인 사람을 바로 배정해 각자에게 'assigned'를,
 * self면 대기 중인 사람에게 'game-open'을 보낸다.
 */
export function createGameFromLobby(
  user: SessionUser, input: { teams: number; rounds?: readonly number[]; mode?: AssignMode },
): CreateGameResponse {
  const mode = input.mode ?? 'auto';
  const queue = mode === 'auto' ? waitingUsers().map((w) => w.userId) : [];
  const { game, placements } = tx(() => {
    const g = createGame(user, input.teams, { rounds: input.rounds, mode });
    return { game: g, placements: mode === 'auto' ? placeUsers(g, queue, { skipExited: true }).placements : [] };
  });
  announce(game, placements);
  const left = waitingUsers();
  if (mode === 'self') {
    for (const w of left) publishLobby({ type: 'game-open', code: game.code }, { userId: w.userId, waitingOnly: true });
  }
  return { code: game.code, assigned: placements.length, leftWaiting: left.length, placements };
}

/**
 * POST /pull: 진행자가 대기실 사람을 자동 배정 규칙으로 데려온다 (lobby·coding).
 * userIds를 주면 그 사람들만(이 게임에서 내보낸 사람도 포함), 없으면 대기 명단 전체(이 게임에서 나간 사람 제외).
 */
export function pullFromLobby(game: GameRow, user: SessionUser, userIds?: readonly string[]): PullResponse {
  requireHost(game, user);
  const explicit = userIds !== undefined && userIds.length > 0;
  let queue = waitingUsers().map((w) => w.userId);
  if (explicit) {
    const want = new Set(userIds);
    queue = queue.filter((u) => want.has(u));
  }
  const res = tx(() => {
    const g = gameById(game.id);
    if (!isOpen(g)) throw conflict(JOIN_CLOSED, 'join_closed');
    return placeUsers(g, queue, { skipExited: !explicit });
  });
  announce(game, res.placements);
  return { assigned: res.placements.length, leftWaiting: waitingUsers().length, placements: res.placements };
}

/**
 * POST /assign: 진행자가 한 사람을 팀·역할에 넣거나 옮긴다 (역할은 통째로 바뀐다, lobby·coding).
 * 다른 끝나지 않은 게임의 팀원이면 409 in_other_game, 대상 팀이 6명이면 409 team_full,
 * 이 게임의 진행자 본인이면 409 host_self (placeUsers와 같은 규칙),
 * 대기 중인 사람·이 게임의 팀원·이 게임에 들어왔던 사람(팀 기록·대기실 복귀 기록)이 아니면 409 not_waiting.
 */
export function assignMember(
  game: GameRow, user: SessionUser, userId: string, teamId: string, roles: readonly GameRole[],
): AssignResponse {
  requireHost(game, user);
  const wanted = sortRoles([...new Set(roles)]);
  if (wanted.length === 0 || roles.some((r) => !GAME_ROLES.includes(r))) {
    throw badRequest('역할을 하나 이상 골라 주세요.', 'invalid_input');
  }
  const team = teamOf(game, teamId);
  const target = one<{ id: string; status: string }>('select id, status from users where id = ?', userId);
  if (!target) throw notFound('사용자를 찾을 수 없습니다.');
  if (target.status !== 'active') throw conflict('사용이 중지된 계정입니다.', 'account_disabled');
  // 진행자 본인은 자기 게임의 팀원이 되지 않는다 (로그인·/me가 /play로 보내 콘솔을 잃는다)
  if (userId === game.host_id) throw conflict('진행자 본인은 자기 게임의 팀에 넣을 수 없습니다.', 'host_self');
  const waitingNow = waitingUsers().some((w) => w.userId === userId);
  tx(() => {
    const g = gameById(game.id);
    if (!isOpen(g)) throw conflict(JOIN_CLOSED, 'join_closed');
    if (inOtherUnfinishedGame(userId, g.id)) throw conflict('다른 게임에 참가 중인 사람입니다.', 'in_other_game');
    // 아무 계정이나(관리자·다른 진행자·대기실에 없는 사람) 몰래 팀원으로 만들지 않는다: 콘솔이 보여 주는 사람만
    const known = waitingNow
      || membershipOf(g.id, userId).teamId !== null
      || !!one('select 1 from game_players where game_id = ? and user_id = ?', g.id, userId)
      || exitedFrom(g.id, userId);
    if (!known) {
      throw conflict('대기실에서 기다리는 사람이나 이 게임의 팀원만 넣을 수 있습니다.', 'not_waiting');
    }
    if (teamHeadcount(team.id, userId) >= LIMITS.maxMembersPerTeam) throw teamFull();
    run('delete from members where game_id = ? and user_id = ?', g.id, userId);
    insertRoles(g.id, team.id, userId, wanted, nowIso());
  });
  announce(game, [{ userId, teamId: team.id, teamName: team.name, teamColor: team.color, roles: wanted }]);
  return { ok: true, teamId: team.id, roles: wanted };
}

/**
 * 대기실 SSE에 들어온 순간 (늦게 온 사람): 열린 자동 배정 게임(lobby·coding, 자리 있음, 이 사람이 나가지 않은 게임)이
 * 정확히 하나면 사람이 가장 적은 팀에 넣고 'assigned'를 보낸다. 넣었으면 배정 내용을, 아니면 null.
 */
export function lobbyArrive(user: Pick<SessionUser, 'id'>): LobbyPlacement & { code: string } | null {
  if (activeGameOf(user.id) !== null || !userActive(user.id)) return null;
  const candidates = all<GameRow>(
    `select g.* from games g
      where g.mode = 'auto' and g.phase in ('lobby', 'coding')
        and not exists (select 1 from game_exits x where x.game_id = g.id and x.user_id = ?)
        and exists (select 1 from teams t where t.game_id = g.id
                      and (select count(distinct m.user_id) from members m where m.team_id = t.id) < ?)`,
    user.id, LIMITS.maxMembersPerTeam,
  );
  if (candidates.length !== 1) return null;
  const game = candidates[0];
  const res = tx(() => {
    const g = gameById(game.id);
    if (!isOpen(g)) return { placements: [] as LobbyPlacement[], skipped: [] };
    return placeUsers(g, [user.id], { skipExited: true });
  });
  if (res.placements.length === 0) return null;
  announce(game, res.placements);
  return { ...res.placements[0], code: game.code };
}

/** POST /api/lobby/join: 대기실의 "참가" 버튼 — 자동 배정 게임에 나를 넣는다. 직접 선택 게임이면 409 self_mode */
export function joinFromLobby(user: SessionUser, code: string): LobbyJoinResponse {
  const game = gameByCode(code);
  if (!isOpen(game)) throw conflict('지금은 참가할 수 없습니다. 대기실이나 코딩 중에만 참가할 수 있어요.', 'join_closed');
  const mine = membershipOf(game.id, user.id);
  if (mine.teamId) {
    const t = teamOf(game, mine.teamId);
    return { code: game.code, teamId: t.id, teamName: t.name, roles: mine.roles };
  }
  // placeUsers는 진행자 본인을 건너뛴다: 빈 배정을 "팀 꽉 참"으로 잘못 알리지 않게 먼저 거른다
  if (game.host_id === user.id) {
    throw conflict('자기 게임에는 참가 버튼으로 들어갈 수 없습니다. 직접 해 보려면 게임 코드로 들어가 팀과 역할을 고르세요.', 'host_self');
  }
  if (game.mode !== 'auto') throw conflict('직접 선택 게임입니다. 팀과 역할을 골라 참가해 주세요.', 'self_mode');
  if (inOtherUnfinishedGame(user.id, game.id)) throw conflict('이미 다른 게임에 참가 중입니다.', 'in_other_game');
  const res = tx(() => {
    const g = gameById(game.id);
    if (!isOpen(g)) throw conflict('지금은 참가할 수 없습니다.', 'join_closed');
    // 진행자가 내보낸 사람은 참가 버튼으로 되돌아오지 못한다 (진행자가 데려오기·옮기기로만)
    if (kickedFrom(g.id, user.id)) throw kickedError();
    return placeUsers(g, [user.id], { skipExited: false });
  });
  const p = res.placements[0];
  if (!p) throw teamFull();
  announce(game, res.placements);
  return { code: game.code, teamId: p.teamId, teamName: p.teamName, roles: p.roles };
}

/** GET /api/lobby */
export function lobbySnapshot(viewer: SessionUser): LobbyResponse {
  const waiting = waitingUsers();
  return {
    me: {
      userId: viewer.id,
      username: viewer.username,
      displayName: viewer.displayName,
      accountRole: viewer.role,
      waiting: waiting.some((w) => w.userId === viewer.id),
    },
    serverNow: new Date().toISOString(),
    waiting: waiting.map(toLobbyUser),
    openGames: openGames(),
    myGame: activeGameOf(viewer.id),
  };
}

/**
 * 로그인·가입 뒤 갈 곳 (FEATURE_V4 §3): 끝나지 않은 게임의 팀원 → /play/<코드>, 참가자 → /lobby, 진행자·관리자 → /
 */
export function homePathFor(user: { id: string; role: AccountRole }): string {
  const g = activeGameOf(user.id);
  if (g) return `/play/${g.code}`;
  return user.role === 'player' ? '/lobby' : '/';
}
