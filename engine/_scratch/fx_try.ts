// npx tsx engine/_scratch/fx_try.ts <K> '<tiles json>' [dir] [minMice]   (all M tiles required unless minMice given)
import { MAPS } from '../maps';
import { run, toText } from '../index';
import type { Dir } from '../index';
import * as L32 from './fx_dplib32';
const K = Number(process.argv[2]); const tiles = JSON.parse(process.argv[3]) as string[]; const dir = (process.argv[4] ?? 'E') as Dir;
const nM = tiles.join('').split('M').length - 1; const need = Number(process.argv[5] ?? nM);
const map = { ...MAPS[2], tiles, startDir: dir };
const m = L32.buildModel(map);
for (const k of [6, 7, K].filter((v, i, a) => v <= K && a.indexOf(v) === i)) {
  const r = L32.search(m, { K: k, accept: L32.acceptMice(need) });
  if (r.prog) { const rr = run(map, r.prog); console.log(`FOUND ${r.size}: ${rr.outcome} mice ${rr.mice} :: ${toText(r.prog).text.replace(/\n\s*/g, ' ')}`); process.exit(0); }
  console.log(`none <= ${k}`);
}
