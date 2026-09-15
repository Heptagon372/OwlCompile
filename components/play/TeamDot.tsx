// 팀 색 점 (훅 없음). 색은 모드 토큰(teamColor → var(--color-team-N)).
// glow(px)를 주면 나이트 = 같은 색 빛 번짐 (v4 그대로 0 0 Npx 팀색), 라이트 = 빛 대신 옅은 같은 색 테 (THEME_V5 §3: 강한 발광 대신 은은하게).
import type { CSSProperties } from 'react';
import { teamColor } from './teamColor';

const GLOW =
  '[box-shadow:0_0_var(--team-dot-blur)_var(--team-dot)] ' +
  '[:root[data-theme=light]_&]:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--team-dot)_16%,transparent)]';

export function TeamDot({ color, glow = 0, className = 'size-2.5' }: { color: string; glow?: number; className?: string }) {
  const c = teamColor(color);
  const style = { background: c, ['--team-dot' as string]: c, ['--team-dot-blur' as string]: `${glow}px` } as CSSProperties;
  return <i aria-hidden="true" style={style} className={`shrink-0 rounded-full ${glow ? GLOW : ''} ${className}`} />;
}
