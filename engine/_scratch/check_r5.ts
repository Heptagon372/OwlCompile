// R5 검증 스크립트: npx tsx engine/_scratch/check_r5.ts
import { run, validate, score, countBlocks, toText, checkMap, parseMap, DELTA, LEFT_OF, RIGHT_OF } from '../index';
import type { Block, Dir, Pos, Program, RunResult } from '../index';
import { map, solutions, expect, noSleep, naive } from '../rounds/r5';

let failures = 0;
const assert = (cond: boolean, msg: string): void => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failures += 1; console.log(`  ✗ ${msg}`); }
};

const countId = (blocks: Block[], id: Block['id']): number =>
  blocks.reduce((n, b) => n + (b.id === id ? 1 : 0)
    + ('body' in b ? countId(b.body, id) : 0)
    + ('then' in b ? countId(b.then, id) + countId(b.else, id) : 0), 0);

/** 첫 번째 잠자기 블록 하나를 뺀 프로그램. */
const removeOneSleep = (p: Program): Program => {
  let done = false;
  const strip = (list: Block[]): Block[] => list
    .filter((b) => { if (!done && b.id === 'sleep') { done = true; return false; } return true; })
    .map((b) => {
      if (b.id === 'repeat' || b.id === 'def') return { ...b, body: strip(b.body) };
      if (b.id === 'if_wall' || b.id === 'if_pit') return { ...b, then: strip(b.then), else: strip(b.else) };
      return b;
    });
  return strip(p);
};

const xy = (p: Pos | null): string => (p ? `(${p.x},${p.y})` : '-');
const printTrace = (r: RunResult): void => {
  for (const s of r.trace) {
    console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(7)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) cat ${xy(s.cat)} mice ${s.mice} ${s.event ?? ''} ${s.message ?? ''}`);
  }
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} distance=${r.distance}`);
};
const collided = (r: RunResult): number[] =>
  r.trace.filter((s) => s.cat && s.cat.x === s.owl.x && s.cat.y === s.owl.y).map((s) => s.tick);

// ---------------------------------------------------------------- 맵 구조
console.log('== map');
console.log(map.tiles.join('\n'));
const problems = checkMap(map);
assert(problems.length === 0, `checkMap: ${problems.join('; ') || 'ok'}`);
assert(map.round === 5 && map.name === '고양이 순찰' && map.difficulty === '어려움' && map.cap === 9
  && map.seconds === 600 && map.intro === '움직이는 고양이·잠자기', 'fixed round-table fields');
const all = map.tiles.join('');
const count = (ch: string) => all.split('').filter((c) => c === ch).length;
assert(count('S') === 1 && count('G') === 1, 'exactly one S and one G');
assert(count('K') === 0 && count('D') === 0, 'no key / door (nest never on a door)');
assert(count('M') === 2, `2 mice on the map (${count('M')})`);
assert(count('O') >= 1, `at least one pit so if_pit is needed (${count('O')})`);
assert(map.tiles.every((r) => r[0] === '#') && map.tiles[7] === '########', 'left column and bottom row framed with walls');
assert(map.tiles[4][7] === 'c', '(7,4) is a cat tile on the right edge');

// 고양이: path 칸 = c 칸 전체, 가지 없는 한 줄, path[0]이 끝 → 손으로 추적할 때 움직임이 하나로 정해짐
assert(!!map.cat && map.cat.mode === 'pingpong', 'cat patrols in pingpong mode');
{
  const path = map.cat!.path;
  const cSet = new Set<string>();
  map.tiles.forEach((row, y) => row.split('').forEach((t, x) => { if (t === 'c') cSet.add(`${x},${y}`); }));
  const pSet = new Set(path.map((p) => `${p.x},${p.y}`));
  assert(pSet.size === path.length, 'cat path has no repeated cell');
  assert(cSet.size === pSet.size && [...cSet].every((k) => pSet.has(k)), 'c tiles == cat path cells');
  const cNeighbors = (k: string) => {
    const [x, y] = k.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => cSet.has(`${x + dx},${y + dy}`)).length;
  };
  assert([...cSet].every((k) => cNeighbors(k) <= 2), 'c tiles form an unbranched chain');
  assert(cNeighbors(`${path[0].x},${path[0].y}`) === 1, `cat starts at a chain end ${xy(path[0])} → direction is forced`);
  assert(pSet.has('7,4'), 'cat path goes through (7,4)');
}

// (7,4)가 병목: (7,4)를 벽으로 두면(걷기·점프 중간 칸 모두) 둥지에 못 간다
// → 교차점을 밟거나 뛰어넘지 않고 고양이를 돌아갈 길이 없다
{
  const pm = parseMap(map);
  const blockedAt = (p: Pos) => {
    const t = pm.tileAt(p);
    return t === null || t === '#' || (p.x === 7 && p.y === 4);
  };
  const key = (x: number, y: number, d: Dir) => `${x},${y},${d}`;
  const seen = new Set<string>([key(pm.start.x, pm.start.y, pm.start.dir)]);
  const queue: { x: number; y: number; d: Dir }[] = [{ x: pm.start.x, y: pm.start.y, d: pm.start.dir }];
  let reach = false;
  while (queue.length) {
    const s = queue.shift()!;
    if (s.x === pm.goal.x && s.y === pm.goal.y) { reach = true; break; }
    const next = [{ x: s.x, y: s.y, d: LEFT_OF[s.d] }, { x: s.x, y: s.y, d: RIGHT_OF[s.d] }];
    const a1 = { x: s.x + DELTA[s.d].x, y: s.y + DELTA[s.d].y };
    const a2 = { x: s.x + 2 * DELTA[s.d].x, y: s.y + 2 * DELTA[s.d].y };
    if (!blockedAt(a1) && pm.tileAt(a1) !== 'O') next.push({ ...a1, d: s.d });
    if (!blockedAt(a1) && !blockedAt(a2) && pm.tileAt(a2) !== 'O') next.push({ ...a2, d: s.d });
    for (const n of next) {
      const k = key(n.x, n.y, n.d);
      if (!seen.has(k)) { seen.add(k); queue.push(n); }
    }
  }
  assert(!reach, '(7,4) is a chokepoint: nest unreachable without passing it');
}

// ---------------------------------------------------------------- 정답들
assert(solutions.length === expect.length, 'solutions/expect aligned');
solutions.forEach((p, i) => {
  console.log(`\n== solution[${i}]`);
  console.log(toText(p).text);
  const v = validate(p, map);
  assert(v.ok, `validate ok (${v.errors.join(', ') || 'no errors'})`);
  const r = run(map, p);
  printTrace(r);
  const ctx = { cap: map.cap, firstSubmit: false, usedPatch: i === 0 };
  const sc = score(r, ctx);
  console.log(`  score ${sc.total} (usedPatch=${ctx.usedPatch}): ${sc.lines.map((l) => `${l.label} ${l.points}`).join(' | ')}`);
  const e = expect[i];
  assert(r.outcome === e.outcome, `outcome ${r.outcome} == ${e.outcome}`);
  assert(r.ticks === e.ticks, `ticks ${r.ticks} == ${e.ticks}`);
  assert(r.mice === e.mice, `mice ${r.mice} == ${e.mice}`);
  assert(r.blocks === e.blocks && countBlocks(p) === e.blocks, `blocks ${r.blocks} == ${e.blocks}`);
  assert(sc.total === e.score, `score ${sc.total} == ${e.score}`);
  assert(r.ticks === r.trace.length - 1, 'ticks == trace.length-1');
  assert(collided(r).length === 0, 'owl and cat never share a cell (밟았다/잡혔다 모두 없음)');
  assert(r.trace.filter((s) => s.tick > 0 && s.tick < r.ticks).every((s) => s.event !== 'goal'), 'nest reached only on the last tick');
});

// 대표 정답 = 잠자기 1개 포함 8블록, 37틱 goal, 쥐 2, 135점(usedPatch)
console.log('\n== acceptance 5');
{
  const p = solutions[0];
  const r = run(map, p);
  assert(countId(p, 'sleep') === 1, 'solutions[0] has exactly one sleep block');
  assert(r.trace.filter((s) => s.block === 'sleep').length === 1, 'that sleep executes exactly once');
  assert(countBlocks(p) === 8, 'solutions[0] is 8 blocks');
  assert(r.outcome === 'goal' && r.ticks === 37 && r.mice === 2, 'goal at exactly tick 37 with exactly 2 mice');
  const sc = score(r, { cap: 9, firstSubmit: false, usedPatch: true });
  assert(sc.total === 135, `score(usedPatch) = ${sc.total} == 135 (100 + 40 + 5 − 10)`);
  assert(JSON.stringify(sc.lines.map((l) => l.points)) === JSON.stringify([100, 40, 5, -10]), 'score lines 100 / 40 / 5 / −10');
  assert(JSON.stringify(noSleep) === JSON.stringify(removeOneSleep(p)), 'noSleep == solutions[0] with its sleep removed');
}

console.log('\n== noSleep');
console.log(toText(noSleep).text);
{
  const v = validate(noSleep, map);
  assert(v.ok, 'noSleep validates');
  assert(countBlocks(noSleep) === 7 && countId(noSleep, 'sleep') === 0, 'noSleep is 7 blocks without sleep');
  const r = run(map, noSleep);
  printTrace(r);
  const last = r.trace[r.trace.length - 1];
  const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  console.log(`  score ${sc.total}: ${sc.lines.map((l) => `${l.label} ${l.points}`).join(' | ')}`);
  assert(r.outcome === 'dead', `outcome ${r.outcome} == dead`);
  assert(r.ticks === 18, `dies at tick ${r.ticks} == 18`);
  assert(last.owl.x === 7 && last.owl.y === 4, `owl entered ${xy(last.owl)} == (7,4)`);
  assert(last.block === 'forward', 'the fatal action is a forward into the cat');
  assert(last.event === 'cat' && last.message === '고양이를 밟았다' && r.message === '고양이를 밟았다', 'message "고양이를 밟았다"');
  assert(!!r.trace[17].cat && r.trace[17].cat!.x === 7 && r.trace[17].cat!.y === 4, 'cat already stands on (7,4) after tick 17');
  assert(r.trace[17].owl.x === 7 && r.trace[17].owl.y === 3, 'owl waits on (7,3) after tick 17');
  assert(sc.total === 0, `score ${sc.total} == 0`);
  // 잠자기 하나 = 부엉이 경로 전체가 정확히 1틱 늦춰진다
  const withSleep = run(map, solutions[0]);
  const shifted = r.trace.every((s) => {
    const w = withSleep.trace[s.tick + 1].owl;
    return w.x === s.owl.x && w.y === s.owl.y && w.dir === s.owl.dir;
  });
  assert(shifted, 'solutions[0] owl route == noSleep route delayed by exactly 1 tick');
  const t19 = withSleep.trace[19];
  assert(t19.owl.x === 7 && t19.owl.y === 4 && !!t19.cat && !(t19.cat.x === 7 && t19.cat.y === 4),
    `with the sleep the owl crosses (7,4) at tick 19 while the cat is at ${xy(t19.cat)}`);
}

// ---------------------------------------------------------------- naive
console.log('\n== naive');
console.log(toText(naive.program).text);
{
  const r = run(map, naive.program);
  printTrace(r);
  const v = validate(naive.program, map);
  console.log(`  validate: ${v.ok ? 'ok' : v.errors.join(', ')}`);
  assert(!v.ok && v.codes.includes('E_CAP'), `naive exceeds the cap (${countBlocks(naive.program)}/${map.cap})`);
  assert(countId(naive.program, 'if_wall') + countId(naive.program, 'if_pit') === 0, 'naive has no sensors');
  assert(r.outcome === 'goal' && r.ticks === 37 && r.mice === 2, 'naive would reach the nest in 37 ticks with 2 mice if it fit');
  console.log(`  note: ${naive.note}`);
}

// ---------------------------------------------------------------- 함정 시연 (정답 아님)
const walk = noSleep;
const S: Block = { id: 'sleep' };
console.log('\n== trap: sleep at the end instead of the start');
{
  const r = run(map, [...walk, S]);
  printTrace(r);
  assert(r.outcome === 'dead' && r.ticks === 18 && r.message === '고양이를 밟았다', 'a trailing sleep never runs → same death at tick 18');
}
console.log('\n== trap: over-waiting (4 sleeps)');
{
  const r = run(map, [S, S, S, S, ...walk]);
  printTrace(r);
  assert(r.outcome === 'dead', `4 sleeps die too (${r.message} @ t${r.ticks})`);
  const r3 = run(map, [S, S, S, ...walk]);
  console.log(`  (3 sleeps → ${r3.outcome} @ t${r3.ticks}, 10 blocks > cap 9)`);
}
console.log('\n== trap: R3 pattern (no pit sensor) + sleep');
{
  const p: Program = [S, { id: 'repeat', n: 6, body: [{ id: 'repeat', n: 6, body: [
    { id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] },
  ] }] }];
  const r = run(map, p);
  printTrace(r);
  assert(r.outcome === 'dead' && r.message === '구덩이에 빠졌다' && r.ticks === 24, 'without if_pit the owl falls into (5,6) at tick 24');
}
console.log('\n== trap: sleep inside the loop body');
{
  const p: Program = [{ id: 'repeat', n: 6, body: [{ id: 'repeat', n: 6, body: [S, ...walk[0].id === 'repeat' ? (walk[0].body[0] as { body: Block[] }).body : []] }] }];
  const r = run(map, p);
  console.log(toText(p).text);
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} (sleeps executed: ${r.trace.filter((s) => s.block === 'sleep').length})`);
  assert(r.outcome !== 'goal', 'a sleep inside the loop runs many times and does not reach the nest');
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
