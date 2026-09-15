// Reviewer scratch: generic exhaustive search over programs of size <= N on a round map.
// npx tsx engine/_scratch/rv_brute.ts <round> <maxSize> [--no=if_wall,if_pit,def,sleep,jump,left,right,repeat] [--top=20] [--minsize=1]
// Fast custom simulator (validated against engine run() on each reported hit).
import { MAPS } from '../maps';
import { run, score, toText, countBlocks } from '../index';
import type { Block, Program } from '../index';

const round = Number(process.argv[2]) as 1 | 2 | 3 | 4 | 5;
const N = Number(process.argv[3] ?? 5);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const NO = new Set((arg('no') ?? '').split(',').filter(Boolean));
const TOP = Number(arg('top') ?? 15);
const MINSIZE = Number(arg('minsize') ?? 1);
const map = process.env.TILES ? { ...MAPS[round], tiles: JSON.parse(process.env.TILES) as string[] } : MAPS[round];
if (process.env.TILES) console.log('TILES OVERRIDE:', map.tiles.join(' | '));
const W = 8;
const tiles = map.tiles.join('');
const S = tiles.indexOf('S');
const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1];  // 0=E 1=S 2=W 3=N (right = +1)
const DIRS: Record<string, number> = { E: 0, S: 1, W: 2, N: 3 };
const tAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? '#' : tiles[y * W + x]);
const mouseIdx = new Map<number, number>();
[...tiles].forEach((c, i) => { if (c === 'M') mouseIdx.set(i, mouseIdx.size); });
const MAXT = 300;
// cat positions per tick
const catAt: number[] = [];
if (map.cat) {
  const p = map.cat.path; let idx = 0, dir = 1;
  catAt.push(p[0].y * W + p[0].x);
  for (let t = 1; t <= MAXT + 2; t++) {
    if (p.length > 1) {
      if (map.cat.mode === 'loop') idx = (idx + 1) % p.length;
      else { let nx = idx + dir; if (nx < 0 || nx >= p.length) { dir = -dir; nx = idx + dir; } idx = nx; }
    }
    catAt.push(p[idx].y * W + p[idx].x);
  }
}
const hasCat = !!map.cat;

type Node =
  | { k: 'f' | 'J' | 'L' | 'R' | 'Z' | 'C' }
  | { k: 'rep'; n: number; body: Node[] }
  | { k: 'iw' | 'ip'; t: Node[]; e: Node[] };

let x = 0, y = 0, d = 0, mice = 0, ticks = 0, status = 0, keys = 0, opened = 0, taken = 0;
let defBody: Node[] | null = null;
const isDoorLocked = (cx: number, cy: number) => tAt(cx, cy) === 'D' && !(opened & (1 << (cy * W + cx) % 31));
const blocked = (cx: number, cy: number) => { const t = tAt(cx, cy); return t === '#' || (t === 'D' && isDoorLocked(cx, cy) && keys === 0); };
const midBlocked = (cx: number, cy: number) => { const t = tAt(cx, cy); return t === '#' || (t === 'D' && isDoorLocked(cx, cy)); };
function act(k: string): void {
  ticks++;
  if (k === 'L') d = (d + 3) & 3;
  else if (k === 'R') d = (d + 1) & 3;
  else if (k === 'Z') { /* sleep */ }
  else {
    const s = k === 'J' ? 2 : 1;
    if (s === 2 && midBlocked(x + DX[d], y + DY[d])) { status = 2; return; }
    const nx = x + DX[d] * s, ny = y + DY[d] * s;
    if (blocked(nx, ny)) { status = 2; return; }
    x = nx; y = ny;
    const cell = ny * W + nx;
    if (hasCat && catAt[ticks - 1] === cell) { status = 3; return; }
    const t = tAt(nx, ny);
    if (t === 'O') { status = 3; return; }
    if (t === 'D' && isDoorLocked(nx, ny)) { keys--; opened |= 1 << (cell % 31); }
    else if (t === 'M' && !(mice & (1 << mouseIdx.get(cell)!))) mice |= 1 << mouseIdx.get(cell)!;
    else if (t === 'K' && !(taken & 1)) { keys++; taken |= 1; }
    else if (t === 'G') { status = 1; return; }
  }
  if (hasCat && catAt[ticks] === y * W + x) { status = 3; return; }
  if (ticks >= MAXT) status = 2;
}
function exec(list: Node[]): void {
  for (const b of list) {
    if (status) return;
    switch (b.k) {
      case 'rep': for (let i = 0; i < b.n && !status; i++) exec(b.body); break;
      case 'iw': exec(blocked(x + DX[d], y + DY[d]) ? b.t : b.e); break;
      case 'ip': exec(tAt(x + DX[d], y + DY[d]) === 'O' ? b.t : b.e); break;
      case 'C': if (defBody) exec(defBody); break;
      default: act(b.k);
    }
  }
}
function runProg(main: Node[], def: Node[] | null): void {
  x = S % W; y = Math.floor(S / W); d = DIRS[map.startDir]; mice = 0; ticks = 0; status = 0; keys = 0; opened = 0; taken = 0; defBody = def;
  exec(main);
}
const popcount = (m: number) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

const LEAVES: Node[] = ([['f', 'forward'], ['J', 'jump'], ['L', 'left'], ['R', 'right'], ['Z', 'sleep']] as const)
  .filter(([, id]) => !NO.has(id)).map(([k]) => ({ k } as Node));
const CALL: Node = { k: 'C' };
const useRep = !NO.has('repeat'), useIW = !NO.has('if_wall'), useIP = !NO.has('if_pit'), useDef = !NO.has('def');
function firstAction(list: Node[]): string | null {
  const b = list[0];
  if (!b) return null;
  return b.k.length === 1 ? b.k : null;
}
function lists(s: number, withCall: boolean, cb: (l: Node[]) => void, prev: string | null = null, prev2: string | null = null, acc: Node[] = []): void {
  if (s === 0) { cb(acc); return; }
  for (let i = 1; i <= s; i++) {
    blocks(i, withCall, (b) => {
      if ((prev === 'L' && b.k === 'R') || (prev === 'R' && b.k === 'L')) return;
      if ((b.k === 'L' || b.k === 'R') && prev === b.k && prev2 === b.k) return;  // XXX = opposite turn
      acc.push(b);
      lists(s - i, withCall, cb, b.k.length === 1 ? b.k : null, b.k.length === 1 ? prev : null, acc);
      acc.pop();
    });
  }
}
function blocks(s: number, withCall: boolean, cb: (b: Node) => void): void {
  if (s === 1) { for (const l of LEAVES) cb(l); if (withCall) cb(CALL); return; }
  if (useRep) lists(s - 1, withCall, (body) => { const copy = body.slice(); for (let n = 2; n <= 9; n++) cb({ k: 'rep', n, body: copy }); });
  if (!useIW && !useIP) return;
  for (let a = 0; a <= s - 1; a++) {
    const b = s - 1 - a;
    lists(a, withCall, (t) => {
      const tc = t.slice();
      const fa = firstAction(tc);
      lists(b, withCall, (e) => {
        if (tc.length === 0 && e.length === 0) return;
        const ec = e.slice();
        if (useIW && fa !== 'f' && fa !== 'J') cb({ k: 'iw', t: tc, e: ec });
        if (useIP && fa !== 'f') cb({ k: 'ip', t: tc, e: ec });
      });
    });
  }
}
const toBlock = (n: Node): Block => {
  switch (n.k) {
    case 'f': return { id: 'forward' }; case 'J': return { id: 'jump' }; case 'L': return { id: 'left' };
    case 'R': return { id: 'right' }; case 'Z': return { id: 'sleep' }; case 'C': return { id: 'call' };
    case 'rep': return { id: 'repeat', n: n.n, body: n.body.map(toBlock) };
    case 'iw': return { id: 'if_wall', then: n.t.map(toBlock), else: n.e.map(toBlock) };
    case 'ip': return { id: 'if_pit', then: n.t.map(toBlock), else: n.e.map(toBlock) };
  }
};
const show = (l: Node[]): string => l.map((b) => b.k === 'rep' ? `rep${b.n}{${show(b.body)}}` : b.k === 'iw' || b.k === 'ip' ? `${b.k}{${show(b.t)}|${show(b.e)}}` : b.k).join(' ');

interface Hit { size: number; sc: number; mice: number; ticks: number; txt: string; prog: Program }
const hits: Hit[] = [];
let bestByKey = new Map<string, number>();
function record(size: number, main: Node[], def: Node[] | null): void {
  const m = popcount(mice);
  const sc = 100 + 20 * m + Math.max(0, map.cap - size) * 5;
  const txt = def ? `def{${show(def)}} ${show(main)}` : show(main);
  const prog: Program = def ? [{ id: 'def', body: def.map(toBlock) }, ...main.map(toBlock)] : main.map(toBlock);
  hits.push({ size, sc, mice: m, ticks, txt, prog });
}
const t0 = process.hrtime.bigint();
for (let n = MINSIZE; n <= N; n++) {
  let tried = 0; const before = hits.length;
  lists(n, false, (main) => { tried++; runProg(main, null); if (status === 1) record(n, main, null); });
  if (useDef) for (let k = 1; k <= n - 2; k++) {
    lists(k, false, (body) => {
      const bc = body.slice();
      lists(n - 1 - k, true, (main) => {
        if (!JSON.stringify(main).includes('"C"')) return;
        tried++; runProg(main, bc);
        if (status === 1) record(n, main, bc);
      });
    });
  }
  const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
  console.log(`size ${n}: ${tried} programs, goal ${hits.length - before} (t=${ms}ms)`);
}
// verify with engine and print best
hits.sort((a, b) => b.sc - a.sc || a.size - b.size || a.ticks - b.ticks);
const seen = new Set<string>();
let printed = 0;
for (const h of hits) {
  const r = run(map, h.prog);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
  const ok = r.outcome === 'goal' && s === h.sc && countBlocks(h.prog) === h.size;
  const key = `${h.sc}|${h.mice}|${h.ticks}`;
  if (!ok) { console.log(`MISMATCH engine=${r.outcome}/${s} sim=${h.sc} ${h.txt}`); continue; }
  if (printed < TOP) { console.log(`score ${s} size ${h.size} mice ${h.mice} ticks ${r.ticks}: ${h.txt}`); printed++; }
  seen.add(key);
}
const dist = new Map<string, number>();
for (const h of hits) { const k = `size${h.size} score${h.sc} mice${h.mice}`; dist.set(k, (dist.get(k) ?? 0) + 1); }
console.log('distribution:', [...dist.entries()].map(([k, v]) => `${k}:${v}`).join(' | '));
