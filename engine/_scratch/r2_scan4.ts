// 스크래치: 끝이 "F g F"로 끝나면 truncation(반복 2 { F g })으로 def 이득이 사라진다 → 끝에 한 동작을 더 둔 구조 탐색
import { nondef, withDef } from './r2_search';
const D: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const RO: Record<string, string> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const LO: Record<string, string> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export function geom2(s: string) {
  let x = 0, y = 0, d = 'E';
  const visited = new Set<string>(['0,0']); const mids = new Set<string>();
  let revisit = 0; let minx = 0, maxx = 0, miny = 0, maxy = 0;
  const upd = (a: number, b: number) => { minx = Math.min(minx, a); maxx = Math.max(maxx, a); miny = Math.min(miny, b); maxy = Math.max(maxy, b); };
  for (const c of s) {
    if (c === 'L') d = LO[d]; else if (c === 'R') d = RO[d];
    else {
      const [dx, dy] = D[d];
      if (c === 'J') { mids.add(`${x + dx},${y + dy}`); upd(x + dx, y + dy); x += 2 * dx; y += 2 * dy; }
      else { x += dx; y += dy; }
      const key = `${x},${y}`; if (visited.has(key)) revisit++; visited.add(key); upd(x, y);
    }
  }
  let ok = true;
  for (const m of mids) if (visited.has(m)) ok = false;
  return { ok, revisit, w: maxx - minx + 1, h: maxy - miny + 1 };
}
const A = ['f', 'J', 'L', 'R'];
const strs = (n: number): string[] => n === 0 ? [''] : strs(n - 1).flatMap((p) => A.map((a) => p + a));
const noop = (s: string) => /LR|RL|LLL|RRR|LL|RR/.test(s);
const shape = process.argv[2];
const out: string[] = [];
const consider = (s: string, tag: string) => {
  if (noop(s)) return;
  const g = geom2(s); if (!g.ok || g.revisit > 0) return;
  if (g.w > 8 || g.h > 8) return;
  const nd = nondef(s); const wd = withDef(s);
  if (wd.cost <= 10 && nd - wd.cost >= 2) out.push(`${s.padEnd(16)} ${tag} def=${wd.cost}(${wd.body}) nodef=${nd} box=${g.w}x${g.h} ticks=${s.length} J=${s.split('J').length - 1}`);
};
if (shape === 'Z') {
  for (const F of strs(3)) { if (!F.includes('J')) continue;
    for (const g1 of A) for (const g2 of A) for (const g3 of ['f', 'J']) consider(F + g1 + F + g2 + F + g3, `F=${F} g=${g1}${g2}${g3}`); }
} else if (shape === 'Y') {
  for (const F of strs(5)) { if (!F.includes('J')) continue;
    for (const g1 of A) for (const g2 of ['f', 'J']) consider(F + g1 + F + g2, `F=${F} g=${g1}${g2}`); }
} else if (shape === 'W') {
  for (const F of strs(3)) { if (!F.includes('J')) continue;
    for (const g1 of A) for (const g2 of A) { consider(F + g1 + F + F + g2 + F, `F=${F} FgFFgF ${g1}${g2}`); consider(F + g1 + F + g2 + F + F, `F=${F} FgFgFF ${g1}${g2}`); } }
}
console.log(out.join('\n')); console.log(out.length);
