// POST /api/setup — 사용자가 0명일 때만 첫 관리자를 만들고 로그인시킨다 (spec §4).
import { z } from 'zod';
import type { AuthResponse } from '@/lib/contracts';
import { PASSWORD_MAX, setupAdmin } from '@/lib/server/auth';
import { handle, json, readJson } from '@/lib/server/http';
import { createSession, toPublicUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  username: z.string().max(40),
  displayName: z.string().max(60),
  password: z.string().max(PASSWORD_MAX),
});

export const POST = handle(async (req) => {
  const body = await readJson(req, Body, 4_000);
  const user = await setupAdmin(body);
  await createSession(user.id, req);
  // 관리자는 홈으로
  return json<AuthResponse>({ user: toPublicUser(user), redirect: '/' }, 201);
});
