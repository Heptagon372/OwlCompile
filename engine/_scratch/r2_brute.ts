// 스크래치: R2 맵에서 크기 ≤ N 인 모든 프로그램(def/call/repeat 2~9/if_wall/if_pit 포함, sleep 제외)을
// 빠른 자체 시뮬레이터로 돌려 둥지에 닿는 것이 있는지 전수 탐색한다.  npx tsx engine/_scratch/r2_brute.ts 7
import { map } from '../rounds/r2';

type Node =
  | { k: 'f' | 'J' | 'L' | 'R' | 'C' }
  | { k: 'rep'; n: number; body: Node[] }
  | { k: 'iw' | 'ip'; t: Node[]; e: Node[] };

const W = 8;
const tiles = map.tiles.join('');
const S = tiles.indexOf('S');
const DX = [1, 0, -1, 0]; const DY = [0, 1, 0, -1];  // 0=E 1=S 2=W 3=N (우회전 = +1)
const tileAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? '#' : tiles[y * W + x]);
const mouseIdx = new Map<number, number>();
[...tiles].forEach((c, i) => { if (c === 'M') mouseIdx.set(i, mouseIdx.size); });

let x = 0, y = 0, d = 0, mice = 0, ticks = 0, status = 0;  // status: 0 running, 1 goal, 2 fail
let defBody: Node[] | null = null;
const MAXT = 120;
function act(k: string): void {
  ticks++;
  if (k === 'L') d = (d + 3) & 3;
  else if (k === 'R') d = (d + 1) & 3;
  else {
    const s = k === 'J' ? 2 : 1;
    if (s === 2 && tileAt(x + DX[d], y + DY[d]) === '#') { status = 2; return; }
    const nx = x + DX[d] * s, ny = y + DY[d] * s;
    const t = tileAt(nx, ny);
    if (t === '#') { status = 2; return; }
    x = nx; y = ny;
    if (t === 'O') { status = 2; return; }
    if (t === 'M') mice |= 1 << mouseIdx.get(ny * W + nx)!;
    if (t === 'G') { status = 1; return; }
  }
  if (ticks >= MAXT) status = 2;
}
function exec(list: Node[]): void {
  for (const b of list) {
    if (status) return;
    switch (b.k) {
      case 'rep': for (let i = 0; i < b.n && !status; i++) exec(b.body); break;
      case 'iw': { const t = tileAt(x + DX[d], y + DY[d]); exec(t === '#' ? b.t : b.e); break; }
      case 'ip': { const t = tileAt(x + DX[d], y + DY[d]); exec(t === 'O' ? b.t : b.e); break; }
      case 'C': if (defBody) exec(defBody); break;
      default: act(b.k);
    }
  }
}
function runProg(main: Node[], def: Node[] | null): void {
  x = S % W; y = Math.floor(S / W); d = 0; mice = 0; ticks = 0; status = 0; defBody = def;
  exec(main);
}

// ---- 열거: size s 짜리 블록 리스트를 콜백으로 생성
const LEAVES: Node[] = [{ k: 'f' }, { k: 'J' }, { k: 'L' }, { k: 'R' }];
const CALL: Node = { k: 'C' };
function firstAction(list: Node[]): string | null {
  const b = list[0];
  if (!b) return null;
  return b.k === 'f' || b.k === 'J' || b.k === 'L' || b.k === 'R' ? b.k : null;
}
function lists(s: number, withCall: boolean, cb: (l: Node[]) => void, prev: string | null = null, acc: Node[] = []): void {
  if (s === 0) { cb(acc); return; }
  for (let i = 1; i <= s; i++) {
    blocks(i, withCall, (b) => {
      // 인접 L/R 상쇄 가지치기
      if ((prev === 'L' && b.k === 'R') || (prev === 'R' && b.k === 'L')) return;
      acc.push(b);
      lists(s - i, withCall, cb, b.k.length === 1 ? b.k : null, acc);
      acc.pop();
    });
  }
}
function blocks(s: number, withCall: boolean, cb: (b: Node) => void): void {
  if (s === 1) { for (const l of LEAVES) cb(l); if (withCall) cb(CALL); return; }
  // repeat
  lists(s - 1, withCall, (body) => { const copy = body.slice(); for (let n = 2; n <= 9; n++) cb({ k: 'rep', n, body: copy }); });
  // if_wall / if_pit
  for (let a = 0; a <= s - 1; a++) {
    const b = s - 1 - a;
    lists(a, withCall, (t) => {
      const tc = t.slice();
      const fa = firstAction(tc);
      lists(b, withCall, (e) => {
        if (tc.length === 0 && e.length === 0) return;
        const ec = e.slice();
        // 벽 앞에서 앞으로/점프 = 즉시 에러, 구덩이 앞에서 앞으로 = 즉사 → 그런 가지는 버린다
        if (fa !== 'f' && fa !== 'J') cb({ k: 'iw', t: tc, e: ec });
        if (fa !== 'f') cb({ k: 'ip', t: tc, e: ec });
      });
    });
  }
}

// 시뮬레이터 자체 점검: 대표 정답(쥐 2) / 쥐 버리는 9블록(쥐 1) / 반복 4 {f J L}(사망)
{
  const f: Node = { k: 'f' }, J: Node = { k: 'J' }, L: Node = { k: 'L' };
  runProg([CALL, f, CALL, J, CALL, CALL], [f, J, L]);
  const a = [status, mice, ticks].join();
  runProg([f, { k: 'rep', n: 2, body: [J, L, J] }, { k: 'rep', n: 2, body: [f, J, L] }], null);
  const b = [status, mice, ticks].join();
  runProg([{ k: 'rep', n: 4, body: [f, J, L] }], null);
  const c = [status, ticks].join();
  console.log(`self-test: rep ${a} (expect 1,3,13) | skip ${b} (expect 1,2 or 1,1 bitmask,12) | naive-rep ${c} (expect 2,5)`);
}

const N = Number(process.argv[2] ?? 6);
const found: string[] = [];
const show = (l: Node[]): string => l.map((b) => b.k === 'rep' ? `rep${b.n}{${show(b.body)}}` : b.k === 'iw' || b.k === 'ip' ? `${b.k}{${show(b.t)}|${show(b.e)}}` : b.k).join(' ');
for (let n = 1; n <= N; n++) {
  let tried = 0;
  // def 없음
  lists(n, false, (main) => { tried++; runProg(main, null); if (status === 1) found.push(`n=${n} mice=${mice} ${show(main)}`); });
  // def 있음: def(1) + body k + main (n-1-k), main에 call 1개 이상
  for (let k = 1; k <= n - 2; k++) {
    lists(k, false, (body) => {
      const bc = body.slice();
      lists(n - 1 - k, true, (main) => {
        if (!JSON.stringify(main).includes('"C"')) return;
        tried++; runProg(main, bc);
        if (status === 1) found.push(`n=${n} mice=${mice} def{${show(bc)}} ${show(main)}`);
      });
    });
  }
  console.log(`size ${n}: ${tried} programs, goal-reaching so far ${found.length}`);
}
console.log(found.slice(0, 40).join('\n'));
