// 탐색용 스크립트 (설계 반복): npx tsx engine/_scratch/design_r9_a/explore.ts [all|trace|bfs|nopit|nowall|bare|best|flat|traps]
import type { Block, GameMap, Program, RunResult } from '../../types';
import { run, checkMap } from '../../run';
import { toText } from '../../text';
import { score } from '../../score';
import { reachableActions, shortestProgram, type SearchSpec } from '../../verify-search';

const map: GameMap = {
  round: 9 as unknown as GameMap['round'],
  name: '두 갈래 열쇠', difficulty: '매우 어려움', cap: 10, seconds: 780, intro: '열쇠를 먼저 찾아 되돌아오는 길',
  tiles: [
    '########',
    '#S.MO.K#',
    '##M#####',
    '##O#####',
    '##.#G###',
    '##.#D###',
    '##.O.###',
    '########',
  ],
  startDir: 'E',
};
const step = (turn: 'left' | 'right' = 'left'): Block => ({ id: 'if_wall', then: [{ id: turn }], else: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] });
const walk = (n: number, turn: 'left' | 'right' = 'left'): Block => ({ id: 'repeat', n, body: [step(turn)] });
const rep: Program = [{ id: 'def', body: [walk(9)] }, { id: 'call' }, { id: 'left' }, { id: 'call' }];
const flat: Program = [{ id: 'repeat', n: 2, body: [walk(9), { id: 'left' }] }];

const sc = (r: RunResult) => score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
const brief = (r: RunResult) => `${r.outcome} "${r.message}" ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} owl=(${r.owl.x},${r.owl.y},${r.owl.dir}) score=${sc(r)}`;
const printTrace = (r: RunResult) => {
  for (const s of r.trace) console.log(`  t${String(s.tick).padStart(2)} ${String(s.block ?? '-').padEnd(8)} owl(${s.owl.x},${s.owl.y},${s.owl.dir}) keys ${s.keys} mice ${s.mice} ${s.event ?? ''} ${s.message ?? ''}`);
  console.log('  =>', brief(r));
};
const oneLine = (p: Program) => toText(p).text.replace(/\n\s*/g, ' / ');
const time = (name: string, f: () => unknown) => {
  const t0 = performance.now();
  const v = f();
  const shown = v && typeof v === 'object' && 'program' in (v as object) ? `${(v as { blocks: number }).blocks}블록 ${oneLine((v as { program: Program }).program)}` : JSON.stringify(v);
  console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${name}: ${shown}`);
};
const rivalBounds = (target: number) => {
  const total = map.tiles.join('').split('M').length - 1;
  const out: { minMice: number; maxBlocks: number }[] = [];
  for (let m = 0; m <= total; m++) { const b = Math.min(map.cap, Math.floor(map.cap - (target - 100 - 20 * m) / 5)); if (b >= 1) out.push({ minMice: m, maxBlocks: b }); }
  return out;
};
const noRival = (target: number, spec: Omit<SearchSpec, 'maxBlocks' | 'minMice'>, label: string) => {
  for (const b of rivalBounds(target)) time(`${label} 쥐≥${b.minMice} ≤${b.maxBlocks}블록`, () => shortestProgram(map, { ...spec, ...b }));
};
const which = process.argv[2] ?? 'all';
const want = (k: string) => which === 'all' || which === k;
console.log('checkMap', checkMap(map));
if (want('trace')) { console.log('== rep'); printTrace(run(map, rep)); console.log('== flat'); console.log('  =>', brief(run(map, flat))); }
if (want('traps')) {
  const traps: [string, Program][] = [
    ['F(우회전) / 좌회전 / F(우회전)', [{ id: 'def', body: [walk(9, 'right')] }, { id: 'call' }, { id: 'left' }, { id: 'call' }]],
    ['F(우회전) / 우회전 / F(우회전)', [{ id: 'def', body: [walk(9, 'right')] }, { id: 'call' }, { id: 'right' }, { id: 'call' }]],
    ['F(좌회전) / 우회전 / F(좌회전)', [{ id: 'def', body: [walk(9)] }, { id: 'call' }, { id: 'right' }, { id: 'call' }]],
    ['반복 9 { 반복 9 { 한 걸음 } } (갈림길 회전 없음)', [{ id: 'repeat', n: 9, body: [walk(9)] }]],
    ['F=반복 8 (한 걸음 모자람)', [{ id: 'def', body: [walk(8)] }, { id: 'call' }, { id: 'left' }, { id: 'call' }]],
    ['F=반복 7', [{ id: 'def', body: [walk(7)] }, { id: 'call' }, { id: 'left' }, { id: 'call' }]],
    ['F 호출 / F 호출 (회전 없음)', [{ id: 'def', body: [walk(9)] }, { id: 'call' }, { id: 'call' }]],
    ['열쇠 무시: 좌회전 앞으로… 곧장 문으로', [{ id: 'right' }, { id: 'forward' }, { id: 'repeat', n: 9, body: [step()] }]],
    ['열쇠 없이 곧장: 앞으로 / 우회전 / 반복 9 { 한 걸음 }', [{ id: 'forward' }, { id: 'right' }, walk(9)]],
  ];
  for (const [name, p] of traps) { const r = run(map, p); console.log(`  ${name} → ${brief(r)} last=${r.trace[r.trace.length - 1].event ?? ''}`); }
}
if (want('bfs')) {
  time('BFS: door as wall → nest?', () => { const locked: GameMap = { ...map, tiles: map.tiles.map((r) => r.replace('D', '#')) }; return reachableActions(locked, { minMice: 0 }); });
  time('BFS: no key (K→.) → nest?', () => { const nokey: GameMap = { ...map, tiles: map.tiles.map((r) => r.replace('K', '.')) }; return reachableActions(nokey, { minMice: 0 }); });
  time('BFS: any actions reach nest with 2 mice?', () => reachableActions(map, { minMice: 2 }));
  time('BFS: jump 없이 둥지?', () => reachableActions(map, { minMice: 0, exclude: ['jump'] }));
}
if (want('flat')) noRival(155, {}, '함수 없이 155점 이상');
if (want('best')) noRival(155, { def: true }, '함수 써도 155점 이상');
if (want('bare')) time('조건 없이(함수 허용) 10블록 이하 둥지', () => shortestProgram(map, { maxBlocks: 10, minMice: 0, def: true, exclude: ['if_wall', 'if_pit'] }));
if (want('nopit')) noRival(140, { def: true, exclude: ['if_pit'] }, 'if_pit 없이 140점 이상');
if (want('nowall')) noRival(140, { def: true, exclude: ['if_wall'] }, 'if_wall 없이 140점 이상');
if (want('nopit_nodef')) noRival(140, { exclude: ['if_pit'] }, 'if_pit 없이(함수 없이) 140점 이상');
if (want('nowall_nodef')) noRival(140, { exclude: ['if_wall'] }, 'if_wall 없이(함수 없이) 140점 이상');
