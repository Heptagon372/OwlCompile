// Compile-error / do-nothing programs earn "미도착" points; dying earns 0.
// Run: npx tsx engine/_scratch/sem_compile_score.ts
import { run, score, validate, MAPS } from '../index';
import type { Program } from '../types';

const ctx = (cap: number) => ({ cap, firstSubmit: true, usedPatch: false });
for (const k of [1, 2, 3, 4, 5] as const) {
  const m = MAPS[k];
  const compileErr: Program = [{ id: 'call' }];            // E_CALL_NO_DEF
  const r1 = run(m, compileErr);
  const r2 = run(m, [{ id: 'sleep' }]);
  console.log(`R${k}: validate([call])=${JSON.stringify(validate(compileErr, m).codes)} run -> ${r1.outcome} "${r1.message}" ticks=${r1.ticks} score=${score(r1, ctx(m.cap)).total}` +
    ` | [sleep] -> ${r2.outcome} score=${score(r2, ctx(m.cap)).total}`);
}
// R2: a team that walks into the first pit gets 0.
const r2 = MAPS[2];
const pit = run(r2, [{ id: 'forward' }, { id: 'forward' }, { id: 'forward' }]);
console.log(`R2 honest attempt: ${pit.outcome} "${pit.message}" ticks=${pit.ticks} score=${score(pit, ctx(r2.cap)).total}`);
