// 스크래치: R2 모티프 탐색. def 비용 vs def 없는 최소 비용(반복+truncation) 비교.
const memo = new Map<string, number>();
function cost(s: string, B: string | null): number {
  if (s.length === 0) return 0;
  const k = `c|${B}|${s}`;
  const m = memo.get(k); if (m !== undefined) return m;
  let best = s.length;
  if (B && s === B) best = 1;
  for (let i = 1; i < s.length; i++) best = Math.min(best, cost(s.slice(0, i), B) + cost(s.slice(i), B));
  for (let p = 1; p <= s.length / 2; p++) {
    if (s.length % p) continue;
    const n = s.length / p; if (n > 9) continue;
    if (s.slice(0, p).repeat(n) === s) best = Math.min(best, 1 + cost(s.slice(0, p), B));
  }
  memo.set(k, best); return best;
}
function costEnd(s: string, B: string | null): number {
  const k = `e|${B}|${s}`;
  const m = memo.get(k); if (m !== undefined) return m;
  let best = cost(s, B);
  if (B && B.startsWith(s)) best = 1;
  for (let i = 1; i < s.length; i++) best = Math.min(best, cost(s.slice(0, i), B) + costEnd(s.slice(i), B));
  for (let p = 1; p < s.length; p++) {
    let ok = true;
    for (let j = p; j < s.length; j++) if (s[j] !== s[j - p]) { ok = false; break; }
    if (!ok) continue;
    const n = Math.ceil(s.length / p); if (n < 2 || n > 9) continue;
    best = Math.min(best, 1 + cost(s.slice(0, p), B));
  }
  memo.set(k, best); return best;
}
export function nondef(s: string) { return costEnd(s, null); }
export function withDef(s: string): { cost: number; body: string } {
  let best = { cost: Infinity, body: '' };
  for (let i = 0; i < s.length; i++) for (let j = i + 2; j <= s.length; j++) {
    const B = s.slice(i, j);
    const c = 1 + cost(B, null) + costEnd(s, B);
    if (c < best.cost) best = { cost: c, body: B };
  }
  return best;
}
const D: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const RO: Record<string, string> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const LO: Record<string, string> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export function geom(s: string) {
  let x = 0, y = 0, d = 'E';
  const visited = new Set<string>(['0,0']); const mids: string[] = [];
  let ok = true; let minx = 0, maxx = 0, miny = 0, maxy = 0;
  const upd = (a: number, b: number) => { minx = Math.min(minx, a); maxx = Math.max(maxx, a); miny = Math.min(miny, b); maxy = Math.max(maxy, b); };
  for (const c of s) {
    if (c === 'L') d = LO[d]; else if (c === 'R') d = RO[d];
    else {
      const [dx, dy] = D[d];
      if (c === 'J') { mids.push(`${x + dx},${y + dy}`); upd(x + dx, y + dy); x += 2 * dx; y += 2 * dy; }
      else { x += dx; y += dy; }
      const key = `${x},${y}`; if (visited.has(key)) ok = false; visited.add(key); upd(x, y);
    }
  }
  for (const m of mids) if (visited.has(m)) ok = false;
  return { ok, w: maxx - minx + 1, h: maxy - miny + 1 };
}
const noop = (s: string) => /LR|RL|LLL|RRR/.test(s);
if (process.argv[2] === 'scan') {
  const A = ['f', 'J', 'L', 'R'];
  const strs = (n: number): string[] => n === 0 ? [''] : strs(n - 1).flatMap((p) => A.map((a) => p + a));
  const glues = ['L', 'R', 'LL', 'RR', 'fL', 'fR', 'Lf', 'Rf'];
  const out: string[] = [];
  for (const k of [3, 4]) for (const F of strs(k)) {
    if (!F.includes('J')) continue;
    for (const g1 of glues) for (const g2 of glues) {
      if (g1 === g2) continue;
      const s = F + g1 + F + g2 + F;
      if (noop(s)) continue;
      const g = geom(s); if (!g.ok) continue;
      if (Math.max(g.w, g.h) > 8 || Math.min(g.w, g.h) > 7) continue;
      const nd = nondef(s); const wd = withDef(s);
      if (wd.cost <= 10 && nd - wd.cost >= 2) out.push(`${s.padEnd(18)} F=${F} g=${g1},${g2} def=${wd.cost}(${wd.body}) nodef=${nd} box=${g.w}x${g.h} ticks=${s.length}`);
    }
  }
  console.log(out.join('\n')); console.log(out.length);
}
