// Scratch library (not engine code): exact min-size program search by function dedup.
// A block list denotes a function State -> State|GOAL|FAIL (+ eaten-mice mask). Cat-free maps only.
// sleep is omitted (identity without a cat), repeat 1 omitted (identity on body).
// Optional `call` leaf with a fixed function (a def body) for def-inclusive searches.
import type { Block, GameMap, Program } from '../index';

export const GOAL = 1022, FAIL = 1023;

export interface Model {
  N: number; s0: number; trans: Record<string, Uint16Array>; sensWall: Uint8Array; sensPit: Uint8Array;
}

export function buildModel(map: GameMap): Model {
  if (map.cat) throw new Error('cat maps unsupported');
  const tAt = (x: number, y: number): string | null => (x < 0 || y < 0 || x >= 8 || y >= 8 ? null : map.tiles[y][x]);
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const DIR: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };
  const miceBit = new Map<string, number>();
  map.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'M') miceBit.set(`${x},${y}`, miceBit.size); }));
  if (miceBit.size > 5) throw new Error('too many mice');
  interface St { x: number; y: number; d: number; ph: number }
  const states: St[] = [];
  const idOf = new Map<string, number>();
  const skey = (s: St) => `${s.x},${s.y},${s.d},${s.ph}`;
  const intern = (s: St) => { const k = skey(s); let id = idOf.get(k); if (id === undefined) { id = states.length; states.push(s); idOf.set(k, id); } return id; };
  const stepRaw = (s: St, a: string): { to: St | 'GOAL' | 'FAIL'; eat: number } => {
    const keys = s.ph === 1 ? 1 : 0; const opened = s.ph === 2;
    const blocked = (x: number, y: number) => { const t = tAt(x, y); return t === null || t === '#' || (t === 'D' && !opened && keys === 0); };
    const midBlocked = (x: number, y: number) => { const t = tAt(x, y); return t === null || t === '#' || (t === 'D' && !opened); };
    if (a === 'L') return { to: { ...s, d: (s.d + 3) & 3 }, eat: 0 };
    if (a === 'R') return { to: { ...s, d: (s.d + 1) & 3 }, eat: 0 };
    const k = a === 'J' ? 2 : 1;
    if (k === 2 && midBlocked(s.x + DX[s.d], s.y + DY[s.d])) return { to: 'FAIL', eat: 0 };
    const nx = s.x + DX[s.d] * k, ny = s.y + DY[s.d] * k;
    if (blocked(nx, ny)) return { to: 'FAIL', eat: 0 };
    const t = tAt(nx, ny); let ph = s.ph, eat = 0;
    if (t === 'O') return { to: 'FAIL', eat: 0 };
    if (t === 'D' && !opened) ph = 2;
    else if (t === 'M') eat = 1 << miceBit.get(`${nx},${ny}`)!;
    else if (t === 'K' && s.ph === 0) ph = 1;
    else if (t === 'G') return { to: 'GOAL', eat: 0 };
    return { to: { x: nx, y: ny, d: s.d, ph }, eat };
  };
  let sx = 0, sy = 0;
  map.tiles.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'S') { sx = x; sy = y; } }));
  const s0 = intern({ x: sx, y: sy, d: DIR[map.startDir], ph: 0 });
  const ACTS = ['f', 'J', 'L', 'R'];
  for (let i = 0; i < states.length; i++) for (const a of ACTS) { const r = stepRaw(states[i], a); if (typeof r.to !== 'string') intern(r.to); }
  const N = states.length;
  if (N >= 1022) throw new Error('too many states');
  const trans: Record<string, Uint16Array> = {};
  for (const a of ACTS) {
    const arr = new Uint16Array(N);
    for (let i = 0; i < N; i++) { const r = stepRaw(states[i], a); arr[i] = r.to === 'FAIL' ? FAIL : r.to === 'GOAL' ? GOAL : (idOf.get(skey(r.to))! | (r.eat << 10)); }
    trans[a] = arr;
  }
  const sensWall = new Uint8Array(N), sensPit = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const s = states[i]; const keys = s.ph === 1 ? 1 : 0, opened = s.ph === 2;
    const t = tAt(s.x + DX[s.d], s.y + DY[s.d]);
    sensWall[i] = t === null || t === '#' || (t === 'D' && !opened && keys === 0) ? 1 : 0;
    sensPit[i] = t === 'O' ? 1 : 0;
  }
  return { N, s0, trans, sensWall, sensPit };
}

class Store {
  pool: Uint16Array; count = 0; table: Int32Array; hashes: Uint32Array; mask: number; len: number;
  constructor(len: number, cap = 1024) {
    this.len = Math.max(1, len);
    this.pool = new Uint16Array(cap * this.len); this.hashes = new Uint32Array(cap);
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
  }
  static hash(a: Uint16Array, len: number): number { let h = 2166136261; for (let i = 0; i < len; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; }
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
      const t = this.table[j]; if (!t) return -1;
      const i = t - 1;
      if (this.hashes[i] === h) { const off = i * this.len; let same = true; for (let k = 0; k < this.len; k++) if (this.pool[off + k] !== a[k]) { same = false; break; } if (same) return i; }
      j = (j + 1) & this.mask;
    }
  }
  add(a: Uint16Array): number {
    const h = Store.hash(a, this.len); const f = this.find(a, h); if (f >= 0) return -(f + 1);
    if (this.count >= this.hashes.length) this.grow();
    const i = this.count++; this.pool.set(a, i * this.len); this.hashes[i] = h; this.place(i); return i;
  }
}

type Prov =
  | { k: 'leaf'; a: string } | { k: 'rep'; n: number; body: number } | { k: 'if'; w: boolean; t: number; e: number }
  | { k: 'seq'; b: number; rest: number } | { k: 'blk'; b: number } | { k: 'empty' };

const popc = (m: number) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const LEAF: Record<string, Block> = { f: { id: 'forward' }, J: { id: 'jump' }, L: { id: 'left' }, R: { id: 'right' }, C: { id: 'call' } };

export interface SearchOpts {
  K: number;              // max program size to check (last level lazy at s0)
  accept: (v: number) => boolean;  // value at s0 (GOAL | mask<<10) acceptable?
  call?: Uint16Array;     // function of the call leaf (def body), optional
  requireCall?: boolean;  // only report programs containing call
  keepLevels?: boolean;
  no?: Set<string>;       // excluded blocks: jump, left, right, repeat, if_wall, if_pit
}

export interface SearchResult {
  size: number | null; prog: Program | null;
  lists: Store; listProv: Prov[]; Lst: number[][]; progOf: (i: number) => Program;
}

export function search(m: Model, o: SearchOpts): SearchResult {
  const { N, s0, trans, sensWall, sensPit } = m;
  const lists = new Store(N, 1 << 12); const listProv: Prov[] = []; const listHasCall: boolean[] = [];
  const blocks = new Store(N, 1 << 12); const blockProv: Prov[] = []; const blockHasCall: boolean[] = [];
  const Lst: number[][] = []; const Blk: number[][] = [];
  const tmp = new Uint16Array(N);
  const compose = (f: Uint16Array, g: Uint16Array, out: Uint16Array) => {
    for (let s = 0; s < N; s++) {
      const v = f[s]; const to = v & 1023;
      if (to >= GOAL) { out[s] = v; continue; }
      const w = g[to]; const wt = w & 1023;
      out[s] = wt === FAIL ? FAIL : (wt | ((v | w) & 0xfc00));
    }
  };
  const prog = (kind: 'list' | 'block', i: number): Block[] => {
    const p = kind === 'list' ? listProv[i] : blockProv[i];
    switch (p.k) {
      case 'empty': return [];
      case 'leaf': return [{ ...LEAF[p.a] }];
      case 'rep': return [{ id: 'repeat', n: p.n, body: prog('list', p.body) }];
      case 'if': return [{ id: p.w ? 'if_wall' : 'if_pit', then: prog('list', p.t), else: prog('list', p.e) }];
      case 'seq': return [...prog('block', p.b), ...prog('list', p.rest)];
      case 'blk': return prog('block', p.b);
    }
  };
  let found: { size: number; prog: Program } | null = null;
  const good = (v: number, hasCall: boolean) => (!o.requireCall || hasCall) && o.accept(v);
  { const id = new Uint16Array(N); for (let i = 0; i < N; i++) id[i] = i; lists.add(id); listProv.push({ k: 'empty' }); listHasCall.push(false); Lst[0] = [0]; }
  // With requireCall, functions are deduped separately for call/no-call (a call-free twin must not hide a call version).
  const addBlock = (a: Uint16Array, prov: Prov, hc: boolean, cur: number[]) => {
    if (!o.requireCall && lists.find(a) >= 0) return;
    const i = blocks.add(a); if (i < 0) { if (o.requireCall && hc && !blockHasCall[-i - 1]) { blockHasCall[-i - 1] = true; blockProv[-i - 1] = prov; } return; }
    blockProv.push(prov); blockHasCall.push(hc); cur.push(i);
  };
  const addList = (a: Uint16Array, prov: Prov, hc: boolean, size: number, cur: number[]) => {
    const i = lists.add(a);
    if (i < 0) { if (o.requireCall && hc && !listHasCall[-i - 1]) { listHasCall[-i - 1] = true; listProv[-i - 1] = prov; if (!found && good(a[s0], true)) found = { size, prog: prog('list', -i - 1) }; } return; }
    listProv.push(prov); listHasCall.push(hc); cur.push(i);
    if (!found && good(a[s0], hc)) found = { size, prog: prog('list', i) };
  };
  const projStore = (sens: Uint8Array, want: number) => {
    const idx: number[] = []; for (let s = 0; s < N; s++) if (sens[s] === want) idx.push(s);
    return { idx, store: new Store(idx.length, 1024), reps: [] as number[][] };
  };
  const projs = { wT: projStore(sensWall, 1), wF: projStore(sensWall, 0), pT: projStore(sensPit, 1), pF: projStore(sensPit, 0) };
  const updateProj = (k: number) => {
    for (const p of Object.values(projs)) {
      p.reps[k] = []; const buf = new Uint16Array(Math.max(1, p.idx.length));
      for (const li of Lst[k]) { const f = lists.get(li); for (let j = 0; j < p.idx.length; j++) buf[j] = f[p.idx[j]]; if (p.store.add(buf) >= 0 || o.requireCall) p.reps[k].push(li); }
    }
  };
  updateProj(0);
  const NO = o.no ?? new Set<string>();
  const leaves: [string, Uint16Array][] = ([['f', trans.f], ['J', trans.J], ['L', trans.L], ['R', trans.R]] as [string, Uint16Array][])
    .filter(([a]) => !NO.has(({ f: 'forward', J: 'jump', L: 'left', R: 'right' } as Record<string, string>)[a]));
  if (o.call) leaves.push(['C', o.call]);

  for (let k = 1; k <= o.K; k++) {
    const last = k === o.K && k >= 2;
    if (last) {
      // lazy last level at s0: seq = block(i) + list(k-i); single repeat of a (k-1)-list; single if = smaller.
      for (let i = 1; i <= k - 1 && !found; i++) {
        for (const bi of Blk[i]) {
          const v = blocks.get(bi)[s0]; const to = v & 1023; if (to >= GOAL) continue;
          for (let mm = 1; mm <= k - i && !found; mm++) for (const li of Lst[mm]) {
            const w = lists.get(li)[to]; const wt = w & 1023;
            if (wt === GOAL && good(wt | ((v | w) & 0xfc00), blockHasCall[bi] || listHasCall[li])) { found = { size: i + mm, prog: [...prog('block', bi), ...prog('list', li)] }; break; }
          }
          if (found) break;
        }
      }
      if (!found && !NO.has('repeat')) {
        for (const li of Lst[k - 1]) {
          const f = lists.get(li); let v = s0;
          for (let n = 1; n <= 9; n++) {
            const w = f[v & 1023]; const wt = w & 1023; if (wt === FAIL) break;
            const nv = wt | ((v | w) & 0xfc00);
            if (wt === GOAL) { if (n >= 2 && good(nv, listHasCall[li])) found = { size: k, prog: [{ id: 'repeat', n, body: prog('list', li) }] }; break; }
            v = nv;
          }
          if (found) break;
        }
      }
      break;
    }
    const blk: number[] = []; const out = new Uint16Array(N);
    if (k === 1) {
      for (const [a, f] of leaves) addBlock(f, { k: 'leaf', a }, a === 'C', blk);
    } else {
      if (!NO.has('repeat')) for (const bi of Lst[k - 1]) {
        const g = lists.get(bi); const h = new Uint16Array(g);
        for (let n = 2; n <= 9; n++) { compose(h, g, out); h.set(out); addBlock(h, { k: 'rep', n, body: bi }, listHasCall[bi], blk); }
      }
      for (const [w, T, E] of [[true, projs.wT, projs.wF], [false, projs.pT, projs.pF]] as const) {
        if (NO.has(w ? 'if_wall' : 'if_pit')) continue;
        const sens = w ? sensWall : sensPit;
        for (let a = 0; a <= k - 1; a++) {
          const b = k - 1 - a; if (a === 0 && b === 0) continue;
          for (const ti of T.reps[a]) {
            const tf = lists.get(ti);
            for (const ei of E.reps[b]) {
              const ef = lists.get(ei);
              for (let s = 0; s < N; s++) out[s] = sens[s] ? tf[s] : ef[s];
              addBlock(out, { k: 'if', w, t: ti, e: ei }, listHasCall[ti] || listHasCall[ei], blk);
            }
          }
        }
      }
    }
    Blk[k] = blk;
    const cur: number[] = [];
    for (const bi of blk) addList(blocks.get(bi), { k: 'blk', b: bi }, blockHasCall[bi], k, cur);
    for (let i = 1; i <= k - 1; i++) for (const bi of Blk[i]) {
      const bf = blocks.get(bi);
      for (const li of Lst[k - i]) { compose(bf, lists.get(li), tmp); addList(tmp, { k: 'seq', b: bi, rest: li }, blockHasCall[bi] || listHasCall[li], k, cur); }
    }
    Lst[k] = cur; updateProj(k);
    if (found) break;
  }
  const fnd = found as { size: number; prog: Program } | null;
  return { size: fnd?.size ?? null, prog: fnd?.prog ?? null, lists, listProv, Lst, progOf: (i) => prog('list', i) };
}

export const acceptMice = (M: number) => (v: number) => (v & 1023) === GOAL && popc(v >> 10) >= M;
