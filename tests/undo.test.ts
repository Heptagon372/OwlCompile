// components/blocks/undo.ts: 되돌리기용 반대 동작이 원래 문서로 정확히 돌아오는지
import { describe, expect, it } from 'vitest';
import type { Block } from '@/lib/engine/types';
import { applyOp, newBlock, sameDoc, type EditOp } from '@/lib/editor/tree';
import { inverseOp } from '@/components/blocks/undo';

function run(doc: Block[], op: EditOp): { after: Block[]; inv: EditOp } {
  const inv = inverseOp(doc, op);
  expect(inv).not.toBeNull();
  const after = applyOp(doc, op);
  expect(after).not.toBeNull();
  const back = applyOp(after as Block[], inv as EditOp);
  expect(back && sameDoc(back, doc)).toBe(true);
  return { after: after as Block[], inv: inv as EditOp };
}

/** [앞으로, 반복(좌회전), 점프] */
function sample(): Block[] {
  const fwd = newBlock('forward');
  const rep = newBlock('repeat');
  const left = newBlock('left');
  const jump = newBlock('jump');
  if (rep.id !== 'repeat') throw new Error('repeat');
  return [fwd, { ...rep, body: [left] }, jump];
}

describe('inverseOp', () => {
  it('insert ↔ remove', () => {
    const doc = sample();
    run(doc, { type: 'insert', block: newBlock('right'), target: { parentUid: null, slot: 0, index: 1 } });
    run(doc, { type: 'insert', block: newBlock('jump'), target: { parentUid: doc[1].uid as string, slot: 0, index: 1 } });
  });

  it('remove (C-블록은 안의 카드까지) ↔ insert', () => {
    const doc = sample();
    run(doc, { type: 'remove', uid: doc[1].uid as string });
    run(doc, { type: 'remove', uid: doc[0].uid as string });
  });

  it('move: 같은 스택 앞뒤, 입 안팎', () => {
    const doc = sample();
    const inner = (doc[1] as Extract<Block, { id: 'repeat' }>).body[0];
    run(doc, { type: 'move', uid: doc[0].uid as string, target: { parentUid: null, slot: 0, index: 3 } });
    run(doc, { type: 'move', uid: doc[2].uid as string, target: { parentUid: null, slot: 0, index: 0 } });
    run(doc, { type: 'move', uid: inner.uid as string, target: { parentUid: null, slot: 0, index: 3 } });
    run(doc, { type: 'move', uid: doc[2].uid as string, target: { parentUid: doc[1].uid as string, slot: 0, index: 0 } });
  });

  it('setN', () => {
    const doc = sample();
    run(doc, { type: 'setN', uid: doc[1].uid as string, n: 7 });
  });

  it('아무것도 바꾸지 않는 동작은 기록하지 않는다', () => {
    const doc = sample();
    expect(inverseOp(doc, { type: 'remove', uid: 'nope' })).toBeNull();
    expect(inverseOp(doc, { type: 'move', uid: doc[0].uid as string, target: { parentUid: null, slot: 0, index: 0 } })).toBeNull();
  });
});
