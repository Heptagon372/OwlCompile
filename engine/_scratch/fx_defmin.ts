// def-inclusive min: def{body} + main (with call leaf), total = 1 + |body| + |main| <= D. Reports the smallest.
// npx tsx engine/_scratch/fx_defmin.ts <D> '<tiles json>'
import { MAPS } from '../maps';
import { run, toText, countBlocks } from '../index';
import type { Block, Program } from '../index';
import { buildModel, search, acceptMice } from './fx_dplib';
const D = Number(process.argv[2]); const tiles = JSON.parse(process.argv[3]) as string[];
const map = { ...MAPS[2], tiles, startDir: 'E' as const };
const m = buildModel(map);
const hasCall = (p: Block[]): boolean => p.some((b) => b.id === 'call' || ('body' in b && hasCall(b.body)) || ('then' in b && (hasCall(b.then) || hasCall(b.else))));
const bodies = search(m, { K: Math.min(5, D - 2), accept: () => false });
let best: { size: number; prog: Program } | null = null;
for (let k = 1; k <= Math.min(4, D - 3); k++) {
  for (const li of bodies.Lst[k] ?? []) {
    const f = bodies.lists.get(li);
    const limit = (best ? best.size - 1 : D) - 1 - k;
    if (limit < 2) continue;
    const r = search(m, { K: limit, accept: acceptMice(2), call: new Uint16Array(f) });
    if (r.prog && hasCall(r.prog)) {
      const prog: Program = [{ id: 'def', body: bodies.progOf(li) }, ...r.prog];
      const rr = run(map, prog);
      if (rr.outcome === 'goal' && rr.mice >= 2) { best = { size: countBlocks(prog), prog }; console.log(`def program ${best.size}: ${toText(prog).text.replace(/\n\s*/g, ' / ')}`); }
    }
  }
}
console.log(best ? `BEST def-inclusive ${best.size}` : `no def program <= ${D} with 2 mice`);
