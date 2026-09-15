// Reviewer scratch: confirm sleep-free R5 alternatives. npx tsx engine/_scratch/rv_r5_nosleep.ts
import { run, score, toText, validate } from '../index';
import type { Block, Program } from '../index';
import { map, noSleep } from '../rounds/r5';
const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const show = (label: string, p: Program, usedPatch = false) => {
  const r = run(map, p);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch }).total;
  console.log(`${label}: valid=${validate(p, map).ok} ${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${r.blocks} score=${s}${usedPatch ? ' (usedPatch)' : ''}`);
  console.log('   ' + toText(p).text.replace(/\n\s*/g, ' '));
  console.log('   ' + r.trace.slice(1).map((st) => `${st.tick}:${st.owl.x},${st.owl.y}${st.owl.dir}/${st.cat!.x},${st.cat!.y}${st.event ? '!' + st.event : ''}`).join(' '));
};
show('A: left + noSleep (one Turner block instead of sleep)', [L, ...noSleep]);
show('A as a patch of noSleep', [L, ...noSleep], true);
show('B: F L rep3{rep8{if_wall{R}{} F} J}', [F, L, { id: 'repeat', n: 3, body: [{ id: 'repeat', n: 8, body: [{ id: 'if_wall', then: [R], else: [] }, F] }, J] }]);
show('C: right + noSleep', [R, ...noSleep]);
