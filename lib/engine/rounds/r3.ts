// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// OWL COMPILE — Round 3 "나선" (docs/ENGINE_SPEC.md §8)
// 새 요소: 만약 앞이 벽이면. 상한 7이라 하드코딩 나선(11블록)은 못 들어가고 센서가 필요하다.
//
//        x 0 1 2 3 4 5 6 7
//   y=0    # # # # # # # #
//   y=1    # S . . M . . #      S(1,1) 동쪽 보기 → 다리1: 동쪽 5칸 (2,1)…(6,1)
//   y=2    # # # # # . . #      (7,1) 벽 → 우회전(남)
//   y=3    # # . G # . . #      다리2: 남쪽 4칸 (6,2)…(6,5)  — (6,6) 벽 → 우회전(서)
//   y=4    # # . # # . . #      다리3: 서쪽 4칸 (5,5)…(2,5)  — (1,5) 벽 → 우회전(북)
//   y=5    # # . . M . . #      다리4: 북쪽 2칸 (2,4),(2,3)  — (2,2) 벽 → 우회전(동)
//   y=6    # . . . . . # #      다리5: 동쪽 1칸 → G(3,3)
//   y=7    # # # # # # # #
//
// 대표 정답 repeat 4 { repeat 5 { if_wall { right } else { forward } } } (5블록)
//   틱:  1-5 앞으로 | 6 우회전 | 7-10 앞으로 | 11 우회전 | 12-15 앞으로 | 16 우회전
//        17-18 앞으로 | 19 우회전 | 20 앞으로 → 둥지.  16 forward + 4 right = 20틱.
//   쥐: (4,1) 3틱째, (4,5) 13틱째 → 2마리. 둥지(3,3)는 20틱에 처음 밟는다.
//   점수(firstSubmit=false, usedPatch=false): 100 + 40 + (7−5)×5 = 150.
//
// 다리 길이가 5·4·4·2·1로 줄어들기 때문에 "반복 4 { 반복 5 { 앞으로 } 우회전 }" 같은
// 고정 길이 프로그램은 11틱째 (6,6) 벽에 부딪힌다. 우회전 대신 좌회전을 쓰면 (6,1)
// 구석에서 북·서로 돌며 윗줄을 왕복하다 20틱을 다 쓰고 stuck(둥지까지 5칸) 이 된다.
import type { GameMap, Outcome, Program } from '../types';

export const map: GameMap = {
  round: 3,
  name: '나선',
  difficulty: '중간',
  cap: 7,
  seconds: 420,
  intro: '만약 앞이 벽이면',
  tiles: [
    '########',
    '#S..M..#',
    '#####..#',
    '##.G#..#',
    '##.##..#',
    '##..M..#',
    '#.....##',
    '########',
  ],
  startDir: 'E',
};

/** 벽이면 우회전, 아니면 앞으로 — 한 번에 1틱. */
const wallTurnElseForward: Program = [
  { id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] },
];

export const solutions: Program[] = [
  // 0. 대표 정답 (cards.html 히어로 그대로). 20회 반복, 20틱째 둥지.
  [{ id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: wallTurnElseForward }] }],
  // 1. 아니면 칸을 비우고 앞으로를 뒤에 둔 변형: 벽이면 (우회전 + 앞으로) 2틱, 아니면 1틱.
  //    16회 반복이면 충분하지만 20회를 돌려도 20틱째 둥지에서 멈춘다.
  [{ id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: [
    { id: 'if_wall', then: [{ id: 'right' }], else: [] },
    { id: 'forward' },
  ] }] }],
  // 2. 반복 횟수를 넉넉히 잡은 변형(27회) — 둥지에 닿는 20틱에 끝난다.
  [{ id: 'repeat', n: 9, body: [{ id: 'repeat', n: 3, body: wallTurnElseForward }] }],
];

export const expect: { outcome: Outcome; ticks: number; mice: number; blocks: number; score: number }[] = [
  { outcome: 'goal', ticks: 20, mice: 2, blocks: 5, score: 150 },
  { outcome: 'goal', ticks: 20, mice: 2, blocks: 5, score: 150 },
  { outcome: 'goal', ticks: 20, mice: 2, blocks: 5, score: 150 },
];

/** 교육용: 센서 없이 다리 길이를 하드코딩한 버전. 11블록이라 상한 7을 넘어 제출조차 못 한다. */
export const naive: { program: Program; note: string } = {
  program: [
    { id: 'repeat', n: 5, body: [{ id: 'forward' }] },
    { id: 'right' },
    { id: 'repeat', n: 2, body: [{ id: 'repeat', n: 4, body: [{ id: 'forward' }] }, { id: 'right' }] },
    { id: 'repeat', n: 2, body: [{ id: 'forward' }] },
    { id: 'right' },
    { id: 'forward' },
  ],
  note: '하드코딩 나선 = 11블록(상한 7 초과, E_CAP). if_wall 정답 = 5블록. 같은 20틱·쥐 2마리.',
};
