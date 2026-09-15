// 3D 글로우 큐브 (훅 없음) — DESIGN_V4 §3·§6: CSS 3D 변환의 반투명 유리 큐브, 안에서 보라빛, 천천히 회전.
// 대기실에만 쓴다. 움직임 줄이기면 정지. 장식이라 aria-hidden. 스타일은 globals.css 의 .gcube*.
// 배정 알림 때 한 번 밝게: flashKey 를 1, 2, 3… 으로 올리면 올릴 때마다 번쩍인다(0·없음 = 안 번쩍임).
import type { CSSProperties } from 'react';

function Cube() {
  return (
    <div className="gcube-scene">
      <div className="gcube-box">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

/* 주변 작은 큐브: 크기 비율 · 위치(큰 큐브 기준 %) · 떠오르는 지연 */
const SATS: { k: number; pos: CSSProperties; delay: string; speed: string }[] = [
  { k: 0.22, pos: { right: '-30%', top: '-8%' }, delay: '-1.2s', speed: '16s' },
  { k: 0.15, pos: { left: '-30%', bottom: '8%' }, delay: '-3.1s', speed: '21s' },
  { k: 0.1, pos: { right: '-14%', bottom: '-22%' }, delay: '-2.2s', speed: '13s' },
];

export function GlowCube({
  size = 180, satellites = true, flashKey, className = '',
}: {
  /** 큰 큐브 한 변 px */
  size?: number;
  /** 주변 작은 큐브 3개 */
  satellites?: boolean;
  /** 올릴 때마다 한 번 밝게 빛난다 (0·null = 없음) */
  flashKey?: number | null;
  className?: string;
}) {
  const flash = flashKey ? (flashKey % 2 ? 'b' : 'a') : undefined;
  return (
    <div
      aria-hidden="true"
      className={`gcube ${className}`}
      data-flash={flash}
      style={{ ['--gc' as string]: `${size}px` } as CSSProperties}
    >
      <div className="gcube-light" />
      <div className="gcube-flash" />
      <div className="gcube-float">
        <div className="gcube-core" />
        <Cube />
      </div>
      {satellites
        ? SATS.map((s, i) => {
            const px = Math.max(12, Math.round(size * s.k));
            return (
              <div
                key={i}
                className="gcube-sat"
                style={{
                  ...s.pos,
                  width: px,
                  height: px,
                  animationDelay: s.delay,
                  ['--gc' as string]: `${px}px`,
                  ['--gc-speed' as string]: s.speed,
                } as CSSProperties}
              >
                <Cube />
              </div>
            );
          })
        : null}
    </div>
  );
}
