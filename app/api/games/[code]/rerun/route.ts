import type { OkResponse } from '@/lib/contracts';
import { rerunTeam } from '@/lib/server/game';
import { TeamIdBody, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** 진행자: {teamId} 패치 후 재실행 (결과 덮어쓰기, −10) */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, TeamIdBody, 1_000);
  rerunTeam(game, user, body.teamId);
  return json<OkResponse>({ ok: true });
});
