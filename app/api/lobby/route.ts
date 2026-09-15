// GET /api/lobby — 대기실: 내 상태, 대기 명단(표시 이름·아이디만), 열린 게임, 내 게임 (FEATURE_V4 §3). 로그인 사용자.
import type { LobbyResponse } from '@/lib/contracts';
import { ensureRuntime, lobbySnapshot } from '@/lib/server/game';
import { handle, json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  ensureRuntime();
  const user = await requireUser();
  return json<LobbyResponse>(lobbySnapshot(user));
});
