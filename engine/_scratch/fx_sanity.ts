import { MAPS } from '../maps';
import { run, toText } from '../index';
import { buildModel, search, acceptMice } from './fx_dplib';
const m = buildModel(MAPS[2]);
const t = Date.now();
const r = search(m, { K: 8, accept: acceptMice(2) });
console.log('R2 current: min def-free (2 mice) =', r.size, Date.now() - t, 'ms');
if (r.prog) { const rr = run(MAPS[2], r.prog); console.log(rr.outcome, rr.mice, rr.blocks); console.log(toText(r.prog).text); }
const r4 = search(buildModel(MAPS[4]), { K: 7, accept: acceptMice(2) });
console.log('R4 current: min (2 mice) =', r4.size, r4.prog ? toText(r4.prog).text.replace(/\n/g, ' / ') : '');
