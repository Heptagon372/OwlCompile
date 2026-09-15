// Scratch: R1 mouse move check (mice to odd distances so jump routes skip them).
import { MAPS } from '../maps';
import { run, toText, score } from '../index';
import type { GameMap, Program } from '../index';
import { buildModel, search, acceptMice, GOAL } from './fx_dplib';
import { parse } from './fx_probe';

const tiles = ['########', '#S..M.##', '#####.##', '#####.##', '###..M.#', '###..G.#', '###....#', '########'];
const map: GameMap = { ...MAPS[1], tiles };
const m = buildModel(map);
const sc = (p: Program) => { const r = run(map, p); return `${r.outcome} t${r.ticks} mice ${r.mice} b${r.blocks} score ${score(r, { cap: 12, firstSubmit: false, usedPatch: false }).total}`; };
for (const [M, K] of [[2, 4], [1, 3], [0, 2]] as const) {
  const r = search(m, { K, accept: M === 0 ? (v) => (v & 1023) === GOAL : acceptMice(M) });
  console.log(`mice>=${M} size<=${K}: ${r.size ?? 'none'} ${r.prog ? toText(r.prog).text.replace(/\n\s*/g, ' / ') + ' => ' + sc(r.prog) : ''}`);
}
for (const src of ['rep4{F} R rep4{F}', 'rep2{rep4{F} R}', 'F F F F R F F F F', 'rep2{J J R}', 'J J R J J', 'rep2{rep2{J} R}']) console.log(src, '=>', sc(parse(src)));
