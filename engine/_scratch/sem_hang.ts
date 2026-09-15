// Zero-tick loop probe: validate() accepts, run() never reaches maxTicks because no action is produced.
// Usage: npx tsx engine/_scratch/sem_hang.ts <depth>
import { run, validate, countBlocks, MAPS } from '../index';
import type { Block, Program } from '../types';

const depth = Number(process.argv[2] ?? '6');
const round = Number(process.argv[3] ?? '1') as 1 | 2 | 3 | 4 | 5;
// core: if_wall { forward } else { }  -> in R1 start faces E with floor ahead, so "else" (empty) is taken: 0 ticks.
let prog: Block = { id: 'if_wall', then: [{ id: 'forward' }], else: [] };
for (let i = 0; i < depth; i++) prog = { id: 'repeat', n: 9, body: [prog] };
const program: Program = [prog];
const map = MAPS[round];
const v = validate(program, map);
console.log(`round ${round} depth ${depth}: blocks=${countBlocks(program)} cap=${map.cap} validate.ok=${v.ok} codes=${JSON.stringify(v.codes)}`);
const t0 = process.hrtime.bigint();
const r = run(map, program);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`run -> outcome=${r.outcome} ticks=${r.ticks} in ${ms.toFixed(0)} ms (zero-tick iterations = 9^${depth} = ${9 ** depth})`);
