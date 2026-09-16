// 탐색용 스크립트 (설계 반복): npx tsx engine/_scratch/design_r8_b/explore.ts [all|bfs|rivals|traps]
import type { Block, GameMap, Program, RunResult } from '../../types';
import { run, checkMap } from '../../run';
import { toText } from '../../text';
import { score } from '../../score';
import { validate } from '../../validate';
import { reachableActions, shortestProgram, catCycle, type SearchSpec } from '../../verify-search';

const map: GameMap = {
  round: 8 as unknown as GameMap['round'],
  name: '고리 순찰', difficulty: '매우 어려움', cap: 9, seconds: 720, intro: '고리를 도는 고양이',
  tiles: [
    '########',
    '#S######',
    '#O######',
    '#.##K###',
    '#.##.###',
    '#O##O###',
    '#MOcc###',
    '###ccMDG',
  ],
  startDir: 'S',
  cat: { path: [{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 7 }, { x: 3, y: 7 }], mode: 'loop' },
};
const step = (): Block => ({ id: 'if_wall', then: [{ id: 'left' }], else: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] });
const walk9 = (): Block => ({ id: 'repeat', n: 9, body: [step()] });
const rep: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, walk9()] }];
const noSleep: Program = [{ id: 'repeat', n: 2, body: [walk9()] }];
const sleepTop: Program = [{ id: 'sleep' }, { id: 'repeat', n: 2, body: [walk9()] }];
const sleepAfter: Program = [{ id: 'repeat', n: 2, body: [walk9(), { id: 'sleep' }] }];
const twoTop: Program = [{ id: 'sleep' }, { id: 'sleep' }, { id: 'repeat', n: 2, body: [walk9()] }];
const rightWait: Program = [{ id: 'right' }, { id: 'repeat', n: 2, body: [walk9()] }];
const naive: Program = [
  { id: 'sleep' }, { id: 'jump' }, { id: 'forward' }, { id: 'jump' }, { id: 'left' },
  { id: 'jump' }, { id: 'forward' }, { id: 'left' }, { id: 'jump' }, { id: 'forward' },
  { id: 'sleep' }, { id: 'left' }, { id: 'left' }, { id: 'forward' }, { id: 'jump' }, { id: 'forward' }, { id: 'left' },
  { id: 'repeat', n: 3, body: [{ id: 'forward' }] },
];
const rep8: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, { id: 'repeat', n: 8, body: [step()] }] }];
const pitFirst: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, { id: 'repeat', n: 9, body: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'if_wall', then: [{ id: 'left' }], else: [{ id: 'forward' }] }] }] }] }];
const rep9: Program = [{ id: 'repeat', n: 9, body: [{ id: 'sleep' }, walk9()] }];
const nine: Program = [{ id: 'repeat', n: 2, body: [{ id: 'sleep' }, { id: 'repeat', n: 3, body: [{ id: 'repeat', n: 3, body: [step()] }] }] }];
const everyStep: Program = [{ id: 'repeat', n: 9, body: [{ id: 'sleep' }, step()] }];

const sc = (r: RunResult) => score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
const printTrace = (r: RunResult) => {
  for (const s of r.trace) console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(8)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) cat(${s.cat?.x},${s.cat?.y}) keys ${s.keys} mice ${s.mice} ${s.event ?? ''} ${s.message ?? ''}`);
  console.log(`  => ${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} score=${sc(r)}`);
};
const brief = (name: string, p: Program) => {
  const r = run(map, p); const last = r.trace[r.trace.length - 1];
  console.log(`${name}: ${r.outcome} t${r.ticks} owl(${last.owl.x},${last.owl.y}) ${last.event ?? ''} "${last.message}" mice ${r.mice} blocks ${r.blocks} score ${sc(r)} validate ${validate(p, map).codes.join(',') || 'ok'}`);
};
console.log('checkMap', checkMap(map), 'cycle', catCycle(map));
const which = process.argv[2] ?? 'all';
if (which === 'all' || which === 'traps') {
  console.log('== rep'); printTrace(run(map, rep));
  brief('noSleep', noSleep); brief('sleepTop', sleepTop); brief('sleepAfter', sleepAfter); brief('twoTop', twoTop); brief('rightWait', rightWait); brief('naive', naive); brief('rep8', rep8); brief('pitFirst', pitFirst); brief('rep9', rep9); brief('nine', nine); brief('everyStep', everyStep);
}
const time = <T,>(name: string, f: () => T): T => {
  const t0 = performance.now(); const v = f();
  const s = v && typeof v === 'object' && 'program' in (v as object) ? `${(v as { blocks: number }).blocks}블록 ${oneLine((v as { program: Program }).program)}` : JSON.stringify(v);
  console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${name}: ${s}`); return v;
};
const oneLine = (p: Program) => toText(p).text.replace(/\n\s*/g, ' / ');
const rivalBounds = (target: number) => {
  const total = map.tiles.join('').split('M').length - 1;
  const out: { minMice: number; maxBlocks: number }[] = [];
  for (let m = 0; m <= total; m++) { const b = Math.min(map.cap, Math.floor(map.cap - (target - 100 - 20 * m) / 5)); if (b >= 1) out.push({ minMice: m, maxBlocks: b }); }
  return out;
};
const noRival = (target: number, spec: Omit<SearchSpec, 'maxBlocks' | 'minMice'>, label: string) => {
  for (const b of rivalBounds(target)) time(`${label} 쥐≥${b.minMice} ≤${b.maxBlocks}블록`, () => shortestProgram(map, { ...spec, ...b }));
};
const rotated = (r: number): GameMap => { const p = map.cat!.path; return { ...map, cat: { ...map.cat!, path: [...p.slice(r), ...p.slice(0, r)] } }; };
if (which === 'all' || which === 'bfs') {
  time('BFS: any actions (sleep ok) → goal', () => reachableActions(map, { minMice: 0 }));
  for (let r = 0; r < 4; r++) time(`BFS: ${r} leading sleeps then no sleep → goal`, () => reachableActions(rotated(r), { minMice: 0, exclude: ['sleep'] }));
  const calm: GameMap = { ...map, cat: undefined, tiles: map.tiles.map((row) => row.replace(/c/g, '.')) };
  time('BFS: no cat, no sleep, 2 mice', () => reachableActions(calm, { minMice: 2, exclude: ['sleep'] }));
  const locked: GameMap = { ...map, tiles: map.tiles.map((row) => row.replace('D', '#')) };
  time('BFS: door as wall (sleep ok) → goal', () => reachableActions(locked, { minMice: 0 }));
}
if (which === 'all' || which === 'rivals') {
  noRival(150, { def: true }, '함수 써도 150 이상');
  noRival(145, { def: true, exclude: ['if_wall', 'if_pit'] }, '조건 없이 145 이상');
  noRival(145, { def: true, exclude: ['if_wall'] }, 'if_wall 없이 145 이상');
  noRival(145, { def: true, exclude: ['if_pit'] }, 'if_pit 없이 145 이상');
}
