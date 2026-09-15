// Reviewer scratch: confirm brute-force hits with the real engine. npx tsx engine/_scratch/rv_confirm.ts
import { run, score, toText, validate, countBlocks, BLOCKS } from '../index';
import type { Block, Program } from '../index';
import { MAPS } from '../maps';
import { SOLUTIONS } from '../solutions';

const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const rep = (n: number, ...body: Block[]): Block => ({ id: 'repeat', n, body });
const ip = (t: Block[], e: Block[]): Block => ({ id: 'if_pit', then: t, else: e });
const show = (round: 1 | 2 | 3 | 4 | 5, label: string, p: Program) => {
  const m = MAPS[round];
  const v = validate(p, m);
  const r = run(m, p);
  const s = score(r, { cap: m.cap, firstSubmit: false, usedPatch: false }).total;
  const cells = r.trace.slice(1).map((st) => `${st.owl.x},${st.owl.y}${st.event ? '!' + st.event : ''}`).join(' ');
  console.log(`R${round} ${label}: valid=${v.ok} ${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${countBlocks(p)} score=${s}\n   code: ${toText(p).text.replace(/\n\s*/g, ' ')}\n   path: ${cells}`);
};

console.log('--- R1');
show(1, 'representative', SOLUTIONS.r1[0]);
show(1, 'jump-only tie', [rep(2, J, J, R)]);
console.log('--- R2');
show(2, 'representative', SOLUTIONS.r2[0]);
show(2, 'no-def if_pit A', [rep(5, F, ip([J, L], []), ip([J], []))]);
show(2, 'no-def if_pit B', [rep(5, ip([J], [F]), ip([J, L], []))]);
console.log('--- R4');
show(4, 'representative', SOLUTIONS.r4[0]);
show(4, 'courtyard 6-block (no if_pit)', [F, rep(2, J, R, F, J)]);
show(4, 'courtyard hand-coded 9 (no repeat, no if)', [F, J, R, F, J, J, R, F, J]);
show(4, 'courtyard with if_pit 6', [rep(3, F, J, ip([], [J]), R)]);
show(4, 'solutions[2] as shipped', SOLUTIONS.r4[2]);

console.log('--- role coverage of solutions[0] (blocks used per role)');
const ids = (p: Program): string[] => p.flatMap((b) => [b.id, ...('body' in b ? ids(b.body) : []), ...('then' in b ? [...ids(b.then), ...ids(b.else)] : [])]);
for (const k of ['r1', 'r2', 'r3', 'r4', 'r5'] as const) {
  const used = new Set(ids(SOLUTIONS[k][0]));
  const byRole: Record<string, string[]> = { runner: [], turner: [], controller: [], architect: [] };
  for (const id of used) byRole[BLOCKS[id as keyof typeof BLOCKS].role].push(id);
  const allSol = new Set(SOLUTIONS[k].flatMap((p) => ids(p)));
  const rolesAny: Record<string, number> = { runner: 0, turner: 0, controller: 0, architect: 0 };
  for (const id of allSol) rolesAny[BLOCKS[id as keyof typeof BLOCKS].role]++;
  console.log(k, JSON.stringify(byRole), ' any-solution role block kinds:', JSON.stringify(rolesAny));
}
