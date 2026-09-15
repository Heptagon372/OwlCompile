// 밑줄형 탭 (훅 없음). 상태는 부모가 쥔다: <PanelTabs tabs={…} value={tab} onChange={setTab} />
// href 를 주면 링크 탭이 된다 (onChange 없이도 됨). 활성 = 흰 글자 + 2px violet-ink 밑줄
// (얇은 선이라 #5B2BFF 는 panel 위 2.95:1 → 검정 위 보라 선은 violet-ink).
import Link from 'next/link';
import type { ReactNode } from 'react';

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  /** 오른쪽 작은 수 (예: 회원 12) */
  count?: number | string;
  icon?: ReactNode;
  href?: string;
  disabled?: boolean;
}

export function PanelTabs<K extends string>({
  tabs, value, onChange, className = '', size = 'md', 'aria-label': ariaLabel,
}: {
  tabs: readonly TabItem<K>[];
  value: K;
  onChange?: (key: K) => void;
  className?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}) {
  const h = size === 'sm' ? 'h-9 text-[13px]' : 'h-11 text-sm';
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex items-end gap-1 overflow-x-auto border-b border-stroke px-1 ${className}`}>
      {tabs.map((t) => {
        const active = t.key === value;
        const cls =
          `relative inline-flex ${h} shrink-0 items-center gap-1.5 px-3 font-semibold transition-colors duration-150 ` +
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink [&_svg]:size-4 ' +
          (active ? 'text-text [&_svg]:text-violet-ink' : 'text-text-dim hover:text-text') +
          (t.disabled ? ' cursor-not-allowed opacity-40' : '');
        const inner = (
          <>
            {t.icon}
            {t.label}
            {t.count !== undefined ? (
              <span className={`rounded-full px-1.5 py-px font-mono text-[11px] tabular-nums ${active ? 'bg-violet-soft text-violet-ink' : 'bg-tint/[0.05] text-text-faint'}`}>
                {t.count}
              </span>
            ) : null}
            <span aria-hidden="true" className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${active ? 'bg-violet-ink shadow-[0_0_8px_var(--glow-tab)]' : 'bg-transparent'}`} />
          </>
        );
        if (t.href && !t.disabled) {
          return (
            <Link key={t.key} href={t.href} role="tab" aria-selected={active} className={cls} aria-current={active ? 'page' : undefined}>
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
