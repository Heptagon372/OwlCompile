// GET /api/auth/me — 현재 사용자(없으면 null), 최초 설정 필요 여부, 갈 곳(redirect, 로그인했을 때만).
import type { MeResponse } from '@/lib/contracts';
import { needsSetup } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { handle, json } from '@/lib/server/http';
import { getCurrentUser, toPublicUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const user = await getCurrentUser();
  return json<MeResponse>({
    user: user ? toPublicUser(user) : null,
    needsSetup: user ? false : needsSetup(),
    redirect: user ? homePathFor(user) : null,
  });
});
