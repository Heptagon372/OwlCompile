// 팀 판정 (FEATURE_V4 §2). 순수 함수, 훅·JSX 없음 (테스트에서 바로 가져온다).
import type { TeamView } from '@/lib/contracts';

/** 이 팀에 아키텍트가 없는가 (제출할 사람이 없다 → 시간이 끝나면 자동 봉인). "아키텍트 없음" 경고 기준 */
export function lacksArchitect(team: Pick<TeamView, 'missingRoles'>): boolean {
  return team.missingRoles.includes('architect');
}
