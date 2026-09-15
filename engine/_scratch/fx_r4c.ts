import { MAPS } from '../maps';
import { run, toText, score } from '../index';
import { buildModel, search, acceptMice } from './fx_dplib';
const map = MAPS[4];
const r = search(buildModel(map), { K: 8, accept: acceptMice(2) });
if (r.prog) {
  const rr = run(map, r.prog);
  console.log(`size ${r.size}: ${rr.outcome} t${rr.ticks} mice ${rr.mice} blocks ${rr.blocks} score ${score(rr, { cap: 10, firstSubmit: false, usedPatch: false }).total}`);
  console.log(toText(r.prog).text);
  console.log(rr.trace.slice(1).map((s) => `${s.tick}:${s.block}@${s.owl.x},${s.owl.y}${s.event ? '/' + s.event : ''}`).join(' '));
} else console.log('none');
