// 스크래치: Round 3 검증. 실행: npx tsx engine/_scratch/check_r3.ts
import { checkMap, countBlocks, run, score, toText, validate } from '../index';
import { expect, map, naive, solutions } from '../rounds/r3';

let failures = 0;
const assert = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
};

// 맵 구조
assert('checkMap 문제 없음', checkMap(map).length === 0, checkMap(map).join('; '));
assert('round 고정값', map.round === 3 && map.name === '나선' && map.difficulty === '중간'
  && map.cap === 7 && map.seconds === 420 && map.intro === '만약 앞이 벽이면');
const all = map.tiles.join('');
assert('구덩이/열쇠/문/고양이 없음', !/[OKDc]/.test(all) && !map.cat);
assert('쥐 정확히 2마리', all.split('').filter((c) => c === 'M').length === 2);
assert('테두리 전부 벽', map.tiles[0] === '########' && map.tiles[7] === '########'
  && map.tiles.every((r) => r[0] === '#' && r[7] === '#'));

// 대표 정답 텍스트
const canon = toText(solutions[0]).text;
console.log('\n--- solutions[0] ---\n' + canon + '\n');
assert('solutions[0] 텍스트 = cards.html 히어로', canon === [
  '반복 4 {', '  반복 5 {', '    만약 앞이 벽이면 {', '      우회전', '    } 아니면 {', '      앞으로', '    }', '  }', '}',
].join('\n'));

assert('solutions/expect 1:1', solutions.length === expect.length);

const goalPos = (() => {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (map.tiles[y][x] === 'G') return { x, y };
  throw new Error('no G');
})();

solutions.forEach((prog, i) => {
  const v = validate(prog, map);
  const r = run(map, prog);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  console.log(`\n=== solution[${i}] blocks=${countBlocks(prog)} ===`);
  for (const st of r.trace) {
    console.log(`t${String(st.tick).padStart(2)} ${String(st.block ?? '-').padEnd(8)} owl=(${st.owl.x},${st.owl.y},${st.owl.dir}) cat=${st.cat ? `(${st.cat.x},${st.cat.y})` : 'none'} ev=${st.event ?? '-'} mice=${st.mice}`);
  }
  console.log(`→ outcome=${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} score=${s.total} [${s.lines.map((l) => `${l.label}:${l.points}`).join(', ')}]`);
  const e = expect[i];
  assert(`solution[${i}] validate ok`, v.ok, v.errors.join('; '));
  assert(`solution[${i}] outcome ${e.outcome}`, r.outcome === e.outcome, r.outcome);
  assert(`solution[${i}] ticks ${e.ticks}`, r.ticks === e.ticks, String(r.ticks));
  assert(`solution[${i}] mice ${e.mice}`, r.mice === e.mice, String(r.mice));
  assert(`solution[${i}] blocks ${e.blocks}`, r.blocks === e.blocks, String(r.blocks));
  assert(`solution[${i}] score ${e.score}`, s.total === e.score, String(s.total));
  assert(`solution[${i}] ticks == trace.length-1`, r.ticks === r.trace.length - 1);
  const wallBumps = r.trace.filter((st) => st.event === 'wall').length;
  assert(`solution[${i}] 벽 충돌 없음`, wallBumps === 0);
  const earlyGoal = r.trace.slice(0, -1).some((st) => st.owl.x === goalPos.x && st.owl.y === goalPos.y);
  assert(`solution[${i}] 마지막 틱 전에 둥지 안 밟음`, !earlyGoal);
});

// 함정 시연(assert 아님, 정보용) + naive
console.log('\n=== traps ===');
const hard = run(map, [{ id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: [{ id: 'forward' }] }, { id: 'right' }] }]);
console.log(`반복4{반복5{앞으로} 우회전}: ${hard.outcome} t${hard.ticks} "${hard.message}" owl=(${hard.owl.x},${hard.owl.y})`);
const leftT = run(map, [{ id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: [{ id: 'if_wall', then: [{ id: 'left' }], else: [{ id: 'forward' }] }] }] }]);
console.log(`좌회전 변형: ${leftT.outcome} t${leftT.ticks} "${leftT.message}" owl=(${leftT.owl.x},${leftT.owl.y})`);
const nv = validate(naive.program, map);
const nr = run(map, naive.program);
console.log(`naive: blocks=${countBlocks(naive.program)} validate=${nv.ok} codes=${nv.codes.join(',')} run=${nr.outcome} t${nr.ticks} mice=${nr.mice}`);
assert('naive는 상한 초과(E_CAP)', !nv.ok && nv.codes.includes('E_CAP'));
assert('naive도 실행하면 20틱 둥지 (설명 일관성)', nr.outcome === 'goal' && nr.ticks === 20 && nr.mice === 2);
assert('하드코딩 5·5 는 벽 충돌', hard.outcome === 'error');
assert('좌회전 변형은 실패', leftT.outcome !== 'goal');

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
