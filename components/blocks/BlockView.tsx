// 블록 트리를 읽기 전용으로 그린다 (드래그 미리보기·고스트·팔레트). 훅 없음.
import type { Block, BlockId } from '@/lib/engine/types';
import { slotsOf } from '@/lib/engine/blocks';
import { BlockCard } from './BlockCard';
import { CBlock, isCBlockId } from './CBlock';

/** 블록 하나와 그 안의 블록 전부. crumbled 에 든 uid 의 카드는 data-crumble (협동 재생의 무너짐, COOP_SPEC §8) */
export function BlockView({
  block, className = '', crumbled,
}: { block: Block; className?: string; crumbled?: ReadonlySet<string> }) {
  const crumble = !!block.uid && !!crumbled?.has(block.uid);
  if (block.id === 'repeat' || block.id === 'if_wall' || block.id === 'if_pit' || block.id === 'def') {
    const slots = slotsOf(block);
    return (
      <CBlock
        id={block.id}
        n={block.id === 'repeat' ? block.n : undefined}
        className={className}
        data-crumble={crumble ? '' : undefined}
        mouths={slots.map((s, i) => (
          <div key={i} className="stack">
            {s.map((c, j) => (
              <BlockView key={c.uid ?? j} block={c} crumbled={crumbled} />
            ))}
          </div>
        ))}
      />
    );
  }
  return <BlockCard id={block.id} className={className} data-crumble={crumble ? '' : undefined} />;
}

/** 팔레트 모양 카드: C-블록은 입을 얇게 */
export function PaletteShape({ id, className = '' }: { id: BlockId; className?: string }) {
  if (isCBlockId(id)) {
    return (
      <CBlock
        id={id}
        n={id === 'repeat' ? undefined : undefined}
        mini
        className={className}
        mouths={[null, null]}
      />
    );
  }
  return <BlockCard id={id} className={className} />;
}

/** 연결 지점 고스트: 머리 카드 한 장만 (C-블록은 머리 + 얇은 꼬리) */
export function GhostShape({ id, n }: { id: BlockId; n?: number }) {
  if (isCBlockId(id)) {
    return <CBlock id={id} n={n} mini mouths={[null, null]} />;
  }
  return <BlockCard id={id} />;
}
