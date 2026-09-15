'use client';
// 게임 화면 공용 훅: GET /state + SSE 구독 + 재연결 + 시계 보정 (docs/WEBSITE_SPEC.md §7)
// 주의: 클라이언트 코드는 '@/lib/engine' 인덱스를 import 하지 않는다(정답·실행기가 번들에 섞임).
//       필요한 순수 함수는 '@/lib/engine/text' 처럼 모듈을 직접 가져온다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { API, type GameEvent, type GameView } from '@/lib/contracts';
import { toText } from '@/lib/engine/text';
import { api, ApiClientError } from './api';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

export interface UseGameResult {
  view: GameView | null;
  error: ApiClientError | null;
  status: ConnectionStatus;
  /** 서버 시각 − 로컬 시각 (ms) */
  serverOffsetMs: number;
  /** 보정된 현재 시각 (ms) */
  serverNow: () => number;
  /** /state를 다시 받는다 (동시에 여러 번 불러도 한 번씩만 실행) */
  refresh: () => Promise<void>;
  /** 로컬에서 뷰를 고친다 (예: 저장 성공 후 myProgram.version 갱신) */
  patchView: (fn: (v: GameView) => GameView) => void;
}

export function useGame(code: string, opts: { onEvent?: (e: GameEvent) => void } = {}): UseGameResult {
  const [view, setView] = useState<GameView | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
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
          const v = await api<GameView>(API.gameState(code));
          const t1 = Date.now();
          const off = Date.parse(v.serverNow) - (t0 + t1) / 2;
          offsetRef.current = off;
          setOffset(off);
          setView(v);
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
  }, [code]);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 80);
    };

    const applyProgram = (e: Extract<GameEvent, { type: 'program' }>) => {
      setView((v) => {
        if (!v || e.round !== v.game.round) return v;
        const teams = v.teams.map((t) =>
          t.id === e.teamId ? { ...t, program: { ...t.program, blocks: e.blocks, submittedAt: e.submittedAt } } : t);
        let myProgram = v.myProgram;
        if (myProgram && myProgram.teamId === e.teamId && e.version > myProgram.version) {
          myProgram = { ...myProgram, doc: e.doc, version: e.version, blocks: e.blocks, submittedAt: e.submittedAt };
        }
        const programs = v.programs
          ? { ...v.programs, [e.teamId]: { doc: e.doc, text: toText(e.doc).text } }
          : v.programs;
        return { ...v, teams, myProgram, programs };
      });
    };

    const connect = () => {
      if (closed) return;
      es = new EventSource(API.gameEvents(code));
      es.onopen = () => {
        retry = 0;
        setStatus('live');
        void refresh(); // 끊긴 사이 놓친 변경 보정
      };
      es.onmessage = (msg: MessageEvent<string>) => {
        let e: GameEvent;
        try {
          e = JSON.parse(msg.data) as GameEvent;
        } catch {
          return;
        }
        onEventRef.current?.(e);
        if (e.type === 'hello') return;
        if (e.type === 'program') {
          applyProgram(e);
          return;
        }
        if (e.type === 'deleted') {
          setError(new ApiClientError(404, 'game_deleted', '게임이 삭제됐습니다.', null));
          return;
        }
        scheduleRefresh();
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (closed) return;
        setStatus('reconnecting');
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
      clearTimeout(refreshTimer);
      es?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [code, refresh]);

  const patchView = useCallback((fn: (v: GameView) => GameView) => {
    setView((v) => (v ? fn(v) : v));
  }, []);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { view, error, status, serverOffsetMs: offset, serverNow, refresh, patchView };
}
