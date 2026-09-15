// DELETE /api/admin/games/[code] — 관리자: 접속 중인 화면에 'deleted'를 알린 뒤 게임 삭제. 대기실 명단도 갱신한다.
import type { OkResponse } from '@/lib/contracts';
import { deleteGameById, findGameIdByCode } from '@/lib/server/auth';
import { emitLobby } from '@/lib/server/game';
import { handle, json, notFound } from '@/lib/server/http';
import { publishDeleted } from '@/lib/server/realtime';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const DELETE = handle<{ code: string }>(async (_req, { params }) => {
  await requireUser(['admin']);
  const { code } = await params;
  const gameId = findGameIdByCode(code);
  if (!gameId) throw notFound('게임을 찾을 수 없습니다.');
  publishDeleted(gameId);
  deleteGameById(gameId);
  // 지운 게임의 팀원은 다시 대기 중이 되고, 열린 게임 목록에서도 빠진다
  emitLobby();
  return json<OkResponse>({ ok: true });
});
