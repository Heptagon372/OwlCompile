// POST /api/auth/password — {current, next}. 바꾸면 다른 기기의 세션은 끊고 이 기기는 새 세션으로 유지한다.
import { z } from 'zod';
import type { AuthResponse } from '@/lib/contracts';
import { PASSWORD_MAX, changePassword, getUserById } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { handle, json, readJson, unauthorized } from '@/lib/server/http';
import { createSession, destroyUserSessions, requireUser, toPublicUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  current: z.string().max(PASSWORD_MAX),
  next: z.string().max(PASSWORD_MAX),
});

export const POST = handle(async (req) => {
  const me = await requireUser();
  const body = await readJson(req, Body, 4_000);
  await changePassword(me.id, body.current, body.next);
  destroyUserSessions(me.id);
  await createSession(me.id, req);
  const user = getUserById(me.id);
  if (!user) throw unauthorized();
  return json<AuthResponse>({ user: toPublicUser(user), redirect: homePathFor(user) });
});
