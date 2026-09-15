// Reviewer scratch: R5 structured search at sizes 8..9.
// Form: X + rep a { rep b { B } }  (nested, product collapsed to 81 since goal stops the run)
//   and X + rep n { B } (flat, n=2..9), X = up to 2 leaves from {F,J,L,R,Z}, B = any list (no sleep, no def) of size <= 5.
// Limitation: no suffix after the loop, no def, B <= 5. Total size <= 9.
// npx tsx engine/_scratch/rv_r5_struct.ts
import { map } from '../rounds/r5';
import { run, score, toText } from '../index';
import type { Block } from '../index';

const W = 8;
const tiles = map.tiles.join('');
const S = tiles.indexOf('S');
const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1];
const tAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? '#' : tiles[y * W + x]);
const catAt: number[] = [];
{ const p = map.cat!.path; let idx = 0, dir = 1; catAt.push(p[0].y * W + p[0].x);
  for (let t = 1; t <= 310; t++) { let nx = idx + dir; if (nx < 0 || nx >= p.length) { dir = -dir; nx = idx + dir; } idx = nx; catAt.push(p[idx].y * W + p[idx].x); } }
type N = { k: 'f' | 'J' | 'L' | 'R' | 'Z' } | { k: 'rep'; n: number; body: N[] } | { k: 'iw' | 'ip'; t: N[]; e: N[] };
let x = 0, y = 0, d = 3, mice = 0, ticks = 0, status = 0, useCat = true;
function act(k: string) {
  ticks++;
  if (k === 'L') d = (d + 3) & 3; else if (k === 'R') d = (d + 1) & 3; else if (k === 'Z') { /**/ } else {
    const s = k === 'J' ? 2 : 1;
    if (s === 2 && tAt(x + DX[d], y + DY[d]) === '#') { status = 2; return; }
    const nx = x + DX[d] * s, ny = y + DY[d] * s; const t = tAt(nx, ny);
    if (t === '#') { status = 2; return; }
    x = nx; y = ny; const c = ny * W + nx;
    if ((useCat && catAt[ticks - 1] === c) || t === 'O') { status = 3; return; }
    if (t === 'M') mice |= c === 4 ? 1 : 2;
    if (t === 'G') { status = 1; return; }
  }
  if (useCat && catAt[ticks] === y * W + x) { status = 3; return; }
  if (ticks >= 300) status = 2;
}
function exec(l: N[]) { for (const b of l) { if (status) return; if (b.k === 'rep') { for (let i = 0; i < b.n && !status; i++) exec(b.body); } else if (b.k === 'iw') exec(tAt(x + DX[d], y + DY[d]) === '#' ? b.t : b.e); else if (b.k === 'ip') exec(tAt(x + DX[d], y + DY[d]) === 'O' ? b.t : b.e); else act(b.k); } }
const BLEAF = ['f', 'J', 'L', 'R'].map((k) => ({ k }) as N);
const XLEAF = ['f', 'J', 'L', 'R', 'Z'].map((k) => ({ k }) as N);
function lists(s: number, cb: (l: N[]) => void, acc: N[] = []): void { if (s === 0) { cb(acc); return; } for (let i = 1; i <= s; i++) blocks(i, (b) => { acc.push(b); lists(s - i, cb, acc); acc.pop(); }); }
function blocks(s: number, cb: (b: N) => void): void {
  if (s === 1) { for (const l of BLEAF) cb(l); return; }
  lists(s - 1, (body) => { const c = body.slice(); for (let n = 2; n <= 9; n++) cb({ k: 'rep', n, body: c }); });
  for (let a = 0; a <= s - 1; a++) lists(a, (t) => { const tc = t.slice(); lists(s - 1 - a, (e) => { if (!tc.length && !e.length) return; const ec = e.slice(); cb({ k: 'iw', t: tc, e: ec }); cb({ k: 'ip', t: tc, e: ec }); }); });
}
const XS: N[][] = [[]];
for (const a of XLEAF) { XS.push([a]); for (const b of XLEAF) XS.push([a, b]); }
const toB = (n: N): Block => n.k === 'rep' ? { id: 'repeat', n: n.n, body: n.body.map(toB) } : n.k === 'iw' ? { id: 'if_wall', then: n.t.map(toB), else: n.e.map(toB) } : n.k === 'ip' ? { id: 'if_pit', then: n.t.map(toB), else: n.e.map(toB) } : ({ id: ({ f: 'forward', J: 'jump', L: 'left', R: 'right', Z: 'sleep' } as const)[n.k] });
const go = (prog: N[], cat: boolean) => { x = S % W; y = Math.floor(S / W); d = 3; mice = 0; ticks = 0; status = 0; useCat = cat; exec(prog); return status; };
const hits: { sc: number; txt: string; ticks: number; mice: number; sleep: boolean }[] = [];
let catFreeGoals = 0, tried = 0;
for (let bsize = 1; bsize <= 5; bsize++) {
  lists(bsize, (B) => {
    const Bc = B.slice();
    for (const X of XS) {
      const loops: [N, number][] = [];
      if (2 + bsize + X.length <= 9) loops.push([{ k: 'rep', n: 9, body: [{ k: 'rep', n: 9, body: Bc }] }, 2]);
      if (1 + bsize + X.length <= 9) for (let n = 2; n <= 9; n++) loops.push([{ k: 'rep', n, body: Bc }, 1]);
      for (const [loop, ov] of loops) {
        const prog = [...X, loop];
        tried++;
        if (go(prog, false) !== 1) continue;
        catFreeGoals++;
        if (go(prog, true) !== 1) continue;
        const size = ov + bsize + X.length;
        const m = (mice & 1) + ((mice >> 1) & 1);
        const p = prog.map(toB);
        const r = run(map, p);
        const sc = score(r, { cap: 9, firstSubmit: false, usedPatch: false }).total;
        if (r.outcome !== 'goal') console.log('MISMATCH', toText(p).text);
        hits.push({ sc, ticks: r.ticks, mice: m, sleep: X.some((l) => l.k === 'Z'), txt: `size${size} ` + toText(p).text.replace(/\n\s*/g, ' ') });
      }
    }
  });
  console.log(`bsize ${bsize}: tried ${tried}, cat-free goals ${catFreeGoals}, cat-safe goals ${hits.length}`);
}
hits.sort((a, b) => b.sc - a.sc);
const nos = hits.filter((h) => !h.sleep);
console.log(`cat-safe sleep-free: ${nos.length}; with sleep prefix: ${hits.length - nos.length}`);
for (const h of nos.slice(0, 30)) console.log('NOSLEEP', h.sc, `t${h.ticks}`, `mice${h.mice}`, h.txt);
for (const h of hits.filter((h) => h.sleep).slice(0, 8)) console.log('SLEEP', h.sc, `t${h.ticks}`, `mice${h.mice}`, h.txt);
