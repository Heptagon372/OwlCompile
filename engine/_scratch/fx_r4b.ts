import { MAPS } from '../maps';
import { toText } from '../index';
import { buildModel, search, acceptMice } from './fx_dplib';
const m = buildModel(MAPS[4]);
const t0 = Date.now();
const r = search(m, { K: 8, accept: acceptMice(2), no: new Set(['if_pit']) });
console.log(`R4 fixed, no if_pit, 2 mice, <= 8: ${r.prog ? r.size + ' ' + toText(r.prog).text.replace(/\n\s*/g, ' / ') : 'none'} (${Date.now() - t0}ms)`);
