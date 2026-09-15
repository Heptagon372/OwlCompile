'use client';
// 연결 편집기의 dnd-kit 설정: 드래그/드롭 데이터 모양, 센서, "가장 가까운 연결 지점" 판정.
import {
  PointerSensor, TouchSensor, useSensor, useSensors,
  type CollisionDetection, type PointerSensorOptions,
} from '@dnd-kit/core';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BlockId } from '@/lib/engine/types';
import type { DropPoint } from '@/lib/editor/tree';

/** 끌리는 것: 팔레트 카드(새 블록) 또는 프로그램에 놓인 카드 */
export type DragData =
  | { kind: 'palette'; blockId: BlockId }
  | { kind: 'placed'; uid: string; blockId: BlockId };

/** 놓는 곳: 연결 지점 또는 삭제 구역(휴지통·팔레트) */
export type DropData =
  | { kind: 'point'; point: DropPoint; depth: number }
  | { kind: 'delete'; zone: 'trash' | 'palette' };

export const PALETTE_ID = (id: BlockId) => `pal:${id}`;
export const PLACED_ID = (uid: string) => `blk:${uid}`;

/** 프로그램 영역 위·아래 이 높이 안에 손가락이 있으면 자동 스크롤 */
export const AUTO_SCROLL_BAND = 56;
/** 한 프레임 최대 스크롤(px) */
export const AUTO_SCROLL_MAX = 16;

/**
 * 자동 스크롤 속도(px/프레임, 위로는 음수). y는 화면 기준 손가락 위치여야 한다
 * (dnd-kit collision args의 pointerCoordinates: 스크롤 보정이 섞이지 않은 값).
 * 영역이 스크롤돼도 손가락이 띠 안에 머물면 계속 같은 속도로 스크롤한다.
 */
export function autoScrollVelocity(y: number, top: number, bottom: number): number {
  if (y < top + AUTO_SCROLL_BAND && y > top - 80) {
    return -Math.min(AUTO_SCROLL_MAX, Math.ceil(((top + AUTO_SCROLL_BAND - y) / AUTO_SCROLL_BAND) * AUTO_SCROLL_MAX));
  }
  if (y > bottom - AUTO_SCROLL_BAND && y <= bottom) {
    return Math.min(AUTO_SCROLL_MAX, Math.ceil(((y - (bottom - AUTO_SCROLL_BAND)) / AUTO_SCROLL_BAND) * AUTO_SCROLL_MAX));
  }
  return 0;
}

/**
 * 마우스·펜 전용 PointerSensor. 터치는 TouchSensor(길게 누르기)가 맡아서
 * 손가락으로 쓸어 올리는 스크롤이 드래그로 바뀌지 않게 한다.
 */
export class MousePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

export function useEditorSensors() {
  return useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
}

/** 가까운 연결 지점으로 스냅하는 최대 거리(px) */
export const SNAP_DISTANCE = 72;
/**
 * 가로 거리 가중치: 순위를 매길 때 가로 차이는 이만큼만 센다.
 * 같은 높이의 지점(반복 입 맨 끝 vs 반복 다음)을 가르는 데만 쓰고, 세로가 맞으면 가로 때문에 놓치지 않게 한다.
 */
export const HORIZONTAL_WEIGHT = 0.35;

export interface PointCandidate {
  id: string | number;
  rect: { left: number; top: number; bottom: number };
  depth: number;
}

/**
 * 가장 가까운 연결 지점 고르기 (순수 함수).
 * - anchor: 끌리는 카드의 왼쪽 위 모서리
 * - pointerInside: 손가락(포인터)이 프로그램 영역 안인지. 안이면 세로 거리만으로 스냅 범위를 판정한다
 *   (폰 폭 프로그램 어디에 놓아도 그 줄 사이 틈에 연결되게). 밖이면 가로·세로 합친 거리로 판정한다.
 * - 순위: 세로 거리 + 가로 거리×HORIZONTAL_WEIGHT, 거의 같으면 더 깊은(안쪽) 지점.
 */
export function nearestPoint(
  anchor: { x: number; y: number },
  pointerInside: boolean,
  candidates: readonly PointCandidate[],
): string | number | null {
  let bestId: string | number | null = null;
  let bestScore = Infinity;
  let bestDepth = -1;
  for (const c of candidates) {
    const r = c.rect;
    const dy = anchor.y < r.top ? r.top - anchor.y : anchor.y > r.bottom ? anchor.y - r.bottom : 0;
    const dx = Math.abs(anchor.x - r.left);
    const reach = pointerInside ? dy : Math.hypot(dx, dy);
    if (reach > SNAP_DISTANCE) continue;
    const score = Math.hypot(dx * HORIZONTAL_WEIGHT, dy);
    if (score < bestScore - 0.5 || (Math.abs(score - bestScore) <= 0.5 && c.depth > bestDepth)) {
      bestScore = score;
      bestId = c.id;
      bestDepth = c.depth;
    }
  }
  return bestId;
}

/** 이보다 덜 움직인 터치 드래그는 탭으로 본다 (TouchSensor tolerance와 같은 값) */
export const TAP_SLOP = 8;

/**
 * 느린 탭 판정: TouchSensor는 150ms 동안 가만히 누르고 있으면 움직이지 않아도 드래그를 시작한다.
 * 그런 "드래그"가 거의 움직이지 않고 끝나면 드롭이 아니라 탭(팔레트=맨 끝에 연결, 놓인 카드=메뉴)으로 처리한다.
 * start·end는 손가락 좌표(스크롤 보정 없음). 없으면 dnd-kit의 delta로 판단한다.
 */
export function isSlowTap(
  activatorType: string,
  start: { x: number; y: number } | null,
  end: { x: number; y: number } | null,
  delta: { x: number; y: number },
): boolean {
  if (!activatorType.startsWith('touch')) return false;
  const moved = start && end ? Math.hypot(end.x - start.x, end.y - start.y) : Math.hypot(delta.x, delta.y);
  return moved < TAP_SLOP;
}

/**
 * 충돌 판정:
 * 1) 손가락(포인터)이 삭제 구역 안이면 삭제 구역
 * 2) 아니면 끌리는 카드의 왼쪽 위 모서리에서 가장 가까운 "연결 가능" 지점 (nearestPoint).
 *    손가락이 프로그램 영역 안이면 세로 거리만으로 스냅 범위를 보므로, 폰 폭 어디에 놓아도 가장 가까운 틈에 연결된다.
 * 규칙상 안 되는 지점은 useDroppable({disabled})로 빠지고, data에도 없으면 무시한다.
 * 연결 지점 위치는 매번 DOM에서 새로 잰다(자동 스크롤·고스트로 자리가 바뀌어도 정확하게).
 */
export function makeCollision(getViewport: () => DOMRect | null): CollisionDetection {
  return ({ droppableContainers, collisionRect, pointerCoordinates }) => {
    if (pointerCoordinates) {
      for (const c of droppableContainers) {
        const d = c.data.current as DropData | undefined;
        if (d?.kind !== 'delete' || c.disabled) continue;
        const r = c.node.current?.getBoundingClientRect();
        if (!r) continue;
        const { x, y } = pointerCoordinates;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return [{ id: c.id }];
      }
    }
    const vp = getViewport();
    const p = pointerCoordinates;
    const pointerInside = !!(vp && p && p.x >= vp.left && p.x <= vp.right && p.y >= vp.top && p.y <= vp.bottom);
    const candidates: PointCandidate[] = [];
    for (const c of droppableContainers) {
      const d = c.data.current as DropData | undefined;
      if (d?.kind !== 'point' || c.disabled) continue;
      const r = c.node.current?.getBoundingClientRect();
      if (!r) continue;
      if (vp && (r.bottom < vp.top - 2 || r.top > vp.bottom + 2)) continue; // 스크롤 밖
      candidates.push({ id: c.id, rect: r, depth: d.depth });
    }
    const bestId = nearestPoint({ x: collisionRect.left, y: collisionRect.top }, pointerInside, candidates);
    return bestId !== null ? [{ id: bestId }] : [];
  };
}

/** 드래그 중 페이지 스크롤·텍스트 선택·iOS 길게 누르기 메뉴를 막는다 (globals.css의 body.owl-dragging) */
export function setDraggingBody(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('owl-dragging', on);
  document.documentElement.classList.toggle('owl-dragging', on);
}
