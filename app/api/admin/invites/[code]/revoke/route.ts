// POST /api/admin/invites/[code]/revoke — 관리자: 아직 쓰지 않은 초대 취소.
import type { OkResponse } from '@/lib/contracts';
import { revokeInvite } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = handle<{ code: string }>(async (_req, { params }) => {
  await requireUser(['admin']);
  const { code } = await params;
  revokeInvite(code.slice(0, 20));
  return json<OkResponse>({ ok: true });
});
