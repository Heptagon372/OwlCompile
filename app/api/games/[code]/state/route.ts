import type { GameView } from '@/lib/contracts';
import { gameContext } from '@/lib/server/game/context';
import { handle, json } from '@/lib/server/http';
import { joinUrlsFor } from '@/lib/server/net';
import { buildView } from '@/lib/server/views';

export const dynamic = 'force-dynamic';

/** 뷰모델: 로그인한 누구나. 역할에 따라 걸러서 준다 (비참가자는 로비 수준, 참가 주소 후보는 진행자·보드만) */
export const GET = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  return json<GameView>(buildView(game, user, { joinUrls: () => joinUrlsFor(req) }));
});
