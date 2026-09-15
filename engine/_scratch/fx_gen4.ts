// Scratch: R2 candidates with non-periodic call layouts (D = 9):
//   F1: X a X b X   (|X| = 3; def{X} C a C b C = 9)
//   F3: a X b X     (|X| = 4; def{X} a C b C = 9)
// Each J mid may be pit or floor (<= 2 floor mids). Turn-ahead cells: wall / floor alcove / pit. Full 8x8 grid.
// Stage A: all def-route floor cells as mice -> if a def-free program <= K visits all, geometry dead.
// Stage B: each mice pair, 2 mice, <= K.
// npx tsx engine/_scratch/fx_gen4.ts <family F1|F3> <shard> <shards> [K=9] [maxSurvivors=3]
import type { GameMap } from '../index';
import { MAPS } from '../maps';
import * as L32 from './fx_dplib32';
import * as L16 from './fx_dplib';

const fam = process.argv[2] ?? 'F1';
const shard = Number(process.argv[3] ?? 0), shards = Number(process.argv[4] ?? 1);
const K = Number(process.argv[5] ?? 9), MAXS = Number(process.argv[6] ?? 3);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const isTurn = (c: string) => c === 'L' || c === 'R';
const acts = ['F', 'J', 'L', 'R'];
const xlen = fam === 'F1' ? 3 : 4;
const Xs: string[] = [];
const gen = (p: string) => {
  if (p.length === xlen) {
    if (![...p].some(isTurn) || !p.includes('J')) return;
    if (/LR|RL|LLL|RRR/.test(p)) return;
    Xs.push(p); return;
  }
  for (const a of acts) gen(p + a);
};
gen('');
const routes: string[] = [];
for (const X of Xs) for (const a of acts) for (const b of acts) {
  if (a === b) continue;
  const r = fam === 'F1' ? X + a + X + b + X : a + X + b + X;
  if (isTurn(r[r.length - 1])) continue;                 // goal on the last action
  if (/LR|RL|LLL|RRR/.test(r)) continue;
  if ([...r].find(isTurn) !== 'L') continue;             // mirror canonical
  routes.push(r);
}
interface Cand { route: string; tiles: string[]; cells: string[] }
const cands: Cand[] = [];
for (const route of routes) {
  const nJ = [...route].filter((c) => c === 'J').length;
  for (let midMask = 0; midMask < (1 << nJ); midMask++) {
    let floors = 0; for (let t = midMask; t; t >>= 1) floors += t & 1;
    if (floors > 2 || floors === nJ) continue;
    let x = 0, y = 0, d = 1, j = 0; const used = new Map<string, string>(); used.set('0,0', 'S');
    const turnAhead: string[] = []; let ok = true;
    for (let i = 0; i < route.length && ok; i++) {
      const c = route[i];
      if (isTurn(c)) { turnAhead.push(`${x + DX[d]},${y + DY[d]}`); d = (d + (c === 'L' ? 3 : 1)) & 3; continue; }
      if (c === 'J') {
        const mk = `${x + DX[d]},${y + DY[d]}`; const t = (midMask >> j++) & 1 ? '_' : 'O';
        if (used.has(mk)) { if (!(t === '_' && used.get(mk) === '.')) { ok = false; break; } } else used.set(mk, t);
        x += 2 * DX[d]; y += 2 * DY[d];
      } else { x += DX[d]; y += DY[d]; }
      const k = `${x},${y}`;
      if (used.has(k)) { ok = false; break; }
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
        for (const [k, t] of used) { const [px, py] = k.split(',').map(Number); grid[py + oy][px + ox] = t === '_' ? '.' : t; }
        let mm = m;
        for (const p of inner) { grid[p.py][p.px] = ['#', '.', 'O'][mm % 3]; mm = Math.floor(mm / 3); }
        const key = inner.map((p) => `${p.px - ox},${p.py - oy}:${grid[p.py][p.px]}`).join(';') + '|' + route + '|' + midMask;
        if (seen.has(key)) continue; seen.add(key);
        const cells = [...used].filter(([, t]) => t === '.').map(([k]) => { const [px, py] = k.split(',').map(Number); return `${px + ox},${py + oy}`; });
        cands.push({ route: route + '/m' + midMask, tiles: grid.map((r) => r.join('')), cells });
      }
    }
  }
}
console.log(`${fam}: X ${Xs.length}, routes ${routes.length}, candidates ${cands.length}, shard ${shard}/${shards}`);
const withMice = (tiles: string[], cells: string[]) => {
  const g = tiles.map((r) => r.split(''));
  for (const k of cells) { const [px, py] = k.split(',').map(Number); g[py][px] = 'M'; }
  return g.map((r) => r.join(''));
};
let survivors = 0, geomA = 0, done = 0;
const t0 = Date.now();
outer: for (let i = shard; i < cands.length; i += shards) {
  const c = cands[i];
  if (++done % 200 === 0) console.log(`progress ${done} stageA ${geomA} t=${Date.now() - t0}ms`);
  if (c.cells.length > 21) continue;
  const all: GameMap = { ...MAPS[2], tiles: withMice(c.tiles, c.cells), startDir: 'E' };
  const mA = L32.buildModel(all);
  const accAll = L32.acceptMice(c.cells.length);
  if (L32.search(mA, { K: 6, accept: accAll }).size !== null) continue;
  if (L32.search(mA, { K: 7, accept: accAll }).size !== null) continue;
  if (L32.search(mA, { K, accept: accAll }).size !== null) continue;
  geomA++;
  console.log(`GEOM route=${c.route} tiles=${JSON.stringify(c.tiles)}`);
  for (let p = 0; p < c.cells.length; p++) for (let q = p + 1; q < c.cells.length; q++) {
    const map: GameMap = { ...MAPS[2], tiles: withMice(c.tiles, [c.cells[p], c.cells[q]]), startDir: 'E' };
    const model = L16.buildModel(map);
    if (L16.search(model, { K: 6, accept: L16.acceptMice(2) }).size !== null) continue;
    if (L16.search(model, { K: 7, accept: L16.acceptMice(2) }).size !== null) continue;
    if (L16.search(model, { K, accept: L16.acceptMice(2) }).size !== null) continue;
    survivors++;
    console.log(`SURVIVOR route=${c.route} tiles=${JSON.stringify(map.tiles)}`);
    if (survivors >= MAXS) break outer;
  }
}
console.log(`done shard ${shard}: stageA ${geomA}, survivors ${survivors} in ${Date.now() - t0}ms`);
