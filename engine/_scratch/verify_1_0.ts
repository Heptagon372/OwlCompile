// verify_1_0: zero-tick loops not bounded by maxTicks?
import { run, validate, MAPS } from '../index';
import type { Block, Program } from '../types';

const maxDepth = Number(process.argv[2] ?? 7);
const nest = (d: number, inner: Block[]): Block[] => (d === 0 ? inner : [{ id: 'repeat', n: 9, body: nest(d - 1, inner) }]);

const time = (label: string, p: Program, mapNo: 1 | 2 | 3 | 4 | 5) => {
  const m = MAPS[mapNo];
  const v = validate(p, m);
  const t0 = process.hrtime.bigint();
  const r = run(m, p);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label} R${mapNo} blocks=${v.blocks}/${v.cap} valid=${v.ok} -> ${r.outcome} ticks=${r.ticks} "${r.message}" ${ms.toFixed(0)} ms`);
};

if (process.argv[3] === 'single') {
  time(`single emptyRepeat depth=${maxDepth}`, nest(maxDepth, []), Number(process.argv[4] ?? 5) as 1 | 2 | 3 | 4 | 5);
  process.exit(0);
}
// A: nested pure-empty repeats (innermost repeat has empty body)
for (let d = 1; d <= maxDepth; d++) time(`A emptyRepeat depth=${d}`, nest(d, []), 1);
// B: reporter's shape — repeats around if_wall { } else { forward }
for (let d = 1; d <= maxDepth - 1; d++) time(`B ifwall depth=${d}`, nest(d, [{ id: 'if_wall', then: [], else: [{ id: 'forward' }] }]), 1);

// Validity of the worst cases (not run)
for (const mapNo of [1, 2, 3, 4, 5] as const) {
  const cap = MAPS[mapNo].cap;
  const worst = nest(cap, []);
  const v = validate(worst, MAPS[mapNo]);
  console.log(`worst R${mapNo}: ${cap} nested empty repeat 9 -> valid=${v.ok} blocks=${v.blocks}; ~${(9 ** cap).toExponential(2)} innermost walks`);
}
