import { z } from 'zod';
import { joinGame } from '@/lib/server/game';
import { Id, RoleEnum, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ teamId: Id, roles: z.array(RoleEnum).min(1).max(4) });

/**
 * 팀·역할 참가 (lobby·coding 중).
 * 409 join_closed / other_team / kicked / team_full / in_other_game (다른 끝나지 않은 게임의 팀원: 한 사람은 게임 하나에만).
 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 2_000);
  const joined = joinGame(game, user, body.teamId, body.roles);
  return json({ ok: true as const, ...joined });
});
