// 파생 출력: 최소 비용 분해
const memo = new Map<string, [number, string]>();
function cost(s: string): [number, string] {
  if (s.length === 0) return [0, ''];
  const k = 'c' + s; const m = memo.get(k); if (m) return m;
  let best: [number, string] = [s.length, s.split('').join(' ')];
  for (let i = 1; i < s.length; i++) { const a = cost(s.slice(0, i)), b = cost(s.slice(i)); if (a[0] + b[0] < best[0]) best = [a[0] + b[0], a[1] + ' ' + b[1]]; }
  for (let p = 1; p <= s.length / 2; p++) { if (s.length % p) continue; const n = s.length / p; if (n > 9) continue;
    if (s.slice(0, p).repeat(n) === s) { const u = cost(s.slice(0, p)); if (1 + u[0] < best[0]) best = [1 + u[0], `rep${n}{${u[1]}}`]; } }
  memo.set(k, best); return best;
}
function costEnd(s: string): [number, string] {
  const k = 'e' + s; const m = memo.get(k); if (m) return m;
  let best = cost(s);
  for (let i = 1; i < s.length; i++) { const a = cost(s.slice(0, i)), b = costEnd(s.slice(i)); if (a[0] + b[0] < best[0]) best = [a[0] + b[0], a[1] + ' ' + b[1]]; }
  for (let p = 1; p < s.length; p++) { let ok = true; for (let j = p; j < s.length; j++) if (s[j] !== s[j - p]) { ok = false; break; }
    if (!ok) continue; const n = Math.ceil(s.length / p); if (n < 2 || n > 9) continue;
    const u = cost(s.slice(0, p)); if (1 + u[0] < best[0]) best = [1 + u[0], `rep${n}*{${u[1]}}`]; }
  memo.set(k, best); return best;
}
for (const s of process.argv.slice(2)) console.log(s, JSON.stringify(costEnd(s)));
