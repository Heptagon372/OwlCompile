// 블록 아이콘 (카드 안 16px 선 아이콘, DESIGN_V2 §2). 훅 없음.
import type { ReactNode } from 'react';
import type { BlockId } from '@/lib/engine/types';

const PATHS: Record<BlockId, ReactNode> = {
  forward: (
    <>
      <path d="M12 20V4" />
      <path d="M5 11l7-7 7 7" />
    </>
  ),
  jump: (
    <>
      <path d="M3 18c3-10 15-10 18 0" />
      <path d="M21 18v-4h-4" />
      <circle cx="3" cy="18" r="1.4" fill="currentColor" />
    </>
  ),
  left: (
    <>
      <path d="M20 18a8 8 0 0 0-8-8H4" />
      <path d="M8 6L4 10l4 4" />
    </>
  ),
  right: (
    <>
      <path d="M4 18a8 8 0 0 1 8-8h8" />
      <path d="M16 6l4 4-4 4" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 12a8 8 0 0 1 14-5.3" />
      <path d="M20 12a8 8 0 0 1-14 5.3" />
      <path d="M18 3v4h-4" />
      <path d="M6 21v-4h4" />
    </>
  ),
  if_wall: (
    <>
      <path d="M12 21V11" />
      <path d="M12 11 6 5" />
      <path d="M12 11l6-6" />
      <path d="M6 5H3v3" />
      <path d="M18 5h3v3" />
    </>
  ),
  if_pit: (
    <>
      <path d="M12 21V11" />
      <path d="M12 11 6 5" />
      <path d="M12 11l6-6" />
      <path d="M6 5H3v3" />
      <path d="M18 5h3v3" />
    </>
  ),
  def: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 16V8h5" />
      <path d="M9 12h4" />
    </>
  ),
  call: (
    <>
      <path d="M7 16V8h5" />
      <path d="M7 12h4" />
      <path d="M14 12h7" />
      <path d="M18 9l3 3-3 3" />
    </>
  ),
  sleep: (
    <>
      <path d="M4 10h5l-5 6h5" />
      <path d="M13 4h6l-6 7h6" />
    </>
  ),
};

/** 카드 안 선 아이콘. v4 둥근 광택 카드에 맞춰 선을 2px 로 조금 굵게 (크기는 .blk svg 의 --blk-icon) */
export function BlockIcon({ id, className }: { id: BlockId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id]}
    </svg>
  );
}
