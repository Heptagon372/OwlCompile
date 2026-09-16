'use client';
// 프로그램 스택 그리기: 연결 지점 / 카드 / 연결 지점 / 카드 … / 연결 지점. C-블록 입 안도 같은 스택.
// 최상위 스택은 카드 줄마다 왼쪽 거터에 줄 번호(1, 2, 3…)를 붙인다 — 표시만 하고 트리 규칙은 건드리지 않는다.
// (거터 폭은 편집기가 --gutter-w 로 준다. 최상위 연결 지점은 같은 폭만큼 오른쪽에서 시작해 카드 열과 맞춘다.)
import { useDraggable } from '@dnd-kit/core';
import { Fragment, type MouseEvent, type ReactNode } from 'react';
import type { Block } from '@/lib/engine/types';
import { BLOCKS, slotsOf } from '@/lib/engine/blocks';
import { pathKey } from '@/lib/engine/text';
import { listPrefix, type Path, type SlotRef } from '@/lib/editor/tree';
import { BlockCard, type CardDomProps } from './BlockCard';
import { CBlock } from './CBlock';
import { DropSlot } from './DropSlot';
import { PLACED_ID, type DragData } from './dnd';
import { useEditor } from './EditorContext';

export function StackView({ list, slotRef, top = false }: { list: Block[]; slotRef: SlotRef; top?: boolean }) {
  const prefix = listPrefix(slotRef);
  if (list.length === 0) {
    return (
      <div className="stack">
        <DropSlot point={{ ...slotRef, index: 0 }} empty top={top} indent={top} />
      </div>
    );
  }
  return (
    <div className="stack">
      <DropSlot point={{ ...slotRef, index: 0 }} indent={top} />
      {list.map((b, i) => (
        <Fragment key={b.uid ?? `i${i}`}>
          <Row n={top ? i + 1 : null}>
            <PlacedBlock block={b} path={[...prefix, i]} />
          </Row>
          <DropSlot point={{ ...slotRef, index: i + 1 }} tail={top && i === list.length - 1} indent={top} />
        </Fragment>
      ))}
    </div>
  );
}

/** 카드 한 줄: 최상위(n 있음)면 왼쪽에 줄 번호 거터를 붙인다. 입 안(n 없음)은 그대로 */
function Row({ n, children }: { n: number | null; children: ReactNode }) {
  if (n === null) return <>{children}</>;
  return (
    <div className="flex items-start">
      <span
        aria-hidden="true"
        className="gutter-num flex h-[var(--blk-h)] w-[var(--gutter-w,0px)] shrink-0 items-center justify-end pr-2.5"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function blockLabel(b: Block): string {
  return b.id === 'repeat' ? `반복 ${b.n}번` : BLOCKS[b.id].label;
}

function PlacedBlock({ block, path }: { block: Block; path: Path }) {
  const { editable, drag, openMenu, hlKey, flash, onHover, crumbled } = useEditor();
  const uid = block.uid ?? `p${path.join('.')}`;
  // 코드 줄 ↔ 블록 호버 연동 · 놓는 순간 네온 링 (FEATURE_V4 §4). 가장 안쪽 카드가 먼저 받고 전파를 멈춘다
  const highlight = hlKey !== null && hlKey === pathKey(path);
  const flashKey = flash && block.uid && flash.uid === block.uid ? flash.n : null;
  // 협동 재생에서 무너진 블록 (COOP_SPEC §8·§9.4): 카드 요소에 data-crumble → globals.css 가 무너뜨린다
  const crumble = !!block.uid && crumbled.has(block.uid);
  const onMouseOver = (e: MouseEvent) => {
    e.stopPropagation();
    onHover(path);
  };
  const data: DragData = { kind: 'placed', uid, blockId: block.id };
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: PLACED_ID(uid),
    data,
    disabled: !editable || !block.uid,
  });
  const lifted = drag?.data.kind === 'placed' && drag.data.uid === uid;
  const open = () => openMenu(uid);
  const label = blockLabel(block);

  const headProps: CardDomProps = editable
    ? {
        ...attributes,
        role: 'button',
        tabIndex: 0,
        'aria-label': `${label} 카드. 끌어서 옮기거나 눌러서 메뉴 열기`,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        },
      }
    : { 'aria-label': label };
  const bodyProps: CardDomProps = editable
    ? { ...listeners, onClick: open, onContextMenu: (e) => e.preventDefault() }
    : {};
  const cls = `${editable ? 'blk-grab' : ''} ${lifted ? 'blk-lifted' : ''}`;

  if (block.id === 'repeat' || block.id === 'if_wall' || block.id === 'if_pit' || block.id === 'def') {
    return (
      <CBlock
        ref={setNodeRef}
        id={block.id}
        n={block.id === 'repeat' ? block.n : undefined}
        className={cls}
        highlight={highlight}
        flashKey={flashKey}
        data-crumble={crumble ? '' : undefined}
        onMouseOver={onMouseOver}
        headProps={headProps}
        bodyProps={bodyProps}
        mouths={slotsOf(block).map((s, si) => (
          <StackView key={si} list={s} slotRef={{ parentPath: path, slot: si }} />
        ))}
      />
    );
  }
  return (
    <BlockCard
      ref={setNodeRef}
      id={block.id}
      className={cls}
      highlight={highlight}
      flashKey={flashKey}
      data-crumble={crumble ? '' : undefined}
      onMouseOver={onMouseOver}
      {...bodyProps}
      {...headProps}
    />
  );
}
