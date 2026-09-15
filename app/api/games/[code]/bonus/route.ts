import { z } from 'zod';
import { LIMITS, type OkResponse } from '@/lib/contracts';
import { addBonus } from '@/lib/server/game';
import { Id, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  teamId: Id,
  points: z.number().int().min(-LIMITS.bonusMaxAbs).max(LIMITS.bonusMaxAbs),
  note: z.string().max(40),
});

/** 진행자: {teamId, points, note} 이벤트 카드 수동 점수 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 1_000);
  addBonus(game, user, body.teamId, body.points, body.note);
  return json<OkResponse>({ ok: true });
});
