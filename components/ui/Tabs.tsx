// 알약 탭 / 세그먼트 (훅 없음) — DESIGN_V4 §3. 상태는 부모가 쥔다: <Tabs tabs={…} value={tab} onChange={setTab} />
// 유리 홈(glass-inset 알약) 안에서 활성 탭이 올라온 유리 알약(glass) 또는 보라 그라데이션(violet)으로.
// href 를 주면 링크 탭. 좌우 화살표·Home·End 로 탭 사이를 옮긴다(roving).
// 밑줄형 탭은 PanelTabs (같은 TabItem).
import Link from 'next/link';
import type { KeyboardEvent } from 'react';
import type { TabItem } from './PanelTabs';

export type TabsSize = 'xs' | 'sm' | 'md' | 'lg';

// 폰(md 미만)에서는 xs·sm·md 탭도 44px 터치 높이
const SIZE: Record<TabsSize, { wrap: string; tab: string }> = {
  xs: { wrap: 'p-0.5 gap-0.5', tab: 'h-7 px-3 text-xs max-md:h-11 [&_svg]:size-3.5' },
  sm: { wrap: 'p-1 gap-1', tab: 'h-8 px-3.5 text-[13px] max-md:h-11 [&_svg]:size-4' },
  md: { wrap: 'p-1 gap-1', tab: 'h-9 px-4 text-[13px] max-md:h-11 md:text-sm [&_svg]:size-4' },
  lg: { wrap: 'p-1.5 gap-1', tab: 'h-11 px-5 text-[15px] [&_svg]:size-5' },
};

function onKey(e: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([aria-disabled="true"]):not(:disabled)'));
  const i = tabs.indexOf(document.activeElement as HTMLElement);
  if (i < 0 || tabs.length === 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
}

export function Tabs<K extends string>({
  tabs, value, onChange, size = 'md', variant = 'glass', fullWidth = false, className = '', 'aria-label': ariaLabel,
}: {
  tabs: readonly TabItem<K>[];
  value: K;
  onChange?: (key: K) => void;
  size?: TabsSize;
  /** 활성 탭 모양: glass(올라온 유리, 기본) · violet(보라 그라데이션 + 빛 — 한 화면에 한 곳만) */
  variant?: 'glass' | 'violet';
  /** 줄 폭 전체, 탭을 똑같이 나눈다 */
  fullWidth?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const s = SIZE[size];
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      className={
        `${fullWidth ? 'flex w-full' : 'inline-flex max-w-full'} items-center overflow-x-auto rounded-full border border-stroke bg-glass-inset ` +
        `shadow-[inset_0_1px_2px_var(--inset-shade-2)] ${s.wrap} ${className}`
      }
    >
      {tabs.map((t) => {
        const active = t.key === value;
        const on = variant === 'violet'
          ? 'bg-violet-grad text-white shadow-glow'
          : 'bg-glass-2 text-text shadow-[inset_0_0_0_1px_var(--color-stroke-strong),inset_0_1px_0_var(--sheen-3),0_4px_14px_var(--shadow-soft)] [&_svg]:text-violet-ink';
        const cls =
          `relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,box-shadow] duration-150 ` +
          // 탭 줄은 overflow-x-auto 라 바깥 링이 잘린다 → 안쪽 링
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink ' +
          `${s.tab} ${fullWidth ? 'flex-1' : ''} ` +
          (active ? on : 'text-text-dim hover:bg-tint/[0.05] hover:text-text') +
          (t.disabled ? ' cursor-not-allowed opacity-40' : '');
        const inner = (
          <>
            {t.icon}
            {t.label}
            {t.count !== undefined ? (
              <span className={`rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums ${active ? (variant === 'violet' ? 'bg-white/15 text-inherit' : 'bg-tint/15 text-inherit') : 'bg-tint/[0.06] text-text-faint'}`}>
                {t.count}
              </span>
            ) : null}
          </>
        );
        if (t.href && !t.disabled) {
          return (
            <Link key={t.key} href={t.href} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className={cls} aria-current={active ? 'page' : undefined}>
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            className={cls}
            onClick={() => onChange?.(t.key)}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
