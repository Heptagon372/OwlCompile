// 프로그램 문서 검증 (docs/WEBSITE_SPEC.md §5 "프로그램 저장 검사"). 서버 전용.
// 순서: 원시 JSON 깊이/노드 사전 검사(악의적 깊은 중첩 차단) → zod 재귀 스키마 → 크기.
import { z } from 'zod';
import { LIMITS } from '@/lib/contracts';
import type { Block, BlockId } from '@/lib/engine';
import { countBlocks, slotsOf } from '@/lib/engine/blocks';
import { HttpError, badRequest } from './http';

const uid = z.string().max(40).optional();

const PlainSchema = z.object({
  id: z.enum(['forward', 'jump', 'left', 'right', 'call', 'sleep']),
  uid,
});

export const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.union([
    PlainSchema,
    z.object({
      id: z.literal('repeat'),
      n: z.number().int().min(1).max(9),
      body: z.array(BlockSchema),
      uid,
    }),
    z.object({
      id: z.enum(['if_wall', 'if_pit']),
      then: z.array(BlockSchema),
      else: z.array(BlockSchema),
      uid,
    }),
    z.object({
      id: z.literal('def'),
      body: z.array(BlockSchema),
      uid,
    }),
  ]),
) as z.ZodType<Block>;

export const DocSchema = z.array(BlockSchema);

/** 블록 트리의 최대 깊이 (최상위 블록 = 1) */
export function docDepth(doc: Block[]): number {
  let max = 0;
  for (const b of doc) {
    let d = 1;
    for (const slot of slotsOf(b)) d = Math.max(d, 1 + docDepth(slot));
    max = Math.max(max, d);
  }
  return max;
}

/**
 * 스키마 전에 원시 값을 훑어 깊이·노드 수가 한도를 넘으면 바로 멈춘다.
 * 슬롯 키(body/then/else) 아래 배열만 따라간다. 모양 오류는 zod가 잡는다.
 */
function precheck(raw: unknown): 'depth' | 'nodes' | null {
  let nodes = 0;
  const walk = (list: unknown, depth: number): 'depth' | 'nodes' | null => {
    if (!Array.isArray(list)) return null;
    if (list.length > 0 && depth > LIMITS.maxDocDepth) return 'depth';
    for (const item of list) {
      nodes += 1;
      if (nodes > LIMITS.maxDocNodes) return 'nodes';
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        for (const key of ['body', 'then', 'else'] as const) {
          const r = walk(o[key], depth + 1);
          if (r) return r;
        }
      }
    }
    return null;
  };
  return walk(raw, 1);
}

/** 요청으로 받은 doc을 검증해 Block[]으로 돌려준다. 실패하면 HttpError. */
export function parseDoc(raw: unknown): Block[] {
  if (!Array.isArray(raw)) throw badRequest('프로그램 형식이 올바르지 않습니다.', 'invalid_doc');
  const pre = precheck(raw);
  if (pre === 'depth') throw badRequest(`블록을 ${LIMITS.maxDocDepth}단계보다 깊게 넣을 수 없습니다.`, 'doc_too_deep');
  if (pre === 'nodes') throw badRequest(`블록은 ${LIMITS.maxDocNodes}개까지 놓을 수 있습니다.`, 'doc_too_large');
  const parsed = DocSchema.safeParse(raw);
  if (!parsed.success) throw badRequest('프로그램 형식이 올바르지 않습니다.', 'invalid_doc');
  const doc = parsed.data;
  if (countBlocks(doc) > LIMITS.maxDocNodes) {
    throw badRequest(`블록은 ${LIMITS.maxDocNodes}개까지 놓을 수 있습니다.`, 'doc_too_large');
  }
  if (docDepth(doc) > LIMITS.maxDocDepth) {
    throw badRequest(`블록을 ${LIMITS.maxDocDepth}단계보다 깊게 넣을 수 없습니다.`, 'doc_too_deep');
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > LIMITS.maxDocBytes) {
    throw new HttpError(413, 'doc_too_large', '프로그램이 너무 큽니다.');
  }
  return doc;
}

/** 블록 id별 개수 (트리 전체) */
export function countById(doc: Block[]): Map<BlockId, number> {
  const m = new Map<BlockId, number>();
  const walk = (list: Block[]) => {
    for (const b of list) {
      m.set(b.id, (m.get(b.id) ?? 0) + 1);
      for (const slot of slotsOf(b)) walk(slot);
    }
  };
  walk(doc);
  return m;
}

/** 이전 doc 대비 개수가 늘어난 블록 id 목록 */
export function addedBlockIds(prev: Block[], next: Block[]): BlockId[] {
  const before = countById(prev);
  const out: BlockId[] = [];
  for (const [id, n] of countById(next)) if (n > (before.get(id) ?? 0)) out.push(id);
  return out;
}

/** DB에 저장된 doc 문자열을 읽는다 (깨졌으면 빈 프로그램) */
export function readStoredDoc(text: string): Block[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as Block[]) : [];
  } catch {
    return [];
  }
}
