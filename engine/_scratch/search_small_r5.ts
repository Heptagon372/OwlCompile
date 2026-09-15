// R5 스크래치: 작은 프로그램 전수 탐색. npx tsx engine/_scratch/search_small_r5.ts [maxBlocks]
// 블록 k개(k ≤ maxBlocks)짜리 프로그램을 전부 만들어(def/call 제외, repeat n=2..9, 빈 if 제외)
// 엔진 run()으로 돌리고, 둥지에 닿는 것과 대표 정답(잠자기 1 + 7블록, 패치 없이 145점) 이상 점수를 내는 것을 센다.
import { run, score, countBlocks, toText } from '../index';
import type { Block, Program } from '../index';
import { map } from '../rounds/r5';

const MAX = Number(process.argv[2] ?? 5);
const LEAVES: Block['id'][] = ['forward', 'jump', 'left', 'right', 'sleep'];
const REPS = [2, 3, 4, 5, 6, 7, 8, 9];

const forestMemo = new Map<number, Block[][]>();
const treeMemo = new Map<number, Block[]>();
function trees(k: number): Block[] {
  if (treeMemo.has(k)) return treeMemo.get(k)!;
  const out: Block[] = [];
  if (k === 1) for (const id of LEAVES) out.push({ id } as Block);
  if (k >= 2) {
    for (const body of forests(k - 1)) for (const n of REPS) out.push({ id: 'repeat', n, body });
    for (let a = 0; a <= k - 1; a++) {
      const b = k - 1 - a;
      if (a === 0 && b === 0) continue;
      for (const th of forests(a)) for (const el of forests(b)) {
        out.push({ id: 'if_wall', then: th, else: el });
        out.push({ id: 'if_pit', then: th, else: el });
      }
    }
  }
  treeMemo.set(k, out);
  return out;
}
function forests(k: number): Block[][] {
  if (k === 0) return [[]];
  if (forestMemo.has(k)) return forestMemo.get(k)!;
  const out: Block[][] = [];
  for (let j = 1; j <= k; j++) for (const t of trees(j)) for (const rest of forests(k - j)) out.push([t, ...rest]);
  forestMemo.set(k, out);
  return out;
}

const TARGET = 145;   // 대표 정답의 패치 없는 점수
for (let k = 1; k <= MAX; k++) {
  const progs = forests(k);
  let goals = 0;
  let better = 0;
  const examples: string[] = [];
  for (const p of progs as Program[]) {
    const r = run(map, p);
    if (r.outcome !== 'goal') continue;
    goals += 1;
    const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
    if (s >= TARGET) better += 1;
    if (examples.length < 5) examples.push(`${s}점 ${r.ticks}틱 쥐${r.mice} ${countBlocks(p)}블록: ${toText(p).text.replace(/\n\s*/g, ' ')}`);
  }
  console.log(`k=${k}: ${progs.length} programs, goal ${goals}, score>=${TARGET} ${better}`);
  for (const e of examples) console.log(`   ${e}`);
  forestMemo.delete(k - 2);
}
