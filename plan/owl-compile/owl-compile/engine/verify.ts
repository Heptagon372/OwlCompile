// 실행: npx tsx engine/verify.ts
// 각 라운드의 정답/함정 프로그램을 돌려서 맵이 의도대로 동작하는지 확인한다.
import { MAPS } from './maps';
import { run, validate, countBlocks } from './interpreter';
import { score } from './blocks';
import type { Block, Program } from './types';

const F: Block = { t: 'forward' };
const J: Block = { t: 'jump' };
const L: Block = { t: 'left' };
const R: Block = { t: 'right' };
const Z: Block = { t: 'sleep' };
const rep = (n: number, body: Block[]): Block => ({ t: 'repeat', n, body });
const ifWall = (then: Block[], els?: Block[]): Block => ({ t: 'if', cond: 'wall', then, else: els });
const ifPit = (then: Block[], els?: Block[]): Block => ({ t: 'if', cond: 'pit', then, else: els });
const def = (body: Block[]): Block => ({ t: 'def', body });
const call: Block = { t: 'call' };

interface Case {
  map: string;
  name: string;
  program: Program;
  expect: 'goal' | 'dead' | 'error' | 'stuck' | 'invalid';
}

const cases: Case[] = [
  // R1
  { map: 'r1', name: '위로 먼저 (쥐 1)', program: [rep(5, [F]), R, rep(5, [F])], expect: 'goal' },
  { map: 'r1', name: '오른쪽 먼저 (쥐 2)', program: [R, rep(5, [F]), L, rep(5, [F])], expect: 'goal' },
  { map: 'r1', name: '반복 없이 (11개)', program: [F, F, F, F, F, R, F, F, F, F, F], expect: 'goal' },
  { map: 'r1', name: '벽 충돌', program: [R, F, F, L, F, F], expect: 'error' },
  // R2
  { map: 'r2', name: '오른쪽 아래 (반복)', program: [F, rep(3, [J]), L, F, rep(3, [J])], expect: 'goal' },
  { map: 'r2', name: '오른쪽 아래 (함수)', program: [def([F, rep(3, [J])]), call, L, call], expect: 'goal' },
  { map: 'r2', name: '왼쪽 위 우회', program: [L, rep(2, [F]), J, rep(3, [F]), R, rep(7, [F])], expect: 'goal' },
  { map: 'r2', name: '구덩이 추락', program: [F, F], expect: 'dead' },
  // R3
  { map: 'r3', name: '조건문 나선', program: [rep(4, [rep(5, [ifWall([R], [F])])])], expect: 'goal' },
  { map: 'r3', name: '중첩 반복', program: [rep(2, [rep(7, [F]), R]), rep(4, [F])], expect: 'goal' },
  { map: 'r3', name: '지름길 (상한 초과)', program: [R, rep(3, [F]), J, rep(2, [F]), L, rep(3, [F])], expect: 'invalid' },
  { map: 'r3', name: '평범한 풀이 (상한 초과)', program: [rep(7, [F]), R, rep(7, [F]), R, rep(4, [F])], expect: 'invalid' },
  // R4
  { map: 'r4', name: '조건문 계단', program: [F, L, rep(5, [ifPit([J], [F]), R, F, L])], expect: 'goal' },
  { map: 'r4', name: '열쇠 안 먹고 샛길 → 문', program: [L, F, R, F, F, L, J, R, F], expect: 'error' },
  { map: 'r4', name: '함수로 시도 (상한 초과)', program: [F, L, def([R, F, L]), F, call, J, call, F, call, J, call, F, call], expect: 'invalid' },
  // R5
  { map: 'r5', name: '잠자기 1 + 조건문', program: [Z, rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])], expect: 'goal' },
  { map: 'r5', name: '잠자기 없이 → 고양이', program: [rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])], expect: 'dead' },
  { map: 'r5', name: '잠자기 2', program: [Z, Z, rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])], expect: 'goal' },
  { map: 'r5', name: '잠자기 5 → 고양이', program: [rep(5, [Z]), rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])], expect: 'dead' },
  { map: 'r5', name: '반복 부족', program: [Z, rep(9, [ifWall([R], [ifPit([J], [F])])])], expect: 'stuck' },
];

let fail = 0;
for (const c of cases) {
  const map = MAPS.find((m) => m.id === c.map)!;
  const v = validate(c.program, map);
  let line: string;
  let ok: boolean;
  if (v) {
    ok = c.expect === 'invalid';
    line = `INVALID  ${v}`;
  } else {
    const res = run(c.program, map);
    const s = score(res, map);
    ok = res.outcome === c.expect;
    line = `${res.outcome.toUpperCase().padEnd(7)}  ${res.message} | 블록 ${res.blocks}/${map.limit} 틱 ${res.ticks} 쥐 ${res.mice} → ${s.total}점`;
  }
  if (!ok) fail++;
  console.log(`${ok ? '✔' : '✘'} [${c.map}] ${c.name.padEnd(22)} ${line}`);
}
console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
