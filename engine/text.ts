// OWL COMPILE — 텍스트 렌더링 & 줄 번호 (docs/ENGINE_SPEC.md §5)
// run()의 Step.line 은 여기서 정한 줄 번호와 같은 규칙을 쓴다.
import type { Block, BlockId, Program } from './types';
import { BLOCKS, isKnownBlockId } from './blocks';

export interface TextLine { text: string; depth: number; path: number[] | null; blockId: BlockId | null }

const INDENT = '  ';

export function pathKey(path: number[]): string {
  return path.join('.');
}

/** 블록의 머리 줄 문구 (들여쓰기 제외). */
export function headText(b: Block): string {
  switch (b.id) {
    case 'repeat': return `반복 ${b.n} {`;
    case 'if_wall': return `${BLOCKS.if_wall.label} {`;
    case 'if_pit': return `${BLOCKS.if_pit.label} {`;
    case 'def': return `${BLOCKS.def.label} {`;
    default:
      // 일반 블록(협동 전용 toggle·spawn 포함)은 라벨 그대로: "색 바꾸기" / "상자 놓기"
      return isKnownBlockId(b.id) ? BLOCKS[b.id].label : `? ${String((b as { id: unknown }).id)}`;
  }
}

export function toText(program: Program): { text: string; lines: TextLine[] } {
  const lines: TextLine[] = [];
  const push = (text: string, depth: number, path: number[] | null, blockId: BlockId | null) =>
    lines.push({ text: INDENT.repeat(depth) + text, depth, path, blockId });

  const walk = (blocks: Block[], prefix: number[], depth: number): void => {
    blocks.forEach((b, i) => {
      const path = [...prefix, i];
      const id: BlockId | null = isKnownBlockId(b.id) ? b.id : null;
      push(headText(b), depth, path, id);
      if (b.id === 'repeat' || b.id === 'def') {
        walk(b.body, [...path, 0], depth + 1);
        push('}', depth, null, null);
      } else if (b.id === 'if_wall' || b.id === 'if_pit') {
        walk(b.then, [...path, 0], depth + 1);
        push('} 아니면 {', depth, null, null);   // else가 비어도 항상 출력 (카드와 동일)
        walk(b.else, [...path, 1], depth + 1);
        push('}', depth, null, null);
      }
    });
  };
  walk(program, [], 0);
  return { text: lines.map((l) => l.text).join('\n'), lines };
}

/** pathKey → 줄 번호(0-based). 모든 블록(C-블록 머리 줄 포함). */
export function lineIndex(program: Program): Map<string, number> {
  const m = new Map<string, number>();
  toText(program).lines.forEach((l, i) => {
    if (l.path) m.set(pathKey(l.path), i);
  });
  return m;
}
