// 블록 프로그램 → 한국어 코드 (엔진 toText 와 글자·줄 번호가 똑같다, docs/ENGINE_SPEC.md §5).
// 코드 뷰의 "한국어" 탭용: toText 줄에 토큰(문법 색)과 줄 키(uid)를 붙인다. 순수 함수.
import type { Block, BlockId, Program } from '@/lib/engine/types';
import { BLOCKS, isKnownBlockId } from '@/lib/engine/blocks';
import { blockBase, createSink, tk } from './sink';
import type { CodeListing, CodeToken } from './types';

export const KO_INDENT = '  ';

/** "함수 F" → [함수][ ][F] 처럼 마지막 낱말을 따로 */
function splitLast(label: string): [string, string] | null {
  const m = /^(.*\S) (\S+)$/.exec(label);
  return m ? [m[1], m[2]] : null;
}

export function koHeadTokens(b: Block): CodeToken[] {
  switch (b.id) {
    case 'repeat':
      return [tk('반복', 'keyword'), tk(' ', 'punct'), tk(String(b.n), 'number'), tk(' {', 'punct')];
    case 'if_wall':
    case 'if_pit':
      return [tk(BLOCKS[b.id].label, 'keyword'), tk(' {', 'punct')];
    case 'def': {
      const s = splitLast(BLOCKS.def.label);
      return s
        ? [tk(s[0], 'keyword'), tk(' ', 'punct'), tk(s[1], 'call'), tk(' {', 'punct')]
        : [tk(BLOCKS.def.label, 'keyword'), tk(' {', 'punct')];
    }
    case 'call': {
      const m = /^(\S+) (.+)$/.exec(BLOCKS.call.label);
      return m ? [tk(m[1], 'call'), tk(' ', 'punct'), tk(m[2], 'keyword')] : [tk(BLOCKS.call.label, 'call')];
    }
    default:
      // 일반 블록(협동 전용 색 바꾸기·상자 놓기 포함): 라벨 그대로 (엔진 toText 와 같다)
      return isKnownBlockId(b.id)
        ? [tk(BLOCKS[b.id].label, 'call')]
        : [tk(`? ${String((b as { id: unknown }).id)}`, 'comment')];
  }
}

const CLOSE: CodeToken[] = [tk('}', 'punct')];
const ELSE: CodeToken[] = [tk('} ', 'punct'), tk('아니면', 'keyword'), tk(' {', 'punct')];

export function toKorean(program: Program): CodeListing {
  const sink = createSink(KO_INDENT);
  const walk = (list: Block[], prefix: number[], depth: number): void => {
    list.forEach((b, i) => {
      const path = [...prefix, i];
      const base = blockBase(b, path);
      const id: BlockId | null = isKnownBlockId(b.id) ? b.id : null;
      sink.push({ base, role: '', depth, path, owner: path, blockId: id, tokens: koHeadTokens(b) });
      if (b.id === 'repeat' || b.id === 'def') {
        walk(b.body, [...path, 0], depth + 1);
        sink.push({ base, role: 'end', depth, path: null, owner: path, blockId: null, tokens: CLOSE });
      } else if (b.id === 'if_wall' || b.id === 'if_pit') {
        walk(b.then, [...path, 0], depth + 1);
        sink.push({ base, role: 'else', depth, path: null, owner: path, blockId: null, tokens: ELSE }); // 비어도 항상 (toText 와 같게)
        walk(b.else, [...path, 1], depth + 1);
        sink.push({ base, role: 'end', depth, path: null, owner: path, blockId: null, tokens: CLOSE });
      }
    });
  };
  walk(program ?? [], [], 0);
  return sink.done();
}
