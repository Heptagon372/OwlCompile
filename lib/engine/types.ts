// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// OWL COMPILE — 엔진 타입 (docs/ENGINE_SPEC.md §2)
// 의존성 0. 브라우저/Node 어디서나 동작하는 순수 타입.

export type Dir = 'N' | 'E' | 'S' | 'W';
export interface Pos { x: number; y: number }
export interface OwlState extends Pos { dir: Dir }

export type BlockId =
  | 'forward' | 'jump' | 'left' | 'right'
  | 'repeat' | 'if_wall' | 'if_pit'
  | 'def' | 'call' | 'sleep'
  | 'toggle' | 'spawn';                       // 협동 게임 전용 (docs/COOP_SPEC.md §2). 게임 1에서는 E_COOP_ONLY

/** 1틱을 소비하는 액션 블록 id. toggle·spawn은 협동 엔진만 실행한다(게임 1 actionsOf는 내지 않는다). */
export type ActionId = 'forward' | 'jump' | 'left' | 'right' | 'sleep' | 'toggle' | 'spawn';

export type Block =
  | { id: 'forward' | 'jump' | 'left' | 'right' | 'call' | 'sleep' | 'toggle' | 'spawn'; uid?: string }
  | { id: 'repeat'; n: number; body: Block[]; uid?: string }
  | { id: 'if_wall' | 'if_pit'; then: Block[]; else: Block[]; uid?: string }
  | { id: 'def'; body: Block[]; uid?: string };

export type Program = Block[];

export type Tile = '.' | '#' | 'O' | 'M' | 'K' | 'D' | 'S' | 'G' | 'c';

export interface CatPatrol {
  path: Pos[];               // path[0] = 틱 0 위치. 인접 칸끼리 이어져야 함(맨해튼 1).
  mode: 'loop' | 'pingpong'; // loop: path가 닫힌 고리. pingpong: 끝에서 되돌아옴.
}

export interface GameMap {
  round: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  difficulty: '쉬움' | '중간' | '어려움' | '매우 어려움';
  cap: number;               // 블록 상한
  seconds: number;           // 코딩 시간(초)
  intro: string;             // 새 요소 한 줄 안내
  tiles: string[];           // 8개 문자열, 각 8글자. tiles[y][x]
  startDir: Dir;
  cat?: CatPatrol;           // R5·R7만. path의 모든 칸은 'c' 타일이어야 함.
}

export type Outcome = 'goal' | 'error' | 'dead' | 'stuck';
export type EventKind = 'mouse' | 'key' | 'door' | 'wall' | 'pit' | 'cat' | 'goal' | 'timeout';

export interface Step {
  tick: number;                 // 0 = 초기 프레임, 1..n = 각 틱
  block: BlockId | null;        // 이 틱에 실행한 액션 블록 (tick 0은 null)
  line: number | null;          // toText 줄 번호(0-based). 보드 하이라이트용
  path: number[] | null;        // AST 경로 (§5). 슬롯: body/then = 0, else = 1
  owl: OwlState;                // 부엉이 행동 후 상태
  cat: Pos | null;              // 고양이 이동 후 위치 (고양이 없으면 null)
  event: EventKind | null;
  message: string | null;       // 토스트 문구
  mice: number;                 // 누적 획득 쥐
  keys: number;                 // 현재 보유 열쇠
  opened: Pos[];                // 지금까지 열린 문
  eaten: Pos[];                 // 지금까지 먹은 쥐 칸
  taken: Pos[];                 // 지금까지 주운 열쇠 칸
}

export interface RunResult {
  outcome: Outcome;
  message: string;              // 최종 한 줄
  ticks: number;                // 실행된 틱 수 (= trace.length - 1)
  blocks: number;               // countBlocks(program)
  mice: number;
  distance: number;             // 종료 시점 부엉이~둥지 맨해튼 거리 (goal이면 0)
  owl: OwlState;                // 최종
  cat: Pos | null;
  trace: Step[];                // trace[0] = 틱 0 초기 프레임
}

export interface RunOptions { maxTicks?: number }  // 기본 300

export interface ScoreLine { label: string; points: number }
export interface ScoreContext { cap: number; firstSubmit: boolean; usedPatch: boolean }
export interface Score { total: number; lines: ScoreLine[] }

export interface Validation {
  ok: boolean;
  errors: string[];             // 사람이 읽는 한국어 문구
  codes: ValidationCode[];      // 기계용
  blocks: number;
  cap: number;
}
export type ValidationCode =
  | 'E_EMPTY' | 'E_CAP' | 'E_DEF_NESTED' | 'E_DEF_MULTI'
  | 'E_CALL_NO_DEF' | 'E_RECURSION' | 'E_REPEAT_N' | 'E_UNKNOWN_BLOCK'
  | 'E_COOP_ONLY';   // 협동 게임 전용 블록(toggle·spawn)이 게임 1 프로그램에 있음 (docs/COOP_SPEC.md §2)
