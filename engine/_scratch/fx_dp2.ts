// Scratch (not engine code): exact min-size search over def-free programs (no def/call, no sleep —
// sleep is the identity on cat-free maps, repeat 1 is the identity on its body).
// Function-dedup DP like fx_dp.ts, but the last level K is checked lazily at the start state only,
// so proving "none <= K" needs full function tables only up to K-1.
// npx tsx engine/_scratch/fx_dp2.ts <round> <K> [--mice=2] [--no=if_pit,if_wall,repeat,jump]
// env TILES='[...]' DIR=E to override the map.
import { MAPS } from '../maps';
import { run, score, countBlocks, toText } from '../index';
import type { Block, GameMap, Program, Dir } from '../index';

const round = Number(process.argv[2]) as 1 | 2 | 3 | 4 | 5;
const K = Number(process.argv[3] ?? 7);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const NO = new Set((arg('no') ?? '').split(',').filter(Boolean));
const M = Number(arg('mice') ?? 2);
let map: GameMap = MAPS[round];
if (process.env.TILES) map = { ...map, tiles: JSON.parse(process.env.TILES) as string[] };
if (process.env.DIR) map = { ...map, startDir: process.env.DIR as Dir };
if (map.cat) throw new Error('cat maps unsupported');
console.log('map:', map.tiles.join(' | '), map.startDir, 'K', K, 'no', [...NO].join(','), 'mice>=', M);

const tAt = (x: number, y: number): string | null => (x < 0 || y < 0 || x >= 8 || y >= 8 ? null : map.tiles[y][x]);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const DIR: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
const miceBit = new Map<string, number>();
map.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'M') miceBit.set(`${x},${y}`, miceBit.size); }));
if (miceBit.size > 5) throw new Error('too many mice');
interface St { x: number; y: number; d: number; ph: number }
const GOAL = 1022, FAIL = 1023;
const states: St[] = [];
const idOf = new Map<string, number>();
const skey = (s: St) => `${s.x},${s.y},${s.d},${s.ph}`;
function intern(s: St): number {
  const k = skey(s);
  let id = idOf.get(k);
  if (id === undefined) { id = states.length; states.push(s); idOf.set(k, id); }
  return id;
}
function stepRaw(s: St, a: string): { to: St | 'GOAL' | 'FAIL'; eat: number } {
  const keys = s.ph === 1 ? 1 : 0;
  const opened = s.ph === 2;
  const blocked = (x: number, y: number) => { const t = tAt(x, y); return t === null || t === '#' || (t === 'D' && !opened && keys === 0); };
  const midBlocked = (x: number, y: number) => { const t = tAt(x, y); return t === null || t === '#' || (t === 'D' && !opened); };
  if (a === 'L') return { to: { ...s, d: (s.d + 3) & 3 }, eat: 0 };
  if (a === 'R') return { to: { ...s, d: (s.d + 1) & 3 }, eat: 0 };
  const k = a === 'J' ? 2 : 1;
  if (k === 2 && midBlocked(s.x + DX[s.d], s.y + DY[s.d])) return { to: 'FAIL', eat: 0 };
  const nx = s.x + DX[s.d] * k, ny = s.y + DY[s.d] * k;
  if (blocked(nx, ny)) return { to: 'FAIL', eat: 0 };
  const t = tAt(nx, ny);
  let ph = s.ph, eat = 0;
  if (t === 'O') return { to: 'FAIL', eat: 0 };
  if (t === 'D' && !opened) ph = 2;
  else if (t === 'M') eat = 1 << miceBit.get(`${nx},${ny}`)!;
  else if (t === 'K' && s.ph === 0) ph = 1;
  else if (t === 'G') return { to: 'GOAL', eat: 0 };
  return { to: { x: nx, y: ny, d: s.d, ph }, eat };
}
let sx = 0, sy = 0;
map.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'S') { sx = x; sy = y; } }));
const s0 = intern({ x: sx, y: sy, d: DIR[map.startDir], ph: 0 });
const ACTS = ['f', 'J', 'L', 'R'].filter((a) => !(a === 'J' && NO.has('jump')));
for (let i = 0; i < states.length; i++) for (const a of ACTS) { const r = stepRaw(states[i], a); if (typeof r.to !== 'string') intern(r.to); }
const N = states.length;
if (N >= 1022) throw new Error('too many states');
console.log('states', N);
const trans: Record<string, Uint16Array> = {};
for (const a of ACTS) {
  const arr = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const r = stepRaw(states[i], a);
    arr[i] = r.to === 'FAIL' ? FAIL : r.to === 'GOAL' ? GOAL : (idOf.get(skey(r.to))! | (r.eat << 10));
  }
  trans[a] = arr;
}
const sensWall = new Uint8Array(N), sensPit = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const s = states[i];
  const keys = s.ph === 1 ? 1 : 0, opened = s.ph === 2;
  const t = tAt(s.x + DX[s.d], s.y + DY[s.d]);
  sensWall[i] = t === null || t === '#' || (t === 'D' && !opened && keys === 0) ? 1 : 0;
  sensPit[i] = t === 'O' ? 1 : 0;
}

class Store {
  pool: Uint16Array; count = 0; table: Int32Array; hashes: Uint32Array; mask: number; len: number;
  constructor(len: number, cap = 1024) {
    this.len = Math.max(1, len);
    this.pool = new Uint16Array(cap * this.len); this.hashes = new Uint32Array(cap);
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
  }
  static hash(a: Uint16Array, len: number): number {
    let h = 2166136261;
    for (let i = 0; i < len; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  get(i: number): Uint16Array { return this.pool.subarray(i * this.len, (i + 1) * this.len); }
  private grow() {
    const cap = this.hashes.length * 2;
    const p = new Uint16Array(cap * this.len); p.set(this.pool); this.pool = p;
    const h = new Uint32Array(cap); h.set(this.hashes); this.hashes = h;
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
    for (let i = 0; i < this.count; i++) this.place(i);
  }
  private place(i: number) { let j = this.hashes[i] & this.mask; while (this.table[j]) j = (j + 1) & this.mask; this.table[j] = i + 1; }
  find(a: Uint16Array, h = Store.hash(a, this.len)): number {
    let j = h & this.mask;
    for (;;) {
      const t = this.table[j];
      if (!t) return -1;
      const i = t - 1;
      if (this.hashes[i] === h) {
        const off = i * this.len; let same = true;
        for (let k = 0; k < this.len; k++) if (this.pool[off + k] !== a[k]) { same = false; break; }
        if (same) return i;
      }
      j = (j + 1) & this.mask;
    }
  }
  add(a: Uint16Array): number {
    const h = Store.hash(a, this.len);
    const f = this.find(a, h);
    if (f >= 0) return -(f + 1);
    if (this.count >= this.hashes.length) this.grow();
    const i = this.count++;
    this.pool.set(a, i * this.len); this.hashes[i] = h; this.place(i);
    return i;
  }
}

type Prov =
  | { k: 'leaf'; a: string }
  | { k: 'rep'; n: number; body: number }
  | { k: 'if'; w: boolean; t: number; e: number }
  | { k: 'seq'; b: number; rest: number }
  | { k: 'blk'; b: number }
  | { k: 'empty' };

const lists = new Store(N, 1 << 16);
const listProv: Prov[] = [];
const blocks = new Store(N, 1 << 16);
const blockProv: Prov[] = [];
const Lst: number[][] = [];
const Blk: number[][] = [];
const tmp = new Uint16Array(N);
function compose(f: Uint16Array, g: Uint16Array, out: Uint16Array) {
  for (let s = 0; s < N; s++) {
    const v = f[s]; const to = v & 1023;
    if (to >= GOAL) { out[s] = v; continue; }
    const w = g[to]; const wt = w & 1023;
    out[s] = wt === FAIL ? FAIL : (wt | ((v | w) & 0xfc00));
  }
}
const popc = (m: number) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const LEAF_ID = { f: 'forward', J: 'jump', L: 'left', R: 'right' } as const;
function prog(kind: 'list' | 'block', i: number): Block[] {
  const p = kind === 'list' ? listProv[i] : blockProv[i];
  switch (p.k) {
    case 'empty': return [];
    case 'leaf': return [{ id: LEAF_ID[p.a as keyof typeof LEAF_ID] }];
    case 'rep': return [{ id: 'repeat', n: p.n, body: prog('list', p.body) }];
    case 'if': return [{ id: p.w ? 'if_wall' : 'if_pit', then: prog('list', p.t), else: prog('list', p.e) }];
    case 'seq': return [...prog('block', p.b), ...prog('list', p.rest)];
    case 'blk': return prog('block', p.b);
  }
}
let found: { size: number; prog: Program } | null = null;
const okGoal = (v: number) => (v & 1023) === GOAL && popc(v >> 10) >= M;

{
  const id = new Uint16Array(N); for (let i = 0; i < N; i++) id[i] = i;
  const i = lists.add(id); listProv.push({ k: 'empty' }); Lst[0] = [i];
}
function addBlock(a: Uint16Array, prov: Prov, cur: number[]) {
  if (lists.find(a) >= 0) return;
  const i = blocks.add(a);
  if (i < 0) return;
  blockProv.push(prov); cur.push(i);
}
function addList(a: Uint16Array, prov: Prov, size: number, cur: number[]) {
  const i = lists.add(a);
  if (i < 0) return;
  listProv.push(prov); cur.push(i);
  if (!found && okGoal(a[s0])) found = { size, prog: prog('list', i) };
}
const t0 = process.hrtime.bigint();
const ms = () => Number((process.hrtime.bigint() - t0) / 1000000n);
function projStore(sens: Uint8Array, want: number) {
  const idx: number[] = []; for (let s = 0; s < N; s++) if (sens[s] === want) idx.push(s);
  return { idx, store: new Store(idx.length, 1024), reps: [] as number[][] };
}
const projs = { wT: projStore(sensWall, 1), wF: projStore(sensWall, 0), pT: projStore(sensPit, 1), pF: projStore(sensPit, 0) };
function updateProj(k: number) {
  for (const p of Object.values(projs)) {
    p.reps[k] = [];
    const buf = new Uint16Array(Math.max(1, p.idx.length));
    for (const li of Lst[k]) {
      const f = lists.get(li);
      for (let j = 0; j < p.idx.length; j++) buf[j] = f[p.idx[j]];
      if (p.store.add(buf) >= 0) p.reps[k].push(li);
    }
  }
}
updateProj(0);

/** goalAt[m][s] = OR over lists of size <= m of (1 << mask) when the list reaches GOAL from s with that mask. */
const goalAt: Uint32Array[] = [];
function updateGoalAt(k: number) {
  const g = new Uint32Array(N);
  if (k > 0) g.set(goalAt[k - 1]);
  for (const li of Lst[k]) {
    const f = lists.get(li);
    for (let s = 0; s < N; s++) { const v = f[s]; if ((v & 1023) === GOAL) g[s] |= 1 << (v >> 10); }
  }
  goalAt[k] = g;
}
updateGoalAt(0);
const anyGoodMask = (set: number, carry: number) => {
  for (let m = 0; m < 32; m++) if ((set >>> m) & 1 && popc(m | carry) >= M) return true;
  return false;
};

function lastLevel(k: number): Program | null {
  // (a) sequences block(i) + list(k-i), evaluated at s0 only
  for (let i = 1; i <= k - 1; i++) {
    for (const bi of Blk[i]) {
      const v = blocks.get(bi)[s0]; const to = v & 1023;
      if (to >= GOAL) continue;           // goal already counted at size i; FAIL dead
      if (anyGoodMask(goalAt[k - i][to], v >> 10)) {
        // reconstruct: find the list
        for (let m = 1; m <= k - i; m++) for (const li of Lst[m]) {
          const w = lists.get(li)[to];
          if ((w & 1023) === GOAL && popc((w >> 10) | (v >> 10)) >= M) return [...prog('block', bi), ...prog('list', li)];
        }
      }
    }
  }
  // (b) single repeat block of size k: repeat n { list of size k-1 }, orbit from s0
  if (!NO.has('repeat')) {
    for (const li of Lst[k - 1]) {
      const f = lists.get(li);
      let v = s0;
      for (let n = 1; n <= 9; n++) {
        const w = f[v & 1023]; const wt = w & 1023;
        if (wt === FAIL) break;
        const nv = wt | ((v | w) & 0xfc00);
        if (wt === GOAL) { if (n >= 2 && popc(nv >> 10) >= M) return [{ id: 'repeat', n, body: prog('list', li) }]; break; }
        v = nv;
      }
    }
  }
  // (c) single if block of size k: runs one branch (size <= k-1) at s0 — covered by smaller sizes.
  return null;
}

for (let k = 1; k <= K; k++) {
  if (k === K && k >= 2) {
    const p = lastLevel(k);
    console.log(`size ${k} (lazy, s0 only): ${p ? 'FOUND' : 'none'} t=${ms()}ms`);
    if (p) found = { size: k, prog: p };
    break;
  }
  const blk: number[] = [];
  const out = new Uint16Array(N);
  if (k === 1) {
    for (const a of ACTS) addBlock(trans[a], { k: 'leaf', a }, blk);
  } else {
    if (!NO.has('repeat')) {
      for (const bi of Lst[k - 1]) {
        const g = lists.get(bi);
        const h = new Uint16Array(g);
        for (let n = 2; n <= 9; n++) { compose(h, g, out); h.set(out); addBlock(h, { k: 'rep', n, body: bi }, blk); }
      }
    }
    for (const [w, T, E] of [[true, projs.wT, projs.wF], [false, projs.pT, projs.pF]] as const) {
      if (w && NO.has('if_wall')) continue;
      if (!w && NO.has('if_pit')) continue;
      const sens = w ? sensWall : sensPit;
      for (let a = 0; a <= k - 1; a++) {
        const b = k - 1 - a;
        if (a === 0 && b === 0) continue;
        for (const ti of T.reps[a]) {
          const tf = lists.get(ti);
          for (const ei of E.reps[b]) {
            const ef = lists.get(ei);
            for (let s = 0; s < N; s++) out[s] = sens[s] ? tf[s] : ef[s];
            addBlock(out, { k: 'if', w, t: ti, e: ei }, blk);
          }
        }
      }
    }
  }
  Blk[k] = blk;
  const cur: number[] = [];
  for (const bi of blk) addList(blocks.get(bi), { k: 'blk', b: bi }, k, cur);
  for (let i = 1; i <= k - 1; i++) {
    for (const bi of Blk[i]) {
      const bf = blocks.get(bi);
      for (const li of Lst[k - i]) { compose(bf, lists.get(li), tmp); addList(tmp, { k: 'seq', b: bi, rest: li }, k, cur); }
    }
  }
  Lst[k] = cur;
  updateProj(k);
  updateGoalAt(k);
  const fs = (found as { size: number } | null)?.size;
  console.log(`size ${k}: blocks ${blk.length}, lists ${cur.length} (total ${lists.count}) t=${ms()}ms found=${fs ?? '-'}`);
  if (fs !== undefined) break;
}
const fnd = found as { size: number; prog: Program } | null;
if (fnd) {
  const r = run(map, fnd.prog);
  console.log(`MIN def-free size ${fnd.size}: engine ${r.outcome} ticks ${r.ticks} mice ${r.mice} blocks ${countBlocks(fnd.prog)} score ${score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total}`);
  console.log(toText(fnd.prog).text.split('\n').map((l) => '   ' + l).join('\n'));
} else console.log(`NONE up to size ${K}`);
