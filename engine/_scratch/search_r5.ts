// R5 설계 탐색 스크래치: npx tsx engine/_scratch/search_r5.ts
// 고정 골격(벽·경로·구덩이·쥐) 위에서
//   (1) (7,4)를 지나는 고양이 순찰로(단순 경로, pingpong, path[0]은 양 끝 중 하나 / 닫힌 고리 loop)
//   (2) 기본 프로그램 안에 잠자기 1개를 넣는 모든 위치
// 를 전부 열거하고, 엔진 run()으로 수용 기준 5를 만족하는 조합만 출력한다.
import { run, score, countBlocks, toText } from '../index';
import type { Block, GameMap, Pos, Program } from '../index';

// 골격: c 없이. 고양이 순찰로 후보 칸은 '.'(경로 칸 포함)에서 고른다.
const SKELETON = [
  '#...M...',
  '#.#####.',
  '#.#.M.#.',
  '#.#.#.#.',
  '#.#.....',
  '#.#.#G#.',
  '#S#..O..',
  '########',
];
const ALLOW_WALLS = process.argv.includes('--walls');   // 결정적이지 않은 벽(턴 지점 앞 칸 제외)도 후보로
const CRITICAL_WALLS = new Set(['2,6', '3,1', '6,2', '7,7']);  // 경로의 우회전 지점 앞 칸

const body = (): Program => [
  { id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'if_pit', then: [{ id: 'jump' }], else: [{ id: 'forward' }] }] },
];
const base = (): Program => [{ id: 'repeat', n: 6, body: [{ id: 'repeat', n: 6, body: body() }] }];

/** 프로그램 트리의 모든 삽입 지점에 잠자기 1개를 넣은 변형들. */
function sleepInsertions(p: Program): { label: string; prog: Program }[] {
  const out: { label: string; prog: Program }[] = [];
  const clone = (x: Program): Program => JSON.parse(JSON.stringify(x));
  const visit = (list: Block[], label: string, rebuild: (nl: Block[]) => Program): void => {
    for (let i = 0; i <= list.length; i++) {
      const nl = [...list.slice(0, i), { id: 'sleep' } as Block, ...list.slice(i)];
      out.push({ label: `${label}[${i}]`, prog: rebuild(nl) });
    }
    list.forEach((b, i) => {
      const slots: [string, Block[]][] = [];
      if (b.id === 'repeat' || b.id === 'def') slots.push(['body', b.body]);
      if (b.id === 'if_wall' || b.id === 'if_pit') { slots.push(['then', b.then]); slots.push(['else', b.else]); }
      for (const [slot, inner] of slots) {
        visit(inner, `${label}[${i}].${slot}`, (nl2) => {
          const copy = clone(list);
          (copy[i] as unknown as Record<string, Block[]>)[slot] = nl2;
          return rebuild(copy);
        });
      }
    });
  };
  visit(clone(p), 'top', (nl) => nl);
  return out;
}

/** p에서 잠자기 블록 1개(첫 번째)를 뺀 프로그램. */
function removeSleep(p: Program): Program {
  let done = false;
  const strip = (list: Block[]): Block[] => list.filter((b) => {
    if (!done && b.id === 'sleep') { done = true; return false; }
    return true;
  }).map((b) => {
    if (b.id === 'repeat' || b.id === 'def') return { ...b, body: strip(b.body) };
    if (b.id === 'if_wall' || b.id === 'if_pit') return { ...b, then: strip(b.then), else: strip(b.else) };
    return b;
  });
  return strip(p);
}

// ---------------------------------------------------------------- 순찰로 열거
const cand = (x: number, y: number): boolean => {
  const t = SKELETON[y][x];
  if (t === '.') return true;
  return ALLOW_WALLS && t === '#' && !CRITICAL_WALLS.has(`${x},${y}`) && x > 0 && y < 7;
};
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const X = { x: 7, y: 4 };
const MAXLEN = 10;
const chains: Pos[][] = [];
// (7,4)를 포함하는 단순 경로 = 두 갈래(한쪽은 빈 갈래 허용)를 (7,4)에서 이어 붙인 것
const arms: Pos[][] = [];
const grow = (arm: Pos[], used: Set<string>): void => {
  arms.push(arm);
  if (arm.length >= MAXLEN - 1) return;
  const last = arm.length ? arm[arm.length - 1] : X;
  for (const [dx, dy] of N4) {
    const n = { x: last.x + dx, y: last.y + dy };
    if (n.x < 0 || n.x > 7 || n.y < 0 || n.y > 7 || !cand(n.x, n.y)) continue;
    const k = `${n.x},${n.y}`;
    if (used.has(k)) continue;
    used.add(k); grow([...arm, n], used); used.delete(k);
  }
};
grow([], new Set(['7,4']));
for (let i = 0; i < arms.length; i++) {
  for (let j = i; j < arms.length; j++) {
    const a = arms[i]; const b = arms[j];
    if (a.length + b.length + 1 > MAXLEN || a.length + b.length === 0) continue;
    const ks = new Set(a.map((p) => `${p.x},${p.y}`));
    if (b.some((p) => ks.has(`${p.x},${p.y}`))) continue;
    // 두 갈래의 첫 칸이 같은 방향이면 안 됨(단순 경로)
    const chain = [...[...a].reverse(), X, ...b];
    chains.push(chain);
    chains.push([...chain].reverse());
  }
}
console.log(`chains: ${chains.length} (walls ${ALLOW_WALLS ? 'allowed' : 'not allowed'})`);

// ---------------------------------------------------------------- 평가
const mkMap = (path: Pos[], mode: 'loop' | 'pingpong'): GameMap => {
  const tiles = SKELETON.map((r) => r.split(''));
  for (const p of path) tiles[p.y][p.x] = 'c';
  return {
    round: 5, name: '고양이 순찰', difficulty: '어려움', cap: 9, seconds: 600, intro: '움직이는 고양이·잠자기',
    tiles: tiles.map((r) => r.join('')), startDir: 'N', cat: { path, mode },
  };
};

const inserts = sleepInsertions(base());
type Hit = { chain: string; mode: string; sleep: string; len: number; extraSleeps: string };
const hits: Hit[] = [];
const seen = new Set<string>();
for (const path of chains) {
  for (const mode of ['pingpong', 'loop'] as const) {
    if (mode === 'loop' && !(path.length > 2 && Math.abs(path[0].x - path[path.length - 1].x) + Math.abs(path[0].y - path[path.length - 1].y) === 1)) continue;
    const key = `${mode}:${path.map((p) => `${p.x},${p.y}`).join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const map = mkMap(path, mode);
    for (const ins of inserts) {
      const r = run(map, ins.prog);
      if (r.outcome !== 'goal' || r.ticks !== 37 || r.mice !== 2 || countBlocks(ins.prog) !== 8) continue;
      if (score(r, { cap: 9, firstSubmit: false, usedPatch: true }).total !== 135) continue;
      const ns = run(map, removeSleep(ins.prog));
      const last = ns.trace[ns.trace.length - 1];
      if (!(ns.outcome === 'dead' && ns.ticks === 18 && last.owl.x === 7 && last.owl.y === 4 && ns.message === '고양이를 밟았다')) continue;
      // 참고: 앞에 잠자기 k개(k=0..4)일 때 결과
      const extra = [0, 1, 2, 3, 4].map((k) => {
        const p: Program = [...Array.from({ length: k }, () => ({ id: 'sleep' }) as Block), ...base()];
        const rr = run(map, p);
        return `${k}:${rr.outcome}@${rr.ticks}`;
      }).join(' ');
      hits.push({ chain: key, mode, sleep: ins.label, len: path.length, extraSleeps: extra });
    }
  }
}
console.log(`hits: ${hits.length}`);
const bySleep = new Map<string, number>();
for (const h of hits) bySleep.set(h.sleep, (bySleep.get(h.sleep) ?? 0) + 1);
console.log('sleep positions that ever work:', [...bySleep.entries()]);
hits.sort((a, b) => a.len - b.len);
for (const h of hits.slice(0, 60)) console.log(`  len ${h.len} ${h.chain}  sleep ${h.sleep}  | ${h.extraSleeps}`);
console.log('\nbase program:\n' + toText(base()).text);
