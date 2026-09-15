import { z } from 'zod';
import { LIMITS, type OkResponse } from '@/lib/contracts';
import { controlTimer } from '@/lib/server/game';
import { gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  action: z.enum(['pause', 'resume', 'add']),
  seconds: z.number().int().min(1).max(LIMITS.timerAddMaxSeconds).optional(),
});

/** 진행자: 타이머 일시정지·재개·추가(기본 30초) */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 1_000);
  controlTimer(game, user, body.action, body.seconds);
  return json<OkResponse>({ ok: true });
});
