// Spec §8 R2: "def 없이 같은 동작을 하려면 블록이 더 많이 든다". Check def-less sensor programs on the real engine.
import { run, score, validate, countBlocks, MAPS, SOLUTIONS } from '../index';
import type { Program } from '../types';

const m = MAPS[2];
const seq = (p: Program) => run(m, p).trace.slice(1).map((s) => s.block![0]).join('');
const ref = SOLUTIONS.r2[0];
const refR = run(m, ref);
console.log('ref', countBlocks(ref), refR.outcome, refR.ticks, refR.mice, seq(ref), score(refR, { cap: 12, firstSubmit: false, usedPatch: false }).total);

const F = { id: 'forward' } as const, J = { id: 'jump' } as const, L = { id: 'left' } as const;
const cands: Record<string, Program> = {
  'rep5{f ip{J L|} ip{J|}}': [{ id: 'repeat', n: 5, body: [F, { id: 'if_pit', then: [J, L], else: [] }, { id: 'if_pit', then: [J], else: [] }] }],
  'rep6{ip{J|f} ip{J L|}}': [{ id: 'repeat', n: 6, body: [{ id: 'if_pit', then: [J], else: [F] }, { id: 'if_pit', then: [J, L], else: [] }] }],
  'rep9{f ip{J L ip{J|}|}}': [{ id: 'repeat', n: 9, body: [F, { id: 'if_pit', then: [J, L, { id: 'if_pit', then: [J], else: [] }], else: [] }] }],
};
for (const [name, p] of Object.entries(cands)) {
  const r = run(m, p);
  const def = JSON.stringify(p).includes('"def"');
  console.log(name, 'blocks', countBlocks(p), 'valid', validate(p, m).ok, 'hasDef', def, r.outcome, r.ticks, 'mice', r.mice, seq(p),
    'sameActions', seq(p) === seq(ref), 'score', score(r, { cap: 12, firstSubmit: false, usedPatch: false }).total);
}
