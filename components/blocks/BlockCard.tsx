// 일반 블록 카드 / C-블록 머리 — DESIGN_V4 §4 둥근 광택 블록. 훅 없음.
// 모양(14px 모서리, 부드러운 위 홈·아래 돌기, 광택 면, 같은 색 그림자)은 globals.css 의 .blk.
// 크기는 감싼 요소의 .blk-compact(편집기 48px) · .blk-board(프로젝터 64px) 같은 변수 클래스가 정한다.
// 홈은 마스크로 파내므로 v3 의 --notch-bg(면 색 맞추기)는 더 필요 없다 (넘겨도 무해).
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { BlockId } from '@/lib/engine/types';
import { BLOCKS } from '@/lib/engine/blocks';
import { BlockIcon } from './BlockIcon';

/** 라벨이 길어 글자를 줄이는 블록 */
export function isLongBlock(id: BlockId): boolean {
  return id === 'if_wall' || id === 'if_pit';
}

/** flashKey → data-flash 값. 0·없음 = 안 번쩍임, 올릴 때마다 a/b 가 번갈아 애니메이션을 다시 튼다 */
export function flashAttr(flashKey?: number | null): 'a' | 'b' | undefined {
  if (!flashKey) return undefined;
  return flashKey % 2 ? 'b' : 'a';
}

/** 카드 DOM 속성 (블록 id와 겹치는 HTML id는 뺀다) */
export type CardDomProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'>;

export interface BlockCardProps extends CardDomProps {
  id: BlockId;
  /** 반복 횟수 (반복 블록이면 흰 반투명 원 칩으로 보인다) */
  n?: number;
  /** 오른쪽 작은 키워드와 틱 알약 (카드 설명용) */
  showMeta?: boolean;
  extra?: ReactNode;
  /** 코드 줄 호버 연동: 은은한 같은 색 링 (data-hl) */
  highlight?: boolean;
  /** 놓는 순간 같은 색 네온 링 0.6s: 1, 2, 3… 으로 올릴 때마다 번쩍 (data-flash) */
  flashKey?: number | null;
}

export const BlockCard = forwardRef<HTMLDivElement, BlockCardProps>(function BlockCard(
  { id, n, showMeta = false, extra, highlight = false, flashKey, className = '', ...rest },
  ref,
) {
  const m = BLOCKS[id];
  return (
    <div
      ref={ref}
      className={`blk ${m.category} ${isLongBlock(id) ? 'long' : ''} ${className}`}
      data-hl={highlight ? '' : undefined}
      data-flash={flashAttr(flashKey)}
      {...rest}
    >
      <BlockIcon id={id} />
      <span className="truncate">{id === 'repeat' ? '반복' : m.label}</span>
      {id === 'repeat' ? (
        <span className="n" aria-label={`${n ?? 'N'}번`}>
          {n ?? 'N'}
        </span>
      ) : null}
      {extra}
      {showMeta ? (
        <>
          <span className="kw">{m.keyword}</span>
          <span className="tick">{m.ticks}틱</span>
        </>
      ) : null}
    </div>
  );
});
