// 두 코드 줄 목록의 차이 (코드 뷰 네온 연출용). 줄 키(블록 uid 기반)로 비교한다. 순수 함수.
//  - new: 이전에 없던 키 · changed: 같은 키인데 글(들여쓰기 포함)이 다름 · same: 그대로
//  - removed: 이전에만 있던 줄 + 새 목록에서 어느 줄 뒤에 두고 사라지게 할지(after = 앞의 살아남은 줄 키, null = 맨 위)
import type { CodeLine } from './types';

export type LineChange = 'new' | 'changed' | 'same';

export interface RemovedLine {
  line: CodeLine;
  /** 새 목록에서 이 줄을 뒤따라 그릴 줄의 키. null 이면 맨 위 */
  after: string | null;
}

export interface ListingDiff {
  status: Map<string, LineChange>;
  removed: RemovedLine[];
  /** 가장 눈여겨볼 변화 (티커용): 첫 새 줄 > 첫 바뀐 줄 > 첫 지운 줄 */
  focus: { kind: 'new' | 'changed' | 'removed'; line: CodeLine } | null;
  /** 변화가 하나라도 있으면 true */
  changed: boolean;
}

export function diffListings(prev: readonly CodeLine[] | null | undefined, next: readonly CodeLine[]): ListingDiff {
  const status = new Map<string, LineChange>();
  if (!prev) {
    for (const l of next) status.set(l.key, 'same');
    return { status, removed: [], focus: null, changed: false };
  }
  const before = new Map(prev.map((l) => [l.key, l] as const));
  let firstNew: CodeLine | null = null;
  let firstChanged: CodeLine | null = null;
  for (const l of next) {
    const old = before.get(l.key);
    const s: LineChange = !old ? 'new' : old.text !== l.text ? 'changed' : 'same';
    status.set(l.key, s);
    if (s === 'new' && !firstNew) firstNew = l;
    if (s === 'changed' && !firstChanged) firstChanged = l;
  }
  const removed: RemovedLine[] = [];
  let lastKept: string | null = null;
  for (const l of prev) {
    if (status.has(l.key)) lastKept = l.key;
    else removed.push({ line: l, after: lastKept });
  }
  const focus = firstNew
    ? { kind: 'new' as const, line: firstNew }
    : firstChanged
      ? { kind: 'changed' as const, line: firstChanged }
      : removed.length
        ? { kind: 'removed' as const, line: removed[0].line }
        : null;
  return { status, removed, focus, changed: focus !== null };
}
