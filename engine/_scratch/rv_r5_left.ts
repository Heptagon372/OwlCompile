// Reviewer scratch: leading left-turn as a sleep substitute in R5. npx tsx engine/_scratch/rv_r5_left.ts
import { run, score, toText } from '../index';
import type { Block, Program } from '../index';
import { map, solutions } from '../rounds/r5';
const L: Block = { id: 'left' };
const noSleep99: Program = solutions[1].filter((b) => b.id !== 'sleep');   // team's 9x9 no-sleep version
const show = (label: string, p: Program, usedPatch: boolean) => {
  const r = run(map, p); const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch }).total;
  const last = r.trace[r.trace.length - 1];
  console.log(`${label}: ${r.outcome} t${r.ticks} mice${r.mice} blocks${r.blocks} score${s} ${last.message} @(${r.owl.x},${r.owl.y})\n   ${toText(p).text.replace(/\n\s*/g, ' ')}`);
};
show('9x9 no-sleep (before patch)', noSleep99, false);
show('patch = add 잠자기 at top', [{ id: 'sleep' }, ...noSleep99], true);
show('patch = add 좌회전 at top', [L, ...noSleep99], true);
show('first submit 좌회전 + 9x9 (no patch)', [L, ...noSleep99], false);
show('sol0 w/o patch (reference)', solutions[0], false);
