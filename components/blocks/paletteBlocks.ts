// 팔레트에 보일 블록 (FEATURE_V4 §2: 내가 가진 역할들의 블록 합집합). 순수 함수, 훅·JSX 없음 (테스트에서 바로 가져온다).
import type { GameRole } from '@/lib/contracts';
import type { BlockId } from '@/lib/engine/types';
import { BLOCK_ORDER, ROLES } from '@/lib/engine/blocks';

/** 역할들이 놓을 수 있는 블록 (팔레트 순서, 여러 역할이면 합집합) */
export function paletteBlocks(roles: readonly GameRole[]): BlockId[] {
  const mine = new Set<BlockId>(roles.flatMap((r) => ROLES[r].blocks));
  return BLOCK_ORDER.filter((id) => mine.has(id));
}
