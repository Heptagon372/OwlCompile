// GET /api/invites/[code] — 초대 유효 여부 {valid, role, note, reason}. 로그인 없이 조회 가능.
import type { InviteCheckResponse } from '@/lib/contracts';
import { checkInvite } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = handle<{ code: string }>(async (_req, { params }) => {
  const { code } = await params;
  return json<InviteCheckResponse>(checkInvite(code.slice(0, 20)));
});
