'use client';
// 연결 편집기 내부 공유 상태 (ProgramEditor → StackView/DropSlot/PlacedBlock)
import { createContext, useContext } from 'react';
import type { Block, BlockId } from '@/lib/engine/types';
import type { DragSource } from '@/lib/editor/tree';
import type { DragData } from './dnd';

export interface DragState {
  data: DragData;
  source: DragSource;
  /** 연결 지점에 보여 줄 반투명 고스트 카드 */
  ghost: { id: BlockId; n?: number };
}

/** 방금 놓은(옮긴·횟수 바꾼) 블록: 그 카드에 0.6초 네온 링 (n 이 오를 때마다 다시 번쩍) */
export interface FlashState { uid: string; n: number }

export interface EditorContextValue {
  doc: Block[];
  editable: boolean;
  drag: DragState | null;
  /** 지금 끄는 것을 연결할 수 있는 지점들 (pointKey) */
  validKeys: ReadonlySet<string>;
  openMenu: (uid: string) => void;
  /** 코드 줄에 마우스를 올렸을 때 그 줄이 속한 블록 경로 (pathKey). 그 카드가 은은하게 강조된다 */
  hlKey: string | null;
  /** 놓는 순간 번쩍일 블록 */
  flash: FlashState | null;
  /** 블록 위 마우스 → 코드 줄 강조 (null = 벗어남) */
  onHover: (path: number[] | null) => void;
  /** 협동 재생에서 무너진 블록 uid (COOP_SPEC §8): 그 카드에 data-crumble → CSS 무너짐. 문서에서는 지우지 않는다 */
  crumbled: ReadonlySet<string>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const v = useContext(EditorContext);
  if (!v) throw new Error('useEditor must be used inside ProgramEditor');
  return v;
}
