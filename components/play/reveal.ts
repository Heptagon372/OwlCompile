// running 중 팀 화면에서 우리 팀 결과를 보여 줄지 (순수 함수, 테스트용으로 분리)
import type { GameView, ResultView } from '@/lib/contracts';

/**
 * 보드가 우리 팀을 재생 중이거나 이미 지나갔으면 공개.
 * 진행자가 앞 팀을 다시 고르거나 재실행해서 지금 재생 팀이 뒤로 가도, 이미 본 팀의 결과는 다시 숨기지 않는다
 * (서버가 이번 라운드에 보여 준 가장 뒤 실행 순서 shownUpTo를 준다).
 */
export function resultRevealed(view: GameView, mine: ResultView): boolean {
  const running = view.results.find((r) => r.teamId === view.game.runningTeamId);
  const reached = Math.max(running?.runOrder ?? 0, view.game.shownUpTo ?? 0);
  return reached > 0 && mine.runOrder <= reached;
}
