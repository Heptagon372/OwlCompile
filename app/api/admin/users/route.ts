// GET /api/admin/users — 관리자: 회원 목록.
import type { AdminUserListResponse } from '@/lib/contracts';
import { listUsers } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  await requireUser(['admin']);
  return json<AdminUserListResponse>({ users: listUsers() });
});
