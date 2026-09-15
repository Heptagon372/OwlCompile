// Malformed program docs (e.g. jsonb from DB / editor bug) crash validate() instead of returning ok:false.
// Run: npx tsx engine/_scratch/sem_malformed.ts
import { validate, countBlocks, toText, run, MAPS } from '../index';
import type { Program } from '../types';

const cases: Record<string, unknown> = {
  'if_wall without else': [{ id: 'if_wall', then: [{ id: 'forward' }] }],
  'repeat without body': [{ id: 'repeat', n: 2 }],
  'def without body': [{ id: 'def' }],
  'null block': [null],
  'unknown id (control)': [{ id: 'teleport' }],
};
for (const [k, p] of Object.entries(cases)) {
  const out: Record<string, string> = {};
  const fns = {
    validate: () => JSON.stringify(validate(p as Program, MAPS[1]).codes),
    countBlocks: () => String(countBlocks(p as Program)),
    toText: () => JSON.stringify(toText(p as Program).text),
    run: () => run(MAPS[1], p as Program).message,
  };
  for (const [fn, f] of Object.entries(fns)) {
    try { out[fn] = f(); } catch (e) { out[fn] = `THROW ${(e as Error).constructor.name}: ${(e as Error).message}`; }
  }
  console.log(k, JSON.stringify(out));
}
