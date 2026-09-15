// Scratch: generate R2 corridor-map candidates for route = X a X (|X| = 4, def{X} C a C = 8 blocks)
// and keep those where NO def-free program of <= K blocks reaches the nest at all (mice ignored).
// npx tsx engine/_scratch/fx_gen.ts <shard> <shards> [K=8]
import type { GameMap } from '../index';
import { MAPS } from '../maps';
import { buildModel, search, GOAL, acceptMice } from './fx_dplib';

const shard = Number(process.argv[2] ?? 0), shards = Number(process.argv[3] ?? 1), K = Number(process.argv[4] ?? 8);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W
const isTurn = (c: string) => c === 'L' || c === 'R';
const acts = ['F', 'J', 'L', 'R'];
const Xs: string[] = [];
for (const a of acts) for (const b of acts) for (const c of acts) for (const d of acts) {
  const x = a + b + c + d;
  if (isTurn(d)) continue;                       // ends with a move (goal on the last action)
  if (![...x].some(isTurn) || !x.includes('J')) continue;
  if (/LR|RL|LLL|RRR/.test(x)) continue;
  if ([...x].find(isTurn) !== 'L') continue;     // mirror canonical
  Xs.push(x);
}
interface Cand { route: string; X: string; a: string; tiles: string[]; dir: string; cells: Set<string> }
const cands: Cand[] = [];
for (const X of Xs) for (const a of acts) {
  const route = X + a + X;
  if (/LR|RL|LLL|RRR/.test(route)) continue;
  // simulate from (0,0) facing E
  let x = 0, y = 0, d = 1; const used = new Map<string, string>(); used.set('0,0', 'S');
  const turnAhead: string[] = []; let ok = true;
  for (let i = 0; i < route.length && ok; i++) {
    const c = route[i];
    if (c === 'L' || c === 'R') { turnAhead.push(`${x + DX[d]},${y + DY[d]}`); d = (d + (c === 'L' ? 3 : 1)) & 3; continue; }
    if (c === 'J') { const mk = `${x + DX[d]},${y + DY[d]}`; if (used.has(mk)) { ok = false; break; } used.set(mk, 'O'); x += 2 * DX[d]; y += 2 * DY[d]; }
    else { x += DX[d]; y += DY[d]; }
    const k = `${x},${y}`; if (used.has(k)) { ok = false; break; }
    used.set(k, i === route.length - 1 ? 'G' : '.');
  }
  if (!ok) continue;
  const xs = [...used.keys()].map((k) => Number(k.split(',')[0])), ys = [...used.keys()].map((k) => Number(k.split(',')[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX > 5 || maxY - minY > 5) continue;
  const opts = [...new Set(turnAhead)].filter((k) => !used.has(k));
  const seen = new Set<string>();
  for (let ox = 1 - minX; ox + maxX <= 6; ox++) for (let oy = 1 - minY; oy + maxY <= 6; oy++) {
    const inner = opts.map((k) => { const [px, py] = k.split(',').map(Number); return { px: px + ox, py: py + oy, k }; })
      .filter((p) => p.px >= 1 && p.px <= 6 && p.py >= 1 && p.py <= 6);
    const nComb = 3 ** inner.length;
    for (let m = 0; m < nComb; m++) {
      const grid = Array.from({ length: 8 }, () => Array(8).fill('#'));
      for (const [k, t] of used) { const [px, py] = k.split(',').map(Number); grid[py + oy][px + ox] = t; }
      let mm = m;
      for (const p of inner) { grid[p.py][p.px] = ['#', '.', 'O'][mm % 3]; mm = Math.floor(mm / 3); }
      const tiles = grid.map((r) => r.join(''));
      // translation-invariant key (only relative layout matters when everything else is wall)
      const key = tiles.join('|').replace(/^#+|#+$/g, '');
      if (seen.has(key)) continue; seen.add(key);
      const cellSet = new Set<string>(); for (const [k, t] of used) if (t === '.') { const [px, py] = k.split(',').map(Number); cellSet.add((px + ox) + ',' + (py + oy)); }
      cands.push({ route, X, a, tiles, dir: 'E', cells: cellSet });
    }
  }
}
console.log(`X ${Xs.length}, candidates ${cands.length}, shard ${shard}/${shards}`);
const anyGoal = (v: number) => (v & 1023) === GOAL;
let survivors = 0;
const t0 = Date.now();
for (let i = shard; i < cands.length; i += shards) {
  const c = cands[i];
  const base: GameMap = { ...MAPS[2], tiles: c.tiles, startDir: 'E' };
  const r0 = search(buildModel(base), { K, accept: anyGoal });
  if (r0.size !== null && r0.size < 7) continue;
  // mice on route cells (floor landings, not S/G)
  const cells: [number, number][] = [];
  c.tiles.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.' && c.cells.has(x + ',' + y)) cells.push([x, y]); }));
  for (let p = 0; p < cells.length; p++) for (let q = p + 1; q < cells.length; q++) {
    const g = c.tiles.map((r) => r.split(''));
    g[cells[p][1]][cells[p][0]] = 'M'; g[cells[q][1]][cells[q][0]] = 'M';
    const tiles = g.map((r) => r.join(''));
    const map: GameMap = { ...base, tiles };
    const model = buildModel(map);
    const r6 = search(model, { K: Math.min(6, K), accept: acceptMice(2) });
    if (r6.size !== null) continue;
    const r = search(model, { K, accept: acceptMice(2) });
    if (r.size !== null) continue;
    survivors++;
    console.log('SURVIVOR m0=' + r0.size + ' route=' + c.route + ' X=' + c.X + ' a=' + c.a + ' tiles=' + JSON.stringify(tiles));
  }
}
console.log('done shard ' + shard + ': survivors ' + survivors + ' in ' + (Date.now() - t0) + 'ms');
