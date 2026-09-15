// Reviewer scratch: R5 fairness probes. npx tsx engine/_scratch/rv_r5.ts
import { run, score, toText } from '../index';
import type { Block, Program } from '../index';
import { map, solutions, noSleep } from '../rounds/r5';

const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' }, Z: Block = { id: 'sleep' };
const step = (): Block => ({ id: 'if_wall', then: [R], else: [{ id: 'if_pit', then: [J], else: [F] }] });
const walk = (a: number, b: number, s: Block[] = [step()]): Block => ({ id: 'repeat', n: a, body: [{ id: 'repeat', n: b, body: s }] });
const one = (p: Program) => {
  const r = run(map, p);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
  const last = r.trace[r.trace.length - 1];
  return `${r.outcome} t${r.ticks} mice${r.mice} blocks${r.blocks} score${s} @(${r.owl.x},${r.owl.y}) ${last.message ?? ''}`;
};
const flat = (p: Program) => toText(p).text.replace(/\n\s*/g, ' ');

console.log('== cat timeline (t: cat pos)');
{
  const r = run(map, [{ id: 'repeat', n: 9, body: [{ id: 'repeat', n: 5, body: [Z] }] }]);
  console.log(r.trace.slice(0, 41).map((s) => `${s.tick}:${s.cat!.x},${s.cat!.y}`).join(' '));
}
console.log('== owl timeline for solutions[0] and noSleep');
for (const [name, p] of [['sol0', solutions[0]], ['noSleep', noSleep]] as [string, Program][]) {
  const r = run(map, p);
  console.log(name, r.trace.map((s) => `${s.tick}:${s.owl.x},${s.owl.y}${s.cat ? `/${s.cat.x},${s.cat.y}` : ''}${s.event ? '!' + s.event : ''}`).join(' '));
}

console.log('== sleep insertion points into noSleep (every structural position)');
function insertions(p: Program): { label: string; prog: Program }[] {
  const out: { label: string; prog: Program }[] = [];
  const clone = (x: Program): Program => JSON.parse(JSON.stringify(x));
  const visit = (list: Block[], label: string, rebuild: (nl: Block[]) => Program): void => {
    for (let i = 0; i <= list.length; i++) out.push({ label: `${label}[${i}]`, prog: rebuild([...list.slice(0, i), Z, ...list.slice(i)]) });
    list.forEach((b, i) => {
      const slots: string[] = b.id === 'repeat' || b.id === 'def' ? ['body'] : b.id === 'if_wall' || b.id === 'if_pit' ? ['then', 'else'] : [];
      for (const slot of slots) {
        visit((b as any)[slot], `${label}[${i}].${slot}`, (nl2) => { const copy = clone(list); (copy[i] as any)[slot] = nl2; return rebuild(copy); });
      }
    });
  };
  visit(clone(p), 'top', (nl) => nl);
  return out;
}
for (const { label, prog } of insertions(noSleep)) console.log(label.padEnd(40), one(prog));

console.log('== k sleeps at start');
for (let k = 0; k <= 6; k++) console.log(k, one([...Array(k).fill(Z), walk(6, 6)]));
console.log('== sleep appended at end (after walk) and other waits');
console.log('rep3{Z} walk', one([{ id: 'repeat', n: 3, body: [Z] }, walk(6, 6)]));
console.log('L R walk', one([L, R, walk(6, 6)]));
console.log('R L walk', one([R, L, walk(6, 6)]));
console.log('L L L L walk? (rep4{L})', one([{ id: 'repeat', n: 4, body: [L] }, walk(6, 6)]));
console.log('== alternative step bodies without sleep (7 blocks)');
const bodies: [string, Block[]][] = [
  ['iw{R}{ip{J}{F}}', [step()]],
  ['ip{J}{iw{R}{F}}', [{ id: 'if_pit', then: [J], else: [{ id: 'if_wall', then: [R], else: [F] }] }]],
  ['iw{R}{J}', [{ id: 'if_wall', then: [R], else: [J] }]],
  ['iw{R}{ip{J}{F}} then F? ', [step()]],
];
for (const [n, b] of bodies) for (const [a, c] of [[6, 6], [9, 9], [5, 8]]) console.log(n, a, c, one([walk(a, c, b)]));
