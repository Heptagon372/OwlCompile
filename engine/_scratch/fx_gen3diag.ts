// print stage-A killers for a sample of gen3 geometries
import { MAPS } from '../maps';
import { toText } from '../index';
import * as L32 from './fx_dplib32';
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const routes = process.argv.slice(2);
for (const route of routes) {
  let x = 1, y = 6, d = 1; const g = Array.from({ length: 8 }, () => Array(8).fill('#')); g[y][x] = 'S';
  const cells: [number, number][] = [];
  for (let i = 0; i < route.length; i++) {
    const c = route[i];
    if (c === 'L' || c === 'R') { d = (d + (c === 'L' ? 3 : 1)) & 3; continue; }
    if (c === 'J') { g[y + DY[d]][x + DX[d]] = 'O'; x += 2 * DX[d]; y += 2 * DY[d]; } else { x += DX[d]; y += DY[d]; }
    if (i === route.length - 1) g[y][x] = 'G'; else { g[y][x] = 'M'; cells.push([x, y]); }
  }
  const tiles = g.map((r) => r.join(''));
  console.log(route, tiles.join(' | '));
  const m = L32.buildModel({ ...MAPS[2], tiles, startDir: 'E' });
  const r = L32.search(m, { K: 9, accept: L32.acceptMice(cells.length) });
  console.log('  killer', r.size, r.prog ? toText(r.prog).text.replace(/\n\s*/g, ' / ') : '');
}
