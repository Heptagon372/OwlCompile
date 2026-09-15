// Scratch: sweep the R2 ring family (route FJL F FJL J FJL FJ, def{F J L} C F C J C C = 10 blocks).
// Vary: which of the 5 jump mids are pit/floor, the 3 corner-ahead cells (#/./O), optional mice pairs.
// Filter: def answer valid (goal, 2 mice, 13 ticks); no def-free 2-mouse program <= 7, then <= 8 (fx_prove core).
// npx tsx engine/_scratch/fx_ring.ts [shard] [shards] [micePairs=0|1]
import { MAPS } from '../maps';
import { run } from '../index';
import type { GameMap } from '../index';
import { buildModel } from './fx_dplib';
import { prove } from './fx_prove_core';
import { parse } from './fx_probe';

const shard = Number(process.argv[2] ?? 0), shards = Number(process.argv[3] ?? 1), pairs = process.argv[4] === '1';
const BASE = ['########', '######.#', '#.OM.O.#', '#.####O#', '#O#OO#.#', '#G####M#', '###S.O.O', '########'];
// jump mids: c1 (5,6), c2 (6,3), b (5,2), c3 (2,2), c4 (1,4)
const MIDS = [[5, 6], [6, 3], [5, 2], [2, 2], [1, 4]];
// corner-ahead cells: c1 facing E at (6,6) -> (7,6); c2 facing N at (6,2) -> (6,1); c3 facing W at (1,2) -> (0,2)
const AHEAD = [[7, 6], [6, 1], [0, 2]];
const ROUTE_CELLS = [[4, 6], [6, 6], [6, 5], [6, 4], [6, 2], [4, 2], [3, 2], [1, 2], [1, 3]];
const def = parse('def{F J L} C F C J C C');
const silent = () => {};
let n = 0, found = 0;
const t0 = Date.now();
for (let mm = 0; mm < 32; mm++) for (let am = 0; am < 27; am++) {
  if ((n++ % shards) !== shard) continue;
  const g = BASE.map((r) => r.split(''));
  // clear mice, set route cells floor
  for (const [x, y] of ROUTE_CELLS) g[y][x] = '.';
  MIDS.forEach(([x, y], i) => { g[y][x] = (mm >> i) & 1 ? '.' : 'O'; });
  let a = am;
  for (const [x, y] of AHEAD) { g[y][x] = ['#', '.', 'O'][a % 3]; a = Math.floor(a / 3); }
  const micePairs: [number, number][][] = pairs
    ? ROUTE_CELLS.flatMap((p, i) => ROUTE_CELLS.slice(i + 1).map((q) => [p as [number, number], q as [number, number]]))
    : [[[6, 5], [3, 2]]];
  for (const mp of micePairs) {
    const h = g.map((r) => [...r]);
    for (const [x, y] of mp) h[y][x] = 'M';
    const tiles = h.map((r) => r.join(''));
    const map: GameMap = { ...MAPS[2], tiles };
    const r = run(map, def);
    if (r.outcome !== 'goal' || r.mice !== 2) continue;
    const model = buildModel(map);
    let res: string | null;
    try { res = prove(model, 5, 7, 2, silent); } catch { res = 'found-list'; }
    if (res) continue;
    try { res = prove(model, 6, 8, 2, silent); } catch { res = 'found-list'; }
    if (res) { console.log(`near8 mids=${mm} ahead=${am} ${JSON.stringify(tiles)}`); continue; }
    found++;
    console.log(`SURVIVOR8 mids=${mm} ahead=${am} ${JSON.stringify(tiles)}`);
  }
}
console.log(`done shard ${shard}: survivors ${found} t=${Date.now() - t0}ms`);
