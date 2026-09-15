import { nondef, withDef, geom } from './r2_search';
const A = ['f', 'J', 'L', 'R'];
const strs = (n: number): string[] => n === 0 ? [''] : strs(n - 1).flatMap((p) => A.map((a) => p + a));
const noop = (s: string) => /LR|RL|LLL|RRR/.test(s);
const out: string[] = [];
// 일반형: 길이 9..13 문자열 중 def 이득이 있는 것 (무작위가 아니라 전수: 모티프 F(3) + 임의 접착 문자열)
const glues = ['L', 'R', 'LL', 'RR', 'fL', 'fR', 'Lf', 'Rf', 'JL', 'JR', 'LJ', 'RJ', 'ff', 'f', 'J'];
for (const F of strs(3)) {
  if (!F.includes('J')) continue;
  for (const pre of ['', 'f', 'R', 'L', 'J']) for (const g1 of glues) for (const g2 of glues) {
    if (g1 === g2) continue;
    const s = pre + F + g1 + F + g2 + F;
    if (noop(s)) continue;
    const g = geom(s); if (!g.ok) continue;
    if (g.w > 8 || g.h > 8) continue;
    const nd = nondef(s); const wd = withDef(s);
    if (wd.cost <= 9 && nd - wd.cost >= 1) out.push(`${s.padEnd(18)} def=${wd.cost}(${wd.body}) nodef=${nd} box=${g.w}x${g.h} ticks=${s.length}`);
  }
}
console.log([...new Set(out)].join('\n')); console.log(out.length);
