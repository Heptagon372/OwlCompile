// POST /api/lobby/join {code} — 대기실의 "참가" 버튼: 자동 배정 게임에 나를 넣는다 (사람이 가장 적은 팀).
// 직접 선택 게임이면 409 self_mode (클라이언트는 /join?code=로), 자리가 없으면 409 team_full.
import { z } from 'zod';
import type { LobbyJoinResponse } from '@/lib/contracts';
import { ensureRuntime, joinFromLobby } from '@/lib/server/game';
import { handle, json, readJson } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().min(1).max(10) });

export const POST = handle(async (req) => {
  ensureRuntime();
  const user = await requireUser();
  const body = await readJson(req, Body, 1_000);
  return json<LobbyJoinResponse>(joinFromLobby(user, body.code.trim()));
});
