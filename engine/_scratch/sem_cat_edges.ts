// Cat edge cases: tick-0 overlap is never checked; jump over an approaching cat; forward swap.
// Run: npx tsx engine/_scratch/sem_cat_edges.ts
import { run, checkMap } from '../index';
import type { GameMap, CatPatrol } from '../types';

const mk = (row0: string, cat: CatPatrol): GameMap => ({
  round: 5, name: 't', difficulty: '어려움', cap: 9, seconds: 1, intro: '', startDir: 'E', cat,
  tiles: [row0, '########', '########', '########', '########', '########', '########', '#######G'],
});
// 1) cat path[0] == owl start (S). Owl sleeps; cat walks away. Brief: "고양이와 같은 칸 = 사망".
const m1 = mk('#Sc.....', { path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
const r1 = run(m1, [{ id: 'sleep' }]);
console.log(`tick0 overlap: t0 owl=${JSON.stringify(r1.trace[0].owl)} t0 cat=${JSON.stringify(r1.trace[0].cat)} t0 event=${r1.trace[0].event} -> outcome=${r1.outcome}; checkMap=${JSON.stringify(checkMap(m1))}`);
// 2) forward swap: owl (2,0)->(3,0), cat (3,0)->(2,0)
const m2 = mk('#.Sc....', { path: [{ x: 3, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
m2.tiles[0] = '#.Scc...';
const r2 = run(m2, [{ id: 'forward' }]);
console.log(`forward swap: ${r2.outcome} "${r2.message}"`);
// 3) jump over cat that moves into owl's old cell
const m3 = mk('#.Sc....', { path: [{ x: 3, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
const r3 = run(m3, [{ id: 'jump' }]);
console.log(`jump over approaching cat: ${r3.outcome} owl=${JSON.stringify(r3.owl)} cat=${JSON.stringify(r3.cat)} (cat started at owl's landing path mid and moved to owl's old cell)`);
