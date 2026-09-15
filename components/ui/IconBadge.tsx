// 아이콘 배지 (훅 없음) — DESIGN_V4 §3: 36~40px 원, 보라 그라데이션 + 안쪽 흰 선 아이콘 + 은은한 빛.
// <IconBadge><IconUsers /></IconBadge>   <IconBadge tone="ok" size="sm"><IconCheck /></IconBadge>
import type { ReactNode } from 'react';

export type IconBadgeTone = 'violet' | 'glass' | 'cyan' | 'ok' | 'warn' | 'danger';
export type IconBadgeSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<IconBadgeSize, string> = {
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-10 [&_svg]:size-5',
  lg: 'size-12 [&_svg]:size-[22px]',
  xl: 'size-14 [&_svg]:size-[26px]',
};

const TONE: Record<IconBadgeTone, { base: string; glow: string }> = {
  violet: {
    base: 'bg-violet-grad-deco text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.35)]',
    glow: 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.35),0_0_22px_var(--glow-badge)]',
  },
  glass: {
    base: 'bg-glass-2 text-violet-ink shadow-[inset_0_0_0_1px_var(--color-stroke-strong),inset_0_1px_0_var(--sheen-3)]',
    glow: 'bg-glass-2 text-violet-ink shadow-[inset_0_0_0_1px_var(--color-stroke-strong),inset_0_1px_0_var(--sheen-3),0_0_18px_var(--glow-badge-soft)]',
  },
  // 테두리 = 그 톤 색 40% (나이트 값 그대로: cyan #3FD6F2 = rgb(63,214,242) …), 빛 = 모드 토큰 --glow-<톤>
  cyan: { base: 'bg-cyan/15 text-neon-cyan shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-cyan)_40%,transparent)]', glow: 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-cyan)_40%,transparent),0_0_18px_var(--glow-cyan)]' },
  ok: { base: 'bg-ok/15 text-ok shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ok)_40%,transparent)]', glow: 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ok)_40%,transparent),0_0_18px_var(--glow-ok)]' },
  warn: { base: 'bg-warn/15 text-warn shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-warn)_40%,transparent)]', glow: 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-warn)_40%,transparent),0_0_18px_var(--glow-warn)]' },
  danger: { base: 'bg-danger/15 text-danger shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-danger)_40%,transparent)]', glow: 'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-danger)_40%,transparent),0_0_18px_var(--glow-danger)]' },
};

export function IconBadge({
  children, tone = 'violet', size = 'md', glow = true, className = '', label,
}: {
  children: ReactNode;
  tone?: IconBadgeTone;
  size?: IconBadgeSize;
  /** 은은한 바깥 빛 (기본 true) */
  glow?: boolean;
  className?: string;
  /** 접근성 이름. 없으면 장식(aria-hidden) */
  label?: string;
}) {
  const t = TONE[tone];
  // glow 클래스는 base 의 그림자를 통째로 바꾼다 (같은 속성 클래스 두 개를 겹치지 않게 base 에서 shadow 만 갈아 끼움)
  const cls = glow ? t.base.replace(/shadow-\[[^\]]+\]/, '') + ' ' + t.glow : t.base;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-grid shrink-0 place-items-center rounded-full ${SIZE[size]} ${cls} ${className}`}
    >
      {children}
    </span>
  );
}
