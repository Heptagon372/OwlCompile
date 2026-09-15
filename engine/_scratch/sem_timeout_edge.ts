// Timeout boundary: (a) a program that finishes exactly at maxTicks is reported as timeout, not stuck;
// (b) the event of the maxTicks tick (mouse/key/door) is overwritten by 'timeout' although its effect is kept;
// (c) maxTicks <= 0 still executes one tick.
// Run: npx tsx engine/_scratch/sem_timeout_edge.ts
import { run, score, MAPS } from '../index';
import type { Block, Program } from '../types';

const rep = (n: number, body: Block[]): Block => ({ id: 'repeat', n, body });
// (a) exactly 300 sleeps with a valid program: 3*4*5*5 = 300 (5 blocks, fits every cap)
const p300: Program = [rep(3, [rep(4, [rep(5, [rep(5, [{ id: 'sleep' }])])])])];
const a = run(MAPS[1], p300);
console.log(`(a) 300-sleep program: outcome=${a.outcome} message="${a.message}" ticks=${a.ticks} lastEvent=${a.trace[a.trace.length - 1].event} (expected stuck: program ended, no infinite loop)`);
const p299: Program = [rep(3, [rep(4, [rep(5, [rep(5, [{ id: 'sleep' }])])])]), { id: 'left' }];
void p299;

// (b) mouse eaten on the final (timeout) tick: R1 first mouse is at tick 2.
const b = run(MAPS[1], [rep(4, [{ id: 'forward' }])], { maxTicks: 2 });
const lb = b.trace[b.trace.length - 1];
console.log(`(b) maxTicks=2 on R1: outcome=${b.outcome} lastEvent=${lb.event} lastMsg="${lb.message}" mice=${b.mice} eaten=${JSON.stringify(lb.eaten)} score=${score(b, { cap: 12, firstSubmit: false, usedPatch: false }).total} (mouse toast never emitted, but mouse removed and scored)`);

// (c) maxTicks 0
const c = run(MAPS[1], [rep(4, [{ id: 'forward' }])], { maxTicks: 0 });
console.log(`(c) maxTicks=0: ticks=${c.ticks} message="${c.message}" (expected 0 ticks)`);
