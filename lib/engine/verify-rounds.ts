// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// 라운드(맵/정답) 검증 — docs/ENGINE_SPEC.md §8 "반드시 만족할 제약" + §9-5 (브리프 수용 기준 4·5).
import type { Block, BlockId, GameMap, Outcome, Pos, Program, RunResult } from './types';
import { ROLES, countBlocks, slotsOf, type Role } from './blocks';
import { toText } from './text';
import { containsBlock, findDef, validate } from './validate';
import { DELTA, checkMap, parseMap, run, samePos } from './run';
import { score } from './score';
import { MAPS, MAP_LIST, type RoundNo } from './maps';
import { ROUND_EXTRAS, SOLUTIONS } from './solutions';
import * as r1 from './rounds/r1';
import * as r2 from './rounds/r2';
import * as r3 from './rounds/r3';
import * as r4 from './rounds/r4';
import * as r5 from './rounds/r5';
import * as r6 from './rounds/r6';
import * as r7 from './rounds/r7';
import { check, eq, type Check } from './verify-util';
import { reachableActions, shortestProgram, type SearchSpec } from './verify-search';

// ---------------------------------------------------------------- 고정값 & 헬퍼

type Expect = { outcome: Outcome; ticks: number; mice: number; blocks: number; score: number };
interface RoundModule {
  map: GameMap;
  solutions: Program[];
  expect: Expect[];
  naive?: { program: Program; note: string };
}

const ROUNDS: Record<RoundNo, RoundModule> = { 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7 };
const ROUND_NOS: RoundNo[] = [1, 2, 3, 4, 5, 6, 7];

/** §8 라운드 표 (브리프·FEATURE_V4 고정값). */
const TABLE: Record<RoundNo, Pick<GameMap, 'name' | 'difficulty' | 'cap' | 'seconds' | 'intro'>> = {
  1: { name: 'Hello, Owl', difficulty: '쉬움', cap: 12, seconds: 300, intro: '앞으로·회전·반복' },
  2: { name: '구덩이 지대', difficulty: '쉬움', cap: 12, seconds: 360, intro: '점프·함수' },
  3: { name: '나선', difficulty: '중간', cap: 7, seconds: 420, intro: '만약 앞이 벽이면' },
  4: { name: '열쇠와 계단', difficulty: '중간', cap: 10, seconds: 480, intro: '열쇠·문·만약 앞이 구덩이면' },
  5: { name: '고양이 순찰', difficulty: '어려움', cap: 9, seconds: 600, intro: '움직이는 고양이·잠자기' },
  6: { name: '밤의 미로', difficulty: '어려움', cap: 8, seconds: 600, intro: '함수 속 조건' },
  7: { name: '둥지 탈환', difficulty: '매우 어려움', cap: 10, seconds: 720, intro: '모든 요소' },
};

/** 고양이가 나오는 라운드. */
const CAT_ROUNDS: RoundNo[] = [5, 7];

/** expect.score의 채점 조건. 기본은 firstSubmit=false, usedPatch=false. R5 대표 정답만 패치 재실행(수용 기준 5). */
const USED_PATCH: Partial<Record<RoundNo, number[]>> = { 5: [0] };
const ctxFor = (n: RoundNo, i: number) => ({
  cap: MAPS[n].cap, firstSubmit: false, usedPatch: USED_PATCH[n]?.includes(i) ?? false,
});

/** uid를 뺀 구조 비교용 문자열. */
const shape = (p: Program): string => JSON.stringify(p, (k, v) => (k === 'uid' ? undefined : v));

/** 트리 전체에서 id 블록 개수. */
const countId = (list: Block[], id: BlockId): number =>
  list.reduce((s, b) => s + (b.id === id ? 1 : 0) + slotsOf(b).reduce((t, sl) => t + countId(sl, id), 0), 0);

/** 트리 전체에서 id 블록을 제거한 사본. */
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

const summarize = (r: RunResult, n: RoundNo, i: number): Expect => ({
  outcome: r.outcome, ticks: r.ticks, mice: r.mice, blocks: r.blocks, score: score(r, ctxFor(n, i)).total,
});

const oneLine = (p: Program) => toText(p).text.replace(/\n\s*/g, ' / ');

/**
 * 부엉이 이동만으로(forward/jump, 회전은 공짜) 닿는 칸 집합. 구덩이 착지 = 사망이라 제외.
 * doorIsWall이면 문은 맵 밖/벽과 같이 막힌 칸(앞으로·점프 착지·점프 중간 모두 불가).
 */
function reachable(map: GameMap, doorIsWall: boolean): Set<string> {
  const pm = parseMap(map);
  const solid = (p: Pos) => {
    const t = pm.tileAt(p);
    return t === null || t === '#' || (t === 'D' && doorIsWall);
  };
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

/**
 * 목표 점수 이상을 내는 둥지 도착 프로그램이 가져야 할 (쥐 ≥ m, 블록 ≤ b) 조건 목록.
 * goal 점수 = 100 + 20·쥐 + 5·(상한 − 블록) (패치·최초 제출 없음). 미도착(최고 40 + 20·전체 쥐)·사망(0)은 따로 확인.
 * 쥐 m마리의 한도 b(m)은 m이 클수록 크므로 "쥐 ≥ m, 블록 ≤ b(m)" 탐색을 m마다 하면 빠짐없다.
 */
function rivalBounds(map: GameMap, target: number): { minMice: number; maxBlocks: number }[] {
  const total = tilesOf(map, 'M').length;
  const out: { minMice: number; maxBlocks: number }[] = [];
  for (let m = 0; m <= total; m++) {
    const b = Math.min(map.cap, Math.floor(map.cap - (target - 100 - 20 * m) / 5));
    if (b >= 1) out.push({ minMice: m, maxBlocks: b });
  }
  return out;
}

/** exclude(+def) 조건으로 target점 이상을 내는 프로그램이 상한 안에 없는가. 찾으면 그 프로그램 문자열. */
function noRival(map: GameMap, target: number, spec: Omit<SearchSpec, 'maxBlocks' | 'minMice'>): { ok: boolean; detail: string } {
  const total = tilesOf(map, 'M').length;
  if (40 + 20 * total >= target) return { ok: false, detail: `미도착 최고점 ${40 + 20 * total} ≥ ${target}` };
  for (const b of rivalBounds(map, target)) {
    const found = shortestProgram(map, { ...spec, ...b });
    if (found) return { ok: false, detail: `쥐 ≥ ${b.minMice}, ${found.blocks}블록: ${oneLine(found.program)}` };
  }
  return { ok: true, detail: '' };
}

// ---------------------------------------------------------------- 공통 제약

function common(n: RoundNo): Check[] {
  const c: Check[] = [];
  const mod = ROUNDS[n];
  const map = mod.map;
  const tag = `R${n}`;

  c.push(check(`${tag}: MAPS[${n}]·MAP_LIST[${n - 1}]가 rounds/r${n}.map`, MAPS[n] === map && MAP_LIST[n - 1] === map));
  c.push(check(`${tag}: SOLUTIONS.r${n}가 rounds/r${n}.solutions`,
    SOLUTIONS[`r${n}` as keyof typeof SOLUTIONS] === mod.solutions));
  c.push(eq(`${tag}: map.round`, map.round, n));
  c.push(eq(`${tag}: 라운드 표 고정값 (name·difficulty·cap·seconds·intro)`,
    { name: map.name, difficulty: map.difficulty, cap: map.cap, seconds: map.seconds, intro: map.intro }, TABLE[n]));
  c.push(eq(`${tag}: checkMap 문제 없음 (8×8·S/G 각 1개·타일 문자·고양이 path)`, checkMap(map), []));

  const goal = tilesOf(map, 'G')[0];
  const doors = tilesOf(map, 'D');
  c.push(check(`${tag}: 둥지 칸 ≠ 문 칸`, goal !== undefined && doors.every((d) => !samePos(d, goal))));

  // 고양이: R5·R7만
  const cTiles = tilesOf(map, 'c');
  if (CAT_ROUNDS.includes(n)) {
    const onPath = (p: Pos) => (map.cat?.path ?? []).some((q) => samePos(p, q));
    c.push(check(`${tag}: 고양이 있음, c 타일 = 순찰 path 칸`,
      !!map.cat && cTiles.length > 0 && cTiles.every(onPath)
      && (map.cat?.path ?? []).every((p) => cTiles.some((q) => samePos(p, q)))));
  } else {
    c.push(check(`${tag}: 고양이 없음 (cat 없음, c 타일 0)`, !map.cat && cTiles.length === 0));
  }

  // 정답들
  c.push(check(`${tag}: solutions ${mod.solutions.length}개 = expect ${mod.expect.length}개 (≥1)`,
    mod.solutions.length >= 1 && mod.solutions.length === mod.expect.length));
  mod.solutions.forEach((p, i) => {
    const v = validate(p, map);
    c.push(check(`${tag} 정답[${i}]: validate 통과`, v.ok, v.errors.join(', ')));
    const r = run(map, p);
    c.push(eq(`${tag} 정답[${i}]: 실행 결과 = expect (outcome·ticks·mice·blocks·score)`, summarize(r, n, i), mod.expect[i]));
    const lines = toText(p).lines;
    const lineOk = r.ticks === r.trace.length - 1
      && r.trace.slice(1).every((s) => s.line !== null && lines[s.line]?.blockId === s.block);
    c.push(check(`${tag} 정답[${i}]: trace 길이·Step.line이 실행 블록 줄을 가리킴`, lineOk));
  });

  if (mod.naive) {
    const r = run(map, mod.naive.program);
    c.push(check(`${tag} naive: 둥지 도착 + note 있음`, r.outcome === 'goal' && mod.naive.note.length > 0,
      `${r.outcome} "${r.message}"`));
    c.push(check(`${tag}: ROUND_EXTRAS.r${n}.naive가 rounds/r${n}.naive`,
      ROUND_EXTRAS[`r${n}` as keyof typeof ROUND_EXTRAS].naive === mod.naive));
  }
  return c;
}

// ---------------------------------------------------------------- 라운드별 제약

function round1(): Check[] {
  const c: Check[] = [];
  const { map, solutions, naive } = r1;
  const sol = solutions[0];
  c.push(check('R1: 구덩이·문·열쇠 없음', ['O', 'D', 'K'].every((ch) => tilesOf(map, ch).length === 0)));
  c.push(check(`R1 정답: ≤ 5블록 (${countBlocks(sol)}) + repeat 사용`, countBlocks(sol) <= 5 && containsBlock(sol, 'repeat')));
  const flat = naive.program.every((b) => b.id === 'forward' || b.id === 'left' || b.id === 'right');
  c.push(check(`R1 naive: 앞으로·회전만 나열, ≥ 9블록 (${countBlocks(naive.program)})`, flat && countBlocks(naive.program) >= 9));
  c.push(eq('R1 naive: 정답과 같은 경로', owlPath(run(map, naive.program)), owlPath(run(map, sol))));
  // 쥐는 점프로 건너뛰면 못 먹는 칸: 점프만 쓴 4블록 경로는 쥐 0마리라 반복 정답(4블록 180점)과 동점이 아니다.
  const jumpOnly: Program = [{ id: 'repeat', n: 2, body: [{ id: 'jump' }, { id: 'jump' }, { id: 'right' }] }];
  const jr = run(map, jumpOnly);
  c.push(eq('R1: 반복 2 { 점프 점프 우회전 } → 둥지 도착, 쥐 0, 140점 (< 골프 180점)',
    { outcome: jr.outcome, ticks: jr.ticks, mice: jr.mice, score: score(jr, ctxFor(1, -1)).total },
    { outcome: 'goal', ticks: 5, mice: 0, score: 140 }));
  return c;
}

function round2(): Check[] {
  const c: Check[] = [];
  const { map, solutions, expect, naive } = r2;
  const sol = solutions[0];
  const solBlocks = countBlocks(sol);
  c.push(check('R2 정답: def + call 사용', containsBlock(sol, 'def') && containsBlock(sol, 'call')));
  c.push(check(`R2 naive: def 없음, 정답보다 블록 많음 (${countBlocks(naive.program)} > ${solBlocks})`,
    !containsBlock(naive.program, 'def') && countBlocks(naive.program) > solBlocks));
  c.push(eq('R2 naive: 정답과 같은 동작(매 틱 부엉이 상태 동일)', owlPath(run(map, naive.program)), owlPath(run(map, sol))));
  // 같은 결과(goal·쥐 수)를 내는 def 없는 정답은 모두 대표 정답보다 길다
  const rivals = solutions
    .map((p, i) => ({ p, e: expect[i] }))
    .filter(({ p, e }) => !containsBlock(p, 'def') && e.outcome === 'goal' && e.mice === expect[0].mice);
  c.push(check(`R2: 쥐 ${expect[0].mice}마리를 먹는 def 없는 정답은 모두 ${solBlocks}블록보다 김 (${rivals.map(({ p }) => countBlocks(p)).join(', ') || '없음'})`,
    rivals.every(({ p }) => countBlocks(p) > solBlocks)));
  return c;
}

function round3(): Check[] {
  const c: Check[] = [];
  const { map } = r3;
  const hero: Program = [{
    id: 'repeat', n: 4, body: [{
      id: 'repeat', n: 5, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }],
    }],
  }];
  const sol = SOLUTIONS.r3[0];
  c.push(eq('R3 SOLUTIONS.r3[0] = repeat 4 { repeat 5 { if_wall { right } else { forward } } }', shape(sol), shape(hero)));
  const r = run(map, sol);
  const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  c.push(eq('R3 수용 기준 4: goal·20틱·쥐 2·5블록·150점',
    { outcome: r.outcome, ticks: r.ticks, mice: r.mice, blocks: r.blocks, score: sc.total },
    { outcome: 'goal', ticks: 20, mice: 2, blocks: 5, score: 150 }));
  const goal = parseMap(map).goal;
  c.push(check('R3: 20틱 이전에 둥지를 밟지 않음', r.trace.slice(0, -1).every((s) => !samePos(s.owl, goal))));
  // §6.4 "역할 커버리지": 정답이 네 역할을 모두 쓸 필요는 없다(R3 정답은 브리프 고정, Architect 블록 없음). R5 정답은 네 역할 모두.
  const roles = (p: Program) => (Object.keys(ROLES) as Role[]).filter((role) => ROLES[role].blocks.some((id) => countId(p, id) > 0));
  c.push(eq('역할 커버리지(현재 동작 고정): R3 정답 = Runner·Turner·Controller, R5 정답 = 네 역할 모두',
    { r3: roles(sol), r5: roles(SOLUTIONS.r5[0]) },
    { r3: ['runner', 'turner', 'controller'], r5: ['runner', 'turner', 'controller', 'architect'] }));
  return c;
}

function round4(): Check[] {
  const c: Check[] = [];
  const { map, solutions } = r4;
  const sol = solutions[0];
  c.push(check('R4 정답: if_pit 사용', containsBlock(sol, 'if_pit')));
  c.push(check('R4: 열쇠 K 정확히 1개, 문 D 정확히 1개',
    tilesOf(map, 'K').length === 1 && tilesOf(map, 'D').length === 1));
  const pm = parseMap(map);
  const gk = `${pm.goal.x},${pm.goal.y}`;
  const k = tilesOf(map, 'K')[0];
  const locked = reachable(map, true);
  c.push(check('R4: 문을 벽으로 두면 둥지 도달 불가 (BFS)', !locked.has(gk)));
  c.push(check('R4: 문 없이도 열쇠는 주울 수 있고, 문을 열면 둥지 도달 가능 (BFS)',
    !!k && locked.has(`${k.x},${k.y}`) && reachable(map, false).has(gk)));
  const r = run(map, sol);
  const keyTick = r.trace.find((s) => s.event === 'key')?.tick ?? -1;
  const doorTick = r.trace.find((s) => s.event === 'door')?.tick ?? -1;
  c.push(check(`R4 정답: 열쇠(t${keyTick}) → 문(t${doorTick}) → 둥지`, keyTick > 0 && doorTick > keyTick && r.outcome === 'goal'));
  // 안뜰 지름길(if_pit 없음, 막히기 전 6블록 160점)은 이제 (4,5) 벽에 막힌다.
  const cy = run(map, r4.courtyard);
  c.push(eq('R4: 안뜰 지름길 앞으로 / 반복 2 { 점프 우회전 앞으로 점프 } → 6틱째 벽 (if_pit 없는 지름길 차단)',
    { outcome: cy.outcome, ticks: cy.ticks, event: cy.trace[cy.trace.length - 1].event, pit: containsBlock(r4.courtyard, 'if_pit') },
    { outcome: 'error', ticks: 6, event: 'wall', pit: false }));
  // if_pit 없는 둘레 경로를 반복으로 줄여도 대표 정답 점수보다 낮다.
  const perimeter: Program = [
    { id: 'forward' }, { id: 'jump' }, { id: 'jump' },
    { id: 'repeat', n: 2, body: [{ id: 'right' }, { id: 'jump' }, { id: 'forward' }, { id: 'jump' }] },
  ];
  // 빠짐없는 탐색(verify-search): 대표 정답(6블록·쥐 1·140점) 이상을 내는 프로그램이 없다.
  //   쥐 1마리 이상 ≤ 5블록이면 145점 이상 / if_pit 없이 쥐 1마리 이상 ≤ 6블록이면 140점 이상.
  const cheaper = shortestProgram(map, { maxBlocks: 5, minMice: 1 });
  c.push(check('R4 탐색: 쥐 1마리 이상으로 둥지에 가는 5블록 이하 프로그램 없음 (145점 이상 불가)', cheaper === null,
    cheaper ? toText(cheaper.program).text : ''));
  const noPit = shortestProgram(map, { maxBlocks: 6, minMice: 1, exclude: ['if_pit'] });
  c.push(check('R4 탐색: if_pit 없이 쥐 1마리 이상 6블록 이하 프로그램 없음 (if_pit 없이 140점 이상 불가)', noPit === null,
    noPit ? toText(noPit.program).text : ''));
  const pr = run(map, perimeter);
  const best = score(r, ctxFor(4, 0)).total;
  c.push(eq(`R4: if_pit 없는 둘레 8블록 → goal·쥐 1·130점 (< 대표 정답 ${best}점)`,
    { outcome: pr.outcome, mice: pr.mice, blocks: pr.blocks, score: score(pr, ctxFor(4, -1)).total, below: score(pr, ctxFor(4, -1)).total < best },
    { outcome: 'goal', mice: 1, blocks: 8, score: 130, below: true }));
  return c;
}

function round5(): Check[] {
  const c: Check[] = [];
  const { map, noSleep } = r5;
  const sol = SOLUTIONS.r5[0];
  c.push(check(`R5 정답: 잠자기 정확히 1개 (${countId(sol, 'sleep')}), 8블록 (${countBlocks(sol)})`,
    countId(sol, 'sleep') === 1 && countBlocks(sol) === 8));
  const r = run(map, sol);
  const patched = score(r, { cap: map.cap, firstSubmit: false, usedPatch: true }).total;
  const plain = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
  c.push(eq('R5 수용 기준 5: 패치 재실행 → goal·37틱·쥐 2·145 − 10 = 135점',
    { outcome: r.outcome, ticks: r.ticks, mice: r.mice, plain, patched },
    { outcome: 'goal', ticks: 37, mice: 2, plain: 145, patched: 135 }));

  c.push(check('R5: ROUND_EXTRAS.r5.noSleep가 rounds/r5.noSleep', ROUND_EXTRAS.r5.noSleep === noSleep));
  c.push(eq('R5 noSleep = 정답[0]에서 잠자기만 뺀 것 (7블록)',
    { shape: shape(noSleep), blocks: countBlocks(noSleep) }, { shape: shape(without(sol, 'sleep')), blocks: 7 }));
  const d = run(map, noSleep);
  const lastStep = d.trace[d.trace.length - 1];
  const zero = [false, true].every((firstSubmit) => [false, true].every((usedPatch) =>
    score(d, { cap: map.cap, firstSubmit, usedPatch }).total === 0));
  c.push(eq('R5 수용 기준 5: noSleep → 18틱째 (7,4)에서 "고양이를 밟았다", dead, 0점',
    { outcome: d.outcome, ticks: d.ticks, owl: [lastStep.owl.x, lastStep.owl.y], event: lastStep.event, message: lastStep.message, zero },
    { outcome: 'dead', ticks: 18, owl: [7, 4], event: 'cat', message: '고양이를 밟았다', zero: true }));

  // §6.4 "고양이 표시": 틱 0 프레임의 고양이는 path[0]. 같은 c 타일에서 출발 칸만 반대 끝이면 대표 정답이 19틱에 죽는다.
  const catPath = map.cat?.path ?? [];
  c.push(eq('R5: trace[0].cat = cat.path[0] = (4,4)', r.trace[0].cat, { x: 4, y: 4 }));
  const reversed: GameMap = { ...map, cat: map.cat ? { ...map.cat, path: [...catPath].reverse() } : undefined };
  const rv = run(reversed, sol);
  const rvLast = rv.trace[rv.trace.length - 1];
  c.push(eq('R5: 고양이 출발 칸을 반대 끝 (7,6)으로 바꾸면 대표 정답이 19틱 (7,4)에서 죽음 (출발 칸을 보여줘야 하는 이유)',
    { outcome: rv.outcome, ticks: rv.ticks, owl: [rvLast.owl.x, rvLast.owl.y], message: rvLast.message },
    { outcome: 'dead', ticks: 19, owl: [7, 4], message: '고양이를 밟았다' }));

  // §8 R5 추가: 잠자기가 유일한 답일 필요는 없다 — 좌회전 하나로 기다리는 8블록 답이 목록에 있다.
  const turnWait = r5.solutions.findIndex((p) => p[0]?.id === 'left' && countBlocks(p) === 8 && countId(p, 'sleep') === 0);
  c.push(check(`R5: 잠자기 없는 8블록 인정 답(좌회전 대기)이 solutions에 있음 (index ${turnWait}), 145점`,
    turnWait > 0 && r5.expect[turnWait].score === 145 && r5.expect[turnWait].ticks === 38));
  return c;
}

/** 대표 정답이 "함수 속 조건"을 쓰는가: 최상위 def 1개, 그 본문 안에 ids 조건이 모두, call ≥ 2. */
function conditionInFunction(sol: Program, ids: BlockId[]): boolean {
  const d = findDef(sol);
  return !!d && ids.every((id) => containsBlock(d.body, id)) && countId(sol, 'call') >= 2 && countId(sol, 'def') === 1;
}

function round6(): Check[] {
  const c: Check[] = [];
  const { map, solutions, expect } = r6;
  const sol = solutions[0];
  const target = expect[0].score;
  c.push(check('R6 정답: 함수 F 본문에 if_wall, F 호출 2번, 점프 사용 ("함수 속 조건")',
    conditionInFunction(sol, ['if_wall']) && containsBlock(sol, 'jump')));
  c.push(check('R6: 열쇠·문 없음, 구덩이 있음', tilesOf(map, 'K').length === 0 && tilesOf(map, 'D').length === 0 && tilesOf(map, 'O').length > 0));
  c.push(eq('R6: 맵의 쥐 = 대표 정답이 먹는 쥐 (더 먹을 쥐가 없다)', tilesOf(map, 'M').length, expect[0].mice));

  const r = run(map, sol);
  const jumpStep = r.trace.find((s) => s.block === 'jump');
  c.push(eq('R6 정답: 10틱째 점프로 (5,0) 구덩이를 넘어 (4,0) → (6,0)',
    { tick: jumpStep?.tick, from: r.trace[(jumpStep?.tick ?? 1) - 1].owl, to: jumpStep ? { x: jumpStep.owl.x, y: jumpStep.owl.y } : null },
    { tick: 10, from: { x: 4, y: 0, dir: 'E' }, to: { x: 6, y: 0 } }));
  // 함정: 같은 모양에서 반복 횟수만 8 → 1회차가 (3,0)에서 끝나 점프 착지가 (5,0) 구덩이.
  const eight: Program = [{ id: 'def', body: [{ id: 'repeat', n: 8, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }] }] },
    { id: 'call' }, { id: 'jump' }, { id: 'call' }];
  const e8 = run(map, eight);
  c.push(eq('R6 함정: F 안의 반복을 8로 → 9틱째 점프 착지가 (5,0) 구덩이, dead',
    { outcome: e8.outcome, ticks: e8.ticks, event: e8.trace[e8.trace.length - 1].event, owl: [e8.owl.x, e8.owl.y] },
    { outcome: 'dead', ticks: 9, event: 'pit', owl: [5, 0] }));
  // 함정: R3의 "벽이면 우회전" 반복만 → 10틱째 (5,0) 구덩이로 걸어 들어간다.
  const spiral: Program = [{ id: 'repeat', n: 9, body: [{ id: 'repeat', n: 9, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }] }] }];
  const sp = run(map, spiral);
  c.push(eq('R6 함정: R3 패턴 반복 9 { 반복 9 { 벽이면 우회전 아니면 앞으로 } } → 10틱째 (5,0) 구덩이',
    { outcome: sp.outcome, ticks: sp.ticks, owl: [sp.owl.x, sp.owl.y] }, { outcome: 'dead', ticks: 10, owl: [5, 0] }));

  // 새 요소 필요성(빠짐없는 탐색): 조건 블록 없이는 — 함수를 써도 — 상한 8 안에 둥지에 아예 못 간다.
  const bare = shortestProgram(map, { maxBlocks: map.cap, minMice: 0, def: true, exclude: ['if_wall', 'if_pit'] });
  c.push(check(`R6 탐색: 조건(if_wall·if_pit) 없이는 함수를 써도 ${map.cap}블록 이하로 둥지에 닿는 프로그램 없음`, bare === null,
    bare ? oneLine(bare.program) : ''));
  const noWall = noRival(map, target, { def: true, exclude: ['if_wall'] });
  c.push(check(`R6 탐색: if_wall 없이는(if_pit·함수 허용) 상한 안에서 ${target}점 이상 불가`, noWall.ok, noWall.detail));

  // 알려진 한계(§8 R6): 상한 8에서는 함수가 블록을 줄이지 못한다. 함수 없는 6블록 답이 같은 동작으로 150점.
  const flat = solutions[1];
  c.push(check('R6 정답[1]: def 없음, 6블록', !containsBlock(flat, 'def') && countBlocks(flat) === 6));
  c.push(eq('R6 정답[1] = 대표 정답과 같은 동작(매 틱 부엉이 상태 동일)', owlPath(run(map, flat)), owlPath(r)));
  const best = expect[1].score;
  const better = noRival(map, best + 5, { def: true });
  c.push(check(`R6 탐색: 함수를 써도 ${best}점(정답[1])보다 높은 프로그램 없음 → 최고점 ${best}`, better.ok, better.detail));
  return c;
}

function round7(): Check[] {
  const c: Check[] = [];
  const { map, solutions, expect, noSleep } = r7;
  const sol = solutions[0];
  const target = expect[0].score;
  c.push(check('R7 정답: 함수 F 본문에 if_wall·if_pit, F 호출 2번, 잠자기 1번, 점프 사용 (모든 요소)',
    conditionInFunction(sol, ['if_wall', 'if_pit']) && countId(sol, 'sleep') === 1 && containsBlock(sol, 'jump')));
  c.push(check('R7: 열쇠 K 정확히 1개, 문 D 정확히 1개, 구덩이 있음',
    tilesOf(map, 'K').length === 1 && tilesOf(map, 'D').length === 1 && tilesOf(map, 'O').length > 0));
  c.push(eq('R7: 맵의 쥐 = 대표 정답이 먹는 쥐 (더 먹을 쥐가 없다)', tilesOf(map, 'M').length, expect[0].mice));

  // 고양이 순찰: pingpong, 인접 칸, 틱 0에 path[0]
  const cat = map.cat;
  c.push(eq('R7: 고양이 pingpong (0,7)→(2,7), trace[0].cat = path[0]',
    { mode: cat?.mode, path: cat?.path, t0: run(map, sol).trace[0].cat },
    { mode: 'pingpong', path: [{ x: 0, y: 7 }, { x: 1, y: 7 }, { x: 2, y: 7 }], t0: { x: 0, y: 7 } }));

  // 열쇠·문: 둥지는 문으로만 들어간다
  const pm = parseMap(map);
  const gk = `${pm.goal.x},${pm.goal.y}`;
  const k = tilesOf(map, 'K')[0];
  const locked = reachable(map, true);
  c.push(check('R7: 문을 벽으로 두면 둥지 도달 불가, 열쇠는 문 없이 주울 수 있음, 문을 열면 도달 가능 (BFS)',
    !locked.has(gk) && !!k && locked.has(`${k.x},${k.y}`) && reachable(map, false).has(gk)));
  const r = run(map, sol);
  const keyTick = r.trace.find((s) => s.event === 'key')?.tick ?? -1;
  const doorTick = r.trace.find((s) => s.event === 'door')?.tick ?? -1;
  c.push(check(`R7 정답: 열쇠(t${keyTick}) → 잠자기 → 문(t${doorTick}, 점프 착지) → 둥지`,
    keyTick === 4 && doorTick === 15 && r.trace[doorTick].block === 'jump' && r.outcome === 'goal'));

  // 잠자기: noSleep은 11틱째 (2,7)에서 고양이를 밟는다
  c.push(check('R7: ROUND_EXTRAS.r7.noSleep가 rounds/r7.noSleep', ROUND_EXTRAS.r7.noSleep === noSleep));
  c.push(eq('R7 noSleep = 정답[0]에서 잠자기만 뺀 것 (9블록)',
    { shape: shape(noSleep), blocks: countBlocks(noSleep) }, { shape: shape(without(sol, 'sleep')), blocks: 9 }));
  const d = run(map, noSleep);
  const last = d.trace[d.trace.length - 1];
  c.push(eq('R7 noSleep → 11틱째 (2,7)에서 "고양이를 밟았다", dead, 0점',
    { outcome: d.outcome, ticks: d.ticks, owl: [last.owl.x, last.owl.y], message: last.message, score: score(d, ctxFor(7, -1)).total },
    { outcome: 'dead', ticks: 11, owl: [2, 7], message: '고양이를 밟았다', score: 0 }));

  // 새 요소 필요성 ①: 잠자기 없이 둥지에 가는 액션 열은 아예 없다(블록 수·함수·조건 무관 — 상태 BFS).
  const sleepless = reachableActions(map, { minMice: 0, exclude: ['sleep'] });
  c.push(check('R7 BFS: 잠자기 없이는 어떤 프로그램도 둥지에 못 간다 (모든 액션 열)', sleepless === null,
    sleepless ? sleepless.join(',') : ''));
  // … 이유는 고양이다: 고양이를 치우면 잠자기 없이도 쥐 2마리를 먹고 둥지에 간다.
  const calm: GameMap = { ...map, cat: undefined, tiles: map.tiles.map((row) => row.replace(/c/g, '.')) };
  c.push(check('R7 BFS: 고양이를 치우면 잠자기 없이 쥐 2마리 + 둥지 가능 (잠자기가 필요한 이유 = 고양이)',
    reachableActions(calm, { minMice: 2, exclude: ['sleep'] }) !== null));
  // 새 요소 필요성 ②: 조건 블록 없이는 — 함수를 써도 — 상한 10 안에서 대표 정답 점수 이상 불가.
  const bare = noRival(map, target, { def: true, exclude: ['if_wall', 'if_pit'] });
  c.push(check(`R7 탐색: 조건(if_wall·if_pit) 없이는 함수를 써도 상한 안에서 ${target}점 이상 불가`, bare.ok, bare.detail));

  // 알려진 한계(§8 R6·R7): 함수 없는 8블록 답이 같은 동작으로 150점.
  const flat = solutions[1];
  c.push(check('R7 정답[1]: def 없음, 8블록, 잠자기 포함', !containsBlock(flat, 'def') && countBlocks(flat) === 8 && containsBlock(flat, 'sleep')));
  c.push(eq('R7 정답[1] = 대표 정답과 같은 동작(매 틱 부엉이 상태 동일)', owlPath(run(map, flat)), owlPath(r)));
  const flatBest = expect[1].score;
  const better = noRival(map, flatBest + 5, {});
  c.push(check(`R7 탐색: 함수 없이 ${flatBest}점(정답[1])보다 높은 프로그램 없음`, better.ok, better.detail));
  return c;
}

// ---------------------------------------------------------------- 진입점

export function runRounds(): Check[] {
  const c: Check[] = [];
  c.push(check('MAP_LIST: 라운드 1→7 순서', MAP_LIST.length === 7 && MAP_LIST.every((m, i) => m.round === i + 1)));
  for (const n of ROUND_NOS) c.push(...common(n));
  c.push(...round1(), ...round2(), ...round3(), ...round4(), ...round5(), ...round6(), ...round7());
  return c;
}
