// Verifier scratch for finding 1.1: R2 def-less programs vs spec §8 ("def 없이 같은 동작을 하려면 블록이 더 많이 든다").
import { run, score, validate, countBlocks, MAPS, SOLUTIONS } from '../index';
import type { Block, Program } from '../types';

const m = MAPS[2];
const ctx = { cap: m.cap, firstSubmit: false, usedPatch: false };
const hasId = (bs: Block[], id: string): boolean =>
  bs.some((b) => b.id === id || Object.values(b).some((v) => Array.isArray(v) && hasId(v as Block[], id)));
// Owl state per tick (pos + dir), the strongest "same behaviour" notion available.
const path = (p: Program) => run(m, p).trace.map((s) => [s.owl.x, s.owl.y, s.owl.dir].join(',')).join(' ');
const acts = (p: Program) => run(m, p).trace.slice(1).map((s: any) => s.block?.[0] ?? '?').join('');

const ref = SOLUTIONS.r2[0];
const rr = run(m, ref);
console.log('REF blocks', countBlocks(ref), rr.outcome, 'ticks', rr.ticks, 'mice', rr.mice, 'acts', acts(ref), 'score', score(rr, ctx).total);

const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' };
const ip = (t: Block[], e: Block[]): Block => ({ id: 'if_pit', then: t, else: e } as Block);
const rep = (n: number, body: Block[]): Block => ({ id: 'repeat', n, body } as Block);
const cands: Record<string, Program> = {
  'rep5{F ip{J L|} ip{J|}}': [rep(5, [F, ip([J, L], []), ip([J], [])])],
  'rep6{ip{J|F} ip{J L|}}': [rep(6, [ip([J], [F]), ip([J, L], [])])],
  'rep9{F ip{J L ip{J|}|}}': [rep(9, [F, ip([J, L, ip([J], [])], [])])],
  // my own variant, not in the finding: nested repeat
  'rep2{rep3{F ip{J L|}} J}': [rep(2, [rep(3, [F, ip([J, L], [])]), J])],
};
for (const [name, p] of Object.entries(cands)) {
  const r = run(m, p);
  const v = validate(p, m);
  console.log(name, '| blocks', countBlocks(p), '| valid', v.ok, v.codes.join(','), '| def', hasId(p, 'def'),
    '|', r.outcome, 'ticks', r.ticks, 'mice', r.mice, '| acts', acts(p),
    '| sameActs', acts(p) === acts(ref), '| sameOwlPath', path(p) === path(ref), '| score', score(r, ctx).total);
}
console.log('naive.note claims def-less best = 12 blocks; smallest found above = 7');
