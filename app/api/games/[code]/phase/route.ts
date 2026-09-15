import { z } from 'zod';
import type { OkResponse } from '@/lib/contracts';
import { transitionPhase } from '@/lib/server/game';
import { PhaseEnum, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ to: PhaseEnum, expect: PhaseEnum });

/** 진행자: {to, expect} 조건부 전이 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 1_000);
  transitionPhase(game, user, body.to, body.expect);
  return json<OkResponse>({ ok: true });
});
