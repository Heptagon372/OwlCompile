// R4 검증 스크립트: npx tsx engine/_scratch/check_r4.ts
import { run, validate, score, countBlocks, toText, checkMap, parseMap, DELTA, LEFT_OF, RIGHT_OF } from '../index';
import type { Block, Dir, Pos, Program, RunResult } from '../index';
import { map, solutions, expect, naive } from '../rounds/r4';

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
    console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(8)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) cat ${cat} keys ${s.keys} mice ${s.mice} ${s.event ?? ''} ${s.message ?? ''}`);
  }
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} distance=${r.distance}`);
};

// ---------------------------------------------------------------- 맵 구조
console.log('== map');
console.log(map.tiles.join('\n'));
const problems = checkMap(map);
assert(problems.length === 0, `checkMap: ${problems.join('; ') || 'ok'}`);
const all = map.tiles.join('');
const count = (ch: string) => all.split('').filter((c) => c === ch).length;
assert(count('K') === 1, 'K exactly 1');
assert(count('D') === 1, 'D exactly 1');
assert(count('c') === 0 && !map.cat, 'no cat');
assert(count('M') >= 1 && count('M') <= 2, `mice 1–2 (${count('M')})`);
assert(count('O') >= 4, `pits form a staircase (${count('O')} pits)`);
assert(map.round === 4 && map.name === '열쇠와 계단' && map.difficulty === '중간' && map.cap === 10
  && map.seconds === 480 && map.intro === '열쇠·문·만약 앞이 구덩이면', 'fixed round-table fields');
const border = [map.tiles[0], map.tiles[7], ...map.tiles.map((r) => r[0] + r[7])].join('');
assert(/^#+$/.test(border), 'framed with walls');

// 문을 영영 못 여는 세계에서 둥지 도달 가능성 BFS (forward/jump/left/right, 문=벽, 구덩이=진입 불가)
{
  const pm = parseMap(map);
  const tile = (p: Pos) => pm.tileAt(p);
  const solid = (p: Pos) => { const t = tile(p); return t === null || t === '#' || t === 'D'; };
  const dirs: Dir[] = ['N', 'E', 'S', 'W'];
  const key = (x: number, y: number, d: Dir) => `${x},${y},${d}`;
  const seen = new Set<string>();
  const queue: { x: number; y: number; d: Dir }[] = [{ x: pm.start.x, y: pm.start.y, d: pm.start.dir }];
  seen.add(key(pm.start.x, pm.start.y, pm.start.dir));
  let reachGoal = false;
  while (queue.length) {
    const s = queue.shift()!;
    if (s.x === pm.goal.x && s.y === pm.goal.y) { reachGoal = true; break; }
    const next: { x: number; y: number; d: Dir }[] = [
      { x: s.x, y: s.y, d: LEFT_OF[s.d] }, { x: s.x, y: s.y, d: RIGHT_OF[s.d] },
    ];
    const a1 = { x: s.x + DELTA[s.d].x, y: s.y + DELTA[s.d].y };
    const a2 = { x: s.x + 2 * DELTA[s.d].x, y: s.y + 2 * DELTA[s.d].y };
    if (!solid(a1) && tile(a1) !== 'O') next.push({ ...a1, d: s.d });
    if (!solid(a1) && !solid(a2) && tile(a2) !== 'O') next.push({ ...a2, d: s.d });
    for (const n of next) {
      const k = key(n.x, n.y, n.d);
      if (!seen.has(k)) { seen.add(k); queue.push(n); }
    }
  }
  void dirs;
  assert(!reachGoal, 'nest unreachable while the door stays locked');
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
  const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  console.log(`  score ${sc.total}: ${sc.lines.map((l) => `${l.label} ${l.points}`).join(' | ')}`);
  const e = expect[i];
  assert(r.outcome === e.outcome, `outcome ${r.outcome} == ${e.outcome}`);
  assert(r.ticks === e.ticks, `ticks ${r.ticks} == ${e.ticks}`);
  assert(r.mice === e.mice, `mice ${r.mice} == ${e.mice}`);
  assert(r.blocks === e.blocks && countBlocks(p) === e.blocks, `blocks ${r.blocks} == ${e.blocks}`);
  assert(sc.total === e.score, `score ${sc.total} == ${e.score}`);
  assert(r.ticks === r.trace.length - 1, 'ticks == trace.length-1');
  const keyTick = r.trace.find((s) => s.event === 'key')?.tick ?? -1;
  const doorTick = r.trace.find((s) => s.event === 'door')?.tick ?? -1;
  assert(keyTick > 0 && doorTick > keyTick, `key (t${keyTick}) before door (t${doorTick})`);
  if (i === 0) {
    assert(r.blocks <= 8, 'representative ≤ 8 blocks');
    assert(contains(p, 'if_pit'), 'representative uses if_pit');
    const jumps = r.trace.filter((s) => s.block === 'jump').length;
    const fwds = r.trace.filter((s) => s.block === 'forward').length;
    assert(jumps >= 2 && fwds >= 2, `staircase: loop body both jumps (${jumps}) and walks (${fwds})`);
  }
});

// ---------------------------------------------------------------- naive
console.log('\n== naive');
console.log(toText(naive.program).text);
{
  const r = run(map, naive.program);
  printTrace(r);
  const v = validate(naive.program, map);
  console.log(`  validate: ${v.ok ? 'ok' : v.errors.join(', ')}`);
  assert(!contains(naive.program, 'if_pit'), 'naive has no if_pit');
  assert(r.outcome === 'goal', 'naive reaches the nest');
  assert(countBlocks(naive.program) > countBlocks(solutions[0]), `naive longer (${countBlocks(naive.program)} > ${countBlocks(solutions[0])})`);
  console.log(`  note: ${naive.note}`);
}

// ---------------------------------------------------------------- 함정 시연 (정답 아님)
console.log('\n== trap: R3 pattern (if_wall only)');
{
  const p: Program = [{ id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }] }] }];
  const r = run(map, p);
  printTrace(r);
  assert(r.outcome === 'dead' && r.ticks === 2, 'R3 pattern dies in the first pit at tick 2');
}
console.log('\n== trap: staircase loop but no turn');
{
  const p: Program = [{ id: 'repeat', n: 9, body: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] }];
  const r = run(map, p);
  printTrace(r);
  assert(r.outcome === 'error' && r.ticks === 4, 'without a turn the owl bumps the east wall at tick 4');
}
console.log('\n== trap: jumping over the locked door while holding the key');
{
  // 열쇠가 있어도 문 위는 뛰어넘을 수 없다(midBlocked) — (4,6)에서 서쪽으로 점프하면 벽 에러
  const p: Program = [{ id: 'forward' }, { id: 'jump' }, { id: 'jump' }, { id: 'right' }, { id: 'jump' }, { id: 'forward' }, { id: 'jump' }, { id: 'right' }, { id: 'jump' }, { id: 'jump' }];
  const r = run(map, p);
  printTrace(r);
  assert(r.outcome === 'error' && r.message === '벽은 뛰어넘을 수 없다', 'cannot jump over the locked door even with a key');
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
