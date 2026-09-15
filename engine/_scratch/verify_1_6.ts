// Verifier scratch for finding 1_6 (R4 courtyard route beats the if_pit answer).
// npx tsx engine/_scratch/verify_1_6.ts [maxSize=5] [--fix]
// Uses ONLY the real engine (run/score/validate) — no custom simulator.
import { run, score, validate, countBlocks, toText } from '../index';
import type { Block, Program, GameMap } from '../index';
import { MAPS } from '../maps';
import { SOLUTIONS } from '../solutions';
import { expect as R4EXPECT, naive as R4NAIVE } from '../rounds/r4';

const MAX = Number(process.argv[2] ?? 5);
const FIX = process.argv.includes('--fix');
const base = MAPS[4];
const fixed: GameMap = { ...base, tiles: base.tiles.map((r, y) => (y === 5 ? '######O#' : r)) };
const map = FIX ? fixed : base;

const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const rep = (n: number, ...body: Block[]): Block => ({ id: 'repeat', n, body });

const sc = (m: GameMap, p: Program) => {
  const r = run(m, p);
  return { r, s: score(r, { cap: m.cap, firstSubmit: false, usedPatch: false }).total };
};
const show = (m: GameMap, label: string, p: Program) => {
  const v = validate(p, m);
  const { r, s } = sc(m, p);
  const path = r.trace.slice(1).map((st) => `${st.owl.x},${st.owl.y}${st.event ? '!' + st.event : ''}`).join(' ');
  console.log(`${label}: valid=${v.ok} ${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${countBlocks(p)} score=${s}\n   ${toText(p).text.replace(/\n\s*/g, ' ')}\n   path: ${path}`);
};

console.log(`=== direct runs on ${FIX ? 'FIXED' : 'SHIPPED'} R4 map ===`);
SOLUTIONS.r4.forEach((p, i) => show(map, `solutions[${i}] (expect ${JSON.stringify(R4EXPECT[i])})`, p));
show(map, 'courtyard 6 no-if', [F, rep(2, J, R, F, J)]);
show(map, 'courtyard hand 9 flat', [F, J, R, F, J, J, R, F, J]);
show(map, 'naive', R4NAIVE.program);

// ---- exhaustive enumeration with engine run() (sleep excluded: no cat in R4, it is a pure no-op tick;
// repeat n=1 excluded: identical behaviour to its body with +1 block). def/call included.
const ATOMS: Block[] = [F, J, L, R];
function* seq(size: number, allowCall: boolean): Generator<Block[]> {
  if (size === 0) { yield []; return; }
  for (let s1 = 1; s1 <= size; s1++) {
    for (const b of blk(s1, allowCall)) for (const rest of seq(size - s1, allowCall)) yield [b, ...rest];
  }
}
function* blk(size: number, allowCall: boolean): Generator<Block> {
  if (size === 1) { yield* ATOMS; if (allowCall) yield { id: 'call' }; return; }
  for (const body of seq(size - 1, allowCall)) for (let n = 2; n <= 9; n++) yield { id: 'repeat', n, body };
  for (let a = 0; a <= size - 1; a++) {
    for (const t of seq(a, allowCall)) for (const e of seq(size - 1 - a, allowCall)) {
      yield { id: 'if_pit', then: t, else: e };
      yield { id: 'if_wall', then: t, else: e };
    }
  }
}
const hasCall = (p: Program): boolean => p.some((b) => b.id === 'call' || ('body' in b && hasCall(b.body)) || ('then' in b && (hasCall(b.then) || hasCall(b.else))));
const hasId = (p: Program, id: string): boolean => p.some((b) => b.id === id || ('body' in b && hasId(b.body, id)) || ('then' in b && (hasId(b.then, id) || hasId(b.else, id))));

let best = -1; const hits: string[] = []; let goals = 0, total = 0; let twoMice = 0;
const consider = (p: Program) => {
  total++;
  const r = run(map, p, { maxTicks: 60 });
  if (r.outcome !== 'goal') return;
  goals++;
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
  if (r.mice === 2) twoMice++;
  const line = `score ${s} size ${countBlocks(p)} mice ${r.mice} ticks ${r.ticks} ifpit=${hasId(p, 'if_pit')}: ${toText(p).text.replace(/\n\s*/g, ' ')}`;
  if (s > best) { best = s; hits.length = 0; }
  if (s === best) hits.push(line);
};
for (let size = 1; size <= MAX; size++) {
  const before = total, g0 = goals;
  for (const p of seq(size, false)) consider(p);
  // with def: [def{body}, ...main], main contains a call; body has no call
  for (let bs = 1; bs <= size - 2; bs++) {
    for (const body of seq(bs, false)) for (const main of seq(size - 1 - bs, true)) {
      if (!hasCall(main)) continue;
      consider([{ id: 'def', body }, ...main]);
    }
  }
  console.log(`size ${size}: ${total - before} programs, goal ${goals - g0}`);
}
console.log(`best score <= ${MAX} blocks: ${best}; two-mouse goal programs: ${twoMice}; hits at best: ${hits.length}`);
hits.slice(0, 25).forEach((h) => console.log('  ' + h));
