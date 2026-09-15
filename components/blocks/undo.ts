// 되돌리기 보조 (순수 함수): 편집 동작(EditOp)의 반대 동작을 만든다.
// 규칙은 lib/editor/tree.ts 그대로다 — 반대 동작도 보통 EditOp 라서 applyOp 가 규칙에 어긋나면 적용하지 않는다.
// 만든 반대 동작은 "op 를 적용한 문서에 적용하면 원래 문서로 돌아오는지" 확인된 것만 돌려준다.
import type { Block } from '@/lib/engine/types';
import {
  applyOp, findPathByUid, getBlock, getList, refFromPrefix, resolveTarget, sameDoc, toUidTarget, type EditOp,
} from '@/lib/editor/tree';

/** op 의 반대 동작. op 가 아무것도 바꾸지 않거나 확인이 안 되면 null */
export function inverseOp(before: Block[], op: EditOp): EditOp | null {
  const after = applyOp(before, op);
  if (!after || sameDoc(after, before)) return null;
  const inv = rawInverse(before, after, op);
  if (!inv) return null;
  const back = applyOp(after, inv);
  return back && sameDoc(back, before) ? inv : null;
}

function rawInverse(before: Block[], after: Block[], op: EditOp): EditOp | null {
  switch (op.type) {
    case 'insert':
      return op.block.uid ? { type: 'remove', uid: op.block.uid } : null;
    case 'setN': {
      const p = findPathByUid(before, op.uid);
      const b = p ? getBlock(before, p) : null;
      return b?.id === 'repeat' ? { type: 'setN', uid: op.uid, n: b.n } : null;
    }
    case 'remove': {
      const p = findPathByUid(before, op.uid);
      const b = p ? getBlock(before, p) : null;
      if (!p || !b) return null;
      const target = toUidTarget(before, { ...refFromPrefix(p.slice(0, -1)), index: p[p.length - 1] });
      return target ? { type: 'insert', block: b, target } : null;
    }
    case 'move': {
      // 원래 자리 = 원래 스택에서 "바로 앞 형제 다음" (맨 앞이었으면 0번). 옮긴 뒤 문서 기준 연결 지점으로 바꾼다.
      const p = findPathByUid(before, op.uid);
      if (!p) return null;
      const ref = refFromPrefix(p.slice(0, -1));
      const idx = p[p.length - 1];
      const orig = toUidTarget(before, { ...ref, index: 0 });
      if (!orig) return null;
      const pt = resolveTarget(after, orig);
      if (!pt) return null;
      let index = 0;
      if (idx > 0) {
        const prevUid = (getList(before, ref) ?? [])[idx - 1]?.uid;
        if (!prevUid) return null;
        const i = (getList(after, pt) ?? []).findIndex((b) => b.uid === prevUid);
        if (i < 0) return null;
        index = i + 1;
      }
      return { type: 'move', uid: op.uid, target: { ...orig, index } };
    }
    default:
      return null;
  }
}
