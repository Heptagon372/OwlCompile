import { cookies } from 'next/headers';
import { isHostOf, membershipOf } from '@/lib/server/game';
import { gameContext } from '@/lib/server/game/context';
import { handle } from '@/lib/server/http';
import { sha256 } from '@/lib/server/password';
import { sseResponse } from '@/lib/server/realtime';
import { SESSION_COOKIE } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/** SSE: 로그인한 누구나 구독. 팀 이벤트는 그 팀원과 진행자에게만 간다 */
export const GET = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  // 로그아웃하면 이 세션의 스트림만 닫을 수 있도록 토큰 해시를 붙여 둔다
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sseResponse(
    req,
    {
      gameId: game.id,
      userId: user.id,
      teamId: membershipOf(game.id, user.id).teamId,
      isHost: isHostOf(game, user),
      tokenHash: token ? sha256(token) : null,
    },
    { type: 'hello', serverNow: new Date().toISOString() },
  );
});
