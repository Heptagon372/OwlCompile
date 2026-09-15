// 보드 v4 (DESIGN_V4 §6 /board, FEATURE_V4 §2·§4): 10팀 배치 계산, Step.path → 파이썬 줄 강조, 보드 번들에 정답이 없음.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICK_MS, type TeamPersonView } from '@/lib/contracts';
import { lineOfPath, toPython } from '@/lib/codegen';
import { MAPS, ROUND_EXTRAS, SOLUTIONS, run } from '@/lib/engine';
import type { Program, Step } from '@/lib/engine/types';
import { pathKey } from '@/lib/engine/text';
import { frameAt } from '@/components/board/frame';
import {
  lobbyGridCols, onlineCount, pillGridCols, rankHighlightIds, rankLayout, rankShift, rankSlot, ringMax, roundCaption, signed, timerTone,
} from '@/components/board/layout';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('board layout for up to 10 teams', () => {
  it('lobby grid: one row up to 5 teams, two rows from 6', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map(lobbyGridCols)).toEqual([2, 3, 4, 5, 3, 4, 4, 5, 5]);
    for (let n = 2; n <= 10; n++) expect(Math.ceil(n / lobbyGridCols(n))).toBeLessThanOrEqual(2);
  });

  it('coding pills: one column up to 5 teams, two from 6', () => {
    expect([2, 5, 6, 10].map(pillGridCols)).toEqual([1, 1, 2, 2]);
  });

  it('ranking cards: 1 column up to 5, 2 columns (column-major) from 6', () => {
    expect(rankLayout(4)).toEqual({ cols: 1, perCol: 4 });
    expect(rankLayout(5)).toEqual({ cols: 1, perCol: 5 });
    expect(rankLayout(7)).toEqual({ cols: 2, perCol: 4 });
    expect(rankLayout(10)).toEqual({ cols: 2, perCol: 5 });
    const ten = rankLayout(10);
    expect(rankSlot(0, ten)).toEqual({ col: 0, row: 0 });
    expect(rankSlot(4, ten)).toEqual({ col: 0, row: 4 });
    expect(rankSlot(5, ten)).toEqual({ col: 1, row: 0 });
    expect(rankSlot(9, ten)).toEqual({ col: 1, row: 4 });
    for (let n = 2; n <= 10; n++) {
      const l = rankLayout(n);
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        const s = rankSlot(i, l);
        expect(s.col).toBeLessThan(l.cols);
        expect(s.row).toBeLessThan(l.perCol);
        seen.add(`${s.col},${s.row}`);
      }
      expect(seen.size).toBe(n);
    }
  });

  it('rank move starts from the previous slot in slot units', () => {
    const ten = rankLayout(10);
    expect(rankShift(7, 2, ten)).toEqual({ dx: 1, dy: 0 }); // 8위 → 3위: 오른쪽 열에서 왼쪽 열로
    expect(rankShift(0, 9, ten)).toEqual({ dx: -1, dy: -4 });
    expect(rankShift(3, 3, ten)).toEqual({ dx: 0, dy: 0 });
    expect(rankShift(3, 0, rankLayout(4))).toEqual({ dx: 0, dy: 3 });
  });

  it('rank highlight: every tied first place, none when all teams tie', () => {
    const rows = (...ranks: number[]) => ranks.map((rank, i) => ({ teamId: `t${i}`, rank }));
    expect([...rankHighlightIds(rows(1, 2, 3))]).toEqual(['t0']);
    expect([...rankHighlightIds(rows(1, 1, 3, 4))]).toEqual(['t0', 't1']);
    expect(rankHighlightIds(rows(1, 1, 1, 1, 1, 1, 1, 1, 1, 1)).size).toBe(0);
    expect(rankHighlightIds([]).size).toBe(0);
  });

  it('timer ring tone and max', () => {
    expect(timerTone(null, false)).toBe('violet');
    expect(timerTone(31, false)).toBe('violet');
    expect(timerTone(30, false)).toBe('danger');
    expect(timerTone(10, true)).toBe('warn');
    expect(ringMax(null, 300)).toBe(300);
    expect(ringMax(360, 300)).toBe(360);
    expect(ringMax(null, 0)).toBe(1);
  });

  it('round label shows index/total inside the selected rounds', () => {
    expect(roundCaption([1, 2, 4, 5, 6], 4)).toEqual({ short: 'R4', step: '3/5 · 난이도 4', label: 'R4 · 3/5 · 난이도 4' });
    expect(roundCaption([1, 2, 3, 4, 5, 6, 7], 7).step).toBe('7/7 · 난이도 7');
    expect(roundCaption([4, 5, 6, 7], 4).label).toBe('R4 · 1/4 · 난이도 4');
  });

  it('counts online people once even with several roles', () => {
    const p = (online: boolean, roles: TeamPersonView['roles']): TeamPersonView => ({ userId: String(Math.random()), displayName: 'x', roles, online, memberIds: {} });
    expect(onlineCount({ people: [p(true, ['runner', 'turner']), p(false, ['controller']), p(true, ['architect'])] })).toBe(2);
    expect(onlineCount({ people: [] })).toBe(0);
  });

  it('signs round points', () => {
    expect([12, 0, -5].map(signed)).toEqual(['+12', '0', '-5']);
  });
});

/** trace 의 모든 액션 스텝이 파이썬 줄 하나를 가리키고, 그 줄의 path 가 스텝의 path 와 같다 */
function expectPathLines(program: Program, trace: readonly Step[]) {
  const listing = toPython(program);
  expect(lineOfPath(listing, trace[0].path)).toBe(-1); // 틱 0 = 초기 프레임, 강조 없음
  for (const s of trace.slice(1)) {
    if (!s.path) continue;
    const i = lineOfPath(listing, s.path);
    expect(i, `tick ${s.tick} path ${pathKey(s.path)}`).toBeGreaterThanOrEqual(0);
    expect(listing.lines[i].path && pathKey(listing.lines[i].path!)).toBe(pathKey(s.path));
  }
}

describe('running screen highlights the current Python line by Step.path (lib/codegen map)', () => {
  it('R3 SOLUTIONS.r3[0]: goal in 20 ticks with 2 mice, every tick maps to a line', () => {
    const program = SOLUTIONS.r3[0];
    const res = run(MAPS[3], program);
    expect(res.outcome).toBe('goal');
    expect(res.ticks).toBe(20);
    expect(res.mice).toBe(2);
    expectPathLines(program, res.trace);
    // 600 ms 틱: 스텝 k 는 k × TICK_MS 에 그 줄을 강조한다
    const listing = toPython(program);
    for (const k of [1, 5, 20]) {
      const f = frameAt(res.trace, k * TICK_MS);
      expect(f.step).toBe(res.trace[k]);
      expect(lineOfPath(listing, f.step.path)).toBe(lineOfPath(listing, res.trace[k].path));
    }
    // 새로고침 복원: 마지막 프레임을 유지하고 마지막 액션 줄을 강조한다
    const end = frameAt(res.trace, Infinity);
    expect(end.stage).toBe('done');
    expect(end.step).toBe(res.trace[res.trace.length - 1]);
    expect(lineOfPath(listing, end.step.path)).toBeGreaterThanOrEqual(0);
  });

  it('R5 noSleep dies at tick 18 at (7,4); patched solutions[0] reaches the goal in 37 ticks', () => {
    const dead = run(MAPS[5], ROUND_EXTRAS.r5.noSleep);
    expect(dead.outcome).toBe('dead');
    expect(dead.ticks).toBe(18);
    expect({ x: dead.owl.x, y: dead.owl.y }).toEqual({ x: 7, y: 4 });
    expectPathLines(ROUND_EXTRAS.r5.noSleep, dead.trace);
    const ok = run(MAPS[5], SOLUTIONS.r5[0]);
    expect(ok.outcome).toBe('goal');
    expect(ok.ticks).toBe(37);
    expectPathLines(SOLUTIONS.r5[0], ok.trace);
  });

  it('every round solution (R1–R7, incl. def/call) maps each executed step to its Python line', () => {
    for (const [key, programs] of Object.entries(SOLUTIONS)) {
      const round = Number(key.replace(/\D/g, ''));
      const map = (MAPS as Record<number, (typeof MAPS)[keyof typeof MAPS]>)[round];
      expect(map, key).toBeTruthy();
      for (const program of programs as Program[]) expectPathLines(program, run(map, program).trace);
    }
  });
});

/* ---------- 보드 클라이언트 번들: 정답·시뮬레이터·서버 모듈이 들어가지 않는다 ---------- */

const FORBIDDEN: RegExp[] = [
  /^lib\/engine\/index\.ts$/, // SOLUTIONS·ROUND_EXTRAS 를 다시 내보낸다
  /^lib\/engine\/solutions\.ts$/,
  /^lib\/engine\/rounds\//,
  /^lib\/engine\/run\.ts$/, // 시뮬레이터 (보드는 서버 trace 만 그린다)
  /^lib\/engine\/verify/,
  /^lib\/server\//,
];

// 값 import / re-export / 부수 효과 import (import type · export type 는 번들에 남지 않아 뺀다)
const IMPORT_RE = /^\s*(?:import|export)\s+(?!type\b)(?:[^;()=]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null; // 패키지
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function reachable(entries: string[]): Map<string, string> {
  const via = new Map<string, string>();
  const stack: [file: string, parent: string][] = entries.map((e) => [e, '(entry)']);
  while (stack.length) {
    const [file, parent] = stack.pop()!;
    if (via.has(file)) continue;
    via.set(file, parent);
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1]);
      if (target && !via.has(target)) stack.push([target, file]);
    }
  }
  return via;
}

describe('board client bundle stays answer-free and simulator-free', () => {
  it('no module reachable from components/board is an answer, simulator or server module', () => {
    const dir = join(ROOT, 'components', 'board');
    const entries = readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => join(dir, f));
    const via = reachable(entries);
    const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');
    const bad = [...via.entries()]
      .filter(([f]) => FORBIDDEN.some((re) => re.test(rel(f))))
      .map(([f, parent]) => `${rel(f)} <- ${parent === '(entry)' ? parent : rel(parent)}`);
    expect(bad).toEqual([]);
    // 코드 뷰·줄 지도는 실제로 들어간다 (강조가 lib/codegen 기준)
    expect([...via.keys()].map(rel)).toEqual(expect.arrayContaining(['lib/codegen/index.ts', 'components/code/CodeView.tsx']));
  });
});
