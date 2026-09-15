'use client';
// 연결 지점: 스택의 맨 앞·블록 사이·맨 끝. 끄는 중 가장 가까운 "연결 가능" 지점에 파란 연결선 + 보라 외곽선 고스트 카드.
// 규칙상 안 되는 지점은 disabled라서 절대 강조되지 않는다. 빈 입은 "여기에 연결" 점선 칸.
import { useDroppable } from '@dnd-kit/core';
import { pointKey, refDepth, type DropPoint } from '@/lib/editor/tree';
import { GhostShape } from './BlockView';
import type { DropData } from './dnd';
import { useEditor } from './EditorContext';

/** 연결선: violet 2px + 끝점 원 (globals.css .drop-line, DESIGN_V3 §2) */
function DropLine() {
  return <div aria-hidden="true" className="drop-line" />;
}

export function DropSlot({
  point, empty = false, top = false, tail = false, indent = false,
}: {
  point: DropPoint;
  /** 빈 스택: "여기에 연결" 점선 칸 */
  empty?: boolean;
  /** 최상위 스택 (빈 프로그램 안내를 크게) */
  top?: boolean;
  /** 프로그램 맨 끝: 아래 빈 공간까지 연결 범위를 넓힌다 */
  tail?: boolean;
  /** 최상위: 줄 번호 거터 폭만큼 오른쪽에서 시작 (카드 열과 같은 왼쪽 선) */
  indent?: boolean;
}) {
  const { drag, validKeys, editable } = useEditor();
  const key = pointKey(point);
  const valid = !!drag && validKeys.has(key);
  const data: DropData = { kind: 'point', point, depth: refDepth(point) };
  const { setNodeRef, isOver } = useDroppable({ id: `pt:${key}`, data, disabled: !valid });
  const over = isOver && valid && !!drag;
  const ml = indent ? 'ml-[var(--gutter-w,0px)]' : '';

  // 고스트: 보라 외곽선 카드 (globals.css .ghost-outline)
  const ghost = over && drag ? (
    <div className="drop-ghost ghost-outline mt-1.5">
      <GhostShape id={drag.ghost.id} n={drag.ghost.n} />
    </div>
  ) : null;

  if (empty) {
    if (!editable) {
      return top ? (
        <p className={`drop-slot rounded-card border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-text-faint ${ml}`}>
          아직 연결한 카드가 없어요.
        </p>
      ) : null;
    }
    return (
      <div ref={setNodeRef} className={`drop-slot ${ml}`} data-drop={key}>
        {over ? (
          <div className="py-1">
            <DropLine />
            {ghost}
          </div>
        ) : (
          <div
            className={
              'grid place-items-center border border-dashed text-center font-semibold transition-colors duration-150 ' +
              (top ? 'min-h-28 rounded-card px-4 text-sm leading-relaxed ' : 'h-9 rounded-ctl text-[13px] ') +
              (valid ? 'border-violet-ink/70 bg-violet-soft text-violet-ink' : 'border-line-strong text-text-faint')
            }
          >
            {top ? (
              <span>
                여기에 연결
                <br />
                <span className="text-xs font-medium text-text-faint">아래 카드를 끌어오거나, 눌러서 맨 끝에 붙이세요</span>
              </span>
            ) : (
              '여기에 연결'
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className={`drop-slot relative ${ml} ${tail && !over && drag ? 'min-h-24' : ''}`} data-drop={key}>
      {over ? (
        <div className="py-1">
          <DropLine />
          {ghost}
        </div>
      ) : null}
    </div>
  );
}
