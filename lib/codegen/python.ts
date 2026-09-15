// 블록 프로그램 → 파이썬식 코드 (docs/FEATURE_V4.md §4). 순수 함수, 엔진은 건드리지 않는다.
// 클라이언트 번들에 들어가므로 엔진 index(정답 포함)가 아니라 types·blocks·text 만 가져온다.
//
// 매핑: 앞으로 owl.forward() · 점프 owl.jump() · 좌회전 owl.turn_left() · 우회전 owl.turn_right() · 잠자기 owl.sleep()
//       F 호출 F() · 반복 N for _ in range(N): · 만약 앞이 벽이면 if owl.wall_ahead(): · 만약 앞이 구덩이면 if owl.pit_ahead():
//       아니면 else: · 함수 F def F():
// 들여쓰기 4칸. 빈 몸통은 pass. 빈 else 는 생략(then 이 비면 pass).
// 경로 규칙은 엔진과 같다(최상위 [i], 입 안 [i, slot, j], slot 0 = body/then, 1 = else) → Step.path 로 줄을 찾는다.
// F 호출로 실행된 액션의 Step.path 는 def 본문의 원래 경로라서 def 본문 줄이 강조된다.
import type { Block, BlockId, Program } from '@/lib/engine/types';
import { isKnownBlockId } from '@/lib/engine/blocks';
import { pathKey } from '@/lib/engine/text';
import { blockBase, createSink, tk } from './sink';
import type { CodeListing, CodeToken } from './types';

export const PY_INDENT = '    ';

const owlCall = (method: string, tail = '()'): CodeToken[] => [
  tk('owl', 'builtin'),
  tk('.', 'punct'),
  tk(method, 'call'),
  tk(tail, 'punct'),
];

/** 블록 머리 줄의 토큰 (들여쓰기 제외) */
export function pyHeadTokens(b: Block): CodeToken[] {
  switch (b.id) {
    case 'forward':
      return owlCall('forward');
    case 'jump':
      return owlCall('jump');
    case 'left':
      return owlCall('turn_left');
    case 'right':
      return owlCall('turn_right');
    case 'sleep':
      return owlCall('sleep');
    case 'call':
      return [tk('F', 'call'), tk('()', 'punct')];
    case 'repeat':
      return [
        tk('for', 'keyword'), tk(' _ ', 'punct'), tk('in', 'keyword'), tk(' ', 'punct'),
        tk('range', 'builtin'), tk('(', 'punct'), tk(String(b.n), 'number'), tk('):', 'punct'),
      ];
    case 'if_wall':
      return [tk('if', 'keyword'), tk(' ', 'punct'), ...owlCall('wall_ahead', '():')];
    case 'if_pit':
      return [tk('if', 'keyword'), tk(' ', 'punct'), ...owlCall('pit_ahead', '():')];
    case 'def':
      return [tk('def', 'keyword'), tk(' ', 'punct'), tk('F', 'call'), tk('():', 'punct')];
    default:
      return [tk(`# ? ${String((b as { id: unknown }).id)}`, 'comment')];
  }
}

const PASS: CodeToken[] = [tk('pass', 'keyword')];
const ELSE: CodeToken[] = [tk('else', 'keyword'), tk(':', 'punct')];

/** 블록 프로그램을 파이썬식 줄 목록 + pathKey→줄 번호 맵으로 */
export function toPython(program: Program): CodeListing {
  const sink = createSink(PY_INDENT);

  const body = (list: Block[], prefix: number[], depth: number, base: string, slot: number, owner: number[]) => {
    if (list.length === 0) {
      sink.push({ base, role: `pass${slot}`, depth, path: null, owner, blockId: null, tokens: PASS });
      return;
    }
    walk(list, prefix, depth);
  };

  const walk = (list: Block[], prefix: number[], depth: number): void => {
    list.forEach((b, i) => {
      const path = [...prefix, i];
      const base = blockBase(b, path);
      const id: BlockId | null = isKnownBlockId(b.id) ? b.id : null;
      sink.push({ base, role: '', depth, path, owner: path, blockId: id, tokens: pyHeadTokens(b) });
      if (b.id === 'repeat' || b.id === 'def') {
        body(b.body, [...path, 0], depth + 1, base, 0, path);
      } else if (b.id === 'if_wall' || b.id === 'if_pit') {
        body(b.then, [...path, 0], depth + 1, base, 0, path);
        if (b.else.length > 0) {
          sink.push({ base, role: 'else', depth, path: null, owner: path, blockId: null, tokens: ELSE });
          walk(b.else, [...path, 1], depth + 1);
        }
      }
    });
  };

  walk(program ?? [], [], 0);
  return sink.done();
}

/** 파이썬식 코드 글 전체 */
export function toPythonText(program: Program): string {
  return toPython(program).text;
}

/** 경로(Step.path 등) → 줄 번호(0-based). 없으면 -1 */
export function lineOfPath(listing: CodeListing, path: readonly number[] | null | undefined): number {
  if (!path) return -1;
  return listing.lineOf.get(pathKey(path as number[])) ?? -1;
}
