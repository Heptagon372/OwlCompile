// OWL COMPILE — 엔진 타입. 프레임워크 무관, 브라우저/서버 어디서나 실행 가능.

export type Dir = 'N' | 'E' | 'S' | 'W';
export type Cond = 'wall' | 'pit';

export type Block =
  | { t: 'forward' }
  | { t: 'jump' }
  | { t: 'left' }
  | { t: 'right' }
  | { t: 'sleep' }
  | { t: 'repeat'; n: number; body: Block[] }
  | { t: 'if'; cond: Cond; then: Block[]; else?: Block[] }
  | { t: 'def'; body: Block[] } // 함수 F — 프로그램당 1개, 최상위에만
  | { t: 'call' };

export type Program = Block[];

/**
 * 타일 문자
 *  .  바닥        #  벽           O  구덩이
 *  M  쥐(+20)     K  열쇠         D  문(열쇠 필요)
 *  S  시작(바닥)  G  둥지(도착)   c  고양이 순찰로(바닥, 시각 구분용)
 */
export type Tile = '.' | '#' | 'O' | 'M' | 'K' | 'D' | 'S' | 'G' | 'c';

export interface Pos {
  x: number;
  y: number;
}

export interface CatSpec {
  path: Pos[]; // 순찰 경로(왕복)
  start: number; // 시작 인덱스
  dir: 1 | -1; // 시작 진행 방향
}

export interface GameMap {
  id: string;
  round: number;
  name: string;
  tagline: string;
  difficulty: '쉬움' | '중간' | '어려움';
  limit: number; // 블록 상한
  timeLimitSec: number;
  grid: string[]; // 8행 × 8열
  start: Pos & { dir: Dir };
  cat?: CatSpec;
  teaches: string[];
}

export type Outcome = 'goal' | 'error' | 'dead' | 'stuck';

export interface Step {
  tick: number;
  action: 'forward' | 'jump' | 'left' | 'right' | 'sleep';
  owl: Pos & { dir: Dir };
  cat?: Pos;
  event?: string;
}

export interface RunResult {
  outcome: Outcome;
  message: string;
  ticks: number;
  blocks: number;
  mice: number;
  hasKey: boolean;
  final: Pos & { dir: Dir };
  trace: Step[];
}
