import { nondef, withDef } from './r2_search';
const D: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const RO: Record<string, string> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const LO: Record<string, string> = { N: 'W', W: 'S', S: 'E', E: 'N' };
function geom2(s: string) {
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
  return { ok, revisit, w: maxx - minx + 1, h: maxy - miny + 1, end: `${x},${y}` };
}
const A = ['f', 'J', 'L', 'R'];
const strs = (n: number): string[] => n === 0 ? [''] : strs(n - 1).flatMap((p) => A.map((a) => p + a));
const noop = (s: string) => /LR|RL|LLL|RRR/.test(s);
const out: string[] = [];
for (const F of strs(Number(process.argv[2] ?? 3))) {
  if (!F.includes('J')) continue;
  for (const g1 of A) for (const g2 of A) {
    const s = F + g1 + F + g2 + F;
    if (noop(s)) continue;
    const g = geom2(s); if (!g.ok) continue;
    if (g.w > 8 || g.h > 8) continue;
    if (g.end === '0,0') continue;
    const nd = nondef(s); const wd = withDef(s);
    if (wd.cost <= Number(process.argv[3] ?? 9) && nd - wd.cost >= Number(process.argv[4] ?? 2)) out.push(`${s.padEnd(14)} F=${F} g=${g1},${g2} def=${wd.cost}(${wd.body}) nodef=${nd} box=${g.w}x${g.h} revisit=${g.revisit}`);
  }
}
console.log(out.join('\n')); console.log(out.length);
