import { z } from 'zod';
import type { PullResponse } from '@/lib/contracts';
import { pullFromLobby } from '@/lib/server/game';
import { Id, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ userIds: z.array(Id).max(100).optional() });

/**
 * 진행자·관리자: 대기실에서 더 데려오기 (자동 배정 규칙, lobby·coding 중).
 * 본문 없음 = 대기 명단 전체(이 게임에서 나간 사람 제외), {userIds} = 그 사람들만. → {assigned, leftWaiting, placements}
 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 8_000);
  return json<PullResponse>(pullFromLobby(game, user, body.userIds));
});
