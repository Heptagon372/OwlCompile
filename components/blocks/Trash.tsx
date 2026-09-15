'use client';
// 휴지통: 놓인 카드를 끄는 동안 화면 아래(안전 영역 위)에 떠 있는 유리 알약 (DESIGN_V4 §3: 짙은 유리 + danger 외곽선).
// 여기에 놓으면 삭제.
import { useDroppable } from '@dnd-kit/core';
import { IconTrash } from '@/components/ui/icons';
import type { DropData } from './dnd';

const DATA: DropData = { kind: 'delete', zone: 'trash' };

export function Trash({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'zone:trash', data: DATA, disabled: !visible });
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-[var(--shell-rail,0px)]"
    >
      <div
        ref={setNodeRef}
        aria-live="polite"
        className={
          'glass glass-sheet pointer-events-auto relative flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-full border-2 text-[15px] font-semibold text-danger shadow-float transition-[border-color,background-color] duration-150 ' +
          // 위에 올리면 면이 장밋빛으로 물든다. 라이트는 흰 유리라 10%만 (22%면 danger 글자가 3.9:1 로 4.5:1 아래, tests/playLight.test.ts)
          (isOver
            ? 'border-solid border-danger [--glass-fill:color-mix(in_srgb,var(--color-danger)_22%,var(--glass-sheet-fill))] ' +
              '[:root[data-theme=light]_&]:[--glass-fill:color-mix(in_srgb,var(--color-danger)_10%,var(--glass-sheet-fill))]'
            : 'border-dashed border-danger/70')
        }
      >
        <IconTrash size={20} />
        {isOver ? '놓으면 삭제돼요' : '여기에 놓으면 삭제'}
      </div>
    </div>
  );
}
