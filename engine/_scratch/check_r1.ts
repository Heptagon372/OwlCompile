// 스크래치: Round 1 검증. 실행:  npx tsx engine/_scratch/check_r1.ts
import { run, validate, score, countBlocks, toText, checkMap } from '../index';
import { map, solutions, expect, naive } from '../rounds/r1';

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures += 1;
};

console.log(`== R${map.round} ${map.name} (${map.difficulty}, cap ${map.cap}, ${map.seconds}s, intro "${map.intro}")`);
console.log(map.tiles.join('\n'));

// --- 맵 구조
const problems = checkMap(map);
assert(problems.length === 0, `checkMap 문제 없음 ${problems.length ? JSON.stringify(problems) : ''}`);
assert(map.round === 1 && map.name === 'Hello, Owl' && map.difficulty === '쉬움' && map.cap === 12
  && map.seconds === 300 && map.intro === '앞으로·회전·반복', '라운드 표 고정값 일치');
const all = map.tiles.join('');
assert(!/[OcKD]/.test(all) && !map.cat, 'R1: 구덩이·고양이·열쇠·문 없음');
assert(all.split('').filter((c) => c === 'M').length >= 1 && all.split('').filter((c) => c === 'M').length <= 2, '쥐 1~2마리');
assert(solutions.length === expect.length, 'solutions와 expect 1:1');

// --- 각 정답 실행
solutions.forEach((program, i) => {
  console.log(`\n--- solutions[${i}] (${countBlocks(program)}블록)`);
  console.log(toText(program).text);
  const v = validate(program, map);
  assert(v.ok, `validate 통과 ${v.ok ? '' : JSON.stringify(v.errors)}`);
  const r = run(map, program);
  for (const s of r.trace) {
    console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(8)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) cat=${s.cat ? `(${s.cat.x},${s.cat.y})` : 'none'} ${s.event ?? ''} ${s.message ?? ''}`);
  }
  const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} score=${sc.total} ${JSON.stringify(sc.lines)}`);
  const e = expect[i];
  assert(r.outcome === e.outcome, `outcome ${r.outcome} == ${e.outcome}`);
  assert(r.ticks === e.ticks, `ticks ${r.ticks} == ${e.ticks}`);
  assert(r.mice === e.mice, `mice ${r.mice} == ${e.mice}`);
  assert(r.blocks === e.blocks, `blocks ${r.blocks} == ${e.blocks}`);
  assert(sc.total === e.score, `score ${sc.total} == ${e.score}`);
  assert(r.ticks === r.trace.length - 1, 'ticks == trace.length - 1');
});

// --- R1 고유 제약
const rep = solutions[0];
assert(countBlocks(rep) <= 5, `대표 정답 ≤ 5블록 (${countBlocks(rep)})`);
assert(JSON.stringify(rep).includes('"repeat"'), '대표 정답에 repeat 사용');
const repTicks = run(map, rep).ticks;
assert(repTicks >= 8 && repTicks <= 14, `대표 정답 8~14틱 (${repTicks})`);
assert(countBlocks(naive.program) >= 9, `naive ≥ 9블록 (${countBlocks(naive.program)})`);
assert(naive.program.every((b) => b.id === 'forward' || b.id === 'left' || b.id === 'right'), 'naive는 forward/left/right만');
const nr = run(map, naive.program);
assert(nr.outcome === 'goal', `naive도 goal (${nr.outcome})`);
assert(naive.note.length > 0, 'naive.note 있음');

// --- 함정 확인 (정보용)
const trap1 = run(map, [{ id: 'repeat', n: 5, body: [{ id: 'forward' }] }]);
console.log(`\n함정: 앞으로 5 → ${trap1.outcome} "${trap1.message}" at (${trap1.owl.x},${trap1.owl.y}) tick ${trap1.ticks}`);
const trap2 = run(map, [{ id: 'repeat', n: 4, body: [{ id: 'forward' }] }, { id: 'left' }, { id: 'forward' }]);
console.log(`함정: 모퉁이 좌회전 → ${trap2.outcome} "${trap2.message}" at (${trap2.owl.x},${trap2.owl.y})`);
const trap3 = run(map, [{ id: 'repeat', n: 4, body: [{ id: 'forward' }, { id: 'right' }] }]);
console.log(`함정: 반복 4 { 앞으로 우회전 } → ${trap3.outcome} "${trap3.message}" at (${trap3.owl.x},${trap3.owl.y}) tick ${trap3.ticks}`);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
