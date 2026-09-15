// OWL COMPILE — Round 1 "Hello, Owl" (docs/ENGINE_SPEC.md §8)
// 새 요소: 앞으로·회전·반복. 구덩이·고양이·열쇠·문 없음.
//
//   x: 01234567
//  y0  ########
//  y1  #S..M.##     S = (1,1), 시작 방향 E
//  y2  #####.##
//  y3  #####.##
//  y4  ###..M.#
//  y5  ###..G.#     G = (5,5)
//  y6  ###....#
//  y7  ########
//
// 의도한 경로 (9틱):
//   (1,1) →E→ (2,1) (3,1) (4,1)🐭 (5,1)   … 앞으로 4
//   우회전 (S)
//   (5,1) →S→ (5,2) (5,3) (5,4)🐭 (5,5)G  … 앞으로 4
//
// 쥐는 출발점/모퉁이에서 홀수 칸(3칸) 거리에 둔다. 점프(R2의 새 요소)로 2칸씩 건너뛰면
// 쥐 칸을 공중에서 지나쳐 못 먹는다: `반복 2 { 점프 점프 우회전 }` = 5틱, 쥐 0, 140점 < 180점.
//
// 대표 정답 = 반복 4 { 앞으로 } / 우회전 / 반복 4 { 앞으로 }  (5블록)
// 코드 골프 = 반복 2 { 반복 4 { 앞으로 } 우회전 }             (4블록, 마지막 우회전은 실행 전 둥지 도착으로 생략)
// naive     = 앞으로 ×4, 우회전, 앞으로 ×4                     (9블록)
//
// 함정: 첫 복도는 정확히 4칸(5번째 앞으로는 (6,1) 벽 → 에러). 모퉁이에서 좌회전하면 (5,0) 벽.
//       `반복 4 { 앞으로 우회전 }`처럼 회전을 반복 안에 넣으면 제자리에서 맴돈다.

import type { GameMap, Outcome, Program } from '../types';

export const map: GameMap = {
  round: 1,
  name: 'Hello, Owl',
  difficulty: '쉬움',
  cap: 12,
  seconds: 300,
  intro: '앞으로·회전·반복',
  tiles: [
    '########',
    '#S..M.##',
    '#####.##',
    '#####.##',
    '###..M.#',
    '###..G.#',
    '###....#',
    '########',
  ],
  startDir: 'E',
};

/** 대표 정답: 반복으로 직선 구간을 묶는다. 5블록, 9틱, 쥐 2. */
const representative: Program = [
  { id: 'repeat', n: 4, body: [{ id: 'forward' }] },
  { id: 'right' },
  { id: 'repeat', n: 4, body: [{ id: 'forward' }] },
];

/** 코드 골프: 두 구간이 같은 모양이라 바깥 반복으로 한 번 더 묶인다. 4블록, 9틱. */
const golf: Program = [
  {
    id: 'repeat', n: 2, body: [
      { id: 'repeat', n: 4, body: [{ id: 'forward' }] },
      { id: 'right' },
    ],
  },
];

/** 반복 없이 앞으로·우회전만 나열한 버전. 9블록, 9틱. */
const naiveProgram: Program = [
  { id: 'forward' }, { id: 'forward' }, { id: 'forward' }, { id: 'forward' },
  { id: 'right' },
  { id: 'forward' }, { id: 'forward' }, { id: 'forward' }, { id: 'forward' },
];

export const solutions: Program[] = [representative, golf, naiveProgram];

// score: firstSubmit=false, usedPatch=false. 둥지 100 + 쥐 2마리 40 + 코드 골프 (12 − blocks) × 5
export const expect: { outcome: Outcome; ticks: number; mice: number; blocks: number; score: number }[] = [
  { outcome: 'goal', ticks: 9, mice: 2, blocks: 5, score: 175 },
  { outcome: 'goal', ticks: 9, mice: 2, blocks: 4, score: 180 },
  { outcome: 'goal', ticks: 9, mice: 2, blocks: 9, score: 155 },
];

export const naive: { program: Program; note: string } = {
  program: naiveProgram,
  note: '반복 없이 앞으로 8장 + 우회전 1장 = 9블록(155점). 반복 4 { 앞으로 }로 묶으면 5블록(175점), '
    + '반복 2 { 반복 4 { 앞으로 } 우회전 }이면 4블록(180점). 세 버전 모두 9틱에 쥐 2마리로 둥지 도착.',
};
