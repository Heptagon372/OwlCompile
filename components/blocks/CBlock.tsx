// C-블록: 머리 / 입 / (아니면 / 입) / 꼬리 — DESIGN_V4 §4. 훅 없음.
// 머리·아니면·꼬리는 각자 광택 면, 왼쪽 팔과 입 안쪽 둥근 모서리(12px)는 .mouth::before, 입 바탕은 유리(globals.css .cblk).
// 입 안 내용은 부모가 넣는다(연결 편집기는 스택 + 연결 지점, 팔레트는 빈 입).
import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import type { BlockId } from '@/lib/engine/types';
import { BLOCKS } from '@/lib/engine/blocks';
import { BlockCard, flashAttr, type CardDomProps } from './BlockCard';

export interface CBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'id'> {
  id: Extract<BlockId, 'repeat' | 'if_wall' | 'if_pit' | 'def'>;
  n?: number;
  /** 입 내용: 반복·함수 1개, 만약 2개(그러면·아니면) */
  mouths: ReactNode[];
  /** 팔레트·고스트용 납작한 모양 (입을 얇게) */
  mini?: boolean;
  showMeta?: boolean;
  /** 머리 카드에 붙일 속성 (포커스·드래그 속성 등, 한 번만 붙는다) */
  headProps?: CardDomProps;
  /** 머리·아니면·꼬리(카드의 몸통) 모두에 붙일 이벤트 핸들러: 드래그 리스너 등 */
  bodyProps?: CardDomProps;
  /** 코드 줄 호버 연동: C-블록 전체에 은은한 같은 색 링 (data-hl) */
  highlight?: boolean;
  /** 놓는 순간 네온 링 0.6s (1, 2, 3… 으로 올릴 때마다) */
  flashKey?: number | null;
}

/* 납작한 입: 안쪽 둥근 모서리도 작게 (--mouth-r) */
const MINI_MOUTH = { minHeight: 10, padding: 0, ['--mouth-r' as string]: '5px' } as CSSProperties;
const MINI_ELSE: CSSProperties = { height: 22, fontSize: 12 };
const MINI_FOOT: CSSProperties = { height: 12 };

export function isCBlockId(id: BlockId): id is CBlockProps['id'] {
  return BLOCKS[id].shape !== 'plain';
}

export const CBlock = forwardRef<HTMLDivElement, CBlockProps>(function CBlock(
  { id, n, mouths, mini = false, showMeta = false, headProps, bodyProps, highlight = false, flashKey, className = '', style, ...rest },
  ref,
) {
  const m = BLOCKS[id];
  const two = m.shape === 'c2';
  const cStyle = mini ? ({ ['--mouth-r' as string]: '5px', ...style } as CSSProperties) : style;
  return (
    <div
      ref={ref}
      className={`cblk ${m.category} ${className}`}
      data-hl={highlight ? '' : undefined}
      data-flash={flashAttr(flashKey)}
      style={cStyle}
      {...rest}
    >
      <BlockCard id={id} n={n} showMeta={showMeta} {...bodyProps} {...headProps} />
      <div className="mouth" style={mini ? MINI_MOUTH : undefined}>
        {mouths[0]}
      </div>
      {two ? (
        <>
          <div className="else" style={mini ? MINI_ELSE : undefined} {...bodyProps}>
            아니면
          </div>
          <div className="mouth" style={mini ? MINI_MOUTH : undefined}>
            {mouths[1]}
          </div>
        </>
      ) : null}
      <div className="foot" style={mini ? MINI_FOOT : undefined} {...bodyProps} />
    </div>
  );
});
