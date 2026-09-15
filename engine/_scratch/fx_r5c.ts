import { MAPS } from '../maps';
import { run, score, validate, countBlocks, toText } from '../index';
import { SOLUTIONS } from '../solutions';
import type { Block, GameMap } from '../index';
import { parse } from './fx_probe';
const m5 = MAPS[5];
const S = (r: ReturnType<typeof run>, patch = false, first = false) => score(r, { cap: m5.cap, firstSubmit: first, usedPatch: patch }).total;
const step = 'iw{R|ip{J|F}}';
for (const src of [`L rep9{rep9{${step}}}`, `Z rep9{rep9{${step}}}`, `F L rep3{rep8{iw{R|} F} J}`]) {
  const p = parse(src); const r = run(m5, p);
  console.log(src, validate(p, m5).ok, r.outcome, r.ticks, r.mice, countBlocks(p), S(r), S(r, true));
}
const r0 = run(m5, SOLUTIONS.r5[0]);
console.log('trace0 cat', JSON.stringify(r0.trace[0].cat));
const rev: GameMap = { ...m5, cat: { ...m5.cat!, path: [...m5.cat!.path].reverse() } };
const rr = run(rev, SOLUTIONS.r5[0]);
const last = rr.trace[rr.trace.length - 1];
console.log('reversed:', rr.outcome, rr.ticks, last.event, last.message, JSON.stringify(last.owl), JSON.stringify(rev.cat!.path[0]));
// compile error scoring (R2)
for (const src of ['C', 'def{F C} C', 'Z']) {
  const p = parse(src); const r = run(MAPS[2], p);
  console.log('R2', src, r.outcome, r.message, r.ticks, r.distance, score(r, { cap: 12, firstSubmit: true, usedPatch: false }).total, score(r, { cap: 12, firstSubmit: false, usedPatch: false }).total);
}
// malformed
for (const bad of [[{ id: 'if_wall', then: [{ id: 'forward' }] }], [{ id: 'repeat', n: 2 }], [null]] as unknown as Block[][]) {
  const res: string[] = [];
  for (const [name, fn] of [['validate', () => validate(bad, MAPS[1])], ['countBlocks', () => countBlocks(bad)], ['toText', () => toText(bad)], ['run', () => run(MAPS[1], bad)]] as const) {
    try { fn(); res.push(name + ':ok'); } catch (e) { res.push(name + ':' + (e as Error).constructor.name); }
  }
  console.log(JSON.stringify(bad), res.join(' '));
}
