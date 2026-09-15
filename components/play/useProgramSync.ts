'use client';
// 팀 프로그램 동기화 (docs/WEBSITE_SPEC.md §7·§9 저장):
// 로컬 즉시 반영 → 120ms 디바운스 PUT {doc, baseVersion} → 200이면 version 갱신, 409면 서버 문서로 교체 + 토스트.
// 다른 팀원의 변경(SSE program → view.myProgram)은 드래그 중이면 놓은 뒤에, 저장 중이면 응답 뒤에 반영하고,
// 아직 보내지 않은 내 동작(EditOp)은 새 문서 위에 다시 적용한다.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  API, type GameView, type MyProgramView, type ProgramConflictBody, type ProgramSaveRequest, type ProgramSaveResponse,
} from '@/lib/contracts';
import type { Block } from '@/lib/engine/types';
import { api, ApiClientError } from '@/lib/client/api';
import { applyOp, ensureUids, replayOps, sameDoc, type EditOp } from '@/lib/editor/tree';
import { useToast } from '@/components/ui/Toast';

export const SAVE_DEBOUNCE_MS = 120;

interface SyncState {
  key: string;
  doc: Block[];
  /** 로컬 문서의 바탕이 된 서버 version */
  base: number;
  /** 이 문서의 라운드. 저장 요청에 실어 보내 늦게 도착한 지난 라운드 저장을 서버가 거절하게 한다 */
  round: number;
  /** 아직 서버에 보내지 않은 동작 */
  pending: EditOp[];
  inflight: Promise<void> | null;
  dragging: boolean;
  /**
   * 드래그·저장 중에 들어와 미뤄 둔 서버 문서.
   * force = 409·저장 실패로 서버 문서로 되돌려야 하는 경우 (version이 base와 같아도 받아들인다)
   */
  remote: { doc: Block[]; version: number; force?: boolean } | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface ProgramSync {
  doc: Block[];
  /** 저장 대기·진행 중 */
  saving: boolean;
  apply: (op: EditOp) => void;
  setDragging: (on: boolean) => void;
  /** 대기 중인 변경을 지금 보내고 끝날 때까지 기다린다 (제출 전) */
  flushNow: () => Promise<void>;
}

export function useProgramSync(
  code: string,
  view: GameView | null,
  patchView: (fn: (v: GameView) => GameView) => void,
  refresh: () => Promise<void>,
): ProgramSync {
  const toast = useToast();
  const mp: MyProgramView | null = view?.myProgram ?? null;
  const round = view?.game.round ?? 0;
  const key = mp && view ? `${mp.teamId}:${round}` : '';
  const [doc, setDocState] = useState<Block[]>(() => (mp ? ensureUids(mp.doc) : []));
  const [saving, setSaving] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const s = useRef<SyncState>({
    key: '', doc: [], base: 0, round: 0, pending: [], inflight: null, dragging: false, remote: null, timer: null,
  });

  const setLocal = useCallback((next: Block[]) => {
    s.current.doc = next;
    setDocState(next);
  }, []);

  const syncSaving = useCallback(() => {
    const st = s.current;
    setSaving(st.pending.length > 0 || st.inflight !== null);
  }, []);

  /**
   * 서버 문서를 받아들인다 (아직 안 보낸 내 동작은 그 위에 다시 적용).
   * 내 저장의 메아리는 version <= base로 걸러진다 (PUT 성공 때 base = 응답 version).
   * 내용이 예전에 보낸 문서와 같아도 더 새 version이면 진짜 변경이다 (A → B → A).
   */
  const adoptRemote = useCallback(
    (remoteDoc: Block[], version: number, force = false) => {
      const st = s.current;
      if (!force && version <= st.base) return;
      st.base = force ? version : Math.max(st.base, version);
      const base = ensureUids(remoteDoc);
      setLocal(st.pending.length ? replayOps(base, st.pending) : base);
    },
    [setLocal],
  );

  const schedule = useCallback(() => {
    const st = s.current;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      st.timer = null;
      void flushRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    const st = s.current;
    if (st.inflight || st.pending.length === 0 || st.dragging) return;
    const sent = st.doc;
    const baseVersion = st.base;
    const sentKey = st.key;
    const sentRound = st.round;
    // 여기서 비운 뒤 st.pending에 쌓이는 동작은 이번 요청에 들어가지 않은 것 (409여도 버리지 않는다)
    st.pending = [];
    const job = (async () => {
      try {
        const body: ProgramSaveRequest = { doc: sent, baseVersion };
        if (sentRound > 0) body.round = sentRound;
        const res = await api<ProgramSaveResponse>(API.gameProgram(code), { method: 'PUT', body });
        if (st.key !== sentKey) return;
        if (res.version > st.base) st.base = res.version;
        patchView((v) => {
          if (!v.myProgram || res.version < v.myProgram.version) return v;
          const teams = v.teams.map((t) =>
            t.id === v.myProgram?.teamId ? { ...t, program: { ...t.program, blocks: res.blocks } } : t);
          return { ...v, teams, myProgram: { ...v.myProgram, doc: sent, version: res.version, blocks: res.blocks } };
        });
      } catch (err) {
        if (st.key !== sentKey) return;
        const body = err instanceof ApiClientError ? (err.body as Partial<ProgramConflictBody> | null) : null;
        if (err instanceof ApiClientError && err.status === 409 && body && Array.isArray(body.doc) && typeof body.version === 'number') {
          const serverDoc = body.doc;
          const version = body.version;
          // 보낸 동작은 거절됐다. 보낸 뒤에 생긴 동작(st.pending)은 서버 문서 위에 다시 적용한다.
          // 드래그 중이면 문서를 바꾸지 않고 놓은 뒤에 반영한다 (드래그 중인 카드 경로가 어긋나지 않게)
          st.base = version;
          if (st.dragging) {
            st.remote = { doc: serverDoc, version, force: true };
          } else {
            st.remote = null;
            const base = ensureUids(serverDoc);
            setLocal(st.pending.length ? replayOps(base, st.pending) : base);
          }
          toast('다른 팀원이 먼저 바꿨어요', 'info');
          patchView((v) =>
            v.myProgram && version >= v.myProgram.version
              ? { ...v, myProgram: { ...v.myProgram, doc: serverDoc, version, blocks: body.blocks ?? v.myProgram.blocks } }
              : v);
        } else {
          // 역할 밖 블록(403), 편집 잠김(409 locked), 형식 오류(400), 네트워크 → 서버 상태로 되돌린다
          toast(err instanceof ApiClientError ? err.message : '저장하지 못했어요.', 'error');
          st.pending = [];
          const cur = viewRef.current?.myProgram;
          if (cur) {
            st.base = cur.version;
            if (st.dragging) {
              st.remote = { doc: cur.doc, version: cur.version, force: true };
            } else {
              st.remote = null;
              setLocal(ensureUids(cur.doc));
            }
          } else {
            st.remote = null;
          }
          void refresh();
        }
      }
    })();
    st.inflight = job;
    syncSaving();
    try {
      await job;
    } finally {
      st.inflight = null;
      const r = st.remote;
      if (r && !st.dragging) {
        st.remote = null;
        adoptRemote(r.doc, r.version, r.force);
      }
      if (st.pending.length) schedule();
      syncSaving();
    }
  }, [code, patchView, refresh, setLocal, toast, adoptRemote, schedule, syncSaving]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // 프로그램이 바뀌면(새 라운드·다른 팀) 초기화, 같은 프로그램이면 서버 쪽 새 version을 받아들인다
  useEffect(() => {
    const st = s.current;
    if (!mp) {
      if (st.key !== '') {
        st.key = '';
        st.pending = [];
        st.remote = null;
        setLocal([]);
      }
      return;
    }
    if (st.key !== key) {
      if (st.timer) clearTimeout(st.timer);
      st.key = key;
      st.round = round;
      st.base = mp.version;
      st.pending = [];
      st.remote = null;
      st.timer = null;
      setLocal(ensureUids(mp.doc));
      syncSaving();
      return;
    }
    if (mp.version <= st.base) return;
    if (st.dragging || st.inflight) {
      if (!st.remote || st.remote.version < mp.version) st.remote = { doc: mp.doc, version: mp.version };
      return;
    }
    if (st.remote) st.remote = null; // 더 새 서버 문서를 바로 받아들이므로 미뤄 둔 것은 필요 없다
    adoptRemote(mp.doc, mp.version);
  }, [mp, key, round, adoptRemote, setLocal, syncSaving]);

  const apply = useCallback(
    (op: EditOp) => {
      const st = s.current;
      const next = applyOp(st.doc, op);
      if (!next || sameDoc(next, st.doc)) return;
      st.pending.push(op);
      setLocal(next);
      syncSaving();
      schedule();
    },
    [schedule, setLocal, syncSaving],
  );

  const setDragging = useCallback(
    (on: boolean) => {
      const st = s.current;
      st.dragging = on;
      if (on) return;
      const r = st.remote;
      if (r && !st.inflight) {
        st.remote = null;
        adoptRemote(r.doc, r.version, r.force);
      }
      if (st.pending.length) schedule();
    },
    [adoptRemote, schedule],
  );

  const flushNow = useCallback(async () => {
    const st = s.current;
    for (let i = 0; i < 5; i += 1) {
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      if (st.inflight) await st.inflight;
      if (st.pending.length === 0) return;
      await flushRef.current();
    }
  }, []);

  // 탭을 떠나면 바로 저장, 언마운트 때 타이머 정리
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    const st = s.current;
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      if (st.timer) clearTimeout(st.timer);
    };
  }, []);

  return { doc, saving, apply, setDragging, flushNow };
}
