// POST /api/admin/users/[id]/reset-password — 관리자: 임시 비밀번호 발급(응답에서 1번만 보인다).
import type { ResetPasswordResponse } from '@/lib/contracts';
import { resetUserPassword } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = handle<{ id: string }>(async (_req, { params }) => {
  const me = await requireUser(['admin']);
  const { id } = await params;
  const tempPassword = await resetUserPassword(me.id, id);
  return json<ResetPasswordResponse>({ tempPassword });
});
