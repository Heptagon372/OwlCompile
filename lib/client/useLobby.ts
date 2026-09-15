'use client';
// 대기실 공용 훅: GET /api/lobby + 대기실 SSE 구독 + 재연결 + 시계 보정 (docs/FEATURE_V4.md §3)
// 참가자 화면(/lobby)은 기본(대기), 진행자 화면(/host)은 { watch: true } (구경만, 대기 명단에 들지 않음).
// 주의: 클라이언트 코드는 '@/lib/engine' 인덱스를 import 하지 않는다(정답·실행기가 번들에 섞임).
import { useCallback, useEffect, useRef, useState } from 'react';
import { API, type LobbyEvent, type LobbyResponse } from '@/lib/contracts';
import { api, ApiClientError } from './api';
import type { ConnectionStatus } from './useGame';

export type LobbyAssignedEvent = Extract<LobbyEvent, { type: 'assigned' }>;
export type LobbyGameOpenEvent = Extract<LobbyEvent, { type: 'game-open' }>;

export interface UseLobbyOptions {
  /** true면 구경만 (진행자 화면). 참가자는 false(기본) = 대기 명단에 든다 */
  watch?: boolean;
  /** false면 아무것도 하지 않는다 (기본 true) */
  enabled?: boolean;
  /** 모든 대기실 이벤트 (hello 포함) */
  onEvent?: (e: LobbyEvent) => void;
  /** 나를 팀에 넣었다 → 보통 router.push(`/play/${e.code}`) */
  onAssigned?: (e: LobbyAssignedEvent) => void;
  /** 직접 선택 게임이 열렸다 → 보통 router.push(`/join?code=${e.code}`) */
  onGameOpen?: (e: LobbyGameOpenEvent) => void;
}

export interface UseLobbyResult {
  /** 마지막으로 받은 대기실 상태 ('lobby' 이벤트로 waiting·openGames가 바로 갱신된다) */
  lobby: LobbyResponse | null;
  error: ApiClientError | null;
  status: ConnectionStatus;
  /** 대기 인원 (lobby가 없으면 0) */
  waitingCount: number;
  /** 마지막 'assigned' 이벤트 (없으면 null) */
  assigned: LobbyAssignedEvent | null;
  /** 마지막 'game-open' 이벤트 (없으면 null) */
  gameOpen: LobbyGameOpenEvent | null;
  /** 보정된 현재 시각 (ms) */
  serverNow: () => number;
  /** GET /api/lobby를 다시 받는다 (동시에 여러 번 불러도 한 번씩만 실행) */
  refresh: () => Promise<void>;
}

export function useLobby(opts: UseLobbyOptions = {}): UseLobbyResult {
  const watch = !!opts.watch;
  const enabled = opts.enabled ?? true;
  const [lobby, setLobby] = useState<LobbyResponse | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [assigned, setAssigned] = useState<LobbyAssignedEvent | null>(null);
  const [gameOpen, setGameOpen] = useState<LobbyGameOpenEvent | null>(null);
  const offsetRef = useRef(0);
  const cbRef = useRef(opts);
  cbRef.current = opts;
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) {
      again.current = true;
      return inflight.current;
    }
    const job = (async () => {
      do {
        again.current = false;
        try {
          const t0 = Date.now();
          const v = await api<LobbyResponse>(API.lobby);
          const t1 = Date.now();
          offsetRef.current = Date.parse(v.serverNow) - (t0 + t1) / 2;
          setLobby(v);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiClientError ? err : new ApiClientError(0, 'network', '서버에 연결할 수 없습니다.', null));
        }
      } while (again.current);
    })();
    inflight.current = job;
    try {
      await job;
    } finally {
      inflight.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let closed = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const handle = (e: LobbyEvent) => {
      cbRef.current.onEvent?.(e);
      switch (e.type) {
        case 'hello':
          offsetRef.current = Date.parse(e.serverNow) - Date.now();
          setLobby((l) => (l ? { ...l, myGame: e.myGame, me: { ...l.me, waiting: e.waiting } } : l));
          return;
        case 'lobby':
          setLobby((l) => (l
            ? { ...l, waiting: e.waiting, openGames: e.openGames, me: { ...l.me, waiting: e.waiting.some((w) => w.userId === l.me.userId) } }
            : l));
          return;
        case 'assigned':
          setAssigned(e);
          cbRef.current.onAssigned?.(e);
          void refresh();
          return;
        case 'game-open':
          setGameOpen(e);
          cbRef.current.onGameOpen?.(e);
          return;
      }
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(API.lobbyEvents({ watch }));
      es.onopen = () => {
        retry = 0;
        setStatus('live');
        void refresh(); // 끊긴 사이 놓친 변경 보정
      };
      es.onmessage = (msg: MessageEvent<string>) => {
        let e: LobbyEvent;
        try {
          e = JSON.parse(msg.data) as LobbyEvent;
        } catch {
          return;
        }
        handle(e);
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        setStatus('reconnecting');
        void refresh(); // 로그아웃·권한 문제면 error(401)로 알린다
        const delay = Math.min(8000, 1000 * 2 ** retry);
        retry += 1;
        retryTimer = setTimeout(connect, delay);
      };
    };

    void refresh();
    connect();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !es && !closed) {
        clearTimeout(retryTimer);
        retry = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, watch, refresh]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return {
    lobby,
    error,
    status,
    waitingCount: lobby?.waiting.length ?? 0,
    assigned,
    gameOpen,
    serverNow,
    refresh,
  };
}
