// Scratch prover CLI: "no def-free program of <= K blocks reaches the nest with >= M mice".
// Stores function tables to size S, evaluates sizes S+1..K (K <= S+2) lazily. See fx_prove_core.ts.
// npx tsx engine/_scratch/fx_prove.ts <round> <S> <K> <M>   env TILES / DIR override
import { MAPS } from '../maps';
import type { Dir, GameMap } from '../index';
import { buildModel } from './fx_dplib';
import { prove } from './fx_prove_core';

const round = Number(process.argv[2]) as 1 | 2 | 3 | 4 | 5;
const S = Number(process.argv[3]), K = Number(process.argv[4]), M = Number(process.argv[5] ?? 2);
const NO = new Set((process.argv.find((a) => a.startsWith('--no='))?.slice(5) ?? '').split(',').filter(Boolean));
if (K > S + 2) throw new Error('K <= S+2');
let map: GameMap = MAPS[round];
if (process.env.TILES) map = { ...map, tiles: JSON.parse(process.env.TILES) as string[] };
if (process.env.DIR) map = { ...map, startDir: process.env.DIR as Dir };
const t0 = Date.now();
try {
  const r = prove(buildModel(map), S, K, M, (s) => console.log(`${s} t=${Date.now() - t0}ms`), NO);
  console.log(r ? `FOUND (<= ${K}): ${r}` : `NONE up to ${K}`, `t=${Date.now() - t0}ms`);
} catch (e) { console.log(String(e), `t=${Date.now() - t0}ms`); }
