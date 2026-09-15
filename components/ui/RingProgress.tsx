'use client';
// 원형 진행 링 — DESIGN_V4 §3: 네온 링(그라데이션 선 + 빛) + 가운데 큰 숫자. 코딩 타이머(프로젝터·편집기 머리)에 쓴다.
// <RingProgress value={secondsLeft} max={total} label={fmt(secondsLeft)} sub="남은 시간" size={96} mono />
// 값이 바뀌면 호가 0.6s 부드럽게 움직인다(움직임 줄이기면 바로). 그라데이션 id 는 useId 로 인스턴스마다 유일.
import { useId, type CSSProperties, type ReactNode } from 'react';

export type RingTone = 'violet' | 'cyan' | 'ok' | 'warn' | 'danger';

// 색은 모드 토큰 (globals.css --ring-<톤>-from/mid/to/glow · --ring-track-* · --ring-dot): 나이트 = v4 값, 라이트 = 짙은 색조 + 옅은 그림자
const tone = (k: RingTone, text: string) => ({
  from: `var(--ring-${k}-from)`, mid: `var(--ring-${k}-mid)`, to: `var(--ring-${k}-to)`, glow: `var(--ring-${k}-glow)`, text,
});
const TONES: Record<RingTone, { from: string; mid: string; to: string; glow: string; text: string }> = {
  violet: tone('violet', 'text-text'),
  cyan: tone('cyan', 'text-text'),
  ok: tone('ok', 'text-text'),
  warn: tone('warn', 'text-warn'),
  danger: tone('danger', 'text-danger'),
};

export interface RingProgressProps {
  value: number;
  max?: number;
  /** 지름 px (기본 120) */
  size?: number;
  /** 선 두께 px (기본 size 의 8%) */
  thickness?: number;
  tone?: RingTone;
  /** 가운데 큰 글자 (기본: 백분율) */
  label?: ReactNode;
  /** 큰 글자 아래 작은 글자 */
  sub?: ReactNode;
  /** 가운데 글자 JetBrains Mono (타이머) */
  mono?: boolean;
  /** 호 끝 빛나는 점 (기본 true) */
  dot?: boolean;
  className?: string;
  /** 스크린리더 이름 (예: "남은 코딩 시간") */
  'aria-label'?: string;
  /** 장식 (aria-hidden) */
  decorative?: boolean;
  /** 가운데를 통째로 바꿀 때 */
  children?: ReactNode;
}

export function RingProgress({
  value, max = 100, size = 120, thickness, tone = 'violet', label, sub, mono = false, dot = true, className = '',
  'aria-label': ariaLabel, decorative = false, children,
}: RingProgressProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const t = TONES[tone];
  const sw = thickness ?? Math.max(4, Math.round(size * 0.08));
  const c = size / 2;
  const r = c - sw / 2 - Math.max(2, sw * 0.4);
  const circ = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const gid = `owl-ring-${uid}`;
  const center = label ?? `${Math.round(frac * 100)}%`;
  const fs = Math.round(size * (mono ? 0.22 : 0.26));
  const rot: CSSProperties = {
    transform: `rotate(${frac * 360}deg)`,
    transformOrigin: '50% 50%',
    transformBox: 'view-box',
    transition: 'transform 0.6s var(--ease-ui)',
  };
  return (
    <div
      className={`relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'progressbar'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : ariaLabel}
      aria-valuemin={decorative ? undefined : 0}
      aria-valuemax={decorative ? undefined : max}
      aria-valuenow={decorative ? undefined : Math.round(value)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 overflow-visible" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: t.from }} />
            <stop offset="0.45" style={{ stopColor: t.mid }} />
            <stop offset="1" style={{ stopColor: t.to }} />
          </linearGradient>
        </defs>
        {/* 트랙 + 안쪽 은은한 원판 */}
        <circle cx={c} cy={c} r={r} style={{ fill: 'var(--ring-track-fill)', stroke: 'var(--ring-track-stroke)' }} strokeWidth={sw} />
        {frac > 0 ? (
          <circle
            className="ring-arc"
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - frac)}
            transform={`rotate(-90 ${c} ${c})`}
            style={{ filter: `drop-shadow(0 0 ${Math.max(3, sw * 0.7)}px ${t.glow})` }}
          />
        ) : null}
        {dot && frac > 0 && frac < 1 ? (
          <g className="ring-arc motion-reduce:!transition-none" style={rot}>
            <circle cx={c} cy={c - r} r={sw * 0.62} style={{ fill: 'var(--ring-dot)', filter: `drop-shadow(0 0 ${sw}px ${t.glow})` }} />
          </g>
        ) : null}
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center leading-none">
        {children ?? (
          <>
            <span
              className={`${mono ? 'font-mono' : 'font-display tracking-[-0.02em]'} font-bold tabular-nums ${t.text}`}
              style={{ fontSize: fs }}
            >
              {center}
            </span>
            {sub ? (
              <span className="mt-1 font-medium text-text-dim" style={{ fontSize: Math.max(11, Math.round(size * 0.09)) }}>{sub}</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
