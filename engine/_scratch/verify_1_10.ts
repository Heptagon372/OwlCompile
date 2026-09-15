// Verifier scratch for finding 1_10 (R5 cat predictability). npx tsx engine/_scratch/verify_1_10.ts
import { run } from '../index';
import type { GameMap, Program } from '../index';
import { map, noSleep, solutions } from '../rounds/r5';

const waitAll: Program = [{ id: 'repeat', n: 9, body: [{ id: 'repeat', n: 5, body: [{ id: 'sleep' }] }] }];
const tl = (m: GameMap) => run(m, waitAll).trace.slice(0, 30).map((s) => `${s.tick}:${s.cat!.x},${s.cat!.y}`).join(' ');

console.log('cat path', JSON.stringify(map.cat), 'intro:', map.intro);
console.log('c tiles:', map.tiles.flatMap((row, y) => [...row].map((ch, x) => (ch === 'c' ? `${x},${y}` : null)).filter(Boolean)).join(' '));
console.log('A actual :', tl(map));
// Same c tiles, different start cell / orientation: path starting at the other end (7,6)
const rev: GameMap = { ...map, cat: { path: [...map.cat!.path].reverse(), mode: 'pingpong' } };
console.log('B rev    :', tl(rev));
// Same c tiles, start mid-line at (6,4) heading east: path (6,4)(7,4)(7,5)(7,6) can't include (4,4),(5,4) in pingpong w/o bounce -> represent as a loop-free pingpong over full line but rotated? Not expressible; skip.
const crossTicks = (m: GameMap) => run(m, waitAll).trace.filter((s) => s.cat!.x === 7 && s.cat!.y === 4).map((s) => s.tick).slice(0, 8).join(',');
console.log('A (7,4) at ticks', crossTicks(map));
console.log('B (7,4) at ticks', crossTicks(rev));
for (const [n, p] of [['sol0', solutions[0]], ['noSleep', noSleep]] as [string, Program][]) {
  const rA = run(map, p), rB = run(rev, p);
  console.log(n, 'actual:', rA.outcome, rA.ticks, rA.message, '| reversed-start:', rB.outcome, rB.ticks, rB.message);
}
const t0 = run(map, noSleep).trace;
console.log('noSleep t16..18:', t0.slice(16, 19).map((s) => `${s.tick}:${s.owl.x},${s.owl.y}/${s.cat!.x},${s.cat!.y}${s.event ? '!' + s.event : ''}`).join(' '));
console.log('trace[0].cat =', JSON.stringify(t0[0].cat));
