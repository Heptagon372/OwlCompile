// Scratch prover core (see fx_prove.ts). Uint16 values: 10-bit state | mice mask << 10 (<= 5 mice).
import { GOAL, FAIL, type Model } from './fx_dplib';

class Store {
  pool: Uint16Array; count = 0; table: Int32Array; hashes: Uint32Array; mask: number; len: number;
  constructor(len: number, cap = 4096) {
    this.len = Math.max(1, len); this.pool = new Uint16Array(cap * this.len); this.hashes = new Uint32Array(cap);
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
  }
  static hash(a: Uint16Array, len: number) { let h = 2166136261; for (let i = 0; i < len; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; }
  get(i: number) { return this.pool.subarray(i * this.len, (i + 1) * this.len); }
  private grow() {
    const cap = this.hashes.length * 2;
    const p = new Uint16Array(cap * this.len); p.set(this.pool); this.pool = p;
    const h = new Uint32Array(cap); h.set(this.hashes); this.hashes = h;
    this.table = new Int32Array(cap * 2); this.mask = cap * 2 - 1;
    for (let i = 0; i < this.count; i++) this.place(i);
  }
  private place(i: number) { let j = this.hashes[i] & this.mask; while (this.table[j]) j = (j + 1) & this.mask; this.table[j] = i + 1; }
  find(a: Uint16Array, h = Store.hash(a, this.len)) {
    for (let j = h & this.mask; ; j = (j + 1) & this.mask) {
      const t = this.table[j]; if (!t) return -1; const i = t - 1;
      if (this.hashes[i] === h) { const off = i * this.len; let same = true; for (let k = 0; k < this.len; k++) if (this.pool[off + k] !== a[k]) { same = false; break; } if (same) return i; }
    }
  }
  add(a: Uint16Array) {
    const h = Store.hash(a, this.len); if (this.find(a, h) >= 0) return -1;
    if (this.count >= this.hashes.length) this.grow();
    const i = this.count++; this.pool.set(a, i * this.len); this.hashes[i] = h; this.place(i); return i;
  }
}

export function prove(m: Model, S: number, K: number, M: number, log = console.log, no: Set<string> = new Set()): string | null {
  const { N, s0, trans, sensWall, sensPit } = m;
  const popc = (x: number) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  const good = (v: number) => (v & 1023) === GOAL && popc(v >> 10) >= M;
  const comb = (v: number, w: number) => { const wt = w & 1023; return wt === FAIL ? FAIL : (wt | ((v | w) & 0xfc00)); };
  const compose = (f: Uint16Array, g: Uint16Array, out: Uint16Array) => {
    for (let s = 0; s < N; s++) { const v = f[s]; out[s] = (v & 1023) >= GOAL ? v : comb(v, g[v & 1023]); }
  };
  const lists = new Store(N); const blocks = new Store(N);
  const Lst: number[][] = []; const Blk: number[][] = [];
  { const id = new Uint16Array(N); for (let i = 0; i < N; i++) id[i] = i; lists.add(id); Lst[0] = [0]; }
  const projStore = (sens: Uint8Array, want: number) => {
    const idx: number[] = []; for (let s = 0; s < N; s++) if (sens[s] === want) idx.push(s);
    return { idx, store: new Store(idx.length, 1024), reps: [] as number[][] };
  };
  const sensors = [
    ...(no.has('if_wall') ? [] : [{ sens: sensWall, T: projStore(sensWall, 1), E: projStore(sensWall, 0) }]),
    ...(no.has('if_pit') ? [] : [{ sens: sensPit, T: projStore(sensPit, 1), E: projStore(sensPit, 0) }]),
  ];
  const updateProj = (k: number) => {
    for (const sn of sensors) for (const p of [sn.T, sn.E]) {
      p.reps[k] = []; const buf = new Uint16Array(Math.max(1, p.idx.length));
      for (const li of Lst[k]) { const f = lists.get(li); for (let j = 0; j < p.idx.length; j++) buf[j] = f[p.idx[j]]; if (p.store.add(buf) >= 0) p.reps[k].push(li); }
    }
  };
  updateProj(0);
  const out = new Uint16Array(N);
  const leaves = ([["forward", trans.f], ["jump", trans.J], ["left", trans.L], ["right", trans.R]] as [string, Uint16Array][]).filter(([id]) => !no.has(id)).map(([, f]) => f);
  for (let k = 1; k <= S; k++) {
    const blk: number[] = [];
    const addBlock = (a: Uint16Array) => { if (lists.find(a) >= 0) return; const i = blocks.add(a); if (i >= 0) blk.push(i); };
    if (k === 1) for (const f of leaves) addBlock(f);
    else {
      if (!no.has("repeat")) for (const li of Lst[k - 1]) { const g = lists.get(li); const h = new Uint16Array(g); for (let n = 2; n <= 9; n++) { compose(h, g, out); h.set(out); addBlock(h); } }
      for (const sn of sensors) for (let a = 0; a <= k - 1; a++) {
        const b = k - 1 - a; if (a === 0 && b === 0) continue;
        for (const ti of sn.T.reps[a]) { const tf = lists.get(ti); for (const ei of sn.E.reps[b]) { const ef = lists.get(ei); for (let s = 0; s < N; s++) out[s] = sn.sens[s] ? tf[s] : ef[s]; addBlock(out); } }
      }
    }
    Blk[k] = blk;
    const cur: number[] = [];
    const addList = (a: Uint16Array) => { const i = lists.add(a); if (i >= 0) { cur.push(i); if (good(a[s0])) throw new Error(`FOUND list of size ${k}`); } };
    for (const bi of blk) addList(blocks.get(bi));
    for (let i = 1; i <= k - 1; i++) for (const bi of Blk[i]) { const bf = blocks.get(bi); for (const li of Lst[k - i]) { compose(bf, lists.get(li), out); addList(out); } }
    Lst[k] = cur; updateProj(k);
    log(`stored size ${k}: blocks ${blk.length} lists ${cur.length}`);
  }
  // value sets
  const VS = (N + 1) * 64;
  const vi = (v: number) => ((v & 1023) === GOAL ? N : (v & 1023)) * 64 + (v >> 10);
  const iv = (i: number) => { const st = (i >> 6) === N ? GOAL : (i >> 6); return st | ((i & 63) << 10); };
  const Vst: Uint8Array[][] = [];
  for (let k = 0; k <= S; k++) {
    Vst[k] = [];
    for (let s = 0; s < N; s++) { const a = new Uint8Array(VS); if (k > 0) a.set(Vst[k - 1][s]); Vst[k].push(a); }
    for (const li of Lst[k]) { const f = lists.get(li); for (let s = 0; s < N; s++) { const v = f[s]; if (v !== FAIL) Vst[k][s][vi(v)] = 1; } }
  }
  const memo = new Map<string, Uint8Array>();
  const repVals = (bodies: number[], s: number, into: Set<number>) => {
    for (const li of bodies) {
      const f = lists.get(li); let v = s;
      for (let n = 1; n <= 9; n++) {
        const w = comb(v, f[v & 1023]); if (w === FAIL) break;
        v = w; if (n >= 2) into.add(v);
        if ((v & 1023) === GOAL) { break; }
      }
    }
  };
  const V = (k: number, s: number): Uint8Array => {
    if (k <= S) return Vst[k][s];
    const key = `${k},${s}`; const hit = memo.get(key); if (hit) return hit;
    const res = new Uint8Array(VS); res.set(V(k - 1, s));
    const ext = (v: number, r: number) => {
      if (v === FAIL) return;
      if ((v & 1023) === GOAL || r === 0) { res[vi(v)] = 1; return; }
      const W = V(r, v & 1023); const c = v & 0xfc00;
      for (let i = 0; i < VS; i++) if (W[i]) { const w = iv(i); res[vi((w & 1023) | ((w | c) & 0xfc00))] = 1; }
    };
    for (let i = 1; i <= Math.min(k, S); i++) {
      const vals = new Set<number>(); for (const bi of Blk[i]) vals.add(blocks.get(bi)[s]);
      for (const v of vals) ext(v, k - i);
    }
    for (let i = S + 1; i <= k; i++) {
      const vals = new Set<number>();
      if (no.has("repeat")) { /* no repeat blocks */ } else if (i === S + 1) repVals(Lst[S], s, vals);
      else if (i === S + 2) concreteRepVals(s, vals);
      else throw new Error('depth');
      for (const v of vals) ext(v, k - i);
    }
    memo.set(key, res); return res;
  };
  // repeat over concrete lists of size S+1, orbit from s
  const concreteRepVals = (s: number, into: Set<number>) => {
    let count = 0;
    const orbit = (f: (x: number) => number) => {
      let v = s; count++;
      for (let n = 1; n <= 9; n++) { const w = comb(v, f(v & 1023)); if (w === FAIL) break; v = w; if (n >= 2) into.add(v); if ((v & 1023) === GOAL) break; }
    };
    // (a) block(j) + list(S+1-j)
    for (let j = 1; j <= S; j++) for (const bi of Blk[j]) {
      const b = blocks.get(bi);
      for (const li of Lst[S + 1 - j]) { const l = lists.get(li); orbit((x) => { const v = b[x]; return (v & 1023) >= GOAL ? v : comb(v, l[v & 1023]); }); }
    }
    // (b) repeat n2 { list of size S }
    if (!no.has("repeat")) for (const li of Lst[S]) {
      const g = lists.get(li); const h = new Uint16Array(g);
      for (let n2 = 2; n2 <= 9; n2++) { compose(h, g, out); h.set(out); const hh = new Uint16Array(h); orbit((x) => hh[x]); }
    }
    // (c) if { a } else { S - a }
    for (const sn of sensors) for (let a = 0; a <= S; a++) {
      const b = S - a;
      for (const ti of sn.T.reps[a]) { const tf = lists.get(ti); for (const ei of sn.E.reps[b]) { const ef = lists.get(ei); orbit((x) => (sn.sens[x] ? tf[x] : ef[x])); } }
    }
    log(`concrete size-${S + 1} bodies: ${count}`);
  };
  const top = V(K, s0);
  for (let i = 0; i < VS; i++) if (top[i] && good(iv(i))) return `value ${iv(i)} (goal, mice mask ${i & 63})`;
  return null;
}
