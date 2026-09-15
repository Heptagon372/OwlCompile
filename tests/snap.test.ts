import { describe, expect, it } from 'vitest';
import { nearestPoint, SNAP_DISTANCE, type PointCandidate } from '@/components/blocks/dnd';

// 390px 폰: 스택 연결 지점은 x=15에서 시작한다
const slot = (id: string, top: number, left = 15, depth = 1): PointCandidate => ({
  id, rect: { left, top, bottom: top + 8 }, depth,
});

describe('nearestPoint (연결 지점 스냅)', () => {
  const pts = [slot('before', 100), slot('after', 152)];

  it('프로그램 영역 안이면 카드 왼쪽 모서리가 가로로 멀어도 세로로 맞는 틈에 스냅한다', () => {
    // 손가락은 가운데(x≈195), 카드 왼쪽 모서리 x=139 → 연결 지점 왼쪽(15)과 124px 차이
    expect(nearestPoint({ x: 139, y: 158 }, true, pts)).toBe('after');
    expect(nearestPoint({ x: 260, y: 104 }, true, pts)).toBe('before');
  });

  it('프로그램 영역 밖이면 가로·세로 합친 거리로 판정한다 (먼 곳에서는 스냅 안 함)', () => {
    expect(nearestPoint({ x: 139, y: 158 }, false, pts)).toBeNull();
    expect(nearestPoint({ x: 30, y: 158 }, false, pts)).toBe('after');
  });

  it('세로로 SNAP_DISTANCE보다 멀면 영역 안이어도 스냅하지 않는다', () => {
    expect(nearestPoint({ x: 15, y: 160 + SNAP_DISTANCE + 1 }, true, pts)).toBeNull();
  });

  it('같은 높이의 지점은 가로가 가까운 쪽(입 안쪽 vs 바깥)을 고른다', () => {
    const nested = [slot('outer', 200, 15, 1), slot('inner', 200, 47, 2)];
    expect(nearestPoint({ x: 50, y: 200 }, true, nested)).toBe('inner');
    expect(nearestPoint({ x: 12, y: 200 }, true, nested)).toBe('outer');
  });

  it('후보가 없으면 null', () => {
    expect(nearestPoint({ x: 0, y: 0 }, true, [])).toBeNull();
  });
});
