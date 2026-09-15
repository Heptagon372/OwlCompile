// verify_1_3: zero-tick loops bypass maxTicks. Usage: npx tsx engine/_scratch/verify_1_3.ts [maxDepthOrig]
import { run, validate, countBlocks, MAPS, SOLUTIONS, ROUND_EXTRAS } from '../index';
import { run as runPatched } from './verify_1_3_run_patched';
import type { Block, Program } from '../types';

const maxDepthOrig = Number(process.argv[2] ?? 7);
const nest = (d: number, inner: Block[]): Program => (d === 0 ? inner : [{ id: 'repeat', n: 9, body: nest(d - 1, inner) }]);
const cores: Record<string, Block[]> = {
  ifFwdElseEmpty: [{ id: 'if_wall', then: [{ id: 'forward' }], else: [] } as Block],
  ifEmptyEmpty: [{ id: 'if_wall', then: [], else: [] } as Block],
};
const time = <T>(f: () => T): [T, number] => { const t0 = process.hrtime.bigint(); const r = f(); return [r, Number(process.hrtime.bigint() - t0) / 1e6]; };

console.log('--- original run() timing on validate-ok programs ---');
for (const [name, core] of Object.entries(cores)) {
  for (const round of [1, 5] as const) {
    for (let d = 4; d <= maxDepthOrig; d++) {
      const p = nest(d, core); const m = MAPS[round]; const v = validate(p, m);
      if (!v.ok) { console.log(`${name} R${round} d${d}: blocks=${v.blocks}/${v.cap} INVALID ${v.codes}`); continue; }
      const [r, ms] = time(() => run(m, p));
      console.log(`${name} R${round} d${d}: blocks=${countBlocks(p)}/${m.cap} ok -> ${r.outcome} ticks=${r.ticks} ${ms.toFixed(0)}ms`);
    }
  }
}
// largest valid depth per round for the empty core
for (const round of [1, 2, 3, 4, 5] as const) {
  let d = 0; while (validate(nest(d + 1, cores.ifEmptyEmpty), MAPS[round]).ok) d++;
  console.log(`R${round} cap=${MAPS[round].cap}: max valid depth (empty core) = ${d} -> 9^${d} = ${(9 ** d).toExponential(2)} zero-tick passes`);
}

console.log('--- patched run() timing ---');
for (const round of [1, 2, 3, 4, 5] as const) {
  let d = 0; while (validate(nest(d + 1, cores.ifEmptyEmpty), MAPS[round]).ok) d++;
  for (const [name, core] of Object.entries(cores)) {
    let dd = d; while (dd > 0 && !validate(nest(dd, core), MAPS[round]).ok) dd--;
    const p = nest(dd, core);
    const [r, ms] = time(() => runPatched(MAPS[round], p));
    console.log(`patched ${name} R${round} d${dd}: -> ${r.outcome} ticks=${r.ticks} ${ms.toFixed(1)}ms`);
  }
}

console.log('--- equivalence patched vs original ---');
let same = 0, diff = 0;
const check = (label: string, round: 1 | 2 | 3 | 4 | 5, p: Program) => {
  const a = JSON.stringify(run(MAPS[round], p)); const b = JSON.stringify(runPatched(MAPS[round], p));
  if (a === b) same++; else { diff++; if (diff <= 5) console.log(`DIFF ${label}`); }
};
for (const round of [1, 2, 3, 4, 5] as const) {
  const key = `r${round}` as const;
  SOLUTIONS[key].forEach((p, i) => check(`sol ${key}[${i}]`, round, p));
  check(`naive ${key}`, round, ROUND_EXTRAS[key].naive.program);
}
check('r5 noSleep', 5, ROUND_EXTRAS.r5.noSleep);
// deterministic LCG random programs (bounded so original run stays fast)
let seed = 12345;
const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const gen = (depth: number, budget: { n: number }): Block[] => {
  const out: Block[] = []; const len = 1 + rnd(3);
  for (let i = 0; i < len && budget.n > 0; i++) {
    budget.n--;
    const k = depth >= 3 ? rnd(6) : rnd(10);
    if (k < 5) out.push({ id: (['forward', 'jump', 'left', 'right', 'sleep'] as const)[k] } as Block);
    else if (k === 5) out.push({ id: 'call' } as Block);
    else if (k <= 7) out.push({ id: 'repeat', n: 1 + rnd(9), body: rnd(4) === 0 ? [] : gen(depth + 1, budget) } as Block);
    else out.push({ id: k === 8 ? 'if_wall' : 'if_pit', then: rnd(3) === 0 ? [] : gen(depth + 1, budget), else: rnd(3) === 0 ? [] : gen(depth + 1, budget) } as Block);
  }
  return out;
};
const stripCalls = (bs: Block[]): Block[] => bs.filter((b) => b.id !== 'call').map((b: any) =>
  b.id === 'repeat' ? { ...b, body: stripCalls(b.body) } : b.id?.startsWith('if_') ? { ...b, then: stripCalls(b.then), else: stripCalls(b.else) } : b);
for (let t = 0; t < 4000; t++) {
  const round = (1 + rnd(5)) as 1 | 2 | 3 | 4 | 5;
  let p = gen(0, { n: 12 });
  if (rnd(2) === 0) p = [{ id: 'def', body: stripCalls(gen(1, { n: 5 })) } as Block, ...p]; else p = stripCalls(p);
  check(`rand#${t}`, round, p);
}
console.log(`equivalence: same=${same} diff=${diff}`);
