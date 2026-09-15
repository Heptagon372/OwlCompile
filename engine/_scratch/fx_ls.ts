// Scratch local search over R2 ring maps: route FJL F FJL J FJL FJ fixed (def{F J L} C F C J C C, 10 blocks),
// mice fixed at (6,5),(3,2). Mutate off-route cells and jump mids. Fitness = min def-free 2-mouse size (capped).
// npx tsx engine/_scratch/fx_ls.ts <seed> <iterations>
import { MAPS } from '../maps';
import { run } from '../index';
import type { GameMap } from '../index';
import { buildModel } from './fx_dplib';
import { prove } from './fx_prove_core';
import { parse } from './fx_probe';
let seed = Number(process.argv[2] ?? 1) >>> 0; const ITER = Number(process.argv[3] ?? 400);
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ROUTE = new Set(['3,6', '4,6', '6,6', '6,5', '6,4', '6,2', '4,2', '3,2', '1,2', '1,3', '1,5']);
const MIDS = ['5,6', '6,3', '5,2', '2,2', '1,4'];
const def = parse('def{F J L} C F C J C C');
const silent = () => {};
const fitness = (tiles: string[]): number => {
  const map: GameMap = { ...MAPS[2], tiles };
  const r = run(map, def);
  if (r.outcome !== 'goal' || r.mice !== 2 || r.ticks !== 13) return -1;
  const m = buildModel(map);
  for (const [S, K] of [[3, 5], [4, 6], [5, 7], [6, 8]]) {
    let hit: string | null;
    try { hit = prove(m, S, K, 2, silent); } catch { hit = 'x'; }
    if (hit) return K - 0.5;   // exists at <= K (min in (K-1, K])
  }
  return 9;                    // none <= 8
};
let cur = MAPS[2].tiles.map((r) => r.split(''));
let curF = fitness(cur.map((r) => r.join('')));
console.log(`start fitness ${curF}`);
const cells: [number, number][] = [];
for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!ROUTE.has(`${x},${y}`)) cells.push([x, y]);
for (let it = 0; it < ITER; it++) {
  const cand = cur.map((r) => [...r]);
  const k = 1 + Math.floor(rnd() * 3);
  for (let j = 0; j < k; j++) {
    const [x, y] = cells[Math.floor(rnd() * cells.length)];
    const isMid = MIDS.includes(`${x},${y}`);
    const opts = isMid ? ['O', '.'] : ['#', 'O', '.'];
    cand[y][x] = opts[Math.floor(rnd() * opts.length)];
  }
  const tiles = cand.map((r) => r.join(''));
  const f = fitness(tiles);
  if (f >= curF) {
    if (f > curF) console.log(`it ${it}: fitness ${f} ${JSON.stringify(tiles)}`);
    cur = cand; curF = f;
    if (f >= 9) { console.log(`TARGET ${JSON.stringify(tiles)}`); break; }
  }
}
console.log(`end fitness ${curF} ${JSON.stringify(cur.map((r) => r.join('')))}`);
