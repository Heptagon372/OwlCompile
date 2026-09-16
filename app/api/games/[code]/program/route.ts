import { z } from 'zod';
import { LIMITS, MAX_ROUND, type ProgramSaveResponse } from '@/lib/contracts';
import { parseDoc } from '@/lib/server/docSchema';
import { saveProgram } from '@/lib/server/game';
import { gameContext } from '@/lib/server/game/context';
import { handle, json, readJson } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  doc: z.unknown(),
  baseVersion: z.number().int().min(0),
  /** 이 저장을 만든 라운드 (편집기가 보낸다). 지금 라운드와 다르면 409 not_editable */
  round: z.number().int().min(1).max(MAX_ROUND).optional(),
});

/** 팀원: {doc, baseVersion, round?} → 200 {version, blocks} 또는 409 {doc, version, blocks} */
export const PUT = handle<{ code: string }>(async (req, { params }) => {
  const { user, game } = await gameContext(params);
  const body = await readJson(req, Body, LIMITS.maxDocBytes + 2_000);
  const doc = parseDoc(body.doc);
  return json<ProgramSaveResponse>(saveProgram(game, user, doc, body.baseVersion, body.round));
});
