// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// OWL COMPILE — 블록 메타 (docs/ENGINE_SPEC.md §3)
import type { Block, BlockId, Program } from './types';

export type Category = 'move' | 'turn' | 'control' | 'function' | 'special';
export type Role = 'runner' | 'turner' | 'controller' | 'architect';
export type Shape = 'plain' | 'c1' | 'c2';   // 일반 / 입 1개 / 입 2개(그러면·아니면)

export interface BlockMeta {
  id: BlockId; label: string; keyword: string;
  category: Category; color: string; ink: string;
  role: Role; ticks: 0 | 1; shape: Shape;
  deck: number;   // 실물 카드 팀당 매수 (참고용, 검증에 안 씀)
  /** 협동 게임(게임 2) 전용 블록 (docs/COOP_SPEC.md §2). 게임 1 팔레트·validate·run에서는 거절된다 */
  coop?: true;
}

export const CATEGORIES: Record<Category, { label: string; color: string; ink: string }> = {
  move: { label: '이동', color: '#8E5CFF', ink: '#FFFFFF' },
  turn: { label: '회전', color: '#2FC4D9', ink: '#0B1C22' },
  control: { label: '제어', color: '#FFB020', ink: '#2A1B00' },
  function: { label: '함수', color: '#3DD68C', ink: '#062A19' },
  special: { label: '특수', color: '#FF6B9A', ink: '#FFFFFF' },
};

function meta(
  id: BlockId, label: string, keyword: string, category: Category,
  role: Role, ticks: 0 | 1, shape: Shape, deck: number, coop?: true,
): BlockMeta {
  const c = CATEGORIES[category];
  const m: BlockMeta = { id, label, keyword, category, color: c.color, ink: c.ink, role, ticks, shape, deck };
  return coop ? { ...m, coop } : m;
}

export const BLOCKS: Record<BlockId, BlockMeta> = {
  forward: meta('forward', '앞으로', 'forward', 'move', 'runner', 1, 'plain', 6),
  jump: meta('jump', '점프', 'jump', 'move', 'runner', 1, 'plain', 4),
  left: meta('left', '좌회전', 'turn left', 'turn', 'turner', 1, 'plain', 4),
  right: meta('right', '우회전', 'turn right', 'turn', 'turner', 1, 'plain', 4),
  repeat: meta('repeat', '반복', 'repeat', 'control', 'controller', 0, 'c1', 3),
  if_wall: meta('if_wall', '만약 앞이 벽이면', 'if wall', 'control', 'controller', 0, 'c2', 2),
  if_pit: meta('if_pit', '만약 앞이 구덩이면', 'if pit', 'control', 'controller', 0, 'c2', 2),
  def: meta('def', '함수 F', 'define F', 'function', 'architect', 0, 'c1', 1),
  call: meta('call', 'F 호출', 'call F', 'function', 'architect', 0, 'plain', 4),
  sleep: meta('sleep', '잠자기', 'sleep', 'special', 'architect', 1, 'plain', 3),
  // 협동 게임 전용 (COOP_SPEC §2 표). role은 참고용 — ROLES 목록에는 넣지 않는다 (게임 1 팔레트·역할 검사에서 자동으로 빠짐)
  toggle: meta('toggle', '색 바꾸기', 'toggle', 'special', 'architect', 1, 'plain', 0, true),
  spawn: meta('spawn', '상자 놓기', 'spawn', 'special', 'architect', 1, 'plain', 0, true),
};

/** 팔레트 표시 순서. 협동 전용 블록은 맨 끝. */
export const BLOCK_ORDER: BlockId[] = [
  'forward', 'jump', 'left', 'right', 'repeat', 'if_wall', 'if_pit', 'def', 'call', 'sleep',
  'toggle', 'spawn',
];

/** 협동 게임 팔레트 = 모든 블록(12개), BLOCK_ORDER 순서 (COOP_SPEC §2). */
export const COOP_BLOCKS: readonly BlockId[] = [...BLOCK_ORDER];

/** 협동 게임 전용 블록인가 (BLOCKS[id].coop). */
export function isCoopBlockId(id: BlockId): boolean {
  return BLOCKS[id].coop === true;
}

export const ROLES: Record<Role, { label: string; blocks: BlockId[]; color: string }> = {
  runner: { label: 'Runner', blocks: ['forward', 'jump'], color: CATEGORIES.move.color },
  turner: { label: 'Turner', blocks: ['left', 'right'], color: CATEGORIES.turn.color },
  controller: { label: 'Controller', blocks: ['repeat', 'if_wall', 'if_pit'], color: CATEGORIES.control.color },
  architect: { label: 'Architect', blocks: ['def', 'call', 'sleep'], color: CATEGORIES.function.color },
};

export function isKnownBlockId(id: unknown): id is BlockId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BLOCKS, id);
}

/** C-블록의 입(슬롯) 목록. 슬롯 번호: body/then = 0, else = 1. 일반 블록은 []. */
export function slotsOf(b: Block): Block[][] {
  switch (b.id) {
    case 'repeat':
    case 'def':
      return [b.body];
    case 'if_wall':
    case 'if_pit':
      return [b.then, b.else];
    default:
      return [];
  }
}

/** 블록 수: 모든 블록 1개 = 1. C-블록도 1이고 입 안은 재귀적으로 따로 센다. */
export function countBlocks(program: Program): number {
  let n = 0;
  for (const b of program) {
    n += 1;
    for (const slot of slotsOf(b)) n += countBlocks(slot);
  }
  return n;
}
