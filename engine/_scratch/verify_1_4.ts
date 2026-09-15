// Verifier for finding 1.4: malformed block docs crash public APIs.
// Run: npx tsx engine/_scratch/verify_1_4.ts
import { validate, countBlocks, toText, run, MAPS } from '../index';
import type { Program } from '../types';

const cases: Record<string, unknown> = {
  'if_wall no else': [{ id: 'if_wall', then: [{ id: 'forward' }] }],
  'if_pit no then/else': [{ id: 'if_pit' }],
  'repeat no body': [{ id: 'repeat', n: 2 }],
  'def no body': [{ id: 'def' }],
  'null entry': [null],
  'string entry': ['forward'],
  'body not array': [{ id: 'repeat', n: 2, body: { id: 'forward' } }],
  'unknown id (control)': [{ id: 'teleport' }],
  'bad n (control)': [{ id: 'repeat', n: 0, body: [{ id: 'forward' }] }],
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
