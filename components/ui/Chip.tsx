// 상태 칩 · 상태 알약 · 인라인 토큰 (훅 없음).
// <Chip tone="ok" dot>연결됨</Chip>   <StatusPill status="progress" />   <Token>앞으로</Token> (본문 속 블록 이름)
// DESIGN_V4 §3: 칩은 알약, 모두 반투명 배경 + 같은 색 글자.
import type { HTMLAttributes, ReactNode } from 'react';
import { PHASE_STATUS, type Phase } from '@/lib/contracts';

export type ChipTone = 'neutral' | 'blue' | 'violet' | 'ok' | 'warn' | 'danger' | 'cyan';

// 점 빛: 나이트 = 같은 색 6px 네온 (v4 그대로). 라이트 = 강한 발광 대신 은은한 모드 토큰 그림자 (THEME_V5 §3, 보드 BoardChip 과 같은 방식)
const LIGHT_DOT = '[html[data-theme=light]_&]:shadow-[0_0_6px_var(--dot-glow-light)]';
// 글자: 라이트에서 ok·warn·danger·cyan 은 같은 색 12% 칠 위에서 4.2~4.4:1 이라 글자 쪽색에 본문색을 22% 섞는다 (5.3:1 이상, 보드 BoardChip 과 같은 방식).
// Tailwind 가 소스에서 클래스를 찾으므로 톤마다 글자 그대로 적는다. 나이트는 v4 그대로.
const TONES: Record<ChipTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-tint/[0.05] text-text-dim border-stroke-strong', dot: 'bg-text-faint' },
  blue: { box: 'bg-blue/12 text-blue-hover border-blue/35', dot: `bg-blue shadow-[0_0_6px_var(--color-blue)] [--dot-glow-light:var(--color-blue-soft)] ${LIGHT_DOT}` },
  violet: { box: 'bg-violet/15 text-violet-ink border-violet/40', dot: `bg-violet-ink shadow-[0_0_6px_var(--color-violet)] [--dot-glow-light:var(--glow-accent)] ${LIGHT_DOT}` },
  ok: { box: 'bg-ok/12 text-ok [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-ok)_78%,var(--color-text))] border-ok/30', dot: `bg-ok shadow-[0_0_6px_var(--color-ok)] [--dot-glow-light:var(--glow-ok)] ${LIGHT_DOT}` },
  warn: { box: 'bg-warn/12 text-warn [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-warn)_78%,var(--color-text))] border-warn/30', dot: `bg-warn shadow-[0_0_6px_var(--color-warn)] [--dot-glow-light:var(--glow-warn)] ${LIGHT_DOT}` },
  danger: { box: 'bg-danger/12 text-danger [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-danger)_78%,var(--color-text))] border-danger/35', dot: `bg-danger shadow-[0_0_6px_var(--color-danger)] [--dot-glow-light:var(--glow-danger)] ${LIGHT_DOT}` },
  cyan: { box: 'bg-cyan/12 text-cyan [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-cyan)_78%,var(--color-text))] border-cyan/30', dot: `bg-cyan shadow-[0_0_6px_var(--color-cyan)] [--dot-glow-light:var(--glow-cyan)] ${LIGHT_DOT}` },
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  /** 왼쪽 상태 점 */
  dot?: boolean;
  /** 점 깜빡임 (연결 중 등) */
  pulse?: boolean;
  /** 고정폭 (코드·숫자) */
  mono?: boolean;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

/** 상태 칩: 알약형, 작은 점 + 글자. */
export function Chip({
  tone = 'neutral', dot = false, pulse = false, mono = false, size = 'md', className = '', children, ...rest
}: ChipProps) {
  const t = TONES[tone];
  const sz = size === 'sm' ? 'h-5 px-2 text-[11px]' : 'h-6 px-2.5 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold leading-none whitespace-nowrap ${sz} ${t.box} ${mono ? 'font-mono tabular-nums' : ''} ${className}`}
      {...rest}
    >
      {dot ? <i aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${t.dot} ${pulse ? 'motion-safe:animate-pulse' : ''}`} /> : null}
      {children}
    </span>
  );
}

/** 상태 알약의 뜻: 진행 중 보라 · 대기 호박색 · 완료 초록 · 오류 장밋빛 (DESIGN_V4 §3) */
export type StatusKind = 'progress' | 'pending' | 'done' | 'error' | 'idle' | 'info';

const STATUS: Record<StatusKind, { tone: ChipTone; label: string }> = {
  progress: { tone: 'violet', label: '진행 중' },
  pending: { tone: 'warn', label: '대기' },
  done: { tone: 'ok', label: '완료' },
  error: { tone: 'danger', label: '오류' },
  idle: { tone: 'neutral', label: '준비' },
  info: { tone: 'blue', label: '안내' },
};

/** 페이즈 → 칩 톤 (모든 화면 공통: contracts PHASE_STATUS → 상태 알약 색) */
export function phaseTone(phase: Phase): ChipTone {
  return STATUS[PHASE_STATUS[phase]].tone;
}

export interface StatusPillProps extends Omit<ChipProps, 'tone'> {
  /** 뜻 (기본 progress). 글자를 안 주면 기본 문구 */
  status?: StatusKind;
  /** 색만 직접 고를 때 (status 색 대신) */
  tone?: ChipTone;
}

/** 상태 알약: 반투명 배경 + 같은 색 글자 + 빛나는 점 */
export function StatusPill({ status = 'progress', tone, dot = true, children, ...rest }: StatusPillProps) {
  const s = STATUS[status];
  return (
    <Chip tone={tone ?? s.tone} dot={dot} {...rest}>
      {children ?? s.label}
    </Chip>
  );
}

/** 본문 속 블록 이름·변수 이름: 보라 인라인 칩 */
export function Token({ className = '', mono = false, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { mono?: boolean; children?: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full bg-violet/15 px-1.5 py-px align-baseline text-[0.92em] font-semibold leading-snug text-violet-ink ${mono ? 'font-mono' : ''} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

/** 번호 칩 "01" (Manrope 숫자). */
export function NumChip({ n, className = '', active = false }: { n: number | string; className?: string; active?: boolean }) {
  const s = typeof n === 'number' ? String(n).padStart(2, '0') : n;
  return (
    <span className={`inline-grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-display text-[11px] font-bold tabular-nums ${active ? 'bg-violet-grad text-white' : 'bg-tint/[0.06] text-text-dim'} ${className}`}>
      {s}
    </span>
  );
}
