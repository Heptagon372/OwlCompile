// GET /api/lobby/events — 대기실 SSE (FEATURE_V4 §3): hello, lobby, assigned(본인에게만), game-open(대기 중인 사람에게).
// 참가자 연결은 대기 명단에 든다. 진행자·관리자 연결은 구경만 한다 (?watch=1은 누구든 구경, 진행자·관리자 ?wait=1은 대기).
// 대기 연결이 붙는 순간 열린 자동 배정 게임이 정확히 하나면 바로 배정한다(늦게 온 사람).
import { cookies } from 'next/headers';
import type { LobbyEvent } from '@/lib/contracts';
import { activeGameOf, ensureRuntime, lobbyArrive } from '@/lib/server/game';
import { handle } from '@/lib/server/http';
import { sha256 } from '@/lib/server/password';
import { LOBBY_CHANNEL, sseResponse } from '@/lib/server/realtime';
import { SESSION_COOKIE, requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const GET = handle(async (req) => {
  ensureRuntime();
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  const watch = q.get('watch') === '1' || (user.role !== 'player' && q.get('wait') !== '1');
  // 로그아웃하면 이 세션의 스트림만 닫을 수 있도록 토큰 해시를 붙여 둔다
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const myGame = activeGameOf(user.id);
  const hello: LobbyEvent = { type: 'hello', serverNow: new Date().toISOString(), waiting: !watch && myGame === null, myGame };
  const res = sseResponse(
    req,
    { gameId: LOBBY_CHANNEL, userId: user.id, teamId: null, isHost: user.role !== 'player', watch, tokenHash: token ? sha256(token) : null },
    hello,
  );
  // 구독은 이미 등록됐다: 여기서 보낸 'assigned'도 이 스트림으로 간다
  if (!watch && myGame === null) {
    try {
      lobbyArrive(user);
    } catch (err) {
      console.error('[lobby] arrive', err);
    }
  }
  return res;
});
