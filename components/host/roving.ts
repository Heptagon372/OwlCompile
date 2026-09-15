// 라디오 묶음 키보드 이동 (Tabs 와 같은 규칙): ← → ↑ ↓ Home End 로 옆 칸에 초점을 옮기며 고른다.
// 묶음 요소에 onKeyDown={onRadioKeys}, 칸마다 role="radio" + aria-checked + tabIndex(고른 칸만 0).
import type { KeyboardEvent } from 'react';

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

export function onRadioKeys(e: KeyboardEvent<HTMLElement>): void {
  if (!KEYS.includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)'));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0 || items.length === 0) return;
  e.preventDefault();
  const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  const next = e.key === 'Home'
    ? 0
    : e.key === 'End'
      ? items.length - 1
      : (i + (fwd ? 1 : -1) + items.length) % items.length;
  items[next].focus();
  items[next].click();
}
