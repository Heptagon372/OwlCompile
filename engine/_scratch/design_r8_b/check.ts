// R8 "고리 순찰" 단독 검사: npx tsx engine/_scratch/design_r8_b/check.ts [--full]
// docs/ROUNDS_8_10.md §3의 검사(구조·정답·함정·새 요소 필요성·함수 한계·결정성)를 이 라운드만 따로 구현한 실행판.
// checks.ts(verify-rounds.ts에 붙여 넣을 checksR8)와 검사 내용이 같다. ✓/✗ 줄마다 걸린 초를 찍고,
// 실패가 있거나 새 요소 필요성 탐색 합계가 60초를 넘으면 exit 1. --full이면 if_pit 없는 탐색(~20s)도 돌린다.
import type { Block, BlockId, GameMap, Outcome, Pos, Program, RunResult } from '../../types';
import { countBlocks, slotsOf } from '../../blocks';
import { toText } from '../../text';
import { containsBlock, validate } from '../../validate';
import { DELTA, checkMap, manhattan, parseMap, run, samePos } from '../../run';
import { score } from '../../score';
import { check, eq, type Check } from '../../verify-util';
import { catCycle, reachableActions, shortestProgram, type SearchSpec } from '../../verify-search';
import * as r8 from './r8';

// ---------------------------------------------------------------- verify-rounds.ts와 같은 헬퍼 (이름도 같게)

type Expect = { outcome: Outcome; ticks: number; mice: number; blocks: number; score: number };

/** ROUNDS_8_10 §1 표의 R8 줄. */
const TABLE8 = { name: '고리 순찰', difficulty: '매우 어려움', cap: 9, seconds: 720, intro: '고리를 도는 고양이' };

const ctxFor = (_n: number, _i: number) => ({ cap: r8.map.cap, firstSubmit: false, usedPatch: false });
const shape = (p: Program): string => JSON.stringify(p, (k, v) => (k === 'uid' ? undefined : v));
const countId = (list: Block[], id: BlockId): number =>
  list.reduce((s, b) => s + (b.id === id ? 1 : 0) + slotsOf(b).reduce((t, sl) => t + countId(sl, id), 0), 0);
const without = (list: Block[], id: BlockId): Block[] =>
  list.filter((b) => b.id !== id).map((b): Block => {
    switch (b.id) {
      case 'repeat': return { ...b, body: without(b.body, id) };
      case 'def': return { ...b, body: without(b.body, id) };
      case 'if_wall':
      case 'if_pit': return { ...b, then: without(b.then, id), else: without(b.else, id) };
      default: return b;
    }
  });
const tilesOf = (map: GameMap, ch: string): Pos[] => {
  const out: Pos[] = [];
  map.tiles.forEach((row, y) => row.split('').forEach((t, x) => { if (t === ch) out.push({ x, y }); }));
  return out;
};
const owlPath = (r: RunResult) => r.trace.map((s) => [s.owl.x, s.owl.y, s.owl.dir].join(','));
const summarize = (r: RunResult, n: number, i: number): Expect => ({
  outcome: r.outcome, ticks: r.ticks, mice: r.mice, blocks: r.blocks, score: score(r, ctxFor(n, i)).total,
});
const oneLine = (p: Program) => toText(p).text.replace(/\n\s*/g, ' / ');

function reachable(map: GameMap, doorIsWall: boolean): Set<string> {
  const pm = parseMap(map);
  const solid = (p: Pos) => { const t = pm.tileAt(p); return t === null || t === '#' || (t === 'D' && doorIsWall); };
  const landable = (p: Pos) => !solid(p) && pm.tileAt(p) !== 'O';
  const key = (p: Pos) => `${p.x},${p.y}`;
  const seen = new Set<string>([key(pm.start)]);
  const queue: Pos[] = [{ x: pm.start.x, y: pm.start.y }];
  while (queue.length) {
    const p = queue.shift() as Pos;
    for (const d of Object.values(DELTA)) {
      const a1 = { x: p.x + d.x, y: p.y + d.y };
      const a2 = { x: p.x + 2 * d.x, y: p.y + 2 * d.y };
      const next: Pos[] = [];
      if (landable(a1)) next.push(a1);
      if (!solid(a1) && landable(a2)) next.push(a2);
      for (const q of next) if (!seen.has(key(q))) { seen.add(key(q)); queue.push(q); }
    }
  }
  return seen;
}
function rivalBounds(map: GameMap, target: number): { minMice: number; maxBlocks: number }[] {
  const total = tilesOf(map, 'M').length;
  const out: { minMice: number; maxBlocks: number }[] = [];
  for (let m = 0; m <= total; m++) {
    const b = Math.min(map.cap, Math.floor(map.cap - (target - 100 - 20 * m) / 5));
    if (b >= 1) out.push({ minMice: m, maxBlocks: b });
  }
  return out;
}
function noRival(map: GameMap, target: number, spec: Omit<SearchSpec, 'maxBlocks' | 'minMice'>): { ok: boolean; detail: string } {
  const total = tilesOf(map, 'M').length;
  if (40 + 20 * total >= target) return { ok: false, detail: `미도착 최고점 ${40 + 20 * total} ≥ ${target}` };
  for (const b of rivalBounds(map, target)) {
    const found = shortestProgram(map, { ...spec, ...b });
    if (found) return { ok: false, detail: `쥐 ≥ ${b.minMice}, ${found.blocks}블록: ${oneLine(found.program)}` };
  }
  return { ok: true, detail: '' };
}

// ---------------------------------------------------------------- 검사 러너 (검사마다 초 기록)

type Timed = Check & { seconds: number; search?: boolean };
const results: Timed[] = [];
/** f가 만든 Check에 걸린 초를 붙인다. search=true인 검사는 "새 요소 필요성 탐색" 합계에 들어간다. */
const add = (f: () => Check, search = false) => {
  const t0 = performance.now();
  const c = f();
  results.push({ ...c, seconds: (performance.now() - t0) / 1000, search });
};

const { map, solutions, expect, naive, noSleep, sleepFirst } = r8;
const sol = solutions[0];
const target = expect[0].score;
const rep = run(map, sol);
const step = (): Block => ({ id: 'if_wall', then: [{ id: 'left' }], else: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] });
const walk = (n: number): Block => ({ id: 'repeat', n, body: [step()] });

// ---- 1. 구조 (§3-1)
add(() => eq('R8: map.round = 8', map.round as number, 8));
add(() => eq('R8: 라운드 표 고정값 (name·difficulty·cap·seconds·intro)',
  { name: map.name, difficulty: map.difficulty, cap: map.cap, seconds: map.seconds, intro: map.intro }, TABLE8));
add(() => eq('R8: checkMap 문제 없음 (8×8·S/G 각 1개·타일 문자·고양이 path)', checkMap(map), []));
add(() => check('R8: 열쇠 K 정확히 1개, 문 D 정확히 1개, 구덩이 있음',
  tilesOf(map, 'K').length === 1 && tilesOf(map, 'D').length === 1 && tilesOf(map, 'O').length > 0));
add(() => { const goal = tilesOf(map, 'G')[0]; return check('R8: 둥지 칸 ≠ 문 칸', tilesOf(map, 'D').every((d) => !samePos(d, goal))); });
add(() => eq('R8: 맵의 쥐 = 대표 정답이 먹는 쥐 (더 먹을 쥐가 없다)', tilesOf(map, 'M').length, expect[0].mice));
// 고양이: loop, 4~6칸, 'c' 칸·인접·닫힌 고리, c 타일 = path 칸, 틱 0에 path[0], 주기 = path 길이
add(() => {
  const cat = map.cat; const path = cat?.path ?? []; const cTiles = tilesOf(map, 'c');
  const onC = path.every((p) => map.tiles[p.y]?.[p.x] === 'c');
  const adjacent = path.every((p, i) => i === 0 || manhattan(path[i - 1], p) === 1);
  const closed = path.length > 1 && manhattan(path[path.length - 1], path[0]) === 1;
  const same = cTiles.length === path.length && cTiles.every((c) => path.some((p) => samePos(p, c)));
  return check(`R8: 고양이 loop, 고리 ${path.length}칸(4~6), 'c' 칸·인접·닫힌 고리, c 타일 = path 칸`,
    cat?.mode === 'loop' && path.length >= 4 && path.length <= 6 && onC && adjacent && closed && same);
});
add(() => eq('R8: 고양이 주기 4 = path (3,6)(4,6)(4,7)(3,7) 순환, trace[0].cat = path[0]',
  { cycle: catCycle(map), t0: rep.trace[0].cat },
  { cycle: [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 3, y: 7 }], t0: { x: 3, y: 6 } }));

// ---- 2. 정답 (§3-2)
add(() => check(`R8: solutions ${solutions.length}개 = expect ${expect.length}개 (≥1)`, solutions.length >= 1 && solutions.length === expect.length));
solutions.forEach((p, i) => {
  add(() => { const v = validate(p, map); return check(`R8 정답[${i}]: validate 통과`, v.ok, v.errors.join(', ')); });
  add(() => eq(`R8 정답[${i}]: 실행 결과 = expect (outcome·ticks·mice·blocks·score)`, summarize(run(map, p), 8, i), expect[i]));
  add(() => {
    const r = run(map, p); const lines = toText(p).lines;
    return check(`R8 정답[${i}]: trace 길이·Step.line이 실행 블록 줄을 가리킴`,
      r.ticks === r.trace.length - 1 && r.trace.slice(1).every((s) => s.line !== null && lines[s.line]?.blockId === s.block));
  });
  add(() => eq(`R8 정답[${i}] = 대표 정답과 같은 동작(매 틱 부엉이 상태 동일)`, owlPath(run(map, p)), owlPath(rep)));
});
add(() => check(`R8 대표 정답: 상한 이내(${countBlocks(sol)} ≤ ${map.cap}), goal, ${target}점 ≥ 140`,
  countBlocks(sol) <= map.cap && rep.outcome === 'goal' && target >= 140));
add(() => check('R8 대표 정답: 반복 2 { 잠자기 / 반복 9 { 한 걸음 } } — 잠자기 1개가 반복 몸통 맨 앞, 함수 없음, if_wall·if_pit 사용',
  shape(sol) === shape([{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, walk(9)] }])
  && countId(sol, 'sleep') === 1 && !containsBlock(sol, 'def') && containsBlock(sol, 'if_wall') && containsBlock(sol, 'if_pit')));
add(() => {
  const at = (ev: string) => rep.trace.find((s) => s.event === ev)?.tick ?? -1;
  const sleeps = rep.trace.filter((s) => s.block === 'sleep').map((s) => s.tick);
  return eq('R8 대표 정답: 잠자기 t1·t11, 열쇠 t10, 문 t19, 고리 진입 A(3,6) t6 · B(4,6) t15 (점프 착지)',
    { sleeps, key: at('key'), door: at('door'), a: rep.trace[6].owl, b: rep.trace[15].owl, jumps: [rep.trace[6].block, rep.trace[15].block] },
    { sleeps: [1, 11], key: 10, door: 19, a: { x: 3, y: 6, dir: 'E' }, b: { x: 4, y: 6, dir: 'S' }, jumps: ['jump', 'jump'] });
});

// ---- 3. 함정 (§3-3)
add(() => {
  const v = validate(naive.program, map); const r = run(map, naive.program);
  return check(`R8 naive: 조건·함수 없음, ${countBlocks(naive.program)}블록 > 상한 → E_CAP, 그래도 둥지 도착·정답과 같은 경로, note 있음`,
    !containsBlock(naive.program, 'if_wall') && !containsBlock(naive.program, 'if_pit') && !containsBlock(naive.program, 'def')
    && countBlocks(naive.program) > map.cap && v.codes.includes('E_CAP') && r.outcome === 'goal'
    && JSON.stringify(owlPath(r)) === JSON.stringify(owlPath(rep)) && naive.note.length > 0, `${v.codes} ${r.outcome}`);
});
add(() => eq('R8 noSleep = 정답[0]에서 잠자기만 뺀 것 (7블록)',
  { shape: shape(noSleep), blocks: countBlocks(noSleep) }, { shape: shape(without(sol, 'sleep')), blocks: 7 }));
add(() => {
  const d = run(map, noSleep); const last = d.trace[d.trace.length - 1];
  const zero = [false, true].every((firstSubmit) => [false, true].every((usedPatch) => score(d, { cap: map.cap, firstSubmit, usedPatch }).total === 0));
  return eq('R8 noSleep → 5틱째 A(3,6)에서 "고양이를 밟았다", dead, 0점',
    { outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], event: last.event, message: last.message, zero },
    { outcome: 'dead', ticks: 5, owl: [3, 6], event: 'cat', message: '고양이를 밟았다', zero: true });
});
add(() => {
  const d = run(map, sleepFirst); const last = d.trace[d.trace.length - 1];
  return eq('R8 sleepFirst(잠자기를 맨 앞에, 8블록) → 나가는 길은 살고 14틱째 B(4,6)에서 "고양이를 밟았다"',
    { blocks: countBlocks(sleepFirst), top: sleepFirst[0]?.id, outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], message: last.message, key: d.trace[10].keys },
    { blocks: 8, top: 'sleep', outcome: 'dead', ticks: 14, owl: [4, 6], message: '고양이를 밟았다', key: 1 });
});
add(() => {
  const after: Program = [{ id: 'repeat', n: 2, body: [walk(9), { id: 'sleep' }] }];
  const d = run(map, after);
  return eq('R8 함정: 반복 몸통 끝에 잠자기 → 5틱째 A(3,6)에서 "고양이를 밟았다"',
    { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y] }, { outcome: 'dead', ticks: 5, owl: [3, 6] });
});
add(() => {
  const two: Program = [{ id: 'sleep' }, { id: 'sleep' }, { id: 'repeat', n: 2, body: [walk(9)] }];
  const d = run(map, two); const last = d.trace[d.trace.length - 1];
  return eq('R8 함정: 잠자기 2개를 앞에 → 7틱째 A는 지나지만 9틱째 B(4,6)에서 "고양이에게 잡혔다"',
    { outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], message: last.message }, { outcome: 'dead', ticks: 9, owl: [4, 6], message: '고양이에게 잡혔다' });
});
add(() => {
  const turn: Program = [{ id: 'right' }, { id: 'repeat', n: 2, body: [walk(9)] }];
  const d = run(map, turn);
  return eq('R8 함정: R5식 회전 대기(우회전 → 한 걸음이 좌회전 2번으로 되돌림, +2틱)는 홀짝이 같아 9틱째 B(4,6)에서 잡힘',
    { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y] }, { outcome: 'dead', ticks: 9, owl: [4, 6] });
});
add(() => {
  const eight: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, walk(8)] }];
  const d = run(map, eight);
  return eq('R8 함정: 반복 8 → 둘째 묶음이 (5,7)에서 끝나 미도착(stuck), 70점',
    { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y], score: score(d, ctxFor(8, -1)).total }, { outcome: 'stuck', ticks: 18, owl: [5, 7], score: 70 });
});

// ---- 4. 새 요소 필요성 (§3-4) — 빠짐없는 탐색·BFS
const rotated = (r: number): GameMap => {
  const p = map.cat?.path ?? [];
  return { ...map, cat: { path: [...p.slice(r), ...p.slice(0, r)], mode: 'loop' } };
};
add(() => { const found = reachableActions(map, { minMice: 0, exclude: ['sleep'] });
  return check('R8 BFS: 잠자기 없이는 어떤 프로그램도 둥지에 못 간다 (모든 액션 열)', found === null, found ? found.join(',') : ''); }, true);
for (let r = 1; r <= 3; r++) {
  add(() => { const found = reachableActions(rotated(r), { minMice: 0, exclude: ['sleep'] });
    return check(`R8 BFS: 잠자기 ${r}개를 맨 앞에만 두면(고양이 출발 칸을 ${r}칸 돌린 맵) 그 뒤 잠자기 없이는 둥지 불가`, found === null, found ? found.join(',') : ''); }, true);
}
add(() => {
  const found = reachableActions(map, { minMice: 2 });
  // 찾은 열에는 잠자기가 2개 이상이고, 그중 하나는 첫 걸음 뒤(길 중간)에 있다.
  const mid = found !== null && found.some((a, i) => a === 'sleep' && found.slice(0, i).some((b) => b !== 'sleep'));
  return check('R8 BFS: 잠자기를 허용하면 쥐 2마리 + 둥지 가능 — 찾은 열의 잠자기 ≥ 2개, 하나는 길 중간',
    found !== null && found.filter((a) => a === 'sleep').length >= 2 && mid, found ? found.join(',') : 'null');
}, true);
add(() => {
  const calm: GameMap = { ...map, cat: undefined, tiles: map.tiles.map((row) => row.replace(/c/g, '.')) };
  return check('R8 BFS: 고양이를 치우면 잠자기 없이 쥐 2마리 + 둥지 가능 (잠자기가 필요한 이유 = 고양이)',
    reachableActions(calm, { minMice: 2, exclude: ['sleep'] }) !== null);
}, true);
add(() => {
  const pm = parseMap(map); const gk = `${pm.goal.x},${pm.goal.y}`; const k = tilesOf(map, 'K')[0]; const locked = reachable(map, true);
  return check('R8 BFS: 문을 벽으로 두면 둥지 도달 불가, 열쇠는 문 없이 주울 수 있음, 문을 열면 도달 가능',
    !locked.has(gk) && !!k && locked.has(`${k.x},${k.y}`) && reachable(map, false).has(gk));
}, true);
add(() => { const bare = noRival(map, target, { def: true, exclude: ['if_wall', 'if_pit'] });
  return check(`R8 탐색: 조건(if_wall·if_pit) 없이는 함수를 써도 상한 안에서 ${target}점 이상 불가`, bare.ok, bare.detail); }, true);
add(() => { const best = noRival(map, target + 5, { def: true });
  return check(`R8 탐색: 함수를 써도 상한 안에서 ${target}점보다 높은 프로그램 없음 → 대표 정답이 최고점`, best.ok, best.detail); }, true);
add(() => { const noWall = noRival(map, target, { def: true, exclude: ['if_wall'] });
  return check(`R8 탐색: if_wall 없이는(if_pit·함수 허용) 상한 안에서 ${target}점 이상 불가`, noWall.ok, noWall.detail); }, true);
// if_pit 없이도 145점 불가(같은 크기 8 탐색, ~20s). verify 전체 3분 예산(§3-6)을 아끼려 기본에서는 생략 — `--full`로 실행.
if (process.argv.includes('--full')) {
  add(() => { const noPit = noRival(map, target, { def: true, exclude: ['if_pit'] });
    return check(`R8 탐색(--full): if_pit 없이는(if_wall·함수 허용) 상한 안에서 ${target}점 이상 불가`, noPit.ok, noPit.detail); }, true);
}

// ---- 5. 함수 한계 (§3-5): 정답에 def가 없다. 같은 동작의 함수 꼴은 10블록이라 상한 9에 안 들어간다(E_CAP).
add(() => {
  const fn: Program = [{ id: 'def', body: [{ id: 'sleep' }, walk(9)] }, { id: 'call' }, { id: 'call' }];
  const v = validate(fn, map); const r = run(map, fn);
  return eq('R8 함수 한계: 정답에 def 없음. 함수 F { 잠자기 / 반복 9 { 한 걸음 } } / F 호출 / F 호출은 같은 20틱 경로지만 10블록 → E_CAP',
    { defs: solutions.map((p) => containsBlock(p, 'def')), blocks: countBlocks(fn), codes: v.codes, same: JSON.stringify(owlPath(r)) === JSON.stringify(owlPath(rep)) },
    { defs: solutions.map(() => false), blocks: 10, codes: ['E_CAP'], same: true });
});

// ---- 6. 결정성: 같은 입력 → 같은 trace·같은 탐색 결과
add(() => check('R8 결정성: 대표 정답·noSleep·sleepFirst를 두 번 실행해도 trace가 같다',
  [sol, noSleep, sleepFirst].every((p) => JSON.stringify(run(map, p).trace) === JSON.stringify(run(map, p).trace))));
add(() => check('R8 결정성: BFS(잠자기 허용)를 두 번 돌려도 같은 액션 열',
  JSON.stringify(reachableActions(map, { minMice: 2 })) === JSON.stringify(reachableActions(map, { minMice: 2 }))));

// ---------------------------------------------------------------- 출력
let failed = 0;
for (const c of results) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? '✓' : '✗'} [${c.seconds.toFixed(1)}s] ${c.name}${c.ok ? '' : `\n    ${c.detail ?? ''}`}`);
}
const total = results.reduce((s, c) => s + c.seconds, 0);
const searchSec = results.filter((c) => c.search).reduce((s, c) => s + c.seconds, 0);
console.log(`\n${results.length - failed}/${results.length} passed · 전체 ${total.toFixed(1)}s · 새 요소 필요성 탐색 ${searchSec.toFixed(1)}s (< 60s: ${searchSec < 60 ? 'ok' : 'NO'})`);
if (failed > 0 || searchSec >= 60) process.exit(1);
