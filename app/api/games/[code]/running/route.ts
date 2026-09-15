import { z } from 'zod';
import type { OkResponse } from '@/lib/contracts';
import { requireHost, selectRunningTeam, setAutoplay } from '@/lib/server/game';
import { Id, gameContext } from '@/lib/server/game/context';
import { badRequest, handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  teamId: Id.optional(),
  /** 지금 재생 팀이 이 팀일 때만 바꾼다 (null = 아직 재생 팀 없음). 다르면 409 running_changed */
  expectTeamId: Id.nullable().optional(),
  autoplay: z.boolean().optional(),
});

/** 진행자: {teamId, expectTeamId?} 보드가 재생할 팀 지정, {autoplay} 자동 넘김 켜기·끄기 (둘 다 가능) */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  requireHost(game, user);
  const body = await readJson(req, Body, 1_000);
  if (body.teamId === undefined && body.autoplay === undefined) {
    throw badRequest('teamId 또는 autoplay가 필요합니다.', 'invalid_input');
  }
  // 검사(페이즈·expectTeamId)가 있는 재생 팀 지정을 먼저 한다: 409면 autoplay도 바뀌지 않는다
  if (body.teamId !== undefined) selectRunningTeam(game, user, body.teamId, body.expectTeamId);
  if (body.autoplay !== undefined) setAutoplay(game, user, body.autoplay);
  return json<OkResponse>({ ok: true });
});
