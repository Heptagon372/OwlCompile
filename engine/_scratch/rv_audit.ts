// Reviewer scratch: projector-embarrassment audit. npx tsx engine/_scratch/rv_audit.ts
// For every shipped solution: turns caused by off-map edge, mice/keys jumped over, cat jumps, unreachable mice.
import { run } from '../index';
import type { Pos } from '../index';
import { MAPS } from '../maps';
import { SOLUTIONS } from '../solutions';

const D: Record<string, Pos> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
for (const rn of [1, 2, 3, 4, 5] as const) {
  const m = MAPS[rn];
  const tile = (x: number, y: number) => (x < 0 || y < 0 || x > 7 || y > 7 ? 'OFF' : m.tiles[y][x]);
  SOLUTIONS[`r${rn}` as 'r1'].forEach((p, i) => {
    const r = run(m, p);
    const notes: string[] = [];
    for (let t = 1; t < r.trace.length; t++) {
      const a = r.trace[t - 1], b = r.trace[t];
      if (b.block === 'left' || b.block === 'right') {
        const ah = tile(a.owl.x + D[a.owl.dir].x, a.owl.y + D[a.owl.dir].y);
        if (ah === 'OFF') notes.push(`t${t} turn at (${a.owl.x},${a.owl.y}) facing ${a.owl.dir}: ahead is OFF-MAP`);
      }
      if (b.block === 'jump') {
        const mx = a.owl.x + D[a.owl.dir].x, my = a.owl.y + D[a.owl.dir].y;
        const mt = tile(mx, my);
        if (mt === 'M' || mt === 'K') notes.push(`t${t} jumps over ${mt} at (${mx},${my})`);
        if (b.cat && a.cat && (a.cat.x === mx && a.cat.y === my)) notes.push(`t${t} jumps over cat`);
      }
      if (a.cat && b.cat && Math.abs(a.cat.x - b.cat.x) + Math.abs(a.cat.y - b.cat.y) > 1) notes.push(`t${t} cat teleports`);
    }
    const allMice = m.tiles.join('').split('').filter((c) => c === 'M').length;
    console.log(`R${rn}[${i}] ${r.outcome} t${r.ticks} mice ${r.mice}/${allMice}${notes.length ? '\n   ' + notes.join('\n   ') : ''}`);
  });
  // reachability of each mouse cell by BFS over floor moves and jumps (ignoring cat/door keys)
  const seen = new Set<string>(); const start = m.tiles.join('').indexOf('S'); const q: [number, number][] = [[start % 8, Math.floor(start / 8)]];
  seen.add(q[0].join());
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const d of Object.values(D)) for (const k of [1, 2]) {
      const nx = x + d.x * k, ny = y + d.y * k; const t = tile(nx, ny);
      if (t === 'OFF' || t === '#' || t === 'O') continue;
      if (k === 2 && ['OFF', '#', 'D'].includes(tile(x + d.x, y + d.y))) continue;
      if (!seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); if (t !== 'G') q.push([nx, ny]); }
    }
  }
  const unreachable: string[] = [];
  m.tiles.forEach((row, y) => row.split('').forEach((c, x) => { if ((c === 'M' || c === 'K' || c === 'G') && !seen.has(`${x},${y}`)) unreachable.push(`${c}(${x},${y})`); }));
  console.log(`R${rn} unreachable items: ${unreachable.join(' ') || 'none'}  | open edge cells (floor on border): ${m.tiles.flatMap((row, y) => row.split('').map((c, x) => ((x === 0 || y === 0 || x === 7 || y === 7) && c !== '#' ? `${c}(${x},${y})` : ''))).filter(Boolean).join(' ')}`);
}
