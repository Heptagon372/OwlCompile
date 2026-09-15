import { z } from 'zod';
import type { AssignResponse } from '@/lib/contracts';
import { assignMember } from '@/lib/server/game';
import { Id, RoleEnum, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ userId: Id, teamId: Id, roles: z.array(RoleEnum).min(1).max(4) });

/**
 * 진행자·관리자: 한 사람을 팀·역할에 넣거나 옮긴다 (역할은 통째로 바뀐다, lobby·coding 중).
 * 409 team_full / in_other_game / join_closed / host_self(진행자 본인) / not_waiting(대기 중도, 이 게임 사람도 아님).
 * 대기실에 있던 사람에게는 'assigned'가 간다.
 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 2_000);
  return json<AssignResponse>(assignMember(game, user, body.userId, body.teamId, body.roles));
});
