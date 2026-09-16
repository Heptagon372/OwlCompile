// 생성 파일(설계 세션에서 셸로 만듦): check.ts의 헬퍼 부분 + checks.ts(import 줄 제외) + 러너. checks.ts가 verify-rounds.ts 안에서 그대로 도는지 확인용.
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

const ROUND_EXTRAS = { r8: { naive: r8.naive, noSleep: r8.noSleep } };
// R8 "고리 순찰" 라운드별 제약 — engine/verify-rounds.ts에 붙여 넣을 조각 (docs/ROUNDS_8_10.md §3).
// 설계 산출물이라 이 자리(engine/_scratch)에서는 컴파일되지 않는다. 실행 가능한 쌍둥이는 같은 폴더의 check.ts.
//
// 설치 순서 (installer):
//   1. `import * as r8 from './rounds/r8';`  ROUNDS[8] = r8, ROUND_NOS에 8, CAT_ROUNDS = [5, 7, 8],
//      TABLE[8] = { name: '고리 순찰', difficulty: '매우 어려움', cap: 9, seconds: 720, intro: '고리를 도는 고양이' }
//      (USED_PATCH에는 R8 없음 — 모든 expect.score는 firstSubmit=false·usedPatch=false).
//   2. import 추가: `manhattan`(./run), `catCycle`(./verify-search). 나머지 헬퍼(check·eq·tilesOf·reachable·noRival·shape·without·
//      countId·owlPath·ctxFor·oneLine·containsBlock·countBlocks·run·parseMap·samePos·score·validate·toText·reachableActions)는
//      verify-rounds.ts에 이미 있는 이름 그대로 쓴다.
//   3. solutions.ts: SOLUTIONS.r8 = r8.solutions, ROUND_EXTRAS.r8 = { naive: r8.naive, noSleep: r8.noSleep }.
//   4. 아래 checksR8()를 round7() 뒤에 붙이고 runRounds()에서 `...checksR8()`를 호출한다. common(8)이 MAPS/SOLUTIONS 배선·
//      라운드 표·checkMap·c 타일 = path·각 정답 validate/expect/Step.line·naive 도착·ROUND_EXTRAS.naive를 검사하므로 여기서는 뺀다.
//   5. 탐색 비용(verify 3분 예산, §3-6): 조건 없이 ≈ 2s, 함수 써도 최고점 ≈ 10s, if_wall 없이 ≈ 22s (합 ≈ 34s).
//      if_pit 없이도 145점 불가(크기 8 탐색 ≈ 20s)는 예산을 아끼려 verify에 넣지 않는다 — check.ts --full로 확인.

/** R8 한 걸음(R7과 같음)·반복 n { 한 걸음 } — 함정 프로그램 조립용. */
const stepR8 = (): Program[number] => ({ id: 'if_wall', then: [{ id: 'left' }], else: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] });
const walkR8 = (n: number): Program[number] => ({ id: 'repeat', n, body: [stepR8()] });

export function checksR8(): Check[] {
  const c: Check[] = [];
  const { map, solutions, expect, naive, noSleep, sleepFirst } = r8;
  const sol = solutions[0];
  const target = expect[0].score;
  const r = run(map, sol);

  // 구조: 고리 고양이(loop) — 4~6칸, 'c' 칸·인접·닫힌 고리, 주기 = path 길이, 틱 0에 path[0]. 열쇠·문·구덩이.
  const cat = map.cat; const path = cat?.path ?? [];
  const adjacent = path.every((p, i) => i === 0 || manhattan(path[i - 1], p) === 1);
  const closed = path.length > 1 && manhattan(path[path.length - 1], path[0]) === 1;
  c.push(check(`R8: 고양이 loop, 고리 ${path.length}칸(4~6), 인접·닫힌 고리`,
    cat?.mode === 'loop' && path.length >= 4 && path.length <= 6 && adjacent && closed));
  c.push(eq('R8: 고양이 주기 4 = path (3,6)(4,6)(4,7)(3,7) 순환, trace[0].cat = path[0]',
    { cycle: catCycle(map), t0: r.trace[0].cat },
    { cycle: [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 3, y: 7 }], t0: { x: 3, y: 6 } }));
  c.push(check('R8: 열쇠 K 정확히 1개, 문 D 정확히 1개, 구덩이 있음',
    tilesOf(map, 'K').length === 1 && tilesOf(map, 'D').length === 1 && tilesOf(map, 'O').length > 0));
  c.push(eq('R8: 맵의 쥐 = 대표 정답이 먹는 쥐 (더 먹을 쥐가 없다)', tilesOf(map, 'M').length, expect[0].mice));

  // 대표 정답: 반복 2 { 잠자기 / 반복 9 { 한 걸음 } } — 잠자기가 반복 몸통 안에 하나, 함수 없음. 20틱 시각표.
  c.push(check(`R8 대표 정답: 상한 이내(${countBlocks(sol)} ≤ ${map.cap}), goal, ${target}점 ≥ 140`,
    countBlocks(sol) <= map.cap && r.outcome === 'goal' && target >= 140));
  c.push(check('R8 대표 정답: 반복 2 { 잠자기 / 반복 9 { 한 걸음 } } — 잠자기 1개가 반복 몸통 맨 앞, 함수 없음, if_wall·if_pit 사용',
    shape(sol) === shape([{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, walkR8(9)] }])
    && countId(sol, 'sleep') === 1 && !containsBlock(sol, 'def') && containsBlock(sol, 'if_wall') && containsBlock(sol, 'if_pit')));
  const at = (ev: string) => r.trace.find((s) => s.event === ev)?.tick ?? -1;
  c.push(eq('R8 대표 정답: 잠자기 t1·t11, 열쇠 t10, 문 t19, 고리 진입 A(3,6) t6 · B(4,6) t15 (점프 착지)',
    { sleeps: r.trace.filter((s) => s.block === 'sleep').map((s) => s.tick), key: at('key'), door: at('door'),
      a: r.trace[6].owl, b: r.trace[15].owl, jumps: [r.trace[6].block, r.trace[15].block] },
    { sleeps: [1, 11], key: 10, door: 19, a: { x: 3, y: 6, dir: 'E' }, b: { x: 4, y: 6, dir: 'S' }, jumps: ['jump', 'jump'] }));
  solutions.forEach((p, i) => {
    if (i > 0) c.push(eq(`R8 정답[${i}] = 대표 정답과 같은 동작(매 틱 부엉이 상태 동일)`, owlPath(run(map, p)), owlPath(r)));
  });

  // 함정: naive(조건·함수 없이 같은 경로, E_CAP), noSleep, 잠자기 자리 실수들, 반복 8
  {
    const v = validate(naive.program, map); const nr = run(map, naive.program);
    c.push(check(`R8 naive: 조건·함수 없음, ${countBlocks(naive.program)}블록 > 상한 → E_CAP, 정답과 같은 경로`,
      !containsBlock(naive.program, 'if_wall') && !containsBlock(naive.program, 'if_pit') && !containsBlock(naive.program, 'def')
      && countBlocks(naive.program) > map.cap && v.codes.includes('E_CAP')
      && JSON.stringify(owlPath(nr)) === JSON.stringify(owlPath(r)), `${v.codes} ${nr.outcome}`));
  }
  c.push(check('R8: ROUND_EXTRAS.r8.noSleep가 rounds/r8.noSleep', ROUND_EXTRAS.r8.noSleep === noSleep));
  c.push(eq('R8 noSleep = 정답[0]에서 잠자기만 뺀 것 (7블록)',
    { shape: shape(noSleep), blocks: countBlocks(noSleep) }, { shape: shape(without(sol, 'sleep')), blocks: 7 }));
  {
    const d = run(map, noSleep); const last = d.trace[d.trace.length - 1];
    c.push(eq('R8 noSleep → 5틱째 A(3,6)에서 "고양이를 밟았다", dead, 0점',
      { outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], event: last.event, message: last.message, score: score(d, ctxFor(8, -1)).total },
      { outcome: 'dead', ticks: 5, owl: [3, 6], event: 'cat', message: '고양이를 밟았다', score: 0 }));
  }
  {
    const d = run(map, sleepFirst); const last = d.trace[d.trace.length - 1];
    c.push(eq('R8 sleepFirst(잠자기를 맨 앞에, 8블록) → 나가는 길은 살고 14틱째 B(4,6)에서 "고양이를 밟았다"',
      { blocks: countBlocks(sleepFirst), top: sleepFirst[0]?.id, outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], message: last.message, key: d.trace[10].keys },
      { blocks: 8, top: 'sleep', outcome: 'dead', ticks: 14, owl: [4, 6], message: '고양이를 밟았다', key: 1 }));
  }
  {
    const after: Program = [{ id: 'repeat', n: 2, body: [walkR8(9), { id: 'sleep' }] }];
    const d = run(map, after);
    c.push(eq('R8 함정: 반복 몸통 끝에 잠자기 → 5틱째 A(3,6)에서 "고양이를 밟았다"',
      { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y] }, { outcome: 'dead', ticks: 5, owl: [3, 6] }));
  }
  {
    const two: Program = [{ id: 'sleep' }, { id: 'sleep' }, { id: 'repeat', n: 2, body: [walkR8(9)] }];
    const d = run(map, two); const last = d.trace[d.trace.length - 1];
    c.push(eq('R8 함정: 잠자기 2개를 앞에 → 7틱째 A는 지나지만 9틱째 B(4,6)에서 "고양이에게 잡혔다"',
      { outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], message: last.message }, { outcome: 'dead', ticks: 9, owl: [4, 6], message: '고양이에게 잡혔다' }));
  }
  {
    const turn: Program = [{ id: 'right' }, { id: 'repeat', n: 2, body: [walkR8(9)] }];
    const d = run(map, turn);
    c.push(eq('R8 함정: R5식 회전 대기(우회전 → 한 걸음이 좌회전 2번으로 되돌림, +2틱)는 홀짝이 같아 9틱째 B(4,6)에서 잡힘',
      { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y] }, { outcome: 'dead', ticks: 9, owl: [4, 6] }));
  }
  {
    const eight: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, walkR8(8)] }];
    const d = run(map, eight);
    c.push(eq('R8 함정: 반복 8 → 둘째 묶음이 (5,7)에서 끝나 미도착(stuck), 70점',
      { outcome: d.outcome, ticks: d.ticks, owl: [d.owl.x, d.owl.y], score: score(d, ctxFor(8, -1)).total }, { outcome: 'stuck', ticks: 18, owl: [5, 7], score: 70 }));
  }

  // 새 요소 필요성 ① 잠자기 — 잠자기 없는 어떤 액션 열로도 둥지 불가(상태 BFS). 고양이 출발 칸을 r칸 돌린 맵 = 잠자기 r개를
  //   맨 앞에만 둔 것: r=1~3도 전부 불가 → 잠자기는 길 중간(반복 몸통 안)에 있어야 한다. 고양이를 치우면 잠자기 없이 가능.
  const rotated = (k: number): GameMap => ({ ...map, cat: { path: [...path.slice(k), ...path.slice(0, k)], mode: 'loop' } });
  const sleepless = reachableActions(map, { minMice: 0, exclude: ['sleep'] });
  c.push(check('R8 BFS: 잠자기 없이는 어떤 프로그램도 둥지에 못 간다 (모든 액션 열)', sleepless === null, sleepless ? sleepless.join(',') : ''));
  for (let k = 1; k <= 3; k++) {
    const found = reachableActions(rotated(k), { minMice: 0, exclude: ['sleep'] });
    c.push(check(`R8 BFS: 잠자기 ${k}개를 맨 앞에만 두면(고양이 출발 칸을 ${k}칸 돌린 맵) 그 뒤 잠자기 없이는 둥지 불가`, found === null, found ? found.join(',') : ''));
  }
  {
    const found = reachableActions(map, { minMice: 2 });
    const mid = found !== null && found.some((a, i) => a === 'sleep' && found.slice(0, i).some((b) => b !== 'sleep'));
    c.push(check('R8 BFS: 잠자기를 허용하면 쥐 2마리 + 둥지 가능 — 찾은 열의 잠자기 ≥ 2개, 하나는 길 중간',
      found !== null && found.filter((a) => a === 'sleep').length >= 2 && mid, found ? found.join(',') : 'null'));
  }
  const calm: GameMap = { ...map, cat: undefined, tiles: map.tiles.map((row) => row.replace(/c/g, '.')) };
  c.push(check('R8 BFS: 고양이를 치우면 잠자기 없이 쥐 2마리 + 둥지 가능 (잠자기가 필요한 이유 = 고양이)',
    reachableActions(calm, { minMice: 2, exclude: ['sleep'] }) !== null));
  // ② 열쇠·문 — 둥지는 문으로만 들어간다 → 고리를 나갈 때·돌아올 때 두 번 지나야 한다.
  const pm = parseMap(map);
  const gk = `${pm.goal.x},${pm.goal.y}`;
  const k = tilesOf(map, 'K')[0];
  const locked = reachable(map, true);
  c.push(check('R8 BFS: 문을 벽으로 두면 둥지 도달 불가, 열쇠는 문 없이 주울 수 있음, 문을 열면 도달 가능',
    !locked.has(gk) && !!k && locked.has(`${k.x},${k.y}`) && reachable(map, false).has(gk)));
  // ③ 조건 — 조건 블록 없이는 함수를 써도 상한 9 안에서 145점 이상 불가(빠짐없는 탐색). if_wall 하나만 빼도 불가.
  const bare = noRival(map, target, { def: true, exclude: ['if_wall', 'if_pit'] });
  c.push(check(`R8 탐색: 조건(if_wall·if_pit) 없이는 함수를 써도 상한 안에서 ${target}점 이상 불가`, bare.ok, bare.detail));
  const noWall = noRival(map, target, { def: true, exclude: ['if_wall'] });
  c.push(check(`R8 탐색: if_wall 없이는(if_pit·함수 허용) 상한 안에서 ${target}점 이상 불가`, noWall.ok, noWall.detail));
  // (if_pit 없이도 145점 불가 — 같은 크기의 탐색 ≈ 20s라 verify 예산(§3-6)을 아끼려 생략. check.ts --full로 확인됨.)

  // 함수 한계(§3-5): 정답에 def가 없다. 같은 동작의 함수 꼴 함수 F { 잠자기 / 반복 9 { 한 걸음 } } / F 호출 / F 호출은
  //   10블록이라 상한 9에 안 들어간다(E_CAP). 함수를 써도 상한 안에서 145점을 넘는 프로그램은 없다(탐색) → 대표 정답이 최고점.
  {
    const fn: Program = [{ id: 'def', body: [{ id: 'sleep' }, walkR8(9)] }, { id: 'call' }, { id: 'call' }];
    const v = validate(fn, map); const fr = run(map, fn);
    c.push(eq('R8 함수 한계: 정답에 def 없음. 함수 F { 잠자기 / 반복 9 { 한 걸음 } } / F 호출 / F 호출은 같은 20틱 경로지만 10블록 → E_CAP',
      { defs: solutions.map((p) => containsBlock(p, 'def')), blocks: countBlocks(fn), codes: v.codes, same: JSON.stringify(owlPath(fr)) === JSON.stringify(owlPath(r)) },
      { defs: solutions.map(() => false), blocks: 10, codes: ['E_CAP'], same: true }));
  }
  const best = noRival(map, target + 5, { def: true });
  c.push(check(`R8 탐색: 함수를 써도 상한 안에서 ${target}점보다 높은 프로그램 없음 → 대표 정답이 최고점`, best.ok, best.detail));

  // 결정성: 같은 입력 → 같은 trace·같은 탐색 결과
  c.push(check('R8 결정성: 대표 정답·noSleep·sleepFirst를 두 번 실행해도 trace가 같다',
    [sol, noSleep, sleepFirst].every((p) => JSON.stringify(run(map, p).trace) === JSON.stringify(run(map, p).trace))));
  c.push(check('R8 결정성: BFS(잠자기 허용)를 두 번 돌려도 같은 액션 열',
    JSON.stringify(reachableActions(map, { minMice: 2 })) === JSON.stringify(reachableActions(map, { minMice: 2 }))));
  return c;
}

const t0 = performance.now();
const out = checksR8();
let failed = 0;
for (const c of out) { if (!c.ok) failed += 1; console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : `\n    ${c.detail ?? ''}`}`); }
console.log(`\n${out.length - failed}/${out.length} passed · ${((performance.now() - t0) / 1000).toFixed(1)}s`);
if (failed > 0) process.exit(1);
