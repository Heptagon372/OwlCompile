// Scratch: R4 checks on the fixed map (row 5 '######O#').
import { MAPS } from '../maps';
import { run, toText, score } from '../index';
import type { GameMap } from '../index';
import { buildModel, search, acceptMice, GOAL } from './fx_dplib';
import { parse } from './fx_probe';

const tiles = process.env.TILES ? JSON.parse(process.env.TILES) as string[]
  : ['########', '#S.OKO.#', '#.#...O#', '#...O#.#', '#.#.M..#', '######O#', '#GODMO.#', '########'];
const map: GameMap = { ...MAPS[4], tiles };
const K = Number(process.argv[2] ?? 6);
const m = buildModel(map);
const show = (label: string, r: { size: number | null; prog: unknown }) => {
  const p = r.prog as Parameters<typeof toText>[0] | null;
  if (!p) { console.log(`${label}: none`); return; }
  const rr = run(map, p);
  console.log(`${label}: size ${r.size} -> ${rr.outcome} t${rr.ticks} mice ${rr.mice} score ${score(rr, { cap: 10, firstSubmit: false, usedPatch: false }).total} :: ${toText(p).text.replace(/\n\s*/g, ' / ')}`);
};
const anyGoal = (v: number) => (v & 1023) === GOAL;
const noPit = new Set(['if_pit']);
show(`2 mice, <= ${K}`, search(m, { K, accept: acceptMice(2) }));
show('1 mouse, <= 5 (would score >= 145)', search(m, { K: 5, accept: acceptMice(1) }));
show('any goal, <= 2', search(m, { K: 2, accept: anyGoal }));
show('no if_pit, 1 mouse, <= 6 (would score >= 140)', search(m, { K: 6, accept: acceptMice(1), no: noPit }));
show(`no if_pit, 2 mice, <= ${K}`, search(m, { K, accept: acceptMice(2), no: noPit }));
show('no if_pit, any goal, <= 2', search(m, { K: 2, accept: anyGoal, no: noPit }));
for (const src of [
  'rep3{rep3{ip{J|F}} R}',
  'rep4{rep3{iw{R|ip{J|F}}}}',
  'rep9{iw{R|} ip{J|F}}',
  'F J J rep2{R J F J}',
  'F rep2{J R F J}',
  'F J R rep4{ip{J|F}} R F J',
  'F J R F J J R F J',
]) {
  const p = parse(src); const r = run(map, p);
  console.log(`${src} => ${r.outcome} "${r.message}" t${r.ticks} mice ${r.mice} blocks ${r.blocks} score ${score(r, { cap: 10, firstSubmit: false, usedPatch: false }).total}`);
}
