// 변경 뒤 SSE 발행 헬퍼 (docs/WEBSITE_SPEC.md §7). 서버 전용.
import { publish } from '../realtime';
import { docOf, programOf } from './rows';

export const emitGame = (gameId: string): void => publish(gameId, { type: 'game' });
export const emitTeams = (gameId: string): void => publish(gameId, { type: 'teams' });
export const emitStandings = (gameId: string): void => publish(gameId, { type: 'standings' });
export const emitResult = (gameId: string, teamId: string): void => publish(gameId, { type: 'result', teamId });
/** 진행자가 이 사람의 역할을 모두 뺐다 (그 사람의 화면은 대기실로) */
export const emitRemoved = (gameId: string, userId: string): void => publish(gameId, { type: 'removed', userId });

/** 그 팀원과 진행자에게만 현재 프로그램을 보낸다 */
export function emitProgram(gameId: string, teamId: string, round: number): void {
  const p = programOf(teamId, round);
  if (!p) return;
  publish(
    gameId,
    {
      type: 'program',
      teamId,
      round,
      doc: docOf(p),
      version: p.version,
      blocks: p.blocks,
      submittedAt: p.submitted_at,
    },
    { teamId },
  );
}
