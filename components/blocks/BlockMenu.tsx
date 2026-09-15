'use client';
// 놓인 카드를 누르면 여는 작은 메뉴: 반복 횟수(1~9), 위·아래로, 삭제
import { useEffect } from 'react';
import type { Block } from '@/lib/engine/types';
import { BLOCKS, countBlocks } from '@/lib/engine/blocks';
import {
  canDrop, findPathByUid, getBlock, getList, refFromPrefix, toUidTarget, type EditOp,
} from '@/lib/editor/tree';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { IconChevronDown, IconChevronUp, IconTrash } from '@/components/ui/icons';
import { GhostShape } from './BlockView';
import { RepeatPicker } from './RepeatPicker';

/** 시트(panel 면) 위의 카드: 노치 홈 색 = panel */
const PREVIEW_SURFACE = { ['--notch-bg' as string]: 'var(--color-panel)' };

export function BlockMenu({
  uid, doc, onClose, onOp,
}: { uid: string | null; doc: Block[]; onClose: () => void; onOp: (op: EditOp) => void }) {
  const path = uid ? findPathByUid(doc, uid) : null;
  const block = path ? getBlock(doc, path) : null;

  // 다른 팀원이 그 카드를 지웠으면 메뉴를 닫는다
  useEffect(() => {
    if (uid && !block) onClose();
  }, [uid, block, onClose]);

  if (!uid || !path || !block) return <Sheet open={false} onClose={onClose} />;

  const ref = refFromPrefix(path.slice(0, -1));
  const list = getList(doc, ref) ?? [];
  const idx = path[path.length - 1];
  const inner = countBlocks([block]) - 1;
  const title = block.id === 'repeat' ? `반복 ${block.n}번` : BLOCKS[block.id].label;

  const moveTo = (index: number) => {
    const target = toUidTarget(doc, { ...ref, index });
    if (target && canDrop(doc, path, ref)) onOp({ type: 'move', uid, target });
  };

  return (
    <Sheet open onClose={onClose} title={title} size="sm">
      <div className="blk-compact mb-4 max-w-[300px] rounded-ctl bg-panel" style={PREVIEW_SURFACE}>
        <GhostShape id={block.id} n={block.id === 'repeat' ? block.n : undefined} />
      </div>
      {block.id === 'repeat' ? (
        <div className="mb-4">
          <p className="ui-label mb-2">몇 번 반복할까요?</p>
          <RepeatPicker
            value={block.n}
            onPick={(n) => {
              onOp({ type: 'setN', uid, n });
              onClose();
            }}
          />
        </div>
      ) : null}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" icon={<IconChevronUp />} disabled={idx <= 0} onClick={() => moveTo(idx - 1)}>
          위로 한 칸
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={<IconChevronDown />}
          disabled={idx >= list.length - 1}
          onClick={() => moveTo(idx + 2)}
        >
          아래로 한 칸
        </Button>
      </div>
      <Button
        variant="danger"
        size="lg"
        fullWidth
        icon={<IconTrash />}
        onClick={() => {
          onOp({ type: 'remove', uid });
          onClose();
        }}
      >
        {inner > 0 ? `삭제 (안의 카드 ${inner}장도 함께)` : '이 카드 삭제'}
      </Button>
    </Sheet>
  );
}
