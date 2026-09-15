// 대기실 명단·열린 게임 계산과 'lobby' 이벤트 발행 (docs/FEATURE_V4.md §3). 서버 전용.
// 대기 중 = 대기실 SSE에 (구경이 아닌) 연결이 있고, 끝나지 않은 게임의 팀원이 아닌 활성 사용자.
import { LIMITS, type AssignMode, type LobbyEvent, type LobbyUser, type OpenGameSummary, type Phase, type RoundNo } from '@/lib/contracts';
import { all } from '../db';
import { LOBBY_CHANNEL, hasChannelSubscribers, lobbyPresence, publishLobby } from '../realtime';
import { roundsOf } from './rows';

export interface WaitingEntry extends LobbyUser {
  sinceMs: number;
  seq: number;
}

/** 대기 명단 (들어온 순서). 끝나지 않은 게임의 팀원·사용 중지 계정은 뺀다 */
export function waitingUsers(): WaitingEntry[] {
  const conn = lobbyPresence();
  if (conn.length === 0) return [];
  const ids = JSON.stringify(conn.map((c) => c.userId));
  const busy = new Set(
    all<{ user_id: string }>(
      `select distinct m.user_id from members m join games g on g.id = m.game_id
        where g.phase <> 'finished' and m.user_id in (select value from json_each(?))`, ids,
    ).map((r) => r.user_id),
  );
  const users = new Map(
    all<{ id: string; username: string; display_name: string; status: string }>(
      'select id, username, display_name, status from users where id in (select value from json_each(?))', ids,
    ).map((u) => [u.id, u]),
  );
  const out: WaitingEntry[] = [];
  for (const c of conn) {
    const u = users.get(c.userId);
    if (!u || u.status !== 'active' || busy.has(c.userId)) continue;
    out.push({
      userId: u.id, username: u.username, displayName: u.display_name,
      since: new Date(c.since).toISOString(), sinceMs: c.since, seq: c.seq,
    });
  }
  return out;
}

/** 공개용 (표시 이름·아이디·들어온 시각만) */
export function toLobbyUser(w: WaitingEntry): LobbyUser {
  return { userId: w.userId, username: w.username, displayName: w.displayName, since: w.since };
}

/** 참가할 수 있는 게임: lobby·coding 페이즈 (최신 먼저). joinable = 6명 미만인 팀이 있다 */
export function openGames(): OpenGameSummary[] {
  return all<{
    code: string; host_name: string | null; phase: Phase; round: RoundNo; rounds: string; mode: AssignMode;
    created_at: string; teams: number; members: number; open_teams: number;
  }>(
    `select g.code, u.display_name as host_name, g.phase, g.round, g.rounds, g.mode, g.created_at,
            (select count(*) from teams t where t.game_id = g.id) as teams,
            (select count(distinct m.user_id) from members m where m.game_id = g.id) as members,
            (select count(*) from teams t where t.game_id = g.id
                and (select count(distinct m.user_id) from members m where m.team_id = t.id) < ?) as open_teams
       from games g left join users u on u.id = g.host_id
      where g.phase in ('lobby', 'coding')
      order by g.created_at desc, g.rowid desc`,
    LIMITS.maxMembersPerTeam,
  ).map((r) => ({
    code: r.code,
    hostName: r.host_name ?? '',
    phase: r.phase,
    round: r.round,
    rounds: roundsOf(r),
    teams: r.teams,
    members: r.members,
    mode: r.mode,
    joinable: r.open_teams > 0,
    createdAt: r.created_at,
  }));
}

export function lobbyEventNow(): Extract<LobbyEvent, { type: 'lobby' }> {
  return { type: 'lobby', waiting: waitingUsers().map(toLobbyUser), openGames: openGames() };
}

/** 여러 변경을 묶어 한 번만 보낸다 (많은 사람이 한꺼번에 들어올 때) */
export const LOBBY_EMIT_DELAY_MS = 50;

const store = globalThis as unknown as { __owlLobbyTimer?: ReturnType<typeof setTimeout> };

/** 대기실 구독자에게 최신 명단을 보낸다 (약 50ms 뒤, 그 사이 요청은 한 번으로 묶인다) */
export function emitLobby(): void {
  if (!hasChannelSubscribers(LOBBY_CHANNEL)) return;
  if (store.__owlLobbyTimer) return;
  const t = setTimeout(() => {
    store.__owlLobbyTimer = undefined;
    flushLobby();
  }, LOBBY_EMIT_DELAY_MS);
  (t as { unref?: () => void }).unref?.();
  store.__owlLobbyTimer = t;
}

/** 지금 바로 보낸다 (테스트·즉시 반영용) */
export function flushLobby(): void {
  if (store.__owlLobbyTimer) {
    clearTimeout(store.__owlLobbyTimer);
    store.__owlLobbyTimer = undefined;
  }
  if (!hasChannelSubscribers(LOBBY_CHANNEL)) return;
  try {
    publishLobby(lobbyEventNow());
  } catch (err) {
    console.error('[lobby] emit', err);
  }
}
