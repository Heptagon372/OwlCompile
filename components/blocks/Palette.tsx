'use client';
// 팔레트("내 카드" 유리 패널): 내가 가진 역할들의 카드를 모두(합집합). 끌어서 원하는 연결 지점에 놓거나, 누르면 프로그램 맨 끝에 붙는다.
// 놓인 카드를 끌어 팔레트 위에 놓으면 삭제된다(삭제 구역). 폰에서는 화면 맨 아래 띠(가로 스크롤), 데스크톱에서는 패널.
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type { GameRole } from '@/lib/contracts';
import type { Block, BlockId } from '@/lib/engine/types';
import { BLOCKS } from '@/lib/engine/blocks';
import { dropBlockReason } from '@/lib/editor/tree';
import { IconPlus, IconTrash } from '@/components/ui/icons';
import { PaletteShape } from './BlockView';
import { PALETTE_ID, type DragData, type DropData } from './dnd';
import { paletteBlocks } from './paletteBlocks';

export { paletteBlocks };

const DELETE_DATA: DropData = { kind: 'delete', zone: 'palette' };
/** v4 블록은 홈을 마스크로 파내서 면 색이 필요 없다 (옛 변수, 무해) */
const SURFACE: CSSProperties = { ['--notch-bg' as string]: 'var(--color-panel)' };

export function Palette({
  roles, ids: idsProp, roleNames, doc, onAppend, deleting, justDragged,
}: {
  roles: readonly GameRole[];
  /** 보일 블록 목록을 직접 준다 (협동 게임 = COOP_BLOCKS, docs/COOP_SPEC.md §2·§8). 없으면 roles 합집합 */
  ids?: readonly BlockId[];
  /** 머리 줄에 보일 내 역할 이름 (데스크톱) */
  roleNames?: readonly string[];
  doc: Block[];
  onAppend: (id: BlockId) => void;
  /** 놓인 카드를 끄는 중: 팔레트가 삭제 구역이 된다 */
  deleting: boolean;
  /** 방금 드래그가 끝났으면 true (드래그 뒤 따라오는 클릭 무시) */
  justDragged: () => boolean;
}) {
  const ids = idsProp ?? paletteBlocks(roles);
  const { setNodeRef, isOver } = useDroppable({ id: 'zone:palette', data: DELETE_DATA, disabled: !deleting });
  const hot = deleting && isOver;
  return (
    <section
      ref={setNodeRef}
      aria-label="내 카드"
      className={
        'glass relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t transition-[border-color,background-color] duration-150 ' +
        'lg:flex-1 lg:rounded-card lg:border lg:shadow-glass ' +
        (hot ? 'border-danger bg-danger/12' : deleting ? 'border-danger/50 bg-danger/[0.04]' : 'border-stroke')
      }
      style={SURFACE}
    >
      {/* 머리 줄: 데스크톱은 패널 제목 · 내 역할 · 안내, 폰은 안내 한 줄 */}
      <div className="flex h-8 shrink-0 items-center gap-2.5 px-3.5 lg:h-12 lg:px-5">
        <h2 className="ui-label hidden shrink-0 items-center gap-2 lg:flex">
          <IconPlus size={16} className="shrink-0 text-violet-ink" />
          내 카드
        </h2>
        {roleNames?.length ? (
          <span className="hidden min-w-0 truncate text-[13px] text-text-dim xl:inline">{roleNames.join(' · ')}</span>
        ) : null}
        <p
          className={
            'ui-caption min-w-0 truncate lg:ml-auto ' +
            // 라이트: 장밋빛 12% 칠 위 11px 글자가 4.4:1 뿐이라 본문색을 22% 섞는다 (5.7:1 이상). 나이트는 v4 그대로
            (deleting ? 'flex items-center gap-1 text-danger [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-danger)_78%,var(--color-text))]' : '')
          }
          aria-live="polite"
        >
          {deleting ? (
            <>
              <IconTrash size={13} />
              {hot ? '놓으면 삭제돼요' : '여기에 놓아도 삭제돼요'}
            </>
          ) : (
            '끌어서 연결 · 누르면 맨 끝에 붙어요'
          )}
        </p>
      </div>
      <div className="blk-compact flex items-start gap-3 overflow-x-auto overscroll-x-contain px-3.5 pb-3 pt-1 lg:flex-wrap lg:content-start lg:overflow-x-visible lg:px-5 lg:pb-5">
        {ids.map((id) => (
          <PaletteItem
            key={id}
            id={id}
            reason={dropBlockReason(doc, id)}
            onAppend={onAppend}
            justDragged={justDragged}
          />
        ))}
      </div>
    </section>
  );
}

function PaletteItem({
  id, reason, onAppend, justDragged,
}: { id: BlockId; reason: string | null; onAppend: (id: BlockId) => void; justDragged: () => boolean }) {
  const data: DragData = { kind: 'palette', blockId: id };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: PALETTE_ID(id),
    data,
    disabled: !!reason,
  });
  const label = BLOCKS[id].label;
  const activate = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    if (justDragged()) return;
    onAppend(id);
  };
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-disabled={!!reason}
      aria-label={reason ? `${label} 카드: ${reason}` : `${label} 카드. 끌어서 연결하거나 누르면 맨 끝에 붙어요`}
      title={reason ?? undefined}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') activate(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={
        'blk-grab shrink-0 rounded-block transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink ' +
        (reason ? 'opacity-40 ' : '') +
        (isDragging ? 'opacity-40' : '')
      }
    >
      <PaletteShape id={id} className={id === 'if_wall' || id === 'if_pit' ? 'w-[172px]' : 'min-w-[112px]'} />
    </div>
  );
}
