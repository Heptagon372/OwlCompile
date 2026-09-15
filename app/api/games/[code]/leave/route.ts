import type { OkResponse } from '@/lib/contracts';
import { leaveGame } from '@/lib/server/game';
import { gameContext } from '@/lib/server/game/context';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** 내 역할 전부 반납 */
export const POST = handle<{ code: string }>(async (_req, { params }) => {
  const { user, game } = await gameContext(params);
  leaveGame(game, user);
  return json<OkResponse>({ ok: true });
});
