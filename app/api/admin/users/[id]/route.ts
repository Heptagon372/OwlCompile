// PATCH·DELETE /api/admin/users/[id] — 관리자: 역할·상태·표시 이름 변경 / 삭제.
import { z } from 'zod';
import type { OkResponse } from '@/lib/contracts';
import { deleteUser, updateUser } from '@/lib/server/auth';
import { badRequest, handle, json, readJson } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  role: z.enum(['admin', 'host', 'player']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  displayName: z.string().max(60).optional(),
});

export const PATCH = handle<{ id: string }>(async (req, { params }) => {
  const me = await requireUser(['admin']);
  const { id } = await params;
  const body = await readJson(req, Body, 2_000);
  if (body.role === undefined && body.status === undefined && body.displayName === undefined) {
    throw badRequest('바꿀 내용이 없습니다.');
  }
  updateUser(me.id, id, body);
  return json<OkResponse>({ ok: true });
});

export const DELETE = handle<{ id: string }>(async (_req, { params }) => {
  const me = await requireUser(['admin']);
  const { id } = await params;
  deleteUser(me.id, id);
  return json<OkResponse>({ ok: true });
});
