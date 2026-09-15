// Scratch: exact search over def-free programs via function dedup (not engine code).
// npx tsx engine/_scratch/fx_dp.ts <round> <K> [--no=if_pit,if_wall,repeat,jump] [--mice=2]
// Each block list denotes a function State -> State|GOAL|FAIL (+ mice eaten). Mice never affect
// movement/sensors, so they ride along as a mask. Timeout ignored (over-approximation: sound for "none exists").
// Reports min size of a def-free program reaching GOAL from start with >= M mice (up to K).
import { MAPS } from '../maps';
import { run, score, countBlocks, toText } from '../index';
import type { Block, GameMap, Program } from '../index';

const round = Number(process.argv[2]) as 1 | 2 | 3 | 4 | 5;
const K = Number(process.argv[3] ?? 7);
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const NO = new Set((arg('no') ?? '').split(',').filter(Boolean));
const M = Number(arg('mice') ?? 2);
const map: GameMap = process.env.TILES ? { ...MAPS[round], tiles: JSON.parse(process.env.TILES) as string[] } : MAPS[round];
if (map.cat) throw new Error('cat maps unsupported');
console.log('map:', map.tiles.join(' | '), 'K', K, 'no', [...NO].join(','), 'mice>=', M);

const tAt = (x: number, y: number): string | null => (x < 0 || y < 0 || x >= 8 || y >= 8 ? null : map.tiles[y][x]);
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const DIR: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
const miceBit = new Map<string, number>();
map.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'M') miceBit.set(`${x},${y}`, miceBit.size); }));
if (miceBit.size > 6) throw new Error('too many mice');
// key phase: 0 = no key yet, 1 = holding key (keys=1), 2 = door opened (keys=0). Assumes <=1 K and <=1 D.
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
// step: returns encoded value (to | eatMask<<10)
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
// BFS
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
  const ax = s.x + DX[s.d], ay = s.y + DY[s.d];
  const t = tAt(ax, ay);
  sensWall[i] = t === null || t === '#' || (t === 'D' && !opened && keys === 0) ? 1 : 0;
  sensPit[i] = t === 'O' ? 1 : 0;
}

// ---------------------------------------------------------------- function store
class Store {
  pool: Uint16Array; count = 0; table: Int32Array; hashes: Uint32Array; mask: number; len: number;
  constructor(len: number, cap = 1024) {
    this.len = Math.max(1, len);
    this.pool = new Uint16Array(cap * this.len); this.hashes = new Uint32Array(cap);
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
  }
  static hash(a: Uint16Array, off: number, len: number): number {
    let h = 2166136261;
    for (let i = 0; i < len; i++) { h ^= a[off + i]; h = Math.imul(h, 16777619); }
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
  find(a: Uint16Array, h = Store.hash(a, 0, this.len)): number {
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
  /** returns [index, isNew] */
  add(a: Uint16Array): number {
    const h = Store.hash(a, 0, this.len);
    const f = this.find(a, h);
    if (f >= 0) return -(f + 1);
    if (this.count >= this.hashes.length) this.grow();
    const i = this.count++;
    this.pool.set(a, i * this.len); this.hashes[i] = h; this.place(i);
    return i;
  }
}

// provenance
type Prov =
  | { k: 'leaf'; a: string }
  | { k: 'rep'; n: number; body: number }      // body = list idx
  | { k: 'if'; w: boolean; t: number; e: number } // list idxs
  | { k: 'seq'; b: number; rest: number }        // block idx, list idx
  | { k: 'blk'; b: number }                      // single block as list
  | { k: 'empty' };

const lists = new Store(N, 1 << 16);
const listProv: Prov[] = [];
const listSize: number[] = [];
const blocks = new Store(N, 1 << 16);
const blockProv: Prov[] = [];
const blockSize: number[] = [];
const Lst: number[][] = [];  // Lst[k] = list idxs of minimal size k
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

let best: { size: number; prog: Program; mask: number } | null = null;
function prog(kind: 'list' | 'block', i: number): Block[] {
  const p = kind === 'list' ? listProv[i] : blockProv[i];
  switch (p.k) {
    case 'empty': return [];
    case 'leaf': return [{ id: ({ f: 'forward', J: 'jump', L: 'left', R: 'right' } as const)[p.a as 'f'] }];
    case 'rep': return [{ id: 'repeat', n: p.n, body: prog('list', p.body) }];
    case 'if': return [{ id: p.w ? 'if_wall' : 'if_pit', then: prog('list', p.t), else: prog('list', p.e) }];
    case 'seq': return [...prog('block', p.b), ...prog('list', p.rest)];
    case 'blk': return prog('block', p.b);
  }
}
function checkGoal(v: number, size: number, mk: () => Program) {
  if ((v & 1023) !== GOAL) return;
  const m = v >> 10;
  if (popc(m) >= M && (!best || size < best.size)) best = { size, prog: mk(), mask: m };
}

// size 0
{
  const id = new Uint16Array(N); for (let i = 0; i < N; i++) id[i] = i;
  const i = lists.add(id); listProv.push({ k: 'empty' }); listSize.push(0); Lst[0] = [i];
}
function addBlock(a: Uint16Array, prov: Prov, size: number, cur: number[]) {
  if (lists.find(a) >= 0) return;       // dominated by a smaller list
  const i = blocks.add(a);
  if (i < 0) return;
  blockProv.push(prov); blockSize.push(size); cur.push(i);
}
function addList(a: Uint16Array, prov: Prov, size: number, cur: number[]) {
  const i = lists.add(a);
  if (i < 0) return;
  listProv.push(prov); listSize.push(size); cur.push(i);
  checkGoal(a[s0], size, () => prog('list', i));
}

const t0 = process.hrtime.bigint();
const ms = () => Number((process.hrtime.bigint() - t0) / 1000000n);
// projections for ifs
function projStore(sens: Uint8Array, want: number) {
  const idx: number[] = []; for (let s = 0; s < N; s++) if (sens[s] === want) idx.push(s);
  return { idx, store: new Store(idx.length, 1024), reps: [] as number[][] };
}
const projs = {
  wT: projStore(sensWall, 1), wF: projStore(sensWall, 0), pT: projStore(sensPit, 1), pF: projStore(sensPit, 0),
};
function updateProj(k: number) {
  for (const p of Object.values(projs)) {
    p.reps[k] = [];
    const buf = new Uint16Array(Math.max(1, p.idx.length));
    for (const li of Lst[k]) {
      const f = lists.get(li);
      for (let j = 0; j < p.idx.length; j++) buf[j] = f[p.idx[j]];
      const r = p.store.add(buf);
      if (r >= 0) p.reps[k].push(li);
    }
  }
}
updateProj(0);

for (let k = 1; k <= K; k++) {
  const blk: number[] = [];
  const out = new Uint16Array(N);
  if (k === 1) {
    for (const a of ACTS) addBlock(trans[a], { k: 'leaf', a }, 1, blk);
  } else {
    // repeat
    if (!NO.has('repeat')) {
      for (const bi of Lst[k - 1]) {
        const g = lists.get(bi);
        const h = new Uint16Array(g);
        for (let n = 2; n <= 9; n++) {
          compose(h, g, out); h.set(out);
          addBlock(h, { k: 'rep', n, body: bi }, k, blk);
        }
      }
    }
    // if
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
            addBlock(out, { k: 'if', w, t: ti, e: ei }, k, blk);
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
      for (const li of Lst[k - i]) {
        compose(bf, lists.get(li), tmp);
        addList(tmp, { k: 'seq', b: bi, rest: li }, k, cur);
      }
    }
  }
  Lst[k] = cur;
  updateProj(k);
  const bsz = (best as { size: number } | null)?.size;
  console.log(`size ${k}: blocks ${blk.length}, lists ${cur.length} (total ${lists.count}) t=${ms()}ms best=${bsz ?? '-'}`);
  if (bsz !== undefined && bsz <= k) break;
}
if (best) {
  const b = best as { size: number; prog: Program; mask: number };
  const r = run(map, b.prog);
  console.log(`FOUND size ${b.size} mask ${b.mask}: engine ${r.outcome} ticks ${r.ticks} mice ${r.mice} blocks ${countBlocks(b.prog)} score ${score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total}`);
  console.log(toText(b.prog).text.split('\n').map((l) => '   ' + l).join('\n'));
} else console.log(`NONE up to size ${K}`);
