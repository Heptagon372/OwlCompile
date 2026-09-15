// OWL COMPILE — 실행 가능 검증. `npx tsx engine/verify.ts` (실패 시 exit 1)
import { runCore } from './verify-core';
import { runRounds } from './verify-rounds';
import type { Check } from './verify-util';

const checks: Check[] = [...runCore(), ...runRounds()];
let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`✓ ${c.name}`);
  } else {
    failed += 1;
    console.log(`✗ ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} passed${failed ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
