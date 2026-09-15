// verify finding 1.5: compile-error / do-nothing programs score 미도착 points.
// Run: npx tsx engine/_scratch/verify_1_5.ts
import { run, score, validate, MAPS } from '../index';
import type { Program } from '../types';

const ctx = (cap: number, firstSubmit = true) => ({ cap, firstSubmit, usedPatch: false });
for (const k of [1, 2, 3, 4, 5] as const) {
  const m = MAPS[k];
  const noDef: Program = [{ id: 'call' }];
  const rec: Program = [{ id: 'def', body: [{ id: 'call' }] } as any, { id: 'call' }];
  const sleep: Program = [{ id: 'sleep' }];
  for (const [name, p] of [['[call]', noDef], ['recursion', rec], ['[sleep]', sleep]] as const) {
    const r = run(m, p as Program);
    const v = validate(p as Program, m);
    const s = score(r, ctx(m.cap));
    console.log(`R${k} ${name}: validate.ok=${v.ok} codes=${JSON.stringify(v.codes)} run=${r.outcome} "${r.message}" ticks=${r.ticks} d=${r.distance} score=${s.total} lines=${JSON.stringify(s.lines)}`);
  }
}
const r2 = MAPS[2];
const pit = run(r2, [{ id: 'forward' }, { id: 'forward' }, { id: 'forward' }]);
console.log(`R2 pit attempt: ${pit.outcome} "${pit.message}" ticks=${pit.ticks} score=${score(pit, ctx(r2.cap)).total}`);
