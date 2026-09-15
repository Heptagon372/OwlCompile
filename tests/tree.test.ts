import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/engine/types';
import {
  TOP, appendOp, applyOp, blockDepth, canDrop, docDepth, dropBlockReason, ensureUids, findPathByUid,
  getBlock, getList, insertAt, listDropPoints, move, newBlock, newUid, pointKey, removeAt, replayOps,
  resolveTarget, sameDoc, setRepeatN, toUidTarget,
} from '@/lib/editor/tree';

const f = (uid: string): Block => ({ id: 'forward', uid });
const r = (uid: string): Block => ({ id: 'right', uid });
const call = (uid: string): Block => ({ id: 'call', uid });
const rep = (uid: string, body: Block[], n = 2): Block => ({ id: 'repeat', n, body, uid });
const ifw = (uid: string, then: Block[], els: Block[]): Block => ({ id: 'if_wall', then, else: els, uid });
const def = (uid: string, body: Block[]): Block => ({ id: 'def', body, uid });
const uids = (list: Block[] | null): (string | undefined)[] => (list ?? []).map((b) => b.uid);

describe('newBlock / newUid / ensureUids', () => {
  it('makes blocks with empty mouths and a uid', () => {
    expect(newBlock('forward')).toMatchObject({ id: 'forward' });
    expect(newBlock('repeat')).toMatchObject({ id: 'repeat', n: 2, body: [] });
    expect(newBlock('if_pit')).toMatchObject({ id: 'if_pit', then: [], else: [] });
    expect(newBlock('def')).toMatchObject({ id: 'def', body: [] });
    const a = newBlock('sleep');
    const b = newBlock('sleep');
    expect(typeof a.uid).toBe('string');
    expect(a.uid).not.toBe(b.uid);
    expect(newUid().length).toBeLessThanOrEqual(40);
  });

  it('fills missing and duplicate uids but keeps an already-complete doc identical', () => {
    const complete = [rep('a', [f('b')]), f('c')];
    expect(ensureUids(complete)).toBe(complete);
    const raw: Block[] = [{ id: 'forward' }, { id: 'repeat', n: 3, body: [{ id: 'left' }] }, f('x'), f('x')];
    const out = ensureUids(raw);
    const all = [out[0].uid, out[1].uid, getBlock(out, [1, 0, 0])?.uid, out[2].uid, out[3].uid];
    expect(all.every((u) => typeof u === 'string' && u.length > 0)).toBe(true);
    expect(new Set(all).size).toBe(5);
    expect(out[2].uid).toBe('x');
    expect(raw[0].uid).toBeUndefined(); // 입력은 그대로
  });
});

describe('getBlock / getList / findPathByUid', () => {
  const doc = [f('a'), ifw('i', [r('t')], [f('e1'), rep('rp', [f('deep')])]), def('d', [])];
  it('follows ENGINE_SPEC §5 paths (slot 0 = then/body, 1 = else)', () => {
    expect(getBlock(doc, [0])?.uid).toBe('a');
    expect(getBlock(doc, [1, 0, 0])?.uid).toBe('t');
    expect(getBlock(doc, [1, 1, 1, 0, 0])?.uid).toBe('deep');
    expect(getBlock(doc, [5])).toBeNull();
    expect(getBlock(doc, [1, 0])).toBeNull();
    expect(getBlock(doc, [0, 0, 0])).toBeNull();
    expect(uids(getList(doc, TOP))).toEqual(['a', 'i', 'd']);
    expect(uids(getList(doc, { parentPath: [1], slot: 1 }))).toEqual(['e1', 'rp']);
    expect(getList(doc, { parentPath: [2], slot: 0 })).toEqual([]);
    expect(getList(doc, { parentPath: [0], slot: 0 })).toBeNull();
  });
  it('finds a path by uid', () => {
    expect(findPathByUid(doc, 'deep')).toEqual([1, 1, 1, 0, 0]);
    expect(findPathByUid(doc, 'd')).toEqual([2]);
    expect(findPathByUid(doc, 'nope')).toBeNull();
  });
});

describe('insertAt / removeAt / setRepeatN', () => {
  it('inserts at top level, clamps the index and never mutates', () => {
    const doc = [f('a'), f('b')];
    expect(uids(insertAt(doc, TOP, 1, r('n')))).toEqual(['a', 'n', 'b']);
    expect(uids(insertAt(doc, TOP, 99, r('n')))).toEqual(['a', 'b', 'n']);
    expect(uids(insertAt(doc, TOP, -3, r('n')))).toEqual(['n', 'a', 'b']);
    expect(uids(doc)).toEqual(['a', 'b']);
  });
  it('inserts into then and else mouths', () => {
    const doc = [ifw('i', [], [])];
    const a = insertAt(doc, { parentPath: [0], slot: 0 }, 0, f('t'));
    const b = insertAt(a, { parentPath: [0], slot: 1 }, 0, r('e'));
    expect(getBlock(b, [0, 0, 0])?.uid).toBe('t');
    expect(getBlock(b, [0, 1, 0])?.uid).toBe('e');
    expect((doc[0] as Extract<Block, { id: 'if_wall' | 'if_pit' }>).then).toEqual([]);
  });
  it('returns the original doc when the slot does not exist', () => {
    const doc = [f('a')];
    expect(insertAt(doc, { parentPath: [0], slot: 0 }, 0, f('x'))).toBe(doc);
    expect(insertAt(doc, { parentPath: [3], slot: 0 }, 0, f('x'))).toBe(doc);
  });
  it('removes a block together with its children', () => {
    const doc = [f('a'), rep('r', [f('b'), rep('r2', [f('c')])]), f('d')];
    const out = removeAt(doc, [1]);
    expect(out.block?.uid).toBe('r');
    expect(uids(out.doc)).toEqual(['a', 'd']);
    const inner = removeAt(doc, [1, 0, 1]);
    expect(inner.block?.uid).toBe('r2');
    expect(uids(getList(inner.doc, { parentPath: [1], slot: 0 }))).toEqual(['b']);
    expect(removeAt(doc, [9]).doc).toBe(doc);
    expect(removeAt(doc, [9]).block).toBeNull();
  });
  it('sets repeat N clamped to 1..9 and ignores non-repeat blocks', () => {
    const doc = [rep('r', [], 2), f('a')];
    expect(getBlock(setRepeatN(doc, [0], 5), [0])).toMatchObject({ n: 5 });
    expect(getBlock(setRepeatN(doc, [0], 0), [0])).toMatchObject({ n: 1 });
    expect(getBlock(setRepeatN(doc, [0], 42), [0])).toMatchObject({ n: 9 });
    expect(setRepeatN(doc, [1], 3)).toBe(doc);
    expect(setRepeatN(doc, [0], 2)).toBe(doc);
  });
});

describe('move', () => {
  it('moves forward in the same stack with index shift', () => {
    const doc = [f('a'), f('b'), f('c'), f('d')];
    // "c 앞"(index 2)으로 a를 옮기면 b 다음, c 앞
    expect(uids(move(doc, [0], TOP, 2))).toEqual(['b', 'a', 'c', 'd']);
    expect(uids(move(doc, [0], TOP, 4))).toEqual(['b', 'c', 'd', 'a']);
    expect(uids(move(doc, [3], TOP, 0))).toEqual(['d', 'a', 'b', 'c']);
    expect(uids(move(doc, [1], TOP, 1))).toEqual(['a', 'b', 'c', 'd']);
    expect(uids(move(doc, [1], TOP, 2))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('moves a block into a later sibling C-block (sibling index shift)', () => {
    const doc = [f('a'), f('b'), rep('r', [f('x')])];
    const out = move(doc, [0], { parentPath: [2], slot: 0 }, 1);
    expect(uids(out)).toEqual(['b', 'r']);
    expect(uids(getList(out, { parentPath: [1], slot: 0 }))).toEqual(['x', 'a']);
  });
  it('moves a block into an earlier sibling C-block', () => {
    const doc = [rep('r', []), f('a')];
    const out = move(doc, [1], { parentPath: [0], slot: 0 }, 0);
    expect(uids(out)).toEqual(['r']);
    expect(uids(getList(out, { parentPath: [0], slot: 0 }))).toEqual(['a']);
  });
  it('lifts a block out of a mouth to the top level', () => {
    const doc = [rep('r', [f('a'), f('b')]), f('c')];
    const out = move(doc, [0, 0, 1], TOP, 2);
    expect(uids(out)).toEqual(['r', 'c', 'b']);
    expect(uids(getList(out, { parentPath: [0], slot: 0 }))).toEqual(['a']);
  });
  it('moves a C-block with all of its children', () => {
    const doc = [f('a'), ifw('i', [r('t')], [f('e')])];
    const out = move(doc, [1], TOP, 0);
    expect(uids(out)).toEqual(['i', 'a']);
    expect(getBlock(out, [0, 1, 0])?.uid).toBe('e');
  });
  it('moves between else and then of the same if', () => {
    const doc = [ifw('i', [f('t')], [r('e')])];
    const out = move(doc, [0, 1, 0], { parentPath: [0], slot: 0 }, 0);
    expect(uids(getList(out, { parentPath: [0], slot: 0 }))).toEqual(['e', 't']);
    expect(getList(out, { parentPath: [0], slot: 1 })).toEqual([]);
  });
  it('refuses to move a block into itself or its descendants', () => {
    const doc = [rep('r', [rep('r2', [])])];
    expect(move(doc, [0], { parentPath: [0], slot: 0 }, 0)).toBe(doc);
    expect(move(doc, [0], { parentPath: [0, 0, 0], slot: 0 }, 0)).toBe(doc);
    expect(move(doc, [9], TOP, 0)).toBe(doc);
  });
});

describe('canDrop', () => {
  it('allows ordinary blocks anywhere that exists', () => {
    const doc = [rep('r', []), ifw('i', [], [])];
    expect(canDrop(doc, 'forward', TOP)).toBe(true);
    expect(canDrop(doc, 'forward', { parentPath: [0], slot: 0 })).toBe(true);
    expect(canDrop(doc, 'left', { parentPath: [1], slot: 1 })).toBe(true);
    expect(canDrop(doc, 'left', { parentPath: [1], slot: 2 })).toBe(false);
    expect(canDrop(doc, 'left', { parentPath: [7], slot: 0 })).toBe(false);
  });
  it('def only at top level', () => {
    const doc = [rep('r', [])];
    expect(canDrop(doc, 'def', TOP)).toBe(true);
    expect(canDrop(doc, 'def', { parentPath: [0], slot: 0 })).toBe(false);
  });
  it('def only once (but the existing def can be moved along the top level)', () => {
    const doc = [def('d', [f('a')]), rep('r', [])];
    expect(canDrop(doc, 'def', TOP)).toBe(false);
    expect(canDrop(doc, [0], TOP)).toBe(true);
    expect(canDrop(doc, [0], { parentPath: [1], slot: 0 })).toBe(false);
  });
  it('call only when a def exists', () => {
    expect(canDrop([f('a')], 'call', TOP)).toBe(false);
    expect(canDrop([def('d', [])], 'call', TOP)).toBe(true);
    const moving = [call('c'), rep('r', [])];
    expect(canDrop(moving, [0], { parentPath: [1], slot: 0 })).toBe(false);
  });
  it('call never inside def, at any depth; a bundle containing call counts too', () => {
    const doc = [def('d', [rep('r', [])]), rep('r2', [call('c')]), rep('r3', [])];
    expect(canDrop(doc, 'call', { parentPath: [0], slot: 0 })).toBe(false);
    expect(canDrop(doc, 'call', { parentPath: [0, 0, 0], slot: 0 })).toBe(false);
    expect(canDrop(doc, 'call', { parentPath: [2], slot: 0 })).toBe(true);
    expect(canDrop(doc, [1], { parentPath: [0], slot: 0 })).toBe(false);
    expect(canDrop(doc, [1], { parentPath: [2], slot: 0 })).toBe(true);
    expect(canDrop(doc, 'forward', { parentPath: [0], slot: 0 })).toBe(true);
  });
  it('no self or descendant target', () => {
    const doc = [rep('r', [ifw('i', [], [])]), f('a')];
    expect(canDrop(doc, [0], { parentPath: [0], slot: 0 })).toBe(false);
    expect(canDrop(doc, [0], { parentPath: [0, 0, 0], slot: 1 })).toBe(false);
    expect(canDrop(doc, [0, 0, 0], { parentPath: [0, 0, 0], slot: 0 })).toBe(false);
    expect(canDrop(doc, [0], TOP)).toBe(true);
    expect(canDrop(doc, [1], { parentPath: [0, 0, 0], slot: 1 })).toBe(true);
    expect(canDrop(doc, [5], TOP)).toBe(false);
  });
  it('respects the server limits (80 nodes, depth 8)', () => {
    const many: Block[] = Array.from({ length: 80 }, (_, i) => f(`n${i}`));
    expect(canDrop(many, 'forward', TOP)).toBe(false);
    expect(canDrop(many, [3], TOP)).toBe(true);
    let deep: Block[] = [];
    for (let i = 0; i < 8; i += 1) deep = [rep(`d${i}`, deep)];
    expect(docDepth(deep)).toBe(8);
    const innermost = { parentPath: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], slot: 0 };
    expect(getList(deep, innermost)).toEqual([]);
    expect(canDrop(deep, 'forward', innermost)).toBe(false);
    expect(canDrop(deep, 'forward', { parentPath: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], slot: 0 })).toBe(true);
    expect(blockDepth(rep('x', [rep('y', [f('z')])]))).toBe(3);
  });
});

describe('listDropPoints', () => {
  it('lists start, between and end of every stack including empty mouths', () => {
    const doc = [f('a'), ifw('i', [r('t')], [])];
    const keys = listDropPoints(doc).map(pointKey);
    expect(keys).toEqual(['top@0', 'top@1', 'top@2', '1/0@0', '1/0@1', '1/1@0']);
    expect(listDropPoints([])).toEqual([{ parentPath: [], slot: 0, index: 0 }]);
  });
  it('every listed point resolves to an existing stack', () => {
    const doc = [rep('r', [ifw('i', [f('x')], [rep('r2', [])])]), def('d', [])];
    for (const p of listDropPoints(doc)) {
      const list = getList(doc, p);
      expect(list).not.toBeNull();
      expect(p.index).toBeLessThanOrEqual(list!.length);
    }
  });
});

describe('uid ops (applyOp / replayOps / appendOp)', () => {
  it('insert, move, setN and remove by uid', () => {
    let doc: Block[] = [rep('r', [])];
    doc = applyOp(doc, { type: 'insert', block: f('a'), target: { parentUid: 'r', slot: 0, index: 0 } }) ?? doc;
    expect(findPathByUid(doc, 'a')).toEqual([0, 0, 0]);
    doc = applyOp(doc, { type: 'move', uid: 'a', target: { parentUid: null, slot: 0, index: 1 } }) ?? doc;
    expect(uids(doc)).toEqual(['r', 'a']);
    doc = applyOp(doc, { type: 'setN', uid: 'r', n: 7 }) ?? doc;
    expect(doc[0]).toMatchObject({ n: 7 });
    doc = applyOp(doc, { type: 'remove', uid: 'r' }) ?? doc;
    expect(uids(doc)).toEqual(['a']);
  });
  it('returns null when the target is gone or a rule forbids it', () => {
    const doc = [f('a')];
    expect(applyOp(doc, { type: 'insert', block: f('x'), target: { parentUid: 'gone', slot: 0, index: 0 } })).toBeNull();
    expect(applyOp(doc, { type: 'insert', block: call('c'), target: { parentUid: null, slot: 0, index: 0 } })).toBeNull();
    expect(applyOp(doc, { type: 'insert', block: f('a'), target: { parentUid: null, slot: 0, index: 0 } })).toBeNull();
    expect(applyOp(doc, { type: 'move', uid: 'gone', target: { parentUid: null, slot: 0, index: 0 } })).toBeNull();
    expect(applyOp(doc, { type: 'remove', uid: 'gone' })).toBeNull();
    expect(applyOp(doc, { type: 'setN', uid: 'a', n: 3 })).toBeNull();
  });
  it('replays local ops on top of a newer server doc', () => {
    const local: Block[] = [f('a'), rep('r', [])];
    const ops = [
      { type: 'insert', block: r('mine'), target: { parentUid: 'r', slot: 0, index: 0 } },
      { type: 'insert', block: f('orphan'), target: { parentUid: 'deleted', slot: 0, index: 0 } },
    ] as const;
    const server: Block[] = [f('b'), ...local];
    const out = replayOps(server, ops);
    expect(uids(out)).toEqual(['b', 'a', 'r']);
    expect(findPathByUid(out, 'mine')).toEqual([2, 0, 0]);
    expect(findPathByUid(out, 'orphan')).toBeNull();
  });
  it('converts path drop points to uid targets and back', () => {
    const doc = [f('a'), ifw('i', [], [])];
    const t = toUidTarget(doc, { parentPath: [1], slot: 1, index: 0 });
    expect(t).toEqual({ parentUid: 'i', slot: 1, index: 0 });
    const moved = [ifw('i', [], []), f('a')];
    expect(resolveTarget(moved, t!)).toEqual({ parentPath: [0], slot: 1, index: 0 });
    expect(toUidTarget(doc, { parentPath: [], slot: 0, index: 2 })).toEqual({ parentUid: null, slot: 0, index: 2 });
    expect(toUidTarget([{ id: 'repeat', n: 2, body: [] }], { parentPath: [0], slot: 0, index: 0 })).toBeNull();
  });
  it('appendOp adds to the end or explains why not', () => {
    const doc = [f('a')];
    const op = appendOp(doc, 'right');
    expect(op).not.toBeNull();
    expect(uids(applyOp(doc, op!))?.length).toBe(2);
    expect(appendOp(doc, 'call')).toBeNull();
    expect(dropBlockReason(doc, 'call')).toContain('함수 F');
    expect(appendOp([def('d', [])], 'def')).toBeNull();
    expect(dropBlockReason([def('d', [])], 'def')).toContain('하나만');
    expect(dropBlockReason(doc, 'forward')).toBeNull();
    expect(sameDoc(doc, [f('a')])).toBe(true);
    expect(sameDoc(doc, [f('b')])).toBe(false);
  });
});
