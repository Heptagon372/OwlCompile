'use client';
// 네온 스파크라인 (인라인 SVG) — DESIGN_V4 §1·§3 지표 카드 아래. 부드러운 곡선 + 아래로 옅어지는 영역 + 선 빛.
// 그라데이션 id 는 useId 로 인스턴스마다 유일 (display:none 안의 같은 id 를 참조해 사라지는 일이 없게).
import { useId } from 'react';

export type SparkTone = 'violet' | 'cyan' | 'ok' | 'warn' | 'danger';

// 색은 모드 토큰 (globals.css --spark-<톤>-line/glow/fill · --spark-fill-opacity): 나이트 = v4 네온 값, 라이트 = 짙은 선 + 옅은 그림자
const tone = (k: SparkTone) => ({ line: `var(--spark-${k}-line)`, glow: `var(--spark-${k}-glow)`, fill: `var(--spark-${k}-fill)` });
const TONES: Record<SparkTone, { line: string; glow: string; fill: string }> = {
  violet: tone('violet'),
  cyan: tone('cyan'),
  ok: tone('ok'),
  warn: tone('warn'),
  danger: tone('danger'),
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 점들을 지나는 부드러운 곡선 (Catmull-Rom → 3차 베지어) */
export function smoothPath(pts: readonly [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r2(c1x)},${r2(c1y)} ${r2(c2x)},${r2(c2y)} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return d;
}

export function Sparkline({
  data, width = 160, height = 40, tone = 'violet', area = true, strokeWidth = 2, className = '', 'aria-label': ariaLabel,
}: {
  data: readonly number[];
  /** 좌표계 폭·높이 (그려지는 크기는 className 으로: 기본 w-full) */
  width?: number;
  height?: number;
  tone?: SparkTone;
  /** 아래 영역 채움 */
  area?: boolean;
  strokeWidth?: number;
  className?: string;
  /** 접근성 이름. 없으면 장식 */
  'aria-label'?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const t = TONES[tone];
  const vals = data.length ? data : [0, 0];
  const series = vals.length === 1 ? [vals[0], vals[0]] : vals;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const pad = strokeWidth + 2;
  const span = max - min || 1;
  const pts = series.map((v, i) => [
    (i / (series.length - 1)) * width,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ] as [number, number]);
  const line = smoothPath(pts);
  const fillPath = `${line} L${width},${height} L0,${height} Z`;
  const gid = `owl-spark-${uid}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`block w-full overflow-visible ${className}`}
      style={{ height }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: t.fill, stopOpacity: 'var(--spark-fill-opacity)' }} />
          <stop offset="1" style={{ stopColor: t.fill, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {area ? <path d={fillPath} fill={`url(#${gid})`} stroke="none" /> : null}
      <path
        d={line}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ stroke: t.line, filter: `drop-shadow(0 0 4px ${t.glow})` }}
      />
    </svg>
  );
}
