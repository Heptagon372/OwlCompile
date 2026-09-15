import { z } from 'zod';
import { LIMITS, type CreateGameResponse, type GameListResponse } from '@/lib/contracts';
import { createGameFromLobby, ensureRuntime, listGamesFor } from '@/lib/server/game';
import { handle, json, readJson } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/** 진행자: 내 게임 목록 */
export const GET = handle(async () => {
  ensureRuntime();
  const user = await requireUser(['host', 'admin']);
  return json<GameListResponse>({ games: listGamesFor(user) });
});

// rounds 값의 규칙(1~7, 오름차순, 중복 없음, 엔진에 있음)은 lib에서 검사한다 (400 invalid_rounds / round_unavailable)
const Body = z.object({
  teams: z.number().int().min(LIMITS.minTeams).max(LIMITS.maxTeams),
  rounds: z.array(z.number()).max(20).optional(),
  mode: z.enum(['auto', 'self']).optional(),
});

/**
 * 진행자: 새 게임 {teams: 2~10, rounds?: [1..7] (기본 [1,2,3,4,5]), mode?: 'auto'|'self' (기본 auto)}
 * → 201 {code, assigned, leftWaiting, placements}. auto면 대기 중인 사람을 바로 배정하고 각자에게 'assigned'를 보낸다.
 */
export const POST = handle(async (req) => {
  ensureRuntime();
  const user = await requireUser(['host', 'admin']);
  const body = await readJson(req, Body, 2_000);
  const out = createGameFromLobby(user, { teams: body.teams, rounds: body.rounds, mode: body.mode ?? 'auto' });
  return json<CreateGameResponse>(out, 201);
});
