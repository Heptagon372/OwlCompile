// 팀 편집기·참가 화면 팀 색 (THEME_V5 §4 "모든 색은 토큰으로"): 서버가 주는 팀 색(TEAM_PRESETS 의 나이트 hex)을
// 모드 토큰 var(--color-team-N) 으로 바꾼다. 나이트 값 = TEAM_PRESETS 그대로라 나이트 화면은 똑같고,
// 라이트에서는 밝은 유리 위에서도 보이는 짙은 같은 색조가 된다 (예: 흰올빼미 #E8E4FF → #4A4468, 흰 면 위에서 사라지지 않게).
// 프리셋에 없는 색(옛 데이터 등)은 그대로 둔다. 훅 없음 (.ts 라 vitest 가 바로 읽는다).
import { TEAM_PRESETS } from '@/lib/contracts';

const TEAM_VAR = new Map(TEAM_PRESETS.map((p, i) => [p.color.toUpperCase(), `var(--color-team-${i + 1})`]));

/** 팀 색 hex → 모드 토큰 (인라인 style 의 background · --team-dot 에 그대로 쓴다) */
export function teamColor(color: string): string {
  return TEAM_VAR.get(color.trim().toUpperCase()) ?? color;
}
