// Zero-tick loops are not bounded by maxTicks. Valid (validate().ok) programs can freeze run().
import { run, validate, MAPS } from '../index';
import type { Block, Program } from '../types';

const depth = Number(process.argv[2] ?? 7);
const nest = (d: number, inner: Block[]): Block[] => (d === 0 ? inner : [{ id: 'repeat', n: 9, body: nest(d - 1, inner) }]);

// R1 (cap 12): walk forward until wall, then spin in an empty then-branch.
const inner: Block[] = [{ id: 'if_wall', then: [], else: [{ id: 'forward' }] }];
const p: Program = nest(depth, inner);
const m = MAPS[1];
const v = validate(p, m);
const t0 = process.hrtime.bigint();
const r = run(m, p);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`depth=${depth} blocks=${v.blocks}/${v.cap} valid=${v.ok} -> ${r.outcome} ticks=${r.ticks} msg="${r.message}" in ${ms.toFixed(0)} ms`);
