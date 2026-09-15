// Scratch: R2 candidates for route = X a X, |X| = 5 (def{X} C a C = 9 blocks, hardcoded 11).
// Full 8x8 grid allowed. Keep geometry+mice where NO def-free program <= K reaches the nest with 2 mice.
// npx tsx engine/_scratch/fx_gen2.ts <shard> <shards> [K=9] [maxSurvivors=5]
import type { GameMap } from '../index';
import { MAPS } from '../maps';
import { buildModel, search, acceptMice } from './fx_dplib';

const shard = Number(process.argv[2] ?? 0), shards = Number(process.argv[3] ?? 1);
const K = Number(process.argv[4] ?? 9), MAXS = Number(process.argv[5] ?? 5);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const isTurn = (c: string) => c === 'L' || c === 'R';
const acts = ['F', 'J', 'L', 'R'];
const Xs: string[] = [];
const gen = (p: string) => {
  if (p.length === 5) {
    if (isTurn(p[4]) || ![...p].some(isTurn) || !p.includes('J')) return;
    if (/LR|RL|LLL|RRR|FF/.test(p)) return;            // FF in a straight line is J-able
    if ([...p].find(isTurn) !== 'L') return;
    Xs.push(p); return;
  }
  for (const a of acts) gen(p + a);
};
gen('');
interface Cand { route: string; tiles: string[]; cells: string[] }
const cands: Cand[] = [];
for (const X of Xs) for (const a of acts) {
  const route = X + a + X;
  if (/LR|RL|LLL|RRR|FF/.test(route)) continue;
  let x = 0, y = 0, d = 1; const used = new Map<string, string>(); used.set('0,0', 'S');
  const turnAhead: string[] = []; let ok = true;
  for (let i = 0; i < route.length && ok; i++) {
    const c = route[i];
    if (isTurn(c)) { turnAhead.push(`${x + DX[d]},${y + DY[d]}`); d = (d + (c === 'L' ? 3 : 1)) & 3; continue; }
    if (c === 'J') { const mk = `${x + DX[d]},${y + DY[d]}`; if (used.has(mk)) { ok = false; break; } used.set(mk, 'O'); x += 2 * DX[d]; y += 2 * DY[d]; }
    else { x += DX[d]; y += DY[d]; }
    const k = `${x},${y}`; if (used.has(k)) { ok = false; break; }
    used.set(k, i === route.length - 1 ? 'G' : '.');
  }
  if (!ok) continue;
  const pts = [...used.keys()].map((k) => k.split(',').map(Number));
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  if (maxX - minX > 7 || maxY - minY > 7) continue;
  const opts = [...new Set(turnAhead)].filter((k) => !used.has(k));
  const seen = new Set<string>();
  for (let ox = -minX; ox + maxX <= 7; ox++) for (let oy = -minY; oy + maxY <= 7; oy++) {
    const inner = opts.map((k) => { const [px, py] = k.split(',').map(Number); return { px: px + ox, py: py + oy }; })
      .filter((p) => p.px >= 0 && p.px <= 7 && p.py >= 0 && p.py <= 7);
    for (let m = 0; m < 3 ** inner.length; m++) {
      const grid = Array.from({ length: 8 }, () => Array(8).fill('#'));
      for (const [k, t] of used) { const [px, py] = k.split(',').map(Number); grid[py + oy][px + ox] = t; }
      let mm = m;
      for (const p of inner) { grid[p.py][p.px] = ['#', '.', 'O'][mm % 3]; mm = Math.floor(mm / 3); }
      const tiles = grid.map((r) => r.join(''));
      // canonical key: layout relative to the route bounding box + which turn-ahead cells are off-map
      const key = inner.map((p) => `${p.px - ox},${p.py - oy}:${grid[p.py][p.px]}`).join(';') + '|' + route;
      if (seen.has(key)) continue; seen.add(key);
      const cells = [...used].filter(([, t]) => t === '.').map(([k]) => { const [px, py] = k.split(',').map(Number); return `${px + ox},${py + oy}`; });
      cands.push({ route, tiles, cells });
    }
  }
}
console.log(`X ${Xs.length}, candidates ${cands.length}, shard ${shard}/${shards}`);
let survivors = 0;
const t0 = Date.now();
let done = 0;
outer: for (let i = shard; i < cands.length; i += shards) {
  const c = cands[i];
  done++;
  if (done % 50 === 0) console.log(`progress ${done} t=${Date.now() - t0}ms`);
  const base: GameMap = { ...MAPS[2], tiles: c.tiles, startDir: 'E' };
  for (let p = 0; p < c.cells.length; p++) for (let q = p + 1; q < c.cells.length; q++) {
    const g = c.tiles.map((r) => r.split(''));
    for (const k of [c.cells[p], c.cells[q]]) { const [px, py] = k.split(',').map(Number); g[py][px] = 'M'; }
    const map: GameMap = { ...base, tiles: g.map((r) => r.join('')) };
    const model = buildModel(map);
    if (search(model, { K: 6, accept: acceptMice(2) }).size !== null) continue;
    if (search(model, { K: 7, accept: acceptMice(2) }).size !== null) continue;
    const r = search(model, { K, accept: acceptMice(2) });
    if (r.size !== null) { console.log(`near-miss (${r.size}) route=${c.route} tiles=${JSON.stringify(map.tiles)}`); continue; }
    survivors++;
    console.log(`SURVIVOR route=${c.route} tiles=${JSON.stringify(map.tiles)}`);
    if (survivors >= MAXS) break outer;
  }
}
console.log(`done shard ${shard}: survivors ${survivors} in ${Date.now() - t0}ms`);
