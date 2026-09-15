// POST /api/auth/signup — {code, username, displayName, password}. 초대는 1회용, 가입과 동시에 로그인.
// 응답 redirect: 참가자 → /lobby (대기실), 진행자 → / (FEATURE_V4 §3)
import { z } from 'zod';
import type { AuthResponse } from '@/lib/contracts';
import { PASSWORD_MAX, signupWithInvite } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { handle, json, readJson } from '@/lib/server/http';
import { createSession, toPublicUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  code: z.string().max(20),
  username: z.string().max(40),
  displayName: z.string().max(60),
  password: z.string().max(PASSWORD_MAX),
});

export const POST = handle(async (req) => {
  const body = await readJson(req, Body, 4_000);
  const user = await signupWithInvite(body);
  await createSession(user.id, req);
  return json<AuthResponse>({ user: toPublicUser(user), redirect: homePathFor(user) }, 201);
});
