// 게임 라우트 공용: 런타임 보장 + 로그인 + 게임 코드 조회 + 본문 스키마. 서버 전용.
import { z } from 'zod';
import { requireUser, type SessionUser } from '../session';
import { gameByCode, type GameRow } from './rows';
import { ensureRuntime } from './runtime';

export async function gameContext(params: Promise<{ code: string }>): Promise<{ user: SessionUser; game: GameRow }> {
  ensureRuntime();
  const user = await requireUser();
  const { code } = await params;
  return { user, game: gameByCode(code) };
}

export const PhaseEnum = z.enum(['lobby', 'coding', 'sealed', 'running', 'scored', 'finished']);
export const RoleEnum = z.enum(['runner', 'turner', 'controller', 'architect']);
export const Id = z.string().min(1).max(64);
export const TeamIdBody = z.object({ teamId: Id });
