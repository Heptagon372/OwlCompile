// Verifier scratch for finding 1_8 (R5: leading 좌회전 substitutes for sleep). npx tsx engine/_scratch/verify_1_8.ts
import { run, score, toText } from '../index';
import type { Program } from '../index';
import { map, solutions, noSleep, expect } from '../rounds/r5';

const show = (label: string, p: Program, usedPatch: boolean, firstSubmit = false) => {
  const r = run(map, p);
  const s = score(r, { cap: map.cap, firstSubmit, usedPatch }).total;
  const last = r.trace[r.trace.length - 1];
  console.log(`${label}: ${r.outcome} t${r.ticks} mice${r.mice} blocks${r.blocks} score${s} "${last.message}" @(${r.owl.x},${r.owl.y})`);
  console.log(`   ${toText(p).text.replace(/\n\s*/g, ' ')}`);
};

// 1) Current documented solutions vs expect
solutions.forEach((p, i) => { show(`sol${i} (expect ${JSON.stringify(expect[i])})`, p, i === 0); });

// 2) spec's noSleep (7 blocks)
show('noSleep (spec)', noSleep, false);

// 3) left instead of sleep, with walk36 (6x6) and with 9x9 variant
const walk36 = noSleep;
const noSleep99: Program = solutions[1].filter((b) => b.id !== 'sleep');
show('9x9 no-sleep', noSleep99, false);
show('patch: sleep + 9x9', [{ id: 'sleep' }, ...noSleep99], true);
show('patch: left + 9x9', [{ id: 'left' }, ...noSleep99], true);
show('patch: right + 9x9', [{ id: 'right' }, ...noSleep99], true);
show('patch: left + 6x6 (walk36)', [{ id: 'left' }, ...walk36], true);
show('patch: right + 6x6 (walk36)', [{ id: 'right' }, ...walk36], true);
show('first-submit (no patch, firstSubmit=false) left + 9x9', [{ id: 'left' }, ...noSleep99], false);
show('first-submit (no patch, firstSubmit=true) left + 9x9', [{ id: 'left' }, ...noSleep99], false, true);
show('first-submit (firstSubmit=true) sol0 sleep + 6x6', solutions[0], false, true);

// 4) the finding's other claimed sleep-free program
const B: Program = [
  { id: 'forward' }, { id: 'left' },
  { id: 'repeat', n: 3, body: [
    { id: 'repeat', n: 8, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [] }, { id: 'forward' }] },
    { id: 'jump' },
  ] },
];
show('finding program B', B, false);
