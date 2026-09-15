// 아치 글로우 (DESIGN_V3 §2 glow-arc, §4: 로그인·가입·첫 설정, 홈 위쪽(옅게), 보드 대기 화면에만).
// 장식이라 aria-hidden. 훅 없음.
// 부모는 `relative isolate` 여야 한다: 글로우가 -z-10 으로 부모 배경 위·내용 아래에 깔린다.
//   <section className="relative isolate …"><GlowArc intensity="soft" height={520} /> …내용…</section>
// 부모 전체에 바로 깔려면 부모에 className="glow-arc" 유틸리티를 써도 된다 (같은 그림).
import type { CSSProperties } from 'react';

export type GlowIntensity = 'soft' | 'medium' | 'strong';

const OPACITY: Record<GlowIntensity, number> = { soft: 0.5, medium: 0.8, strong: 1 };

export interface GlowArcProps {
  /** 세기: soft(홈) · medium(기본) · strong(로그인·보드 대기) 또는 0~1 */
  intensity?: GlowIntensity | number;
  /** 글로우 층 높이 (px 수 또는 CSS 길이). 기본 '100%' (부모 높이) */
  height?: number | string;
  /** 링 위 여백 (px 수 또는 CSS 길이). 기본 48px */
  offset?: number | string;
  /** 링 반지름 (CSS 길이). 기본 clamp(300px, 62vw, 1400px). 보드(1920 무대)는 예: '1150px' */
  radius?: number | string;
  /** 천천히 숨쉬기 (움직임 줄이기 설정이면 멈춤) */
  animated?: boolean;
  className?: string;
}

const len = (v: number | string | undefined) => (typeof v === 'number' ? `${v}px` : v);

export function GlowArc({
  intensity = 'medium', height = '100%', offset, radius, animated = false, className = '',
}: GlowArcProps) {
  const op = typeof intensity === 'number' ? Math.max(0, Math.min(1, intensity)) : OPACITY[intensity];
  const vars: Record<string, string | number> = { '--arc-opacity': op };
  if (offset !== undefined) vars['--arc-top'] = len(offset)!;
  if (radius !== undefined) vars['--arc-r'] = len(radius)!;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden ${className}`}
      style={{ height: len(height) }}
    >
      <div className={`glow-arc h-full w-full ${animated ? 'glow-arc-breathe' : ''}`} style={vars as CSSProperties} />
    </div>
  );
}
