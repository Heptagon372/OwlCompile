// 부엉이 스프라이트 (DESIGN_V2 §5 모양 + DESIGN_V3 §5 색): 기하학적 실루엣 — 전기 보라 몸통(violet-hover), 흰 눈, 시안 부리,
// 방향은 스프라이트 회전 + 작은 화살표. 색은 토큰(var(--color-*))만 쓴다.
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

/* 몸통 색: DESIGN_V3 §5 "부엉이 몸통 violet" (= --color-violet-hover). 검정 바탕에서 주 보라보다 한 톤 밝게 */
const BODY = 'var(--color-violet-hover)';
const BEAK = 'var(--color-cyan)';
/* 동공: 나이트 = 바탕색(v4 그대로), 라이트 = 짙은 남보라 (라이트 바탕색이면 흰 눈에 묻힌다) */
const PUPIL = 'var(--map-owl-pupil)';
const WHITE = 'var(--color-white)';
const BLACK = 'var(--color-black)';

/* 64×64 좌표계. 몸통은 위가 살짝 각진 둥근 사각(귀깃 포함), 눈은 큰 흰 원 + 어두운 동공, 부리는 시안 삼각. */
function OwlBody() {
  return (
    <>
      {/* 귀깃 */}
      <path d="M13 26 L11 8 L26 18 Z" fill={BODY} />
      <path d="M51 26 L53 8 L38 18 Z" fill={BODY} />
      {/* 몸통 */}
      <path d="M12 26 Q12 14 32 14 Q52 14 52 26 V44 Q52 60 32 60 Q12 60 12 44 Z" fill={BODY} />
      {/* 윗면 하이라이트 (검정 바탕에서 입체감) */}
      <path d="M16 24 Q18 17 32 17 Q46 17 48 24" fill="none" stroke={WHITE} strokeOpacity={0.22} strokeWidth="1.5" strokeLinecap="round" />
      {/* 가슴 결 (한 톤 어두운 면) */}
      <path d="M20 44 Q32 52 44 44 V47 Q32 56 20 47 Z" fill={BLACK} fillOpacity={0.2} />
      {/* 눈 */}
      <circle cx="23" cy="32" r="8" fill={WHITE} />
      <circle cx="41" cy="32" r="8" fill={WHITE} />
      <circle cx="24.5" cy="32.5" r="3.6" fill={PUPIL} />
      <circle cx="42.5" cy="32.5" r="3.6" fill={PUPIL} />
      <circle cx="26" cy="31" r="1.1" fill={WHITE} />
      <circle cx="44" cy="31" r="1.1" fill={WHITE} />
      {/* 부리 */}
      <path d="M28.5 40 L35.5 40 L32 46.5 Z" fill={BEAK} />
    </>
  );
}

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
      <path d="M32 -9 L37.5 -1 L26.5 -1 Z" fill={BEAK} />
      <OwlBody />
    </svg>
  );
}

/** 로고용 (화살표 없음) */
export function OwlLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="4 6 56 56" className={className} aria-hidden="true">
      <OwlBody />
    </svg>
  );
}
