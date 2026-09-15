// 줄 목록 만들기 도우미 (python·korean 공용). 순수 함수.
import type { Block, BlockId } from '@/lib/engine/types';
import { pathKey } from '@/lib/engine/text';
import type { CodeLine, CodeListing, CodeToken, CodeTokenKind } from './types';

export const tk = (text: string, kind: CodeTokenKind): CodeToken => ({ text, kind });

/** 블록의 줄 키 바탕: uid 가 있으면 uid (옮겨도 같은 줄), 없으면 경로 */
export function blockBase(b: Block, path: number[]): string {
  return typeof b.uid === 'string' && b.uid !== '' ? `u:${b.uid}` : `p:${pathKey(path)}`;
}

export interface PushLine {
  /** blockBase() 값 */
  base: string;
  /** 머리 줄은 '' , 그 밖에는 'else' · 'pass0' · 'end' 등 */
  role: string;
  depth: number;
  path: number[] | null;
  owner: number[] | null;
  blockId: BlockId | null;
  tokens: CodeToken[];
}

export function createSink(indentUnit: string) {
  const lines: CodeLine[] = [];
  const lineOf = new Map<string, number>();
  const seen = new Map<string, number>();
  const push = (o: PushLine) => {
    let key = o.role ? `${o.base}:${o.role}` : o.base;
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    if (dup) key = `${key}#${dup}`; // uid 가 겹치는 문서도 키는 유일하게
    const code = o.tokens.map((t) => t.text).join('');
    if (o.path) lineOf.set(pathKey(o.path), lines.length);
    lines.push({
      key,
      text: indentUnit.repeat(o.depth) + code,
      code,
      indent: o.depth,
      path: o.path,
      owner: o.owner,
      blockId: o.blockId,
      tokens: o.tokens,
    });
  };
  const done = (): CodeListing => ({ lines, lineOf, text: lines.map((l) => l.text).join('\n') });
  return { push, done };
}
