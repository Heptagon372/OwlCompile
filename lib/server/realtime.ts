// 메모리 pub/sub + SSE 스트림 + 온라인 추적 + 타이머 틱커 (docs/WEBSITE_SPEC.md §7, FEATURE_V4 §3). 서버 전용.
// 단일 Node 프로세스 전제. 라우트 번들이 달라도 같은 버스를 쓰도록 globalThis에 둔다.
// 채널: 게임 id(게임 SSE) 또는 LOBBY_CHANNEL(대기실 SSE). 같은 버스를 쓰되 채널 id가 다르다.
import type { GameEvent, LobbyEvent } from '@/lib/contracts';

export type BusEvent = GameEvent | LobbyEvent;

/** 대기실 채널 id (게임 id는 UUID라 겹치지 않는다) */
export const LOBBY_CHANNEL = 'lobby';
/** 대기실 연결이 끊겼다가 이 시간 안에 다시 붙으면 들어온 시각(자동 배정 순서)을 유지한다 */
export const LOBBY_GRACE_MS = 15_000;

export interface Subscriber {
  id: number;
  /** 채널: 게임 id 또는 LOBBY_CHANNEL */
  gameId: string;
  userId: string;
  /** 구독자의 팀 (진행자·보드는 null). 참가하면 setSubscriberTeam으로 갱신 */
  teamId: string | null;
  /** 이 게임의 진행자·관리자: 모든 팀 이벤트를 받는다 */
  isHost: boolean;
  /** 대기실 채널에서 구경만 하는 연결 (진행자 화면). 대기 명단에 들지 않는다 */
  watch?: boolean;
  /** 이 스트림을 연 세션 토큰의 sha256 (로그아웃하면 그 세션의 스트림만 닫는다) */
  tokenHash?: string | null;
  send: (event: BusEvent) => void;
  /** 스트림을 닫고 구독을 해제한다 (권한 회수·연결 수 초과 때) */
  close: () => void;
}

/** 한 사용자가 한 채널에 동시에 열 수 있는 SSE 연결 수. 넘으면 가장 오래된 것을 닫는다. */
export const MAX_STREAMS_PER_USER = 6;

export interface Target {
  /** 이 팀의 구독자와 진행자에게만 */
  teamId?: string;
  /** 진행자에게만 */
  hostsOnly?: boolean;
  /** 이 사용자의 연결에만 */
  userId?: string;
  /** 구경(watch) 연결은 빼고 */
  waitingOnly?: boolean;
}

interface LobbyEntry { since: number; seq: number; goneAt: number | null }

interface Bus {
  seq: number;
  subs: Map<string, Set<Subscriber>>;
  presence: Map<string, (channel: string) => void>;
  tickers: Map<string, ReturnType<typeof setInterval>>;
  /** 대기실에 들어온 시각 (사용자별). 예전 버스 객체에는 없을 수 있다 */
  lobby?: Map<string, LobbyEntry>;
  lobbySeq?: number;
}

const store = globalThis as unknown as { __owlBus?: Bus };
function bus(): Bus {
  store.__owlBus ??= { seq: 0, subs: new Map(), presence: new Map(), tickers: new Map() };
  store.__owlBus.lobby ??= new Map();
  return store.__owlBus;
}

function countUser(channel: string, userId: string): number {
  let n = 0;
  for (const s of bus().subs.get(channel) ?? []) if (s.userId === userId) n += 1;
  return n;
}

function countWaitingStreams(userId: string): number {
  let n = 0;
  for (const s of bus().subs.get(LOBBY_CHANNEL) ?? []) if (s.userId === userId && !s.watch) n += 1;
  return n;
}

function notifyPresence(channel: string): void {
  for (const fn of bus().presence.values()) {
    try {
      fn(channel);
    } catch (err) {
      console.error('[realtime] presence listener', err);
    }
  }
}

/** 사용자가 대기실에 (다시) 들어왔다: 처음이거나 유예 시간이 지났으면 지금을 들어온 시각으로 */
function enterLobby(userId: string, now = Date.now()): void {
  const b = bus();
  const map = b.lobby!;
  for (const [k, v] of map) if (v.goneAt !== null && now - v.goneAt > LOBBY_GRACE_MS) map.delete(k);
  const e = map.get(userId);
  if (e) {
    e.goneAt = null;
    return;
  }
  b.lobbySeq = (b.lobbySeq ?? 0) + 1;
  map.set(userId, { since: now, seq: b.lobbySeq, goneAt: null });
}

function leaveLobby(userId: string, now = Date.now()): void {
  const e = bus().lobby!.get(userId);
  if (e) e.goneAt = now;
}

/**
 * 구독 등록. 반환값을 호출하면 해제된다. 사용자의 첫 연결·마지막 해제 때 presence 리스너가 불린다.
 * close를 주지 않으면 해제만 한다. 같은 사용자의 연결이 MAX_STREAMS_PER_USER를 넘으면 가장 오래된 것을 닫는다.
 */
export function subscribe(sub: Omit<Subscriber, 'id' | 'close'> & { close?: () => void }): () => void {
  const b = bus();
  const set = b.subs.get(sub.gameId) ?? new Set<Subscriber>();
  b.subs.set(sub.gameId, set);
  const mineOld = [...set].filter((s) => s.userId === sub.userId).sort((x, y) => x.id - y.id);
  for (const old of mineOld.slice(0, Math.max(0, mineOld.length - (MAX_STREAMS_PER_USER - 1)))) old.close();
  const waitingStream = sub.gameId === LOBBY_CHANNEL && !sub.watch;
  if (waitingStream && countWaitingStreams(sub.userId) === 0) enterLobby(sub.userId);
  const first = countUser(sub.gameId, sub.userId) === 0;
  let unsubscribe: () => void = () => {};
  const full: Subscriber = { ...sub, id: ++b.seq, close: sub.close ?? (() => unsubscribe()) };
  set.add(full);
  if (first) notifyPresence(sub.gameId);
  let done = false;
  unsubscribe = () => {
    if (done) return;
    done = true;
    set.delete(full);
    if (b.subs.get(sub.gameId) === set && set.size === 0) b.subs.delete(sub.gameId);
    if (waitingStream && countWaitingStreams(sub.userId) === 0) leaveLobby(sub.userId);
    if (countUser(sub.gameId, sub.userId) === 0) notifyPresence(sub.gameId);
  };
  return unsubscribe;
}

/**
 * 사용자의 모든 SSE 스트림을 닫는다 (사용 중지·삭제·비밀번호 초기화·역할 변경 때).
 * 클라이언트는 재연결하면서 권한을 다시 검사받는다 (없으면 401/403).
 */
export function disconnectUser(userId: string): void {
  for (const set of [...bus().subs.values()]) {
    for (const s of [...set]) if (s.userId === userId) s.close();
  }
}

/** 한 세션(토큰 해시)으로 연 SSE 스트림만 닫는다 (로그아웃 때). 같은 사용자의 다른 기기는 그대로 둔다. */
export function disconnectSession(tokenHash: string): void {
  if (!tokenHash) return;
  for (const set of [...bus().subs.values()]) {
    for (const s of [...set]) if (s.tokenHash === tokenHash) s.close();
  }
}

/** 테스트용: 채널의 구독 수 */
export function subscriberCount(gameId: string, userId?: string): number {
  let n = 0;
  for (const s of bus().subs.get(gameId) ?? []) if (!userId || s.userId === userId) n += 1;
  return n;
}

/** 채널에 구독자가 하나라도 있는가 */
export function hasChannelSubscribers(channel: string): boolean {
  return (bus().subs.get(channel)?.size ?? 0) > 0;
}

function deliver(channel: string, event: BusEvent, target: Target): void {
  for (const s of [...(bus().subs.get(channel) ?? [])]) {
    if (target.hostsOnly && !s.isHost) continue;
    if (target.teamId && !s.isHost && s.teamId !== target.teamId) continue;
    if (target.userId && s.userId !== target.userId) continue;
    if (target.waitingOnly && s.watch) continue;
    try {
      s.send(event);
    } catch {
      // 끊긴 스트림: abort 처리에서 정리된다
    }
  }
}

/** 게임 이벤트 발행. target이 있으면 그 팀·진행자에게만. */
export function publish(gameId: string, event: GameEvent, target: Target = {}): void {
  deliver(gameId, event, target);
}

/** 대기실 이벤트 발행. target.userId면 그 사람의 대기실 연결에만 */
export function publishLobby(event: LobbyEvent, target: Target = {}): void {
  deliver(LOBBY_CHANNEL, event, target);
}

/**
 * 대기실에 연결된(구경 제외) 사용자와 들어온 시각. 들어온 순서(시각 → 도착 순번)로 정렬.
 * 끝나지 않은 게임의 팀원인지는 여기서 거르지 않는다 (DB 조회는 lobbyFeed.ts).
 */
export function lobbyPresence(): { userId: string; since: number; seq: number }[] {
  const b = bus();
  const ids = new Set<string>();
  for (const s of b.subs.get(LOBBY_CHANNEL) ?? []) if (!s.watch) ids.add(s.userId);
  const out: { userId: string; since: number; seq: number }[] = [];
  for (const userId of ids) {
    let e = b.lobby!.get(userId);
    if (!e) {
      enterLobby(userId);
      e = b.lobby!.get(userId)!;
    }
    out.push({ userId, since: e.since, seq: e.seq });
  }
  return out.sort((x, y) => x.since - y.since || x.seq - y.seq);
}

/** 게임에 SSE로 연결된 사용자 id */
export function onlineUserIds(gameId: string): Set<string> {
  const out = new Set<string>();
  for (const s of bus().subs.get(gameId) ?? []) out.add(s.userId);
  return out;
}

/** 연결 중인 사용자가 팀에 참가·이탈했을 때 구독의 팀을 바꾼다 */
export function setSubscriberTeam(gameId: string, userId: string, teamId: string | null): void {
  for (const s of bus().subs.get(gameId) ?? []) if (s.userId === userId) s.teamId = teamId;
}

/** 게임이 삭제될 때: 모두에게 deleted를 보내고 구독을 정리하는 건 스트림 쪽 abort에 맡긴다 */
export function publishDeleted(gameId: string): void {
  publish(gameId, { type: 'deleted' });
}

/** 이름으로 presence 리스너 등록 (같은 이름은 교체되므로 HMR에서도 중복되지 않는다). 인자는 채널 id */
export function onPresenceChange(name: string, fn: (channel: string) => void): void {
  bus().presence.set(name, fn);
}

/** 이름으로 주기 작업 등록. 이미 있으면 무시 (프로세스당 1개). */
export function startTicker(name: string, fn: () => void, ms: number): void {
  const b = bus();
  if (b.tickers.has(name)) return;
  const t = setInterval(() => {
    try {
      fn();
    } catch (err) {
      console.error(`[realtime] ticker ${name}`, err);
    }
  }, ms);
  (t as { unref?: () => void }).unref?.();
  b.tickers.set(name, t);
}

/**
 * SSE 응답을 만든다. hello를 먼저 보내고 구독을 등록한다. 25초마다 주석 핑.
 * 구독은 이 함수가 돌아오기 전에 등록된다 (ReadableStream start는 동기) → 곧바로 publish해도 받는다.
 * 라우트: export const dynamic = 'force-dynamic'; GET에서 권한 확인 후 return sseResponse(req, {...}, hello)
 */
export function sseResponse(req: Request, sub: Omit<Subscriber, 'id' | 'send' | 'close'>, hello: BusEvent): Response {
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (ping) clearInterval(ping);
    unsubscribe();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: BusEvent) => write(`data: ${JSON.stringify(event)}\n\n`);
      const close = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // 이미 닫힘
        }
      };
      write('retry: 2000\n\n');
      send(hello);
      unsubscribe = subscribe({ ...sub, send, close });
      ping = setInterval(() => write(': ping\n\n'), 25_000);
      req.signal.addEventListener('abort', close);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
