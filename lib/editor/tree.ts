// 연결 편집기의 Block[] 트리 순수 연산 (docs/WEBSITE_SPEC.md §9, 경로 규칙은 docs/ENGINE_SPEC.md §5).
// - 블록 경로(Path): 최상위 i번째 = [i], C-블록 입 안 j번째 = [i, slot, j] (slot 0 = body/then, 1 = else).
// - 연결 지점(SlotRef + index): parentPath [] = 최상위 스택, 아니면 parentPath 블록의 slot번 입.
// - 모든 함수는 입력을 바꾸지 않고 새 배열을 돌려준다(바뀌지 않은 가지는 그대로 공유).
// 클라이언트·서버 어디서나 쓴다. 엔진 인덱스가 아니라 blocks/types만 가져온다.
import type { Block, BlockId } from '@/lib/engine/types';
import { countBlocks, isKnownBlockId, slotsOf } from '@/lib/engine/blocks';
import { LIMITS } from '@/lib/contracts';

export type Path = number[];
export interface SlotRef { parentPath: Path; slot: number }
/** 연결 지점: 어느 스택(입)의 몇 번째 자리 */
export interface DropPoint extends SlotRef { index: number }
/** 끌고 있는 것: 팔레트의 새 블록(id) 또는 이미 놓인 블록(경로) */
export type DragSource = BlockId | Path;

export const TOP: SlotRef = { parentPath: [], slot: 0 };
export const REPEAT_DEFAULT_N = 2;

// ------------------------------------------------------------------ uid
let uidSeq = 0;
/** 짧은 무작위 uid (서버 스키마: 40자 이하 문자열) */
export function newUid(): string {
  uidSeq = (uidSeq + 1) % 1_000_000;
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `b${rnd}${uidSeq.toString(36)}`;
}

/** 팔레트에서 새로 놓는 블록 (빈 입, 반복은 기본 2번) */
export function newBlock(id: BlockId): Block {
  const uid = newUid();
  switch (id) {
    case 'repeat':
      return { id, n: REPEAT_DEFAULT_N, body: [], uid };
    case 'if_wall':
    case 'if_pit':
      return { id, then: [], else: [], uid };
    case 'def':
      return { id, body: [], uid };
    default:
      return { id, uid };
  }
}

/** 입(슬롯) 배열만 바꾼 새 블록 */
function withSlots(b: Block, slots: Block[][]): Block {
  switch (b.id) {
    case 'repeat':
      return { ...b, body: slots[0] ?? b.body };
    case 'def':
      return { ...b, body: slots[0] ?? b.body };
    case 'if_wall':
    case 'if_pit':
      return { ...b, then: slots[0] ?? b.then, else: slots[1] ?? b.else };
    default:
      return b;
  }
}

/** uid가 없거나 겹치는 블록에 새 uid를 붙인다. 바뀐 것이 없으면 같은 배열을 돌려준다. */
export function ensureUids(doc: Block[]): Block[] {
  const seen = new Set<string>();
  const walk = (list: Block[]): Block[] => {
    let changed = false;
    const out = list.map((b) => {
      let nb = b;
      const slots = slotsOf(b);
      if (slots.length) {
        const ns = slots.map(walk);
        if (ns.some((s, i) => s !== slots[i])) nb = withSlots(nb, ns);
      }
      if (typeof nb.uid !== 'string' || nb.uid === '' || nb.uid.length > 40 || seen.has(nb.uid)) {
        nb = { ...nb, uid: newUid() };
      }
      seen.add(nb.uid as string);
      if (nb !== b) changed = true;
      return nb;
    });
    return changed ? out : list;
  };
  return walk(doc);
}

// ------------------------------------------------------------------ 경로 도우미
export function pathEquals(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function isPrefix(prefix: readonly number[], p: readonly number[]): boolean {
  return prefix.length <= p.length && prefix.every((v, i) => v === p[i]);
}
/** 연결 지점이 속한 스택의 "목록 접두어": 최상위 [], 입 [...parentPath, slot]. 그 스택의 k번째 블록 경로 = [...접두어, k] */
export function listPrefix(ref: SlotRef): Path {
  return ref.parentPath.length === 0 ? [] : [...ref.parentPath, ref.slot];
}
export function refFromPrefix(prefix: Path): SlotRef {
  return prefix.length === 0 ? TOP : { parentPath: prefix.slice(0, -1), slot: prefix[prefix.length - 1] };
}
export function slotKey(ref: SlotRef): string {
  return ref.parentPath.length === 0 ? 'top' : `${ref.parentPath.join('.')}/${ref.slot}`;
}
export function pointKey(p: DropPoint): string {
  return `${slotKey(p)}@${p.index}`;
}

/** 경로의 블록 (없으면 null) */
export function getBlock(doc: Block[], path: Path): Block | null {
  if (path.length === 0 || path.length % 2 === 0) return null;
  let list: Block[] = doc;
  for (let i = 0; i < path.length; i += 2) {
    const b = list[path[i]];
    if (!b) return null;
    if (i === path.length - 1) return b;
    const slot = slotsOf(b)[path[i + 1]];
    if (!slot) return null;
    list = slot;
  }
  return null;
}

/** 연결 지점의 스택 배열 (없으면 null) */
export function getList(doc: Block[], ref: SlotRef): Block[] | null {
  if (ref.parentPath.length === 0) return doc;
  const parent = getBlock(doc, ref.parentPath);
  if (!parent) return null;
  return slotsOf(parent)[ref.slot] ?? null;
}

/** 스택 배열 하나를 바꾼 새 문서 (접두어가 가리키는 스택이 없으면 원본) */
function updateList(doc: Block[], prefix: Path, fn: (list: Block[]) => Block[]): Block[] {
  if (prefix.length === 0) return fn(doc);
  const [i, slot, ...rest] = prefix;
  const b = doc[i];
  if (!b) return doc;
  const slots = slotsOf(b);
  const inner = slots[slot];
  if (!inner) return doc;
  const nextInner = updateList(inner, rest, fn);
  if (nextInner === inner) return doc;
  const ns = slots.slice();
  ns[slot] = nextInner;
  const out = doc.slice();
  out[i] = withSlots(b, ns);
  return out;
}

/** 경로의 블록을 바꾼 새 문서 */
function updateBlock(doc: Block[], path: Path, fn: (b: Block) => Block): Block[] {
  const prefix = path.slice(0, -1);
  const idx = path[path.length - 1];
  return updateList(doc, prefix, (list) => {
    const b = list[idx];
    if (!b) return list;
    const nb = fn(b);
    if (nb === b) return list;
    const out = list.slice();
    out[idx] = nb;
    return out;
  });
}

// ------------------------------------------------------------------ 기본 연산
/** ref 스택의 index 자리에 block을 끼운다. index는 0..길이로 잘린다. 스택이 없으면 원본. */
export function insertAt(doc: Block[], ref: SlotRef, index: number, block: Block): Block[] {
  if (!getList(doc, ref)) return doc;
  return updateList(doc, listPrefix(ref), (list) => {
    const i = Math.max(0, Math.min(list.length, Math.trunc(index)));
    const out = list.slice();
    out.splice(i, 0, block);
    return out;
  });
}

/** 경로의 블록(안의 블록 포함)을 떼어낸다. 없으면 { doc: 원본, block: null } */
export function removeAt(doc: Block[], path: Path): { doc: Block[]; block: Block | null } {
  const block = getBlock(doc, path);
  if (!block) return { doc, block: null };
  const idx = path[path.length - 1];
  const next = updateList(doc, path.slice(0, -1), (list) => list.filter((_, i) => i !== idx));
  return { doc: next, block };
}

/**
 * from 경로의 블록을 ref 스택의 index 자리로 옮긴다. index는 옮기기 전 문서 기준이다
 * (같은 스택에서 뒤로 옮기면 한 칸 당겨지는 것을 알아서 보정). 자기 자신·자손 안으로는 못 옮긴다(원본 반환).
 */
export function move(doc: Block[], from: Path, ref: SlotRef, index: number): Block[] {
  const block = getBlock(doc, from);
  if (!block || !getList(doc, ref)) return doc;
  if (isPrefix(from, ref.parentPath)) return doc; // 자기 입 또는 자손 입
  const srcPrefix = from.slice(0, -1);
  const srcIdx = from[from.length - 1];
  const tgt = listPrefix(ref).slice();
  let at = index;
  if (pathEquals(tgt, srcPrefix)) {
    if (at > srcIdx) at -= 1;
  } else if (tgt.length > srcPrefix.length && isPrefix(srcPrefix, tgt)) {
    // 대상 스택이 원래 자리보다 뒤에 있는 형제 블록 안이면 그 형제의 번호가 한 칸 당겨진다
    const k = srcPrefix.length;
    if (tgt[k] > srcIdx) tgt[k] -= 1;
  }
  const removed = removeAt(doc, from).doc;
  return insertAt(removed, refFromPrefix(tgt), at, block);
}

/** 반복 횟수 바꾸기 (1~9로 자름). 반복이 아니면 원본 */
export function setRepeatN(doc: Block[], path: Path, n: number): Block[] {
  const v = Math.max(1, Math.min(9, Math.round(Number.isFinite(n) ? n : 1)));
  return updateBlock(doc, path, (b) => (b.id === 'repeat' && b.n !== v ? { ...b, n: v } : b));
}

/** uid로 블록 경로 찾기 */
export function findPathByUid(doc: Block[], uid: string): Path | null {
  const walk = (list: Block[], prefix: Path): Path | null => {
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      const p = [...prefix, i];
      if (b.uid === uid) return p;
      const slots = slotsOf(b);
      for (let s = 0; s < slots.length; s += 1) {
        const r = walk(slots[s], [...p, s]);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(doc, []);
}

// ------------------------------------------------------------------ 연결 가능 여부
export function containsId(list: Block[], id: BlockId): boolean {
  return list.some((b) => b.id === id || slotsOf(b).some((s) => containsId(s, id)));
}

/** 블록 하나(안 포함)의 깊이: 일반 블록 1, 입이 있으면 1 + 입 안 최대 깊이 */
export function blockDepth(b: Block): number {
  let d = 1;
  for (const s of slotsOf(b)) for (const c of s) d = Math.max(d, 1 + blockDepth(c));
  return d;
}

/** 문서 깊이 (최상위 블록 = 1). 서버 docSchema.docDepth와 같은 규칙 */
export function docDepth(doc: Block[]): number {
  return doc.reduce((m, b) => Math.max(m, blockDepth(b)), 0);
}

/** 연결 지점 스택이 몇 겹 안쪽인가 (최상위 0, 반복 입 안 1 …) */
export function refDepth(ref: SlotRef): number {
  return ref.parentPath.length === 0 ? 0 : (ref.parentPath.length + 1) / 2;
}

/**
 * 끌고 있는 것을 ref 스택에 연결할 수 있는가 (규칙상 안 되는 곳엔 연결 지점을 띄우지 않는다).
 * - 함수 F는 최상위에만, 문서에 하나만
 * - F 호출(안에 호출이 든 묶음 포함)은 함수 F가 있을 때만, 함수 F 입 안에는 금지
 * - 자기 자신·자손 안으로 이동 금지
 * - 서버 한도: 노드 80개·깊이 8
 * 최종 판정은 서버의 validate다.
 */
export function canDrop(doc: Block[], source: DragSource, ref: SlotRef): boolean {
  if (typeof source === 'string') {
    if (!isKnownBlockId(source)) return false;
    return canDropBlock(doc, newBlock(source), ref);
  }
  const found = getBlock(doc, source);
  if (!found || !getList(doc, ref)) return false;
  if (isPrefix(source, ref.parentPath)) return false;
  return checkRules(removeAt(doc, source).doc, doc, found, ref);
}

/** 새 블록(이미 만들어진 것)을 연결할 수 있는가 */
export function canDropBlock(doc: Block[], block: Block, ref: SlotRef): boolean {
  if (!getList(doc, ref)) return false;
  if (countBlocks(doc) + countBlocks([block]) > LIMITS.maxDocNodes) return false;
  return checkRules(doc, doc, block, ref);
}

/** rest = 끌고 있는 블록을 뺀 문서, doc = ref 경로가 가리키는 원래 문서 */
function checkRules(rest: Block[], doc: Block[], block: Block, ref: SlotRef): boolean {
  const topLevel = ref.parentPath.length === 0;
  if (block.id === 'def') {
    if (!topLevel) return false;
    if (containsId(rest, 'def')) return false;
  }
  if (containsId([block], 'call')) {
    const hasDef = block.id === 'def' || containsId(rest, 'def');
    if (!hasDef) return false;
    if (!topLevel && doc[ref.parentPath[0]]?.id === 'def') return false;
  }
  if (refDepth(ref) + blockDepth(block) > LIMITS.maxDocDepth) return false;
  return true;
}

// ------------------------------------------------------------------ 편집 동작 (uid 기준)
// 편집기는 "무엇을 했는지"를 uid로 표현해 부모에 넘긴다. 다른 팀원의 변경이 먼저 도착해도
// 같은 동작을 새 문서에 다시 적용할 수 있다(대상이 사라졌거나 규칙에 어긋나면 버린다).
export interface UidTarget { parentUid: string | null; slot: number; index: number }
export type EditOp =
  | { type: 'insert'; block: Block; target: UidTarget }
  | { type: 'move'; uid: string; target: UidTarget }
  | { type: 'remove'; uid: string }
  | { type: 'setN'; uid: string; n: number };

/** 경로 기준 연결 지점 → uid 기준 대상 (부모에 uid가 없으면 null) */
export function toUidTarget(doc: Block[], point: DropPoint): UidTarget | null {
  if (point.parentPath.length === 0) return { parentUid: null, slot: 0, index: point.index };
  const parent = getBlock(doc, point.parentPath);
  if (!parent?.uid) return null;
  return { parentUid: parent.uid, slot: point.slot, index: point.index };
}

/** uid 기준 대상 → 지금 문서의 연결 지점 (부모가 사라졌으면 null) */
export function resolveTarget(doc: Block[], t: UidTarget): DropPoint | null {
  if (t.parentUid === null) return { parentPath: [], slot: 0, index: t.index };
  const p = findPathByUid(doc, t.parentUid);
  if (!p) return null;
  const parent = getBlock(doc, p);
  if (!parent || !slotsOf(parent)[t.slot]) return null;
  return { parentPath: p, slot: t.slot, index: t.index };
}

/** 동작을 문서에 적용한다. 적용할 수 없으면 null */
export function applyOp(doc: Block[], op: EditOp): Block[] | null {
  switch (op.type) {
    case 'insert': {
      const pt = resolveTarget(doc, op.target);
      if (!pt || !canDropBlock(doc, op.block, pt)) return null;
      if (op.block.uid && findPathByUid(doc, op.block.uid)) return null; // 이미 들어간 블록
      return insertAt(doc, pt, pt.index, op.block);
    }
    case 'move': {
      const from = findPathByUid(doc, op.uid);
      const pt = resolveTarget(doc, op.target);
      if (!from || !pt || !canDrop(doc, from, pt)) return null;
      return move(doc, from, pt, pt.index);
    }
    case 'remove': {
      const from = findPathByUid(doc, op.uid);
      if (!from) return null;
      return removeAt(doc, from).doc;
    }
    case 'setN': {
      const at = findPathByUid(doc, op.uid);
      if (!at || getBlock(doc, at)?.id !== 'repeat') return null;
      return setRepeatN(doc, at, op.n);
    }
  }
}

/** 동작 여러 개를 차례로 적용 (적용할 수 없는 것은 건너뛴다) */
export function replayOps(doc: Block[], ops: readonly EditOp[]): Block[] {
  return ops.reduce<Block[]>((d, op) => applyOp(d, op) ?? d, doc);
}

/** 팔레트 탭: 프로그램 맨 끝(최상위 마지막)에 붙이는 동작. 규칙상 안 되면 null */
export function appendOp(doc: Block[], id: BlockId): EditOp | null {
  if (!canDrop(doc, id, TOP)) return null;
  return { type: 'insert', block: newBlock(id), target: { parentUid: null, slot: 0, index: doc.length } };
}

/** 문서의 모든 연결 지점: 각 스택(최상위, 모든 입)의 맨 앞·블록 사이·맨 끝 */
export function listDropPoints(doc: Block[]): DropPoint[] {
  const out: DropPoint[] = [];
  const walk = (list: Block[], ref: SlotRef): void => {
    for (let i = 0; i <= list.length; i += 1) out.push({ parentPath: ref.parentPath, slot: ref.slot, index: i });
    const prefix = listPrefix(ref);
    list.forEach((b, i) => {
      slotsOf(b).forEach((s, si) => walk(s, { parentPath: [...prefix, i], slot: si }));
    });
  };
  walk(doc, TOP);
  return out;
}

/** 문서 비교 (uid 포함 구조 비교) */
export function sameDoc(a: Block[], b: Block[]): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** 연결이 안 되는 이유 (팔레트 탭이 거절될 때 안내용) */
export function dropBlockReason(doc: Block[], id: BlockId): string | null {
  if (countBlocks(doc) + 1 > LIMITS.maxDocNodes) return `카드는 ${LIMITS.maxDocNodes}장까지 놓을 수 있어요`;
  if (id === 'def' && containsId(doc, 'def')) return '함수 F는 하나만 만들 수 있어요';
  if (id === 'call' && !containsId(doc, 'def')) return '함수 F를 먼저 놓아야 F 호출을 쓸 수 있어요';
  return null;
}
