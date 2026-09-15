// Verifier scratch 1_6b: candidate replacement programs on the FIXED R4 map (row 5 = '######O#').
// npx tsx engine/_scratch/verify_1_6b.ts
import { run, score, validate, countBlocks, toText, checkMap } from '../index';
import type { Block, Program, GameMap } from '../index';
import { MAPS } from '../maps';

const base = MAPS[4];
const fixed: GameMap = { ...base, tiles: base.tiles.map((r, y) => (y === 5 ? '######O#' : r)) };
console.log('checkMap(fixed):', JSON.stringify(checkMap(fixed)));
const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const rep = (n: number, ...body: Block[]): Block => ({ id: 'repeat', n, body });
const ip = (t: Block[], e: Block[]): Block => ({ id: 'if_pit', then: t, else: e });
const iw = (t: Block[], e: Block[]): Block => ({ id: 'if_wall', then: t, else: e });
const step = (): Block => ip([J], [F]);
const show = (label: string, p: Program) => {
  const v = validate(p, fixed);
  const r = run(fixed, p);
  const s = score(r, { cap: fixed.cap, firstSubmit: false, usedPatch: false }).total;
  console.log(`${label}: valid=${v.ok} ${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${countBlocks(p)} score=${s} | ${toText(p).text.replace(/\n\s*/g, ' ')}`);
};
show('2-mouse flat (lure then around)', [F, J, R, F, J, L, F, F, R, J, R, J, F, J]);
show('2-mouse rep2{R J}', [F, J, R, F, J, L, F, F, rep(2, R, J), F, J]);
show('2-mouse def', [{ id: 'def', body: [R, J] }, F, J, R, F, J, L, F, F, { id: 'call' }, { id: 'call' }, F, J]);
show('wall-follow if_pit 6', [rep(9, iw([R], []), ip([J], [F]))]);
show('alt 6 rep6{ip{|f} J iw{R|}}', [rep(6, ip([], [F]), J, iw([R], []))]);
show('perimeter flat-ish 9 (rep2 on sides 2,3)', [F, J, J, rep(2, R, J, F, J)]);
show('courtyard lure dies at wall', [F, J, R, rep(4, step()), R, F, J]);
