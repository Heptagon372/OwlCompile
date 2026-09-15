// POST /api/auth/login — 아이디+비밀번호, 아이디+IP당 5분에 10회 제한 (spec §4).
// 응답 redirect: 끝나지 않은 게임의 팀원 → /play/<코드>, 참가자 → /lobby, 진행자·관리자 → / (FEATURE_V4 §3)
import { z } from 'zod';
import type { AuthResponse } from '@/lib/contracts';
import { verifyLogin } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { clientIp, handle, json, readJson } from '@/lib/server/http';
import { createSession, toPublicUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  username: z.string().max(40),
  password: z.string().max(400),
});

export const POST = handle(async (req) => {
  const body = await readJson(req, Body, 4_000);
  const user = await verifyLogin({ username: body.username, password: body.password, ip: clientIp(req) });
  await createSession(user.id, req);
  return json<AuthResponse>({ user: toPublicUser(user), redirect: homePathFor(user) });
});
