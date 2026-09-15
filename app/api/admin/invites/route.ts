// GET·POST /api/admin/invites — 관리자: 초대 목록 / 메모 줄마다 1장 생성 {role, notes[], expiresInDays}.
// 링크 주소는 다른 기기에서 열리는 주소를 쓴다: OWL_PUBLIC_URL → 진행자가 연 LAN 주소 → 이 PC의 와이파이 주소 (lib/server/net.ts).
import { z } from 'zod';
import type { InviteListResponse } from '@/lib/contracts';
import { LIMITS } from '@/lib/contracts';
import { INVITE_MAX_DAYS, createInvites, listInvites } from '@/lib/server/auth';
import { handle, json, readJson } from '@/lib/server/http';
import { preferredOrigin } from '@/lib/server/net';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  role: z.enum(['host', 'player']),
  notes: z.array(z.string().max(200)).max(LIMITS.inviteMaxBatch * 2),
  expiresInDays: z.number().int().min(0).max(INVITE_MAX_DAYS),
});

export const GET = handle(async (req) => {
  await requireUser(['admin']);
  const link = preferredOrigin(req);
  return json<InviteListResponse>({ invites: listInvites(link.origin), linkOrigin: link.origin, linkKind: link.kind });
});

export const POST = handle(async (req) => {
  const me = await requireUser(['admin']);
  const body = await readJson(req, Body, 32_000);
  const codes = new Set(createInvites({ ...body, createdBy: me.id }));
  const link = preferredOrigin(req);
  const invites = listInvites(link.origin).filter((i) => codes.has(i.code));
  return json<InviteListResponse>({ invites, linkOrigin: link.origin, linkKind: link.kind }, 201);
});
