// Verifier scratch for finding 1_9 (role coverage per round). npx tsx engine/_scratch/verify_1_9.ts
import { run, score, validate, countBlocks, BLOCKS } from '../index';
import type { Block, Program } from '../index';
import { MAPS } from '../maps';
import { SOLUTIONS } from '../solutions';

const ids = (p: Program): string[] =>
  p.flatMap((b) => [b.id, ...('body' in b ? ids(b.body) : []), ...('then' in b ? [...ids(b.then), ...ids(b.else)] : [])]);

for (const k of ['r1', 'r2', 'r3', 'r4', 'r5'] as const) {
  SOLUTIONS[k].forEach((p, i) => {
    const byRole: Record<string, number> = { runner: 0, turner: 0, controller: 0, architect: 0 };
    for (const id of ids(p)) byRole[BLOCKS[id as keyof typeof BLOCKS].role]++;
    console.log(`${k}[${i}] blocks=${countBlocks(p)} roles=${JSON.stringify(byRole)}`);
  });
}

// Architect-using variants for R3/R4: do they exist, and are they ever cheaper than the minimum?
const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, R: Block = { id: 'right' };
const call: Block = { id: 'call' };
const rep = (n: number, ...body: Block[]): Block => ({ id: 'repeat', n, body });
const def = (...body: Block[]): Block => ({ id: 'def', body });
const iw = (t: Block[], e: Block[]): Block => ({ id: 'if_wall', then: t, else: e });
const ip = (t: Block[], e: Block[]): Block => ({ id: 'if_pit', then: t, else: e });
const show = (round: 3 | 4, label: string, p: Program) => {
  const m = MAPS[round];
  const r = run(m, p);
  const s = score(r, { cap: m.cap, firstSubmit: false, usedPatch: false }).total;
  console.log(`R${round} ${label}: valid=${validate(p, m).ok} ${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${countBlocks(p)} score=${s}`);
};
show(3, 'def step + 9x3 call', [def(iw([R], [F])), rep(9, rep(3, call))]);
show(3, 'sleep-prefixed rep', [{ id: 'sleep' }, rep(4, rep(5, iw([R], [F])))]);
show(4, 'def step + 3x{3 call, right}', [def(ip([J], [F])), rep(3, rep(3, call), R)]);
show(4, 'def side + 3 call', [def(rep(3, ip([J], [F])), R), rep(3, call)]);
