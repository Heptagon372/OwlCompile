// R2 검증 스크립트: npx tsx engine/_scratch/check_r2.ts
import { run, validate, score, countBlocks, toText, checkMap, parseMap, DELTA, LEFT_OF, RIGHT_OF } from '../index';
import type { Block, Dir, Pos, Program, RunResult } from '../index';
import { map, solutions, expect, naive } from '../rounds/r2';
import { nondef, withDef } from './r2_search';

let failures = 0;
const assert = (cond: boolean, msg: string): void => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures += 1; console.log(`  ✗ ${msg}`); }
};

const contains = (blocks: Block[], id: Block['id']): boolean =>
  blocks.some((b) => b.id === id
    || ('body' in b && contains(b.body, id))
    || ('then' in b && (contains(b.then, id) || contains(b.else, id))));

const printTrace = (r: RunResult): void => {
  for (const s of r.trace) {
    const cat = s.cat ? `(${s.cat.x},${s.cat.y})` : '-';
    console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(8)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) cat ${cat} mice ${s.mice} ${s.event ?? ''} ${s.message ?? ''}`);
  }
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} distance=${r.distance}`);
};

/** 실행된 액션 열 → 문자열 (f=앞으로 J=점프 L/R=회전). */
const actions = (r: RunResult): string => r.trace.slice(1)
  .map((s) => ({ forward: 'f', jump: 'J', left: 'L', right: 'R', sleep: 'z' } as Record<string, string>)[s.block ?? ''] ?? '?').join('');
/** 틱별 (위치·방향·이벤트) — "같은 동작" 비교용. */
const behaviour = (r: RunResult): string => r.trace.map((s) => `${s.owl.x},${s.owl.y},${s.owl.dir},${s.event ?? ''}`).join('|');

// ---------------------------------------------------------------- 맵 구조
console.log('== map');
console.log(map.tiles.join('\n'));
const problems = checkMap(map);
assert(problems.length === 0, `checkMap: ${problems.join('; ') || 'ok'}`);
const all = map.tiles.join('');
const count = (ch: string) => all.split('').filter((c) => c === ch).length;
assert(count('K') === 0 && count('D') === 0, 'no key / door');
assert(count('c') === 0 && !map.cat, 'no cat');
assert(count('M') >= 1 && count('M') <= 2, `mice 1–2 (${count('M')})`);
assert(count('O') >= 5, `pit zone (${count('O')} pits)`);
assert(map.round === 2 && map.name === '구덩이 지대' && map.difficulty === '쉬움' && map.cap === 12
  && map.seconds === 360 && map.intro === '점프·함수', 'fixed round-table fields');
const border = [map.tiles[0], map.tiles[7], ...map.tiles.map((r) => r[0] + r[7])].join('');
assert(/^[#O]+$/.test(border), 'border has no walkable cell (walls, one pit hole at (7,6))');

// 도달 가능 칸 BFS (forward/jump/left/right, 구덩이 = 진입 불가): 복도 + 벽감뿐이어야 한다
{
  const pm = parseMap(map);
  const tile = (p: Pos) => pm.tileAt(p);
  const solid = (p: Pos) => { const t = tile(p); return t === null || t === '#'; };
  const key = (x: number, y: number, d: Dir) => `${x},${y},${d}`;
  const seen = new Map<string, number>();
  const queue: { x: number; y: number; d: Dir }[] = [{ x: pm.start.x, y: pm.start.y, d: pm.start.dir }];
  seen.set(key(pm.start.x, pm.start.y, pm.start.dir), 0);
  let goalTicks = -1;
  while (queue.length) {
    const s = queue.shift()!;
    const t = seen.get(key(s.x, s.y, s.d))!;
    if (s.x === pm.goal.x && s.y === pm.goal.y) { if (goalTicks < 0) goalTicks = t; continue; }
    const next: { x: number; y: number; d: Dir }[] = [
      { x: s.x, y: s.y, d: LEFT_OF[s.d] }, { x: s.x, y: s.y, d: RIGHT_OF[s.d] },
    ];
    const a1 = { x: s.x + DELTA[s.d].x, y: s.y + DELTA[s.d].y };
    const a2 = { x: s.x + 2 * DELTA[s.d].x, y: s.y + 2 * DELTA[s.d].y };
    if (!solid(a1) && tile(a1) !== 'O') next.push({ ...a1, d: s.d });
    if (!solid(a1) && !solid(a2) && tile(a2) !== 'O') next.push({ ...a2, d: s.d });
    for (const n of next) {
      const k = key(n.x, n.y, n.d);
      if (!seen.has(k)) { seen.set(k, t + 1); queue.push(n); }
    }
  }
  const cells = [...new Set([...seen.keys()].map((k) => k.split(',').slice(0, 2).join(',')))].sort();
  console.log(`  reachable cells: ${cells.join(' ')}`);
  const ring = ['3,6', '4,6', '6,6', '6,5', '6,4', '6,2', '6,1', '4,2', '3,2', '1,2', '1,3', '1,5'].sort();
  assert(JSON.stringify(cells) === JSON.stringify(ring), 'only the corridor ring (+ nook (6,1)) is reachable');
  assert(goalTicks === 12, `fastest possible arrival is 12 ticks (the mouse-skipping route) — got ${goalTicks}`);
}

// ---------------------------------------------------------------- 정답들
assert(solutions.length === expect.length, 'solutions/expect aligned');
const results: RunResult[] = [];
solutions.forEach((p, i) => {
  console.log(`\n== solution[${i}]`);
  console.log(toText(p).text);
  const v = validate(p, map);
  assert(v.ok, `validate ok (${v.errors.join(', ') || 'no errors'})`);
  const r = run(map, p);
  results.push(r);
  printTrace(r);
  const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  console.log(`  score ${sc.total}: ${sc.lines.map((l) => `${l.label} ${l.points}`).join(' | ')}`);
  const e = expect[i];
  assert(r.outcome === e.outcome, `outcome ${r.outcome} == ${e.outcome}`);
  assert(r.ticks === e.ticks, `ticks ${r.ticks} == ${e.ticks}`);
  assert(r.mice === e.mice, `mice ${r.mice} == ${e.mice}`);
  assert(r.blocks === e.blocks && countBlocks(p) === e.blocks, `blocks ${r.blocks} == ${e.blocks}`);
  assert(sc.total === e.score, `score ${sc.total} == ${e.score}`);
  assert(r.ticks === r.trace.length - 1, 'ticks == trace.length-1');
});

// 대표 정답 제약
{
  const p = solutions[0];
  const r = results[0];
  console.log('\n== representative constraints');
  assert(contains(p, 'def') && contains(p, 'call'), 'representative uses def + call');
  const jumps = r.trace.filter((s) => s.block === 'jump').length;
  assert(jumps >= 4, `jumps are essential (${jumps} jumps, every jumped-over cell is a pit)`);
  const pm = parseMap(map);
  for (let i = 1; i < r.trace.length; i++) {
    if (r.trace[i].block !== 'jump') continue;
    const a = r.trace[i - 1].owl;
    const mid = { x: a.x + DELTA[a.dir].x, y: a.y + DELTA[a.dir].y };
    assert(pm.tileAt(mid) === 'O', `t${i} jumps over a pit at (${mid.x},${mid.y})`);
  }
  // 모든 해의 쥐는 경로 위(착지·걷는 칸)에서만 먹혔다
  const eatenAt = r.trace.filter((s) => s.event === 'mouse').map((s) => `${s.owl.x},${s.owl.y}`);
  assert(eatenAt.join(' ') === '6,5 3,2', `both mice eaten on the path (${eatenAt.join(' ')})`);
  // 같은 동작 비교: [1] [2] naive 모두 [0]과 틱마다 똑같다
  assert(behaviour(results[1]) === behaviour(r), 'solution[1] = same behaviour as [0]');
  assert(behaviour(results[2]) === behaviour(r), 'solution[2] (no def) = same behaviour as [0]');
  // 문자열 문법 탐색: 이 동작 열을 def 없이(반복 + 끝 truncation) 쓰는 최소 블록 vs def 1개로 쓰는 최소 블록
  const acts = actions(r);
  const nd = nondef(acts);
  const wd = withDef(acts);
  console.log(`  action string ${acts}: min without def = ${nd}, min with def = ${wd.cost} (F = ${wd.body})`);
  assert(nd === 12 && wd.cost === 10, 'grammar search: without def ≥ 12 blocks, with def 10 blocks');
  assert(countBlocks(solutions[2]) === nd, 'solution[2] is the optimal def-free program for this behaviour');
}

// ---------------------------------------------------------------- naive
console.log('\n== naive');
console.log(toText(naive.program).text);
{
  const r = run(map, naive.program);
  printTrace(r);
  const v = validate(naive.program, map);
  console.log(`  validate: ${v.ok ? 'ok' : v.errors.join(', ')}`);
  assert(!contains(naive.program, 'def') && !contains(naive.program, 'call') && !contains(naive.program, 'repeat'), 'naive has no def / call / repeat');
  assert(r.outcome === 'goal' && r.mice === 2 && r.ticks === 13, 'naive reaches the nest with 2 mice in 13 ticks');
  assert(behaviour(r) === behaviour(results[0]), 'naive = same behaviour as the representative');
  assert(countBlocks(naive.program) === 13 && !v.ok && v.codes.join() === 'E_CAP', 'naive is 13 blocks → over cap 12 (E_CAP only)');
  assert(countBlocks(naive.program) > countBlocks(solutions[0]), `naive longer (${countBlocks(naive.program)} > ${countBlocks(solutions[0])})`);
  console.log(`  note: ${naive.note}`);
}

// ---------------------------------------------------------------- 함정 시연 (정답 아님)
const F: Block = { id: 'forward' };
const J: Block = { id: 'jump' };
const L: Block = { id: 'left' };
const R: Block = { id: 'right' };
const rep = (n: number, body: Block[]): Block => ({ id: 'repeat', n, body });
const ifw = (then: Block[], els: Block[] = []): Block => ({ id: 'if_wall', then, else: els });
const ifp = (then: Block[], els: Block[] = []): Block => ({ id: 'if_pit', then, else: els });
const trap = (title: string, p: Program, check: (r: RunResult) => boolean, msg: string): void => {
  console.log(`\n== trap: ${title} (${countBlocks(p)} blocks)`);
  const r = run(map, p);
  printTrace(r);
  assert(check(r), msg);
};
trap('repeat 4 { forward jump left } — assumes all sides equal', [rep(4, [F, J, L])],
  (r) => r.outcome === 'dead' && r.ticks === 5 && r.owl.x === 6 && r.owl.y === 3, 'right side is one cell longer → pit (6,3) at tick 5');
trap('forgot the top-row jump (glue forward instead)', [{ id: 'def', body: [F, J, L] }, { id: 'call' }, F, { id: 'call' }, F, { id: 'call' }, { id: 'call' }],
  (r) => r.outcome === 'dead' && r.ticks === 8 && r.owl.x === 5 && r.owl.y === 2, 'top row starts with a pit → dead at (5,2), tick 8');
trap('R3 hero pattern', [rep(4, [rep(5, [ifw([R], [F])])])],
  (r) => r.outcome === 'dead' && r.ticks === 2, 'walks into the first pit at tick 2');
trap('pit-aware wall follower', [rep(9, [rep(3, [ifw([L], [ifp([J], [F])])])])],
  (r) => r.outcome !== 'goal', 'first corner has a pit ahead, not a wall → fails');
trap('side counter repeat 4 { repeat 3 { if_wall {} else { if_pit {J} else {F} } } left }',
  [rep(4, [rep(3, [ifw([], [ifp([J], [F])])]), L])],
  (r) => r.outcome !== 'goal', 'bottom side is only 2 moves and (7,6) is a pit, not a wall → fails');
trap('"turn after a jump if pit/wall ahead" rule',
  [rep(2, [rep(5, [ifp([J, ifp([L], [ifw([L], [])])], [F])])])],
  (r) => r.outcome !== 'goal', 'corner (6,2) has the open nook (6,1) ahead → fails');
trap('"turn after a jump if pit ahead" rule',
  [rep(2, [rep(5, [ifp([J, ifp([L], [])], [F])])])],
  (r) => r.outcome !== 'goal', 'corner (6,2) has the open nook ahead → fails');

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
