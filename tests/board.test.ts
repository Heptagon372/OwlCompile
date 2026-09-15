import { describe, expect, it } from 'vitest';
import { ENDING_MS, TICK_MS } from '@/lib/contracts';
import type { Dir, Step } from '@/lib/engine/types';
import {
  ENDING_MESSAGE_MS, MOVE_MS, TOAST_MS, catOnTop, endingStartMs, frameAt, playbackDurationMs, rotations, settleDelayMs,
} from '@/components/board/frame';
import {
  autoplayDelayMs, autoplayNextTeam, joinDisplay, nextRunningTeam, pickJoinUrls, rerunState,
} from '@/components/host/logic';
import { playKey } from '@/components/board/frame';
import { AUTO_SCROLL_BAND, autoScrollVelocity, isSlowTap } from '@/components/blocks/dnd';

describe('editor slow tap (TouchSensor fired after 150ms without moving)', () => {
  it('treats a barely-moved touch drag as a tap, not a drop', () => {
    const at = { x: 100, y: 700 };
    expect(isSlowTap('touchstart', at, { x: 103, y: 702 }, { x: 0, y: 0 })).toBe(true);
    expect(isSlowTap('touchstart', at, at, { x: 0, y: 0 })).toBe(true);
    // a real drag
    expect(isSlowTap('touchstart', at, { x: 100, y: 600 }, { x: 0, y: -100 })).toBe(false);
    // no pointer record: fall back to dnd-kit delta
    expect(isSlowTap('touchstart', null, null, { x: 2, y: 3 })).toBe(true);
    expect(isSlowTap('touchstart', null, null, { x: 0, y: 40 })).toBe(false);
    // mouse never activates without movement (PointerSensor distance 4): never a tap here
    expect(isSlowTap('pointerdown', at, at, { x: 0, y: 0 })).toBe(false);
  });
});
import { MAPS, ROUND_EXTRAS, SOLUTIONS, run } from '@/lib/engine';

function step(tick: number, dir: Dir = 'E', message: string | null = null): Step {
  return {
    tick, block: tick === 0 ? null : 'forward', line: tick === 0 ? null : tick - 1, path: null,
    owl: { x: tick, y: 0, dir }, cat: null, event: null, message, mice: 0, keys: 0, opened: [], eaten: [], taken: [],
  };
}

const trace = [step(0), step(1), step(2, 'E', '쥐 획득 +20'), step(3), step(4, 'E', '둥지 도착')];

describe('frameAt', () => {
  it('starts at the initial frame', () => {
    const f = frameAt(trace, 0);
    expect(f.index).toBe(0);
    expect(f.stage).toBe('playing');
    expect(f.toast).toBeNull();
  });

  it('advances one step per TICK_MS', () => {
    expect(frameAt(trace, TICK_MS - 1).index).toBe(0);
    expect(frameAt(trace, TICK_MS).index).toBe(1);
    expect(frameAt(trace, 3 * TICK_MS + 10).index).toBe(3);
  });

  it('shows a toast for a while once the owl has reached the step with a message', () => {
    const shown = 2 * TICK_MS + MOVE_MS;
    expect(frameAt(trace, shown - 1).toast).toBeNull();
    const f = frameAt(trace, shown + 50);
    expect(f.toast).toEqual({ message: '쥐 획득 +20', tick: 2 });
    expect(frameAt(trace, 3 * TICK_MS).toast?.message).toBe('쥐 획득 +20');
    expect(frameAt(trace, shown + TOAST_MS).toast?.message).not.toBe('쥐 획득 +20');
    expect(frameAt([step(0), step(1, 'E', 'x'), step(2), step(3), step(4)], TICK_MS + MOVE_MS + TOAST_MS).toast).toBeNull();
  });

  it('holds the last frame and runs the ending after the last move', () => {
    const lastAt = 4 * TICK_MS;
    expect(frameAt(trace, lastAt).stage).toBe('playing');
    expect(endingStartMs(trace)).toBe(lastAt + MOVE_MS);
    const e = frameAt(trace, lastAt + MOVE_MS + 10);
    expect(e.stage).toBe('ending');
    expect(e.atLast).toBe(true);
    expect(e.toast).toBeNull();
    expect(frameAt(trace, lastAt + MOVE_MS + ENDING_MESSAGE_MS).stage).toBe('done');
    expect(frameAt(trace, 10 * 60_000).index).toBe(4);
  });

  it('jumps straight to the last frame on refresh (Infinity)', () => {
    const f = frameAt(trace, Infinity);
    expect(f.index).toBe(4);
    expect(f.stage).toBe('done');
  });

  it('handles a compile-error trace with a single frame', () => {
    const single = [step(0)];
    expect(frameAt(single, 0).stage).toBe('ending');
    expect(frameAt(single, ENDING_MESSAGE_MS).stage).toBe('done');
    expect(playbackDurationMs(single)).toBe(ENDING_MS);
  });

  it('clamps negative and NaN time', () => {
    expect(frameAt(trace, -500).index).toBe(0);
    expect(frameAt(trace, Number.NaN).index).toBe(0);
  });

  it('matches the autoplay duration rule', () => {
    expect(playbackDurationMs(trace)).toBe(4 * TICK_MS + ENDING_MS);
  });
});

describe('rotations', () => {
  it('turns the short way', () => {
    const t = [step(0, 'N'), step(1, 'W'), step(2, 'S'), step(3, 'E'), step(4, 'N')];
    expect(rotations(t)).toEqual([0, -90, -180, -270, -360]);
  });
  it('turns right then left back', () => {
    const t = [step(0, 'E'), step(1, 'S'), step(2, 'E')];
    expect(rotations(t)).toEqual([90, 180, 90]);
  });
});

describe('real engine trace (R3 solution)', () => {
  it('plays to the goal in 20 ticks', () => {
    const map = MAPS[3];
    const res = run(map, SOLUTIONS.r3[0]);
    expect(res.outcome).toBe('goal');
    const f = frameAt(res.trace, Infinity);
    expect(f.index).toBe(res.ticks);
    expect(f.step.event).toBe('goal');
    expect(frameAt(res.trace, 5 * TICK_MS).step).toBe(res.trace[5]);
  });
});

describe('host autoplay helpers', () => {
  const results = [
    { teamId: 'b', runOrder: 2, ticks: 3, trace: null },
    { teamId: 'a', runOrder: 1, ticks: 10, trace: null },
    { teamId: 'c', runOrder: 3, ticks: 0, trace: null },
  ];
  it('computes ticks × TICK_MS + ENDING_MS + AUTOPLAY_GAP_MS', () => {
    expect(autoplayDelayMs(10)).toBe(10 * TICK_MS + ENDING_MS + 3000);
  });
  it('finds the next team by run order', () => {
    expect(nextRunningTeam(results, null)).toBe('a');
    expect(nextRunningTeam(results, 'a')).toBe('b');
    expect(nextRunningTeam(results, 'b')).toBe('c');
    expect(nextRunningTeam(results, 'c')).toBeNull();
  });

  it('autoplay does not replay teams already shown after a rerun', () => {
    // 순서 B1 A2 C3 D4, 네 팀 모두 보여 줌(shownUpTo 4) → A 재실행 뒤에는 멈춘다
    const order = [
      { teamId: 'B', runOrder: 1 }, { teamId: 'A', runOrder: 2 }, { teamId: 'C', runOrder: 3 }, { teamId: 'D', runOrder: 4 },
    ];
    expect(nextRunningTeam(order, 'A')).toBe('C'); // 수동 "다음 팀"은 그대로
    expect(autoplayNextTeam(order, 'A', 4)).toBeNull();
    // B·A까지만 봤을 때 A를 재실행하면 다음은 아직 안 본 C
    expect(autoplayNextTeam(order, 'A', 2)).toBe('C');
    // B만 보고 A 재실행(A가 아직 안 본 순서) → 그 다음 C
    expect(autoplayNextTeam(order, 'A', 1)).toBe('C');
    // 처음
    expect(autoplayNextTeam(order, null, 0)).toBe('B');
    expect(autoplayNextTeam(order, 'B', 1)).toBe('A');
  });
});

describe('rerun button state (host console)', () => {
  const firstRun = { usedPatch: false, scoreLines: [{ label: '미도착' }] };
  const granted = { usedPatch: true, scoreLines: [{ label: '미도착' }] }; // allowPatch가 used_patch=1로 바꾼 직후
  const rerun = { usedPatch: true, scoreLines: [{ label: '미도착' }, { label: '패치권 사용' }] };
  const team = (patchLeft: number, submittedAt: string | null) => ({ patchLeft, program: { submittedAt } });
  it('is hidden before a patch is allowed', () => {
    expect(rerunState('running', firstRun, team(1, 'x'))).toBe('hidden');
    expect(rerunState('running', null, team(0, null))).toBe('hidden');
  });
  it('shows (disabled) right after the patch is granted, enabled once the team resubmits', () => {
    expect(rerunState('running', granted, team(0, null))).toBe('waiting');
    expect(rerunState('running', granted, team(0, '2026-09-13T00:00:00Z'))).toBe('ready');
  });
  it('hides after the rerun and outside running', () => {
    expect(rerunState('running', rerun, team(0, '2026-09-13T00:00:00Z'))).toBe('hidden');
    expect(rerunState('scored', granted, team(0, 'x'))).toBe('hidden');
  });
});

describe('board play key', () => {
  it('does not restart on patch grant, restarts on rerun / reselect', () => {
    const before = playKey({ teamId: 't', round: 1, runSeq: 0 });
    // 패치 허용은 usedPatch만 바꾸고 runSeq는 그대로 → 같은 키
    expect(playKey({ teamId: 't', round: 1, runSeq: 0 })).toBe(before);
    // 재실행 결과가 같은 ticks·outcome이어도 runSeq가 올라가 다시 재생
    expect(playKey({ teamId: 't', round: 1, runSeq: 1 })).not.toBe(before);
  });
});

describe('editor auto-scroll', () => {
  const top = 100;
  const bottom = 500;
  it('scrolls only inside the top / bottom bands', () => {
    expect(autoScrollVelocity(300, top, bottom)).toBe(0);
    expect(autoScrollVelocity(bottom - 5, top, bottom)).toBeGreaterThan(0);
    expect(autoScrollVelocity(top + 5, top, bottom)).toBeLessThan(0);
    expect(autoScrollVelocity(bottom - AUTO_SCROLL_BAND - 1, top, bottom)).toBe(0);
  });
  it('keeps scrolling while the finger holds still in the band (pointer does not include scroll offset)', () => {
    // 손가락은 그대로, 영역만 스크롤된다: pointerCoordinates는 스크롤과 무관하므로 속도가 유지돼야 한다
    const fingerY = bottom - 10;
    let scrollTop = 0;
    for (let frame = 0; frame < 100; frame += 1) scrollTop += autoScrollVelocity(fingerY, top, bottom);
    expect(scrollTop).toBeGreaterThan(AUTO_SCROLL_BAND * 10);
  });
});

describe('items change after the owl glide (MOVE_MS), not at tick start', () => {
  const M = { x: 2, y: 0 };
  const K = { x: 3, y: 0 };
  const D = { x: 4, y: 0 };
  const s = (tick: number, extra: Partial<Step> = {}): Step => ({ ...step(tick), ...extra });
  const t2 = [
    s(0), s(1),
    s(2, { eaten: [M], mice: 1, event: 'mouse', message: '쥐 획득 +20' }),
    s(3, { eaten: [M], mice: 1, taken: [K], keys: 1, event: 'key' }),
    s(4, { eaten: [M], mice: 1, taken: [K], keys: 0, opened: [D], event: 'door' }),
  ];

  it('keeps the previous step items while the owl is still moving', () => {
    const moving = frameAt(t2, 2 * TICK_MS + 10);
    expect(moving.index).toBe(2);
    expect(moving.settled).toBe(false);
    expect(moving.items.eaten).toEqual([]);
    expect(moving.items.mice).toBe(0);
    // the toast waits for the owl too, so it appears together with the mouse disappearing
    expect(moving.toast).toBeNull();
    const landed = frameAt(t2, 2 * TICK_MS + MOVE_MS);
    expect(landed.settled).toBe(true);
    expect(landed.items.eaten).toEqual([M]);
    expect(landed.items.mice).toBe(1);
    expect(landed.toast?.message).toBe('쥐 획득 +20');
  });

  it('changes items and shows the toast at once when the owl stays in place', () => {
    // tick 2: 제자리에서 문을 연다 (부엉이 칸이 tick 1과 같다)
    const still: Step[] = [s(0), s(1), s(2, { owl: { x: 1, y: 0, dir: 'E' }, opened: [D], event: 'door', message: '문 열림' })];
    expect(settleDelayMs(still, 0)).toBe(0);
    expect(settleDelayMs(still, 1)).toBe(MOVE_MS);
    expect(settleDelayMs(still, 2)).toBe(0);
    const f = frameAt(still, 2 * TICK_MS + 1);
    expect(f.stage).toBe('playing');
    expect(f.settled).toBe(true);
    expect(f.items.opened).toEqual([D]);
    expect(f.toast?.message).toBe('문 열림');
  });

  it('applies to keys and doors too', () => {
    expect(frameAt(t2, 3 * TICK_MS + 1).items.taken).toEqual([]);
    expect(frameAt(t2, 3 * TICK_MS + MOVE_MS).items).toMatchObject({ taken: [K], keys: 1 });
    expect(frameAt(t2, 4 * TICK_MS + 1).items).toMatchObject({ opened: [], keys: 1 });
    expect(frameAt(t2, 4 * TICK_MS + MOVE_MS).items).toMatchObject({ opened: [D], keys: 0 });
  });

  it('is settled on the initial frame and on refresh (Infinity)', () => {
    expect(frameAt(t2, 0).settled).toBe(true);
    const end = frameAt(t2, Infinity);
    expect(end.settled).toBe(true);
    expect(end.items.opened).toEqual([D]);
  });

  it('settles before the ending starts', () => {
    const endStart = endingStartMs(t2);
    expect(frameAt(t2, endStart).settled).toBe(true);
    expect(frameAt(t2, endStart).stage).toBe('ending');
  });
});

describe('cat drawn above the owl on a cat death frame', () => {
  it('uses the cat event or a shared cell', () => {
    const base = step(5);
    expect(catOnTop({ ...base, cat: null })).toBe(false);
    expect(catOnTop({ ...base, cat: { x: 0, y: 3 } })).toBe(false);
    expect(catOnTop({ ...base, cat: { x: base.owl.x, y: base.owl.y } })).toBe(true);
    // 자리 바꾸기(서로 지나침)로 잡힌 경우: 칸은 달라도 event가 cat
    expect(catOnTop({ ...base, cat: { x: base.owl.x + 1, y: 0 }, event: 'cat' })).toBe(true);
  });

  it('matches the real R5 no-sleep death frame', () => {
    const res = run(MAPS[5], ROUND_EXTRAS.r5.noSleep);
    expect(res.outcome).toBe('dead');
    const last = res.trace[res.trace.length - 1];
    expect(catOnTop(last)).toBe(true);
    expect(res.trace.slice(0, -1).some((st) => catOnTop(st))).toBe(false);
  });
});

describe('join address helpers (host console / board lobby)', () => {
  it('uses the server candidates first, the browser origin only as a fallback', () => {
    const list = [
      { url: 'http://192.168.0.12:3000', kind: 'lan' as const },
      { url: 'http://100.101.2.3:3000', kind: 'vpn' as const },
    ];
    expect(pickJoinUrls(list, 'http://localhost:3000')).toEqual({ best: list[0], others: [list[1]] });
    expect(pickJoinUrls([], 'http://localhost:3000').best).toEqual({ url: 'http://localhost:3000', kind: 'local' });
    expect(pickJoinUrls(undefined, 'http://192.168.0.12:3000').best?.kind).toBe('lan');
    expect(pickJoinUrls(undefined, '')).toEqual({ best: null, others: [] });
  });
  it('shows http addresses without the scheme and adds /join', () => {
    expect(joinDisplay('http://192.168.0.12:3000')).toBe('192.168.0.12:3000/join');
    expect(joinDisplay('https://owl.example.com/')).toBe('https://owl.example.com/join');
  });
});
