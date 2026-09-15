import { z } from 'zod';
import type { OkResponse } from '@/lib/contracts';
import { kickMember } from '@/lib/server/game';
import { Id, gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ memberId: Id.optional(), userId: Id.optional() })
  .refine((b) => (b.memberId ? 1 : 0) + (b.userId ? 1 : 0) === 1, { message: 'memberId 또는 userId 하나' });

/** 진행자: {memberId} 역할 1개 또는 {userId} 그 사람의 역할 전부 내보내기. 역할이 모두 없어지면 대기실로 돌아간다 */
export const POST = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, 1_000);
  kickMember(game, user, body.memberId ? { memberId: body.memberId } : { userId: body.userId });
  return json<OkResponse>({ ok: true });
});
