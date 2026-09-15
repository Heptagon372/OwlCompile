// components/play/useProgramSync.ts를 작은 훅 런타임으로 돌린다 (react는 mock).
// 리뷰 지적: A → B → A 변경이 안 보이던 문제, 드래그 중 409가 문서를 바꾸던 문제, 409 때 보내지 않은 동작이 사라지던 문제.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: unknown };
  const h = {
    slots: [] as Slot[],
    idx: 0,
    effects: [] as (() => void)[],
    reset() { h.slots = []; },
  };
  const changed = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(init: unknown) {
      const i = h.idx++;
      if (!h.slots[i]) h.slots[i] = { value: typeof init === 'function' ? (init as () => unknown)() : init };
      const slot = h.slots[i];
      return [slot.value, (v: unknown) => { slot.value = typeof v === 'function' ? (v as (p: unknown) => unknown)(slot.value) : v; }];
    },
    useRef(init: unknown) {
      const i = h.idx++;
      if (!h.slots[i]) h.slots[i] = { value: { current: init } };
      return h.slots[i].value;
    },
    useCallback(fn: unknown, deps: unknown[]) {
      const i = h.idx++;
      const s = h.slots[i];
      if (!s || changed(deps, s.deps)) h.slots[i] = { value: fn, deps };
      return h.slots[i].value;
    },
    useEffect(fn: () => unknown, deps?: unknown[]) {
      const i = h.idx++;
      const s = h.slots[i];
      if (!s || changed(deps, s.deps)) {
        h.effects.push(() => {
          if (s && typeof s.cleanup === 'function') (s.cleanup as () => void)();
          h.slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  return { h, react };
});

const toastSpy = vi.fn();
const apiMock = vi.fn();
vi.mock('react', () => H.react);
vi.mock('@/components/ui/Toast', () => ({ useToast: () => toastSpy }));
vi.mock('@/lib/client/api', () => {
  class ApiClientError extends Error {
    constructor(readonly status: number, readonly code: string, message: string, readonly body: unknown) { super(message); }
  }
  return { api: (...a: unknown[]) => apiMock(...a), ApiClientError };
});

import type { Block } from '@/lib/engine/types';
import { ApiClientError } from '@/lib/client/api';
import { newBlock } from '@/lib/editor/tree';
import { useProgramSync } from '@/components/play/useProgramSync';

type View = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let view: View;
function mkView(doc: Block[], version: number): View {
  return {
    game: { round: 1, phase: 'coding' },
    teams: [{ id: 't1', program: { blocks: doc.length } }],
    myProgram: { teamId: 't1', doc, version, blocks: doc.length, submittedAt: null, editable: true, patchActive: false },
  };
}
const patchView = (fn: (v: View) => View) => { view = fn(view); };
const refresh = async () => {};
function render() {
  H.h.idx = 0;
  H.h.effects = [];
  useProgramSync('1234', view, patchView, refresh);
  const fx = H.h.effects;
  H.h.effects = [];
  fx.forEach((f) => f());
  H.h.idx = 0;
  return useProgramSync('1234', view, patchView, refresh); // 효과 뒤 상태 다시 읽기
}
const ids = (d: Block[]) => d.map((b) => b.id);
const at = (index: number) => ({ parentUid: null, slot: 0, index });

(globalThis as { document?: unknown }).document = {
  visibilityState: 'visible', addEventListener() {}, removeEventListener() {},
};
beforeEach(() => { H.h.reset(); apiMock.mockReset(); toastSpy.mockReset(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('useProgramSync', () => {
  it('shows a teammate deleting a card when the result equals my last save (A -> B -> A)', async () => {
    view = mkView([], 0);
    let s = render();
    apiMock.mockResolvedValueOnce({ version: 1, blocks: 1 });
    s.apply({ type: 'insert', block: newBlock('forward'), target: at(0) });
    await vi.advanceTimersByTimeAsync(150); // 디바운스 → PUT
    s = render();
    const sent = (apiMock.mock.calls[0][1] as { body: { doc: Block[] } }).body.doc;
    expect(ids(s.doc)).toEqual(['forward']);

    view = mkView([...sent, newBlock('jump')], 2); // 팀원이 점프 추가 (SSE v2)
    s = render();
    expect(ids(s.doc)).toEqual(['forward', 'jump']);

    view = mkView([...sent], 3); // 팀원이 점프를 다시 지움 (SSE v3) → 내 마지막 저장과 같은 내용
    s = render();
    expect(ids(s.doc)).toEqual(['forward']);
  });

  it('ignores the echo of my own save', async () => {
    view = mkView([], 0);
    let s = render();
    apiMock.mockResolvedValueOnce({ version: 1, blocks: 1 });
    s.apply({ type: 'insert', block: newBlock('forward'), target: at(0) });
    await vi.advanceTimersByTimeAsync(150);
    s = render();
    s.apply({ type: 'insert', block: newBlock('jump'), target: at(1) }); // 아직 안 보낸 동작
    view = mkView([newBlock('forward')], 1); // v1 메아리
    s = render();
    expect(ids(s.doc)).toEqual(['forward', 'jump']);
  });

  it('defers a 409 server doc while a drag is in progress, then adopts it when the drag ends', async () => {
    view = mkView([], 0);
    let s = render();
    let reject!: (e: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    s.apply({ type: 'insert', block: newBlock('forward'), target: at(0) });
    await vi.advanceTimersByTimeAsync(150); // PUT 진행 중
    s.setDragging(true); // 사용자가 카드를 끌기 시작
    const other: Block[] = [newBlock('left'), newBlock('right')];
    reject(new ApiClientError(409, 'version_conflict', 'conflict', { doc: other, version: 5, blocks: 2 }));
    await vi.advanceTimersByTimeAsync(0);
    s = render();
    expect(ids(s.doc)).toEqual(['forward']); // 드래그 중에는 그대로
    s.setDragging(false);
    s = render();
    expect(ids(s.doc)).toEqual(['left', 'right']); // 놓은 뒤 서버 문서
  });

  it('keeps edits made after the rejected request and re-sends them on top of the server doc', async () => {
    view = mkView([], 0);
    let s = render();
    let reject!: (e: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((_, r) => { reject = r; }));
    s.apply({ type: 'insert', block: newBlock('forward'), target: at(0) });
    await vi.advanceTimersByTimeAsync(150); // PUT #1 진행 중
    s = render();
    s.apply({ type: 'insert', block: newBlock('jump'), target: at(1) }); // 요청에 들어가지 않은 동작
    apiMock.mockResolvedValueOnce({ version: 6, blocks: 2 });
    reject(new ApiClientError(409, 'version_conflict', 'conflict', { doc: [newBlock('left')], version: 5, blocks: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    s = render();
    expect(ids(s.doc)).toEqual(['left', 'jump']);
    await vi.advanceTimersByTimeAsync(150);
    expect(apiMock).toHaveBeenCalledTimes(2);
    const body = (apiMock.mock.calls[1][1] as { body: { doc: Block[]; baseVersion: number; round?: number } }).body;
    expect(body.baseVersion).toBe(5);
    expect(body.round).toBe(1); // 이 문서의 라운드를 함께 보낸다 (늦게 도착한 지난 라운드 저장 거절용)
    expect(ids(body.doc)).toEqual(['left', 'jump']);
  });
});
