// 통계 띠 (DESIGN_V3 §1 "로고 띠", §4 보드 대기 "참가 주소 박스"): 얇은 테두리 둥근 상자 안에 항목들, 사이 세로 구분선.
// 훅 없음. 폰(<640px)은 세로로 쌓이고 가로 구분선. size="board" 는 항상 가로(프로젝터 1920 무대).
//   <StatStrip lead={<Mono>owl.example/join</Mono>} items={[{ label: '1팀', value: '4/4' }, …]} />
//   또는 children 으로 <StatStripItem …/> 를 직접 넣는다 (구분선은 상자가 그린다).
import type { ReactNode } from 'react';

export type StatStripSize = 'sm' | 'md' | 'lg' | 'board';
export type StatTone = 'default' | 'violet' | 'ok' | 'warn' | 'danger' | 'dim';

export interface StatItem {
  key?: string | number;
  label?: ReactNode;
  value: ReactNode;
  /** 값 옆 작은 보조 (예: "/4") */
  hint?: ReactNode;
  /** 값을 JetBrains Mono 로 (코드·주소) — 기본은 Manrope */
  mono?: boolean;
  tone?: StatTone;
}

const PAD: Record<StatStripSize, string> = {
  sm: 'px-3.5 py-2.5 gap-0.5',
  md: 'px-5 py-4 gap-1',
  lg: 'px-6 py-5 gap-1.5',
  board: 'px-8 py-6 gap-2',
};
const VALUE: Record<StatStripSize, string> = {
  sm: 'text-base',
  md: 'text-2xl',
  lg: 'text-[32px]',
  board: 'text-[48px]',
};
const LABEL: Record<StatStripSize, string> = {
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-[13px]',
  board: 'text-[22px]',
};
const HINT: Record<StatStripSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  board: 'text-[26px]',
};
const TONE: Record<StatTone, string> = {
  default: 'text-text',
  violet: 'text-violet-ink',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  dim: 'text-text-faint',
};

export function StatStripItem({ label, value, hint, mono = false, tone = 'default', size = 'md', onViolet = false, className = '' }: Omit<StatItem, 'key'> & {
  size?: StatStripSize; onViolet?: boolean; className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col justify-center ${PAD[size]} ${className}`}>
      <span className={`flex items-baseline gap-1 truncate font-bold leading-none tabular-nums ${mono ? 'font-mono' : 'font-display tracking-[-0.02em]'} ${VALUE[size]} ${onViolet && tone === 'default' ? 'text-white' : TONE[tone]}`}>
        {value}
        {hint ? <span className={`font-semibold ${onViolet ? 'text-white/60' : 'text-text-faint'} ${HINT[size]}`}>{hint}</span> : null}
      </span>
      {label ? <span className={`truncate font-medium ${onViolet ? 'text-white/75' : 'text-text-dim'} ${LABEL[size]}`}>{label}</span> : null}
    </div>
  );
}

export interface StatStripProps {
  items?: StatItem[];
  /** 맨 앞 칸 (예: "1,200+" 통계나 참가 주소). 다른 칸보다 넓게 */
  lead?: ReactNode;
  leadClassName?: string;
  size?: StatStripSize;
  /** 보라 면 위 (line-on-violet 테두리·흰 글자) */
  onViolet?: boolean;
  className?: string;
  'aria-label'?: string;
  children?: ReactNode;
}

export function StatStrip({
  items, lead, leadClassName = '', size = 'md', onViolet = false, className = '', 'aria-label': ariaLabel, children,
}: StatStripProps) {
  const dir = size === 'board'
    ? 'flex-row divide-x'
    : 'flex-col divide-y sm:flex-row sm:divide-x sm:divide-y-0';
  const line = onViolet ? 'border-line-on-violet divide-line-on-violet' : 'glass border-stroke-strong divide-stroke-strong shadow-glass';
  return (
    <div
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className={`relative flex overflow-hidden rounded-card border ${dir} ${line} ${className}`}
    >
      {lead ? (
        <div className={`flex min-w-0 flex-[1.4] items-center ${PAD[size]} ${onViolet ? 'text-white' : 'text-text'} ${leadClassName}`}>{lead}</div>
      ) : null}
      {items?.map((it, i) => (
        <StatStripItem
          key={it.key ?? i}
          label={it.label}
          value={it.value}
          hint={it.hint}
          mono={it.mono}
          tone={it.tone}
          size={size}
          onViolet={onViolet}
        />
      ))}
      {children}
    </div>
  );
}
