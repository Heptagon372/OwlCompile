// 부엉이 캐릭터 (게임 맵 위의 말): 캐릭터 그림 public/game/owl.png + 머리 위 작은 시안 방향 화살표.
// 방향은 부리 회전이 아니라 스프라이트 전체 회전 + 화살표 (plan/CLAUDE.md). SVG 로 감싸 두어 .map-actor > svg 의 그림자·크기 규칙이 그대로 먹는다.
// 사이트 로고는 components/ui/Brand.tsx 의 BrandMark (다른 그림).
import type { Dir } from '@/lib/engine/types';

export const DIR_DEG: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };

/** 이전 각도에서 dir 방향까지 짧은 쪽으로 돈 누적 각도 (애니메이션이 270° 도는 것을 막는다) */
export function nextRotation(prevDeg: number, dir: Dir): number {
  const cur = ((prevDeg % 360) + 360) % 360;
  let delta = DIR_DEG[dir] - cur;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return prevDeg + delta;
}

/** 캐릭터 그림 (정사각, 투명 배경, 256px) */
export const OWL_CHARACTER_SRC = '/game/owl.png';

const ARROW = 'var(--color-cyan)';

export function OwlSprite({
  dir = 'N',
  rotation,
  transitionMs = 300,
  className,
  size = '88%',
}: {
  dir?: Dir;
  /** 누적 각도(도). 주면 dir 대신 쓴다 */
  rotation?: number;
  transitionMs?: number;
  className?: string;
  size?: string;
}) {
  const deg = rotation ?? DIR_DEG[dir];
  return (
    <svg
      viewBox="-4 -10 72 78"
      className={className}
      style={{ width: size, height: size, transform: `rotate(${deg}deg)`, transition: `transform ${transitionMs}ms ease` }}
      aria-hidden="true"
    >
      {/* 방향 화살표 (작게, 시안) */}
      <path d="M32 -9 L37.5 -1 L26.5 -1 Z" fill={ARROW} />
      {/* 캐릭터: 옛 도형 부엉이와 같은 자리 (귀 끝 y≈3, 발 y≈59) */}
      <image href={OWL_CHARACTER_SRC} x="4" y="3" width="56" height="56" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}
