// 스크래치: 동작 문자열의 경로를 그린다. 숫자=착지 순서, o=점프 중간(구덩이 자리)
const D: Record<string, [number, number]> = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const RO: Record<string, string> = { N: 'E', E: 'S', S: 'W', W: 'N' };
const LO: Record<string, string> = { N: 'W', W: 'S', S: 'E', E: 'N' };
for (const s of process.argv.slice(2)) {
  let x = 0, y = 0, d = 'E'; const cells = new Map<string, string>([['0,0', 'S']]); let n = 0;
  for (const c of s) {
    if (c === 'L') d = LO[d]; else if (c === 'R') d = RO[d];
    else { const [dx, dy] = D[d]; if (c === 'J') { cells.set(`${x + dx},${y + dy}`, 'o'); x += 2 * dx; y += 2 * dy; } else { x += dx; y += dy; }
      n++; cells.set(`${x},${y}`, n.toString(36)); }
  }
  cells.set(`${x},${y}`, 'G');
  const xs = [...cells.keys()].map((k) => +k.split(',')[0]); const ys = [...cells.keys()].map((k) => +k.split(',')[1]);
  console.log(`\n${s}`);
  for (let yy = Math.min(...ys); yy <= Math.max(...ys); yy++) { let row = ''; for (let xx = Math.min(...xs); xx <= Math.max(...xs); xx++) row += cells.get(`${xx},${yy}`) ?? '.'; console.log('  ' + row); }
}
