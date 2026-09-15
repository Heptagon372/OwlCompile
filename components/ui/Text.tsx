// 글자 도우미 (훅 없음): Kbd, Mono, Label, BigNum, SectionTitle, EmptyState, Notice.
import type { HTMLAttributes, ReactNode } from 'react';

/** 키보드 키 / 짧은 코드 (게임 코드 등) */
export function Kbd({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={`inline-grid h-6 min-w-6 place-items-center rounded-ctl border border-line-strong bg-inset px-1.5 font-mono text-[12px] font-medium text-text shadow-[inset_0_-1px_0_var(--color-line-strong)] ${className}`}
      {...rest}
    >
      {children}
    </kbd>
  );
}

/** 고정폭 숫자·코드 글자. dim 이면 보조색. */
export function Mono({ className = '', dim = false, size, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { dim?: boolean; size?: number }) {
  return (
    <span className={`font-mono tabular-nums ${dim ? 'text-text-dim' : ''} ${className}`} style={size ? { fontSize: size } : undefined} {...rest}>
      {children}
    </span>
  );
}

/** 작은 대문자 느낌 라벨 (11px 600 자간) */
export function Label({ className = '', children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`ui-caption ${className}`} {...rest}>{children}</span>;
}

/** 큰 숫자 (점수·HUD). Manrope 700 고정폭 숫자. 타이머·코드처럼 JetBrains Mono 가 필요하면 mono */
export function BigNum({ className = '', mono = false, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { mono?: boolean }) {
  return (
    <span className={`${mono ? 'font-mono' : 'font-display tracking-[-0.02em]'} text-2xl font-bold leading-none tabular-nums text-text ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** 패널 본문 안의 절 제목 ("목표", "규칙"): violet-ink 아이콘 + 굵은 글자 */
export function SectionTitle({ icon, className = '', children }: { icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <h3 className={`mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-text-dim [&_svg]:size-4 [&_svg]:text-violet-ink ${className}`}>
      {icon}
      {children}
    </h3>
  );
}

/** 비어 있음 안내 (목록·표·패널) */
export function EmptyState({ icon, title, body, action, className = '', compact = false }: {
  icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string; compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-1.5 py-6' : 'gap-2 py-12'} ${className}`}>
      {icon ? <div className="mb-1 grid size-10 place-items-center rounded-full border border-line-strong text-violet-ink [&_svg]:size-5">{icon}</div> : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {body ? <p className="max-w-xs text-[13px] leading-relaxed text-text-dim">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** 안내 띠 (info / warn / danger / ok). 이모지 없이 왼쪽 색 막대. */
export function Notice({ tone = 'info', className = '', children, role }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; className?: string; children: ReactNode; role?: string }) {
  const t = tone === 'danger'
    ? 'border-danger/35 border-l-danger bg-danger/10 text-text'
    : tone === 'warn'
      ? 'border-warn/35 border-l-warn bg-warn/10 text-text'
      : tone === 'ok'
        ? 'border-ok/35 border-l-ok bg-ok/10 text-text'
        : 'border-blue/35 border-l-blue bg-blue-soft text-text';
  return (
    <div role={role} className={`rounded-ctl border border-l-2 px-3.5 py-3 text-sm leading-relaxed ${t} ${className}`}>
      {children}
    </div>
  );
}
