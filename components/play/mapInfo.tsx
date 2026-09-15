// 맵 보조 표시 (훅 없음): 난이도 칩 색, 새 요소 토큰(블록 이름은 보라 인라인 칩), 맵 기호 범례(SVG 글리프)
import type { ReactNode } from 'react';
import type { GameMap } from '@/lib/contracts';
import { BLOCKS, CATEGORIES } from '@/lib/engine/blocks';
import { CatSprite, DoorGlyph, KeyGlyph, MouseGlyph } from '@/components/map/MapGrid';
import { Token, type ChipTone } from '@/components/ui/Chip';

export const DIFFICULTY_TONE: Record<GameMap['difficulty'], ChipTone> = {
  쉬움: 'neutral',
  중간: 'blue',
  어려움: 'violet',
  '매우 어려움': 'violet',
};

/** 블록 이름·분류 이름 (이것만 보라 Token 칩으로) */
const BLOCK_WORDS = new Set<string>([
  ...Object.values(BLOCKS).map((b) => b.label),
  ...Object.values(CATEGORIES).map((c) => c.label),
]);

/** "앞으로·회전·반복" → 칩 여러 개. 블록 이름은 보라 Token, 맵 요소(열쇠·문 …)는 무채 칩 */
export function IntroTokens({ intro }: { intro: string }) {
  const items = intro.split('·').map((s) => s.trim()).filter(Boolean);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {items.map((it) =>
        BLOCK_WORDS.has(it) ? (
          <Token key={it}>{it}</Token>
        ) : (
          <span
            key={it}
            className="inline-block rounded-full border border-line bg-panel-2 px-2 py-px text-[0.92em] font-semibold leading-snug text-text"
          >
            {it}
          </span>
        ))}
    </span>
  );
}

function GoalRing() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="text-cyan">
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function PitDot() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="var(--color-black)" stroke="var(--color-line-strong)" strokeWidth="2" />
    </svg>
  );
}

/** 맵 기호 범례: 이 맵에 있는 것만 */
export function MapLegend({ map, className = '' }: { map: GameMap; className?: string }) {
  const flat = map.tiles.join('');
  const items: { key: string; icon: ReactNode; label: string }[] = [{ key: 'goal', icon: <GoalRing />, label: '둥지 (도착)' }];
  if (flat.includes('O')) items.push({ key: 'pit', icon: <PitDot />, label: '구덩이' });
  if (flat.includes('M')) items.push({ key: 'mouse', icon: <MouseGlyph />, label: '쥐 +20' });
  if (flat.includes('K')) items.push({ key: 'key', icon: <KeyGlyph />, label: '열쇠' });
  if (flat.includes('D')) items.push({ key: 'door', icon: <DoorGlyph />, label: '문 (열쇠 필요)' });
  if (map.cat) items.push({ key: 'cat', icon: <CatSprite />, label: '고양이 순찰' });
  return (
    <ul aria-label="맵 기호" className={`flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-text-dim ${className}`}>
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1.5">
          <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">{i.icon}</span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
