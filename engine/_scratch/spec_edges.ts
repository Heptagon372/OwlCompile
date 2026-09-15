// Edge-case conformance probes (cards.html / brief vs engine; timeout; validate robustness).
import { run, validate, score } from '../index';
import type { GameMap, Program } from '../types';

const mk = (tiles: string[], startDir: GameMap['startDir'] = 'E', cap = 12): GameMap => ({
  round: 1, name: 't', difficulty: '쉬움', cap, seconds: 60, intro: '', tiles, startDir,
});
const pad = (rows: string[]) => [...rows, ...Array(8 - rows.length).fill('########')];
const show = (tag: string, m: GameMap, p: Program) => {
  const r = run(m, p);
  console.log(tag, '->', r.outcome, `ticks=${r.ticks}`, `"${r.message}"`, r.trace.slice(1).map((s) => `${s.tick}:${s.block}@${s.owl.x},${s.owl.y}${s.event ? '/' + s.event : ''}`).join(' '));
  return r;
};

// 1) cards.html back of jump card: "착지 칸이 벽·문이면 에러". Engine: holding key, jump onto locked door opens it.
const doorMap = mk(pad(['########', '#SK.D.G#']));
show('jump onto locked door WITH key (card says error)', doorMap, [{ id: 'forward' }, { id: 'jump' }, { id: 'forward' }, { id: 'forward' }]);

// 2) cards.html if_wall: "앞 칸이 벽, 맵 밖, 잠긴 문이면 위 입을". Engine: locked door + key → else branch.
const ifMap = mk(pad(['########', '#SKD.G.#']));
show('if_wall facing locked door WITH key (card says then=right)', ifMap, [
  { id: 'forward' },
  { id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] },
]);

// 3) maxTicks reached exactly when the program ends: stuck vs timeout
const spin = mk(pad(['########', '#S....G#']));
const r300 = run(spin, [{ id: 'repeat', n: 3, body: [{ id: 'repeat', n: 100, body: [{ id: 'left' }] }] }]);
console.log('300 turns exactly (program ends at tick 300):', r300.outcome, r300.ticks, r300.message, r300.trace[300].event);
const r299 = run(spin, [{ id: 'repeat', n: 3, body: [{ id: 'repeat', n: 100, body: [{ id: 'left' }] }] }, ], { maxTicks: 301 });
console.log('same program with maxTicks 301:', r299.outcome, r299.ticks, r299.message);
const r0 = run(spin, [{ id: 'forward' }, { id: 'forward' }], { maxTicks: 0 });
console.log('maxTicks 0:', r0.outcome, r0.ticks, r0.message);
const rneg = run(spin, [{ id: 'forward' }, { id: 'forward' }], { maxTicks: -5 });
console.log('maxTicks -5:', rneg.outcome, rneg.ticks, rneg.message);

// 4) timeout on a tick with an event (mouse) — event replaced
const mouse = mk(pad(['########', '#S.M..G#']));
const rt = run(mouse, [{ id: 'forward' }, { id: 'forward' }, { id: 'forward' }], { maxTicks: 2 });
console.log('timeout on mouse tick:', rt.outcome, rt.mice, rt.trace[2].event, rt.trace[2].message);

// 5) E_CALL_NO_DEF when a def exists but nested
const v = validate([{ id: 'repeat', n: 1, body: [{ id: 'def', body: [{ id: 'forward' }] }] }, { id: 'call' }], spin);
console.log('nested def + call codes:', v.codes);

// 6) stuck score line with 0 mice
const rs = run(spin, [{ id: 'forward' }]);
console.log('stuck 0 mice lines:', JSON.stringify(score(rs, { cap: 12, firstSubmit: false, usedPatch: false }).lines));

// 7) validate robustness on malformed if (missing else) — spec says "else는 항상 배열"
try {
  const bad = validate([{ id: 'if_wall', then: [{ id: 'forward' }] } as any], spin);
  console.log('validate missing else:', bad.codes);
} catch (e) { console.log('validate missing else THROWS:', (e as Error).message); }
try {
  const bad = validate([{ id: 'repeat', n: 2 } as any], spin);
  console.log('validate repeat missing body:', bad.codes);
} catch (e) { console.log('validate repeat missing body THROWS:', (e as Error).message); }
try {
  const bad = validate([null as any], spin);
  console.log('validate null block:', bad.codes);
} catch (e) { console.log('validate null block THROWS:', (e as Error).message); }

// 8) run with repeat n invalid (run does not validate): n = '3' string, n = 2.5
const rstr = run(spin, [{ id: 'repeat', n: '3' as any, body: [{ id: 'forward' }] }]);
console.log('run repeat n="3":', rstr.outcome, rstr.ticks);
