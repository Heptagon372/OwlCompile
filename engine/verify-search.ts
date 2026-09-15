// verify 전용: "블록 n개 이하로 이런 결과를 내는 프로그램이 있는가"를 빠짐없이 찾는 탐색.
// docs/ENGINE_SPEC.md §9-5 (R2: def 없이 대표 정답만큼 짧은 프로그램이 없음, R4: if_pit 없이 대표 정답 점수 이상 없음,
// R6: 조건 없이는 대표 정답 점수 불가·def 없이 더 높은 점수 불가, R7: 고양이 맵에서 같은 검사).
//
// 원리: 블록 목록 하나 = 상태 → 결과 함수 (상태 = 부엉이 칸·방향·열쇠 단계·고양이 시각, 결과 = 상태 | 둥지 | 실패,
// + 먹은 쥐 집합). 크기 k의 목록을 전부 만들되 **같은 함수는 하나만 남긴다**(더 작은 크기에서 이미 나온 함수는 버림).
// 그러면 반복/조건/이어 붙이기의 결과도 함수만으로 정해지므로, 남긴 대표만 조합해도 모든 프로그램의 결과를 빠짐없이 덮는다.
// 마지막 크기는 표를 만들지 않고 시작 상태에서만 평가한다(메모리 절약).
//
// 고양이: 순찰은 주기 P(loop = path 길이, pingpong = 2(길이−1))로 되풀이되므로 상태에 "시각 mod P"를 넣으면
// 고양이 위치가 상태만으로 정해진다(run.ts §6.3과 같은 순서: 부엉이 행동 → 진입 칸의 고양이 → 고양이 이동 → 잡힘).
// 고양이 맵에서는 잠자기가 결과를 바꾸므로 잎(leaf)에 넣는다. 센서는 고양이를 보지 않는다.
//
// 함수(def): spec.def = true이면 def 본문 D(호출 없는 목록)의 서로 다른 함수마다 "F 호출" 잎을 더해 나머지를 다시 찾는다.
// 호출이 1번뿐인 프로그램은 D를 그 자리에 풀어 쓴 def 없는 프로그램(블록 2개 적음)과 같고, 나머지가 2블록 이하이면
// 호출 1번이거나 [호출, 호출] ≡ 반복 2 { D }라서 def 없는 탐색이 이미 덮는다 → D는 maxBlocks − 4 블록까지만 본다.
//
// 범위: sleep은 고양이가 없으면 넣지 않는다(제자리 1틱 = 결과를 바꾸지 않음), repeat 1과 두 입이 모두 빈 if도 넣지 않는다
// (항등). maxTicks는 무시한다(시간 초과로 실패할 프로그램도 "도달"로 셈 — 결과가 "없음"이면 그 결론은 그대로 참).
// 쥐는 최대 14마리. 문·열쇠는 각각 최대 1개. 상태는 최대 65533개.
import type { Block, BlockId, GameMap, Pos, Program } from './types';

const GOAL = 0xfffe;
const FAIL = 0xffff;
const STATE = 0xffff;       // 값의 아래 16비트 = 상태 번호 (또는 GOAL/FAIL)
const MICE = 0x3fff0000;    // 위 14비트 = 먹은 쥐 집합
const MICE_SHIFT = 16;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const DIR_NO: Record<string, number> = { N: 0, E: 1, S: 2, W: 3 };

type Leaf = { id: BlockId; f: Uint32Array };
interface Model { n: number; start: number; leaves: Leaf[]; wall: Uint8Array; pit: Uint8Array }

/** 고양이 위치를 시각 mod P로 편 표. 고양이가 없으면 null. run.ts의 loop/pingpong 규칙과 같다. */
export function catCycle(map: GameMap): Pos[] | null {
  const cat = map.cat;
  if (!cat || cat.path.length === 0) return null;
  const p = cat.path;
  if (p.length === 1 || cat.mode === 'loop') return [...p];
  return [...p, ...p.slice(1, -1).reverse()];
}

/** 맵을 상태 전이표로 바꾼다. 상태 = (x, y, 방향, 열쇠 단계: 0 없음 / 1 보유 / 2 문 열림, 고양이 시각 mod P). */
function buildModel(map: GameMap, exclude: Set<BlockId>): Model {
  const tile = (x: number, y: number): string | null => (y < 0 || y >= map.tiles.length || x < 0 || x >= map.tiles[y].length ? null : map.tiles[y][x]);
  const count = (ch: string) => map.tiles.join('').split(ch).length - 1;
  if (count('K') > 1 || count('D') > 1 || count('M') > 14) throw new Error('verify-search: 열쇠/문 1개, 쥐 14마리까지');
  const mouseBit = new Map<string, number>();
  map.tiles.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'M') mouseBit.set(`${x},${y}`, mouseBit.size); }));
  const cyc = catCycle(map);
  const P = cyc ? cyc.length : 1;
  const catAt = (t: number): Pos | null => (cyc ? cyc[t % P] : null);

  type St = { x: number; y: number; d: number; ph: number; t: number };
  const states: St[] = [];
  const ids = new Map<string, number>();
  const key = (s: St) => `${s.x},${s.y},${s.d},${s.ph},${s.t}`;
  const intern = (s: St): number => {
    let id = ids.get(key(s));
    if (id === undefined) { id = states.length; states.push(s); ids.set(key(s), id); }
    return id;
  };
  // run.ts §6.3와 같은 규칙
  const blocked = (s: St, x: number, y: number) => { const t = tile(x, y); return t === null || t === '#' || (t === 'D' && s.ph === 0); };
  const midBlocked = (s: St, x: number, y: number) => { const t = tile(x, y); return t === null || t === '#' || (t === 'D' && s.ph !== 2); };
  const step = (s: St, id: BlockId): { to: St | 'goal' | 'fail'; eat: number } => {
    let { x, y, d, ph } = s;
    let eat = 0;
    if (id === 'left') d = (d + 3) & 3;
    else if (id === 'right') d = (d + 1) & 3;
    else if (id === 'forward' || id === 'jump') {
      const k = id === 'jump' ? 2 : 1;
      if (k === 2 && midBlocked(s, x + DX[d], y + DY[d])) return { to: 'fail', eat: 0 };
      const tx = x + DX[d] * k, ty = y + DY[d] * k;
      if (blocked(s, tx, ty)) return { to: 'fail', eat: 0 };
      x = tx; y = ty;
      const c = catAt(s.t);
      if (c && c.x === x && c.y === y) return { to: 'fail', eat: 0 };      // 고양이를 밟았다
      const t = tile(x, y);
      if (t === 'O') return { to: 'fail', eat: 0 };
      if (t === 'G') return { to: 'goal', eat: 0 };                         // 둥지: 고양이는 움직이지 않는다
      if (t === 'D' && ph === 1) ph = 2;
      else if (t === 'M') eat = 1 << (mouseBit.get(`${x},${y}`) as number);
      else if (t === 'K' && ph === 0) ph = 1;
    }
    // sleep: 아무것도 안 함
    const nt = (s.t + 1) % P;
    const c2 = catAt(nt);
    if (c2 && c2.x === x && c2.y === y) return { to: 'fail', eat: 0 };     // 고양이에게 잡혔다
    return { to: { x, y, d, ph, t: nt }, eat };
  };
  let start = -1;
  map.tiles.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'S') start = intern({ x, y, d: DIR_NO[map.startDir], ph: 0, t: 0 }); }));
  const all: BlockId[] = cyc ? ['forward', 'jump', 'left', 'right', 'sleep'] : ['forward', 'jump', 'left', 'right'];
  const moves = all.filter((id) => !exclude.has(id));
  for (let i = 0; i < states.length; i++) {
    for (const id of moves) { const r = step(states[i], id); if (typeof r.to !== 'string') intern(r.to); }
  }
  const n = states.length;
  if (n >= GOAL) throw new Error('verify-search: 상태가 너무 많음');
  const leaves = moves.map((id) => {
    const f = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const r = step(states[i], id);
      f[i] = r.to === 'fail' ? FAIL : r.to === 'goal' ? GOAL : ((ids.get(key(r.to)) as number) | (r.eat << MICE_SHIFT));
    }
    return { id, f };
  });
  const wall = new Uint8Array(n), pit = new Uint8Array(n);
  states.forEach((s, i) => {
    wall[i] = blocked(s, s.x + DX[s.d], s.y + DY[s.d]) ? 1 : 0;   // isWallAhead (열쇠 보유 문은 벽 아님)
    pit[i] = tile(s.x + DX[s.d], s.y + DY[s.d]) === 'O' ? 1 : 0;
  });
  return { n, start, leaves, wall, pit };
}

/** 같은 함수(Uint32Array)를 한 번만 저장하는 해시 집합. */
class FnSet {
  private pool: Uint32Array; private hashes: Uint32Array; private table: Int32Array; size = 0;
  constructor(private len: number) {
    this.pool = new Uint32Array(1024 * len); this.hashes = new Uint32Array(1024); this.table = new Int32Array(2048);
  }
  get(i: number): Uint32Array { return this.pool.subarray(i * this.len, (i + 1) * this.len); }
  private hash(a: Uint32Array): number {
    let h = 2166136261;
    for (let i = 0; i < this.len; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  private slot(h: number, a: Uint32Array | null): number {
    const mask = this.table.length - 1;
    for (let j = h & mask; ; j = (j + 1) & mask) {
      const t = this.table[j];
      if (t === 0) return j;
      if (a && this.hashes[t - 1] === h) {
        const off = (t - 1) * this.len;
        let same = true;
        for (let k = 0; k < this.len && same; k++) same = this.pool[off + k] === a[k];
        if (same) return j;
      }
    }
  }
  has(a: Uint32Array): boolean { return this.table[this.slot(this.hash(a), a)] !== 0; }
  /** 새로 넣었으면 번호, 이미 있으면 -1. */
  add(a: Uint32Array): number {
    const h = this.hash(a);
    const j = this.slot(h, a);
    if (this.table[j] !== 0) return -1;
    if (this.size === this.hashes.length) { this.grow(); return this.add(a); }
    const i = this.size++;
    this.pool.set(a, i * this.len); this.hashes[i] = h; this.table[j] = i + 1;
    return i;
  }
  private grow(): void {
    const cap = this.hashes.length * 2;
    const pool = new Uint32Array(cap * this.len); pool.set(this.pool); this.pool = pool;
    const hashes = new Uint32Array(cap); hashes.set(this.hashes); this.hashes = hashes;
    this.table = new Int32Array(cap * 2);
    for (let i = 0; i < this.size; i++) this.table[this.slot(this.hashes[i], null)] = i + 1;
  }
}

type Origin =
  | { k: 'empty' } | { k: 'leaf'; id: BlockId } | { k: 'repeat'; n: number; body: number }
  | { k: 'if'; id: 'if_wall' | 'if_pit'; then: number; else: number } | { k: 'seq'; head: number; rest: number } | { k: 'one'; block: number };

export interface SearchSpec {
  maxBlocks: number;
  minMice: number;
  /** 쓰지 않을 블록. def·call은 def: true일 때만 쓴다. 고양이가 없으면 sleep은 늘 빠진다. */
  exclude?: BlockId[];
  /** 함수 F(def + call)도 쓴다. */
  def?: boolean;
}

type Found = { blocks: number; program: Program } | null;

/**
 * 함수 표 목록을 크기 순으로 만든다. accept를 만족하는 시작 상태 결과가 나오면 found.
 * full이면 마지막 크기도 표로 만든다(def 본문 후보용). 아니면 마지막 크기는 시작 상태에서만 평가.
 */
function enumerate(m: Model, leaves: Leaf[], maxBlocks: number, exclude: Set<BlockId>, accept: (v: number) => boolean, full: boolean) {
  const N = m.n;
  const lists = new FnSet(N); const listOrigin: Origin[] = [];
  const blocks = new FnSet(N); const blockOrigin: Origin[] = [];
  const listsOfSize: number[][] = []; const blocksOfSize: number[][] = [];
  const out = new Uint32Array(N);

  const compose = (f: Uint32Array, g: Uint32Array, dst: Uint32Array) => {   // 먼저 f, 그다음 g
    for (let s = 0; s < N; s++) {
      const v = f[s]; const to = v & STATE;
      if (to >= GOAL) { dst[s] = v; continue; }
      const w = g[to]; const wt = w & STATE;
      dst[s] = wt === FAIL ? FAIL : (wt | ((v | w) & MICE));
    }
  };
  const build = (kind: 'list' | 'block', i: number): Block[] => {
    const o = kind === 'list' ? listOrigin[i] : blockOrigin[i];
    switch (o.k) {
      case 'empty': return [];
      case 'leaf': return [{ id: o.id } as Block];
      case 'repeat': return [{ id: 'repeat', n: o.n, body: build('list', o.body) }];
      case 'if': return [{ id: o.id, then: build('list', o.then), else: build('list', o.else) }];
      case 'seq': return [...build('block', o.head), ...build('list', o.rest)];
      case 'one': return build('block', o.block);
    }
  };
  let found: Found = null;
  const addList = (f: Uint32Array, o: Origin, size: number, into: number[]) => {
    const i = lists.add(f);
    if (i < 0) return;
    listOrigin.push(o); into.push(i);
    if (!found && accept(f[m.start])) found = { blocks: size, program: build('list', i) };
  };
  const addBlock = (f: Uint32Array, o: Origin, into: number[]) => {
    if (lists.has(f)) return;                 // 더 작은 목록과 같은 함수 → 필요 없음
    const i = blocks.add(f);
    if (i < 0) return;
    blockOrigin.push(o); into.push(i);
  };
  // if 조합은 "센서 참 상태에서의 함수"(then 쪽)와 "거짓 상태에서의 함수"(else 쪽)만 다르면 되므로 그 사영의 대표만 쓴다.
  const projection = (sens: Uint8Array, want: number) => {
    const idx: number[] = [];
    for (let s = 0; s < N; s++) if (sens[s] === want) idx.push(s);
    return { idx, seen: new FnSet(Math.max(1, idx.length)), reps: [] as number[][] };
  };
  const sensors = ([['if_wall', m.wall], ['if_pit', m.pit]] as const)
    .filter(([id]) => !exclude.has(id))
    .map(([id, sens]) => ({ id, sens, yes: projection(sens, 1), no: projection(sens, 0) }));
  const project = (size: number) => {
    for (const s of sensors) for (const p of [s.yes, s.no]) {
      p.reps[size] = [];
      const buf = new Uint32Array(Math.max(1, p.idx.length));
      for (const li of listsOfSize[size]) {
        const f = lists.get(li);
        for (let j = 0; j < p.idx.length; j++) buf[j] = f[p.idx[j]];
        if (p.seen.add(buf) >= 0) p.reps[size].push(li);
      }
    }
  };
  { const id = new Uint32Array(N); for (let s = 0; s < N; s++) id[s] = s; lists.add(id); listOrigin.push({ k: 'empty' }); listsOfSize[0] = [0]; }
  project(0);

  for (let k = 1; k <= maxBlocks && !found; k++) {
    if (!full && k === maxBlocks && k >= 2) {
      // 마지막 크기: 시작 상태에서만. (a) 블록 i개짜리 머리 + 나머지 목록, (b) 반복 하나(본문 k−1).
      // (c) if 하나는 한쪽 입(≤ k−1)만 실행하므로 이미 더 작은 크기에서 확인됐다.
      for (let i = 1; i < k && !found; i++) {
        for (const bi of blocksOfSize[i]) {
          const v = blocks.get(bi)[m.start]; const to = v & STATE;
          if (to >= GOAL) continue;
          for (let r = 1; r <= k - i && !found; r++) {
            for (const li of listsOfSize[r]) {
              const w = lists.get(li)[to];
              if (accept((w & STATE) | ((v | w) & MICE))) { found = { blocks: i + r, program: [...build('block', bi), ...build('list', li)] }; break; }
            }
          }
          if (found) break;
        }
      }
      if (!found && !exclude.has('repeat')) {
        for (const li of listsOfSize[k - 1]) {
          const f = lists.get(li); let v = m.start;
          for (let n = 1; n <= 9; n++) {
            const w = f[v & STATE]; const wt = w & STATE;
            if (wt === FAIL) break;
            v = wt | ((v | w) & MICE);
            if (wt === GOAL) { if (n >= 2 && accept(v)) found = { blocks: k, program: [{ id: 'repeat', n, body: build('list', li) }] }; break; }
          }
          if (found) break;
        }
      }
      break;
    }
    const made: number[] = [];
    if (k === 1) {
      for (const leaf of leaves) addBlock(leaf.f, { k: 'leaf', id: leaf.id }, made);
    } else {
      if (!exclude.has('repeat')) {
        for (const li of listsOfSize[k - 1]) {
          const body = lists.get(li); const acc = new Uint32Array(body);
          for (let n = 2; n <= 9; n++) { compose(acc, body, out); acc.set(out); addBlock(acc, { k: 'repeat', n, body: li }, made); }
        }
      }
      for (const s of sensors) {
        for (let a = 0; a <= k - 1; a++) {
          const b = k - 1 - a;
          if (a === 0 && b === 0) continue;
          for (const ti of s.yes.reps[a]) {
            const tf = lists.get(ti);
            for (const ei of s.no.reps[b]) {
              const ef = lists.get(ei);
              for (let st = 0; st < N; st++) out[st] = s.sens[st] ? tf[st] : ef[st];
              addBlock(out, { k: 'if', id: s.id, then: ti, else: ei }, made);
            }
          }
        }
      }
    }
    blocksOfSize[k] = made;
    const sized: number[] = [];
    for (const bi of made) addList(blocks.get(bi), { k: 'one', block: bi }, k, sized);
    for (let i = 1; i < k; i++) {
      for (const bi of blocksOfSize[i]) {
        const head = blocks.get(bi);
        for (const li of listsOfSize[k - i]) { compose(head, lists.get(li), out); addList(out, { k: 'seq', head: bi, rest: li }, k, sized); }
      }
    }
    listsOfSize[k] = sized;
    project(k);
  }
  return { found: found as Found, lists, listsOfSize, build };
}

/**
 * 블록 수와 무관한 도달 가능성: exclude에 없는 액션(forward·jump·left·right, 고양이 맵이면 sleep)만으로 된 **어떤 액션 열**이든
 * 둥지에 쥐 minMice마리 이상을 먹고 살아서 닿을 수 있는가. 모든 프로그램의 실행은 액션 열이므로 false이면
 * "그 액션 없이는 어떤 프로그램(블록 수·함수·조건 무관)도 안 된다"는 증명이다. 상태 × 먹은 쥐 집합 위의 BFS.
 * 찾으면 액션 열을 돌려준다(검증용).
 */
export function reachableActions(map: GameMap, spec: { minMice: number; exclude?: BlockId[] }): BlockId[] | null {
  const m = buildModel(map, new Set<BlockId>(spec.exclude ?? []));
  const popcount = (x: number) => { let c = 0; for (; x; x >>>= 1) c += x & 1; return c; };
  const key = (s: number, mice: number) => s * 65536 + mice;
  const prev = new Map<number, { from: number; id: BlockId } | null>([[key(m.start, 0), null]]);
  const queue: number[] = [key(m.start, 0)];
  const trace = (k: number, last: BlockId): BlockId[] => {
    const out: BlockId[] = [last];
    for (let p = prev.get(k); p; p = prev.get(p.from)) out.push(p.id);
    return out.reverse();
  };
  for (let qi = 0; qi < queue.length; qi++) {
    const k = queue[qi];
    const s = Math.floor(k / 65536), mice = k % 65536;
    for (const leaf of m.leaves) {
      const v = leaf.f[s]; const to = v & STATE;
      if (to === FAIL) continue;
      const mm = mice | ((v & MICE) >>> MICE_SHIFT);
      if (to === GOAL) { if (popcount(mm) >= spec.minMice) return trace(k, leaf.id); continue; }
      const nk = key(to, mm);
      if (!prev.has(nk)) { prev.set(nk, { from: k, id: leaf.id }); queue.push(nk); }
    }
  }
  return null;
}

/**
 * 블록 maxBlocks개 이하로 (exclude 없이) 둥지에 쥐 minMice마리 이상을 먹고 도착하는 가장 작은 프로그램. 없으면 null.
 * def: true이면 함수 F(최상위 def 1개 + call)도 쓴다. 찾은 프로그램은 호출한 쪽에서 run()으로 다시 확인할 것.
 */
export function shortestProgram(map: GameMap, spec: SearchSpec): Found {
  const exclude = new Set<BlockId>(spec.exclude ?? []);
  const m = buildModel(map, exclude);
  const popcount = (x: number) => { let c = 0; for (x >>>= MICE_SHIFT; x; x >>>= 1) c += x & 1; return c; };
  const accept = (v: number) => (v & STATE) === GOAL && popcount(v & MICE) >= spec.minMice;

  let best = enumerate(m, m.leaves, spec.maxBlocks, exclude, accept, false).found;
  if (!spec.def || spec.maxBlocks < 5) return best;

  // def 본문 후보: 호출 없는 목록의 서로 다른 함수 (크기 1 … maxBlocks − 4)
  const maxBody = spec.maxBlocks - 4;
  const bodies = enumerate(m, m.leaves, maxBody, exclude, () => false, true);
  for (let d = 1; d <= maxBody; d++) {
    for (const li of bodies.listsOfSize[d] ?? []) {
      const limit = (best ? best.blocks - 1 : spec.maxBlocks) - 1 - d;   // 나머지(호출 포함) 블록 수 상한
      if (limit < 3) break;
      const f = new Uint32Array(bodies.lists.get(li));
      const inner = enumerate(m, [...m.leaves, { id: 'call', f }], limit, exclude, accept, false).found;
      if (inner) best = { blocks: inner.blocks + 1 + d, program: [{ id: 'def', body: bodies.build('list', li) }, ...inner.program] };
    }
  }
  return best;
}
