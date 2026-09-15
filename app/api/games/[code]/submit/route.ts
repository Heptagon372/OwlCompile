import { z } from 'zod';
import type { SubmitResponse } from '@/lib/contracts';
import { submitProgram } from '@/lib/server/game';
import { gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** 본문은 없어도 된다. round(편집기가 보낸다)가 지금 라운드와 다르면 409 not_editable */
const Body = z.object({ round: z.number().int().min(1).max(7).optional() });

/** 그 팀의 아키텍트 누구나: 봉인 제출. validate 실패면 400 invalid_program {errors} */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 1_000);
  return json<SubmitResponse>(submitProgram(game, user, body.round));
});
