// OWL COMPILE — 라운드별 진행자용 정답 + 프로그램 텍스트 변환
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

export interface Solution {
  title: string;
  note: string;
  program: Program;
}

export const SOLUTIONS: Record<string, Solution[]> = {
  r1: [
    { title: '최적 — 오른쪽 먼저', note: '쥐 2마리, 6블록. 위로 먼저 가면 5블록이지만 쥐 1마리라 5점 손해.', program: [R, rep(5, [F]), L, rep(5, [F])] },
    { title: '위로 먼저', note: '5블록, 쥐 1마리.', program: [rep(5, [F]), R, rep(5, [F])] },
  ],
  r2: [
    { title: '최적 — 함수', note: '"앞으로 + 점프 3번"이 두 번 나온다. 7블록, 쥐 2마리.', program: [def([F, rep(3, [J])]), call, L, call] },
    { title: '반복만', note: '8블록. 함수 대비 5점 손해.', program: [F, rep(3, [J]), L, F, rep(3, [J])] },
    { title: '왼쪽 위 우회 (함정)', note: '9블록, 쥐 1마리. 구덩이가 하나뿐이라 편해 보이지만 30점 손해.', program: [L, rep(2, [F]), J, rep(3, [F]), R, rep(7, [F])] },
  ],
  r3: [
    { title: '최적 — 조건문', note: '벽이면 돌고 아니면 전진. 맵을 안 보고도 가는 코드. 5블록.', program: [rep(4, [rep(5, [ifWall([R], [F])])])] },
    { title: '중첩 반복', note: '6블록. 평범한 풀이(8블록)와 왼쪽 지름길(9블록)은 상한 7 초과로 제출 불가.', program: [rep(2, [rep(7, [F]), R]), rep(4, [F])] },
  ],
  r4: [
    { title: '유일 해 — 조건문 계단', note: '열쇠 먹고 왼쪽 보기 → 계단 5번. 구덩이면 점프 아니면 앞으로. 9블록. 조건 없이는 최소 16블록.', program: [F, L, rep(5, [ifPit([J], [F]), R, F, L])] },
  ],
  r5: [
    { title: '정답 — 잠자기 1 + R3·R4 합체', note: '고양이는 6틱 주기, 교차점(7,4)에 5·11·17·23틱마다 온다. 부엉이는 18틱째 도착 → 1틱 늦춰야 산다. 8블록.', program: [Z, rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])] },
    { title: '잠자기 2도 생존', note: '9블록으로 상한 꽉 채움. 잠자기 0 → 고양이 밟음, 잠자기 5(반복 사용) → 고양이에게 잡힘.', program: [Z, Z, rep(9, [rep(9, [ifWall([R], [ifPit([J], [F])])])])] },
  ],
};

const LABEL: Record<string, string> = { forward: '앞으로', jump: '점프', left: '좌회전', right: '우회전', sleep: '잠자기', call: 'F 호출' };

/** 프로그램을 들여쓴 텍스트로. 프로젝터에서 "코드 읽어주기"에 그대로 사용. */
export function toText(blocks: Block[], depth = 0): string {
  const pad = '  '.repeat(depth);
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'repeat':
          return `${pad}반복 ${b.n} {\n${toText(b.body, depth + 1)}\n${pad}}`;
        case 'def':
          return `${pad}함수 F {\n${toText(b.body, depth + 1)}\n${pad}}`;
        case 'if': {
          const head = b.cond === 'wall' ? '만약 앞이 벽이면' : '만약 앞이 구덩이면';
          const el = b.else && b.else.length ? ` 아니면 {\n${toText(b.else, depth + 1)}\n${pad}}` : '';
          return `${pad}${head} {\n${toText(b.then, depth + 1)}\n${pad}}${el}`;
        }
        default:
          return `${pad}${LABEL[b.t]}`;
      }
    })
    .join('\n');
}
