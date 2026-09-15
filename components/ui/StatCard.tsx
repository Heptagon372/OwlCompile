// 지표 카드 (훅 없음) — DESIGN_V4 §3: 유리 카드, 왼쪽 위 빛나는 원형 아이콘 배지, 작은 라벨, 큰 Manrope 숫자,
// 보조 문구(증감), 아래 (선택) 네온 스파크라인.
// <StatCard icon={<IconUsers />} label="대기 인원" value={12} sub="방금 3명 들어옴" spark={[3,5,4,8,12]} />
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconBadge, type IconBadgeTone } from './IconBadge';
import { Sparkline, type SparkTone } from './Sparkline';

export type StatCardSize = 'md' | 'lg' | 'board';

const VALUE: Record<StatCardSize, string> = {
  md: 'text-[30px]',
  lg: 'text-[40px]',
  board: 'text-[80px]',
};
const LABEL: Record<StatCardSize, string> = {
  md: 'text-[13px]',
  lg: 'text-sm',
  board: 'text-[24px]',
};

const SUB_TONE = {
  dim: 'text-text-dim',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  violet: 'text-violet-ink',
} as const;

export interface StatCardProps {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  /** 값 옆 작은 단위 (예: "명", "/10") */
  unit?: ReactNode;
  /** 아래 보조 문구 (증감 등) */
  sub?: ReactNode;
  subTone?: keyof typeof SUB_TONE;
  /** 스파크라인 데이터 (2개 이상) */
  spark?: readonly number[];
  sparkTone?: SparkTone;
  badgeTone?: IconBadgeTone;
  /** 오른쪽 위 작은 요소 (상태 알약 등) */
  right?: ReactNode;
  /** 배지 바깥 빛 (기본 true). 화면에 강한 빛이 이미 둘이면 false (DESIGN_V4 §3) */
  badgeGlow?: boolean;
  href?: string;
  size?: StatCardSize;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
}

export function StatCard({
  icon, label, value, unit, sub, subTone = 'dim', spark, sparkTone = 'violet', badgeTone = 'violet', badgeGlow = true, right, href,
  size = 'md', className = '', children, 'aria-label': ariaLabel,
}: StatCardProps) {
  const board = size === 'board';
  const body = (
    <>
      <div className="flex items-center gap-3">
        {icon ? <IconBadge tone={badgeTone} glow={badgeGlow} size={board ? 'xl' : 'md'}>{icon}</IconBadge> : null}
        <span className={`min-w-0 flex-1 truncate font-medium text-text-dim ${LABEL[size]}`}>{label}</span>
        {right ? <span className="shrink-0">{right}</span> : null}
      </div>
      <div className={`mt-4 flex items-baseline gap-1.5 font-display font-bold leading-none tracking-[-0.02em] tabular-nums text-text ${VALUE[size]}`}>
        {value}
        {unit ? <span className={`font-semibold text-text-faint ${board ? 'text-[32px]' : 'text-base'}`}>{unit}</span> : null}
      </div>
      {sub ? <p className={`mt-2 ${board ? 'text-[22px]' : 'text-[13px]'} ${SUB_TONE[subTone]}`}>{sub}</p> : null}
      {spark && spark.length > 1 ? (
        <div className="-mx-1 mt-3">
          <Sparkline data={spark} tone={sparkTone} height={board ? 72 : 40} />
        </div>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  );
  const cls =
    `glass relative flex min-w-0 flex-col overflow-hidden rounded-card border border-stroke shadow-glass ${board ? 'p-8' : 'p-5'} ` +
    className;
  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={`${cls} transition-[border-color,translate] duration-150 hover:border-stroke-strong hover:[--glass-fill:var(--color-glass-2)] motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink`}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={cls} aria-label={ariaLabel} role={ariaLabel ? 'group' : undefined}>
      {body}
    </div>
  );
}

/** 빠른 실행 타일 (DESIGN_V4 §1): 아이콘 + 라벨의 작은 유리 타일 */
export function QuickTile({
  href, icon, label, sub, onClick, className = '',
}: {
  href?: string;
  icon: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      <IconBadge tone="glass" size="md" glow={false}>{icon}</IconBadge>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text">{label}</span>
        {sub ? <span className="block truncate text-xs text-text-faint">{sub}</span> : null}
      </span>
    </>
  );
  const cls =
    'glass relative flex min-h-16 items-center gap-3 rounded-inset border border-stroke px-3.5 py-3 text-left shadow-glass ' +
    'transition-[border-color,translate] duration-150 hover:border-stroke-strong hover:[--glass-fill:var(--color-glass-2)] motion-safe:hover:-translate-y-0.5 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink ' +
    className;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
