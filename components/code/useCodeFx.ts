'use client';
// 코드 뷰 네온 연출 상태: 렌더 사이 줄 차이를 계산해 줄마다 효과(new / chg-a / chg-b)와 사라지는 줄(유령)을 준다.
// - 첫 렌더·언어 전환은 연출 없음 (이전 = 없음).
// - 효과는 시작 시각과 함께 보관해서, 연출 도중 다른 줄이 바뀌어 다시 그려도 끊기지 않는다(new 1.25s, chg 0.65s).
// - 바뀐 줄은 세대 짝수/홀수로 a/b 애니메이션 이름을 번갈아 써서 같은 줄도 다시 튼다.
// - flashPaths + flashKey: flashKey 가 바뀌면 그 경로들의 줄을 "바뀐 줄"처럼 한 번 빛낸다(옮긴 블록 등).
// - 지운 줄은 0.32s 동안 원래 자리(앞 줄 뒤)에 유령으로 남아 흐려진다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { pathKey } from '@/lib/engine/text';
import { diffListings, type ListingDiff } from '@/lib/codegen/diff';
import type { CodeLang, CodeLine, CodeListing } from '@/lib/codegen/types';

export type RowFx = 'new' | 'chg-a' | 'chg-b';
export type FxRow = { kind: 'line'; line: CodeLine; index: number } | { kind: 'ghost'; line: CodeLine; id: string };

interface Stored { kind: 'new' | 'chg'; at: number; gen: number }

const NEW_MS = 1250;
const CHG_MS = 650;
const GHOST_MS = 320;

export interface CodeFx {
  rows: FxRow[];
  fxOf: (key: string) => RowFx | undefined;
  focus: ListingDiff['focus'];
  gen: number;
}

export function useCodeFx(
  listing: CodeListing,
  lang: CodeLang,
  opts: { animate?: boolean; flashPaths?: readonly (readonly number[])[] | null; flashKey?: number | string | null } = {},
): CodeFx {
  const { animate = true, flashPaths, flashKey } = opts;
  const committed = useRef<{ lang: CodeLang; lines: CodeLine[]; gen: number; flashKey: unknown } | null>(null);
  const store = useRef(new Map<string, Stored>());
  const [clearedGen, setClearedGen] = useState(0);

  const model = useMemo(() => {
    const prev = committed.current;
    const gen = (prev?.gen ?? 0) + 1;
    const now = Date.now();
    const s = store.current;
    const base = animate && prev && prev.lang === lang ? prev.lines : null;
    const diff = diffListings(base, listing.lines);
    if (!base) s.clear();
    for (const l of listing.lines) {
      const st = diff.status.get(l.key);
      if (st === 'new') s.set(l.key, { kind: 'new', at: now, gen });
      else if (st === 'changed') s.set(l.key, { kind: 'chg', at: now, gen });
    }
    // 명시적 반짝임 (flashKey 가 바뀐 렌더에서만)
    if (animate && prev && flashKey != null && flashKey !== prev.flashKey && flashPaths?.length) {
      for (const p of flashPaths) {
        const i = listing.lineOf.get(pathKey(p as number[]));
        const l = i === undefined ? undefined : listing.lines[i];
        if (l && s.get(l.key)?.kind !== 'new') s.set(l.key, { kind: 'chg', at: now, gen });
      }
    }
    // 오래된 효과 정리
    for (const [k, v] of s) if (now - v.at > (v.kind === 'new' ? NEW_MS : CHG_MS)) s.delete(k);

    const after = new Map<string | null, CodeLine[]>();
    if (base) {
      for (const r of diff.removed) {
        const list = after.get(r.after) ?? [];
        list.push(r.line);
        after.set(r.after, list);
      }
    }
    const ghost = (l: CodeLine): FxRow => ({ kind: 'ghost', line: l, id: `ghost:${gen}:${l.key}` });
    const rows: FxRow[] = [...(after.get(null) ?? []).map(ghost)];
    listing.lines.forEach((l, index) => {
      rows.push({ kind: 'line', line: l, index });
      for (const g of after.get(l.key) ?? []) rows.push(ghost(g));
    });
    const snapshot = new Map(s);
    const fxOf = (key: string): RowFx | undefined => {
      const v = snapshot.get(key);
      if (!v) return undefined;
      return v.kind === 'new' ? 'new' : v.gen % 2 ? 'chg-b' : 'chg-a';
    };
    return { rows, fxOf, focus: base ? diff.focus : null, gen, hasGhosts: rows.length !== listing.lines.length };
    // flashPaths 는 flashKey 와 함께 바뀐다고 본다 (flashKey 가 신호)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing, lang, animate, flashKey]);

  useEffect(() => {
    committed.current = { lang, lines: listing.lines, gen: model.gen, flashKey };
    if (!model.hasGhosts) return;
    const t = setTimeout(() => setClearedGen(model.gen), GHOST_MS);
    return () => clearTimeout(t);
  }, [model, lang, listing, flashKey]);

  const rows = model.hasGhosts && clearedGen >= model.gen ? model.rows.filter((r) => r.kind === 'line') : model.rows;
  return { rows, fxOf: model.fxOf, focus: model.focus, gen: model.gen };
}
