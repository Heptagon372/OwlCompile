// GET /api/admin/games — 관리자: 모든 게임 목록.
import type { GameListResponse } from '@/lib/contracts';
import { listAllGames } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireUser(['admin']);
  return json<GameListResponse>({ games: listAllGames() });
});
