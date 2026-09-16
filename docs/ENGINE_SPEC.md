# OWL COMPILE — 엔진 스펙 (engine/ 구현 기준)

이 문서는 `plan/CLAUDE.md`(빌드 브리프)가 "이미 있다"고 전제하는 `engine/`의 **정확한 의미론**을 정의한다.
브리프에 적힌 규칙은 그대로 따르고, 브리프가 비워둔 부분은 아래 "결정" 항목으로 확정한다.
구현체는 `engine/`에 두고 `npx tsx engine/verify.ts`가 전부 통과해야 한다.

의존성 0. 브라우저/Node 어디서나 돌아가는 순수 TypeScript. `Date`, `Math.random` 사용 금지(결정적 재생).

---

## 1. 파일 구성

```
engine/
  types.ts       Dir, Pos, Block, Program, GameMap, Step, RunResult, ScoreLine, Validation
  blocks.ts      BLOCKS 메타(라벨/색/역할/틱/모양/덱 매수), ROLES, countBlocks
  text.ts        toText(program) → 줄 목록 + 각 블록의 줄 번호 (run의 line과 동일 규칙)
  validate.ts    validate(program, map) → 제출 가능 여부
  run.ts         run(map, program, opts?) → RunResult (trace 포함)
  score.ts       score(result, ctx) → { total, lines }
  maps.ts        MAPS: 7라운드 맵 (rounds/r1.ts … r7.ts를 모아 export)
  rounds/r1.ts … r7.ts   각 라운드의 맵 + 정답 + 기대값(검증용)
  solutions.ts   SOLUTIONS = { r1: Program[], … r7: Program[] }, ROUND_EXTRAS  (rounds/*에서 모음)
  index.ts       위 전부 re-export
  verify.ts      실행 가능 검증 (실패 시 exit 1). 외부 테스트 러너 없음.
  verify-core.ts · verify-rounds.ts · verify-search.ts · verify-util.ts   verify.ts가 쓰는 검사 모음(빠짐없는 탐색·상태 BFS 포함)
```

---

## 2. 타입 (`types.ts`)

```ts
export type Dir = 'N' | 'E' | 'S' | 'W';
export interface Pos { x: number; y: number }
export interface OwlState extends Pos { dir: Dir }

export type BlockId =
  | 'forward' | 'jump' | 'left' | 'right'
  | 'repeat' | 'if_wall' | 'if_pit'
  | 'def' | 'call' | 'sleep';

export type Block =
  | { id: 'forward' | 'jump' | 'left' | 'right' | 'call' | 'sleep'; uid?: string }
  | { id: 'repeat'; n: number; body: Block[]; uid?: string }
  | { id: 'if_wall' | 'if_pit'; then: Block[]; else: Block[]; uid?: string }
  | { id: 'def'; body: Block[]; uid?: string };

export type Program = Block[];
```
- `uid`는 편집기(dnd-kit 키, 커서)용. 엔진은 무시한다. 없어도 된다.
- `else`는 항상 배열(빈 배열 허용). `then`도 빈 배열 허용.

```ts
export type Tile = '.' | '#' | 'O' | 'M' | 'K' | 'D' | 'S' | 'G' | 'c';

export interface CatPatrol {
  path: Pos[];               // path[0] = 틱 0 위치. 인접 칸끼리 이어져야 함(맨해튼 1).
  mode: 'loop' | 'pingpong'; // loop: 마지막→처음으로 순간이동 없이 "path가 닫힌 고리"여야 함. pingpong: 끝에서 되돌아옴.
}

export interface GameMap {
  round: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;              // "Hello, Owl" 등 (§8 라운드 표 그대로)
  difficulty: '쉬움' | '중간' | '어려움' | '매우 어려움';
  cap: number;               // 블록 상한
  seconds: number;           // 코딩 시간(초)
  intro: string;             // 새 요소 한 줄 안내 (브리프 "새 요소")
  tiles: string[];           // 8개 문자열, 각 8글자. tiles[y][x]
  startDir: Dir;
  cat?: CatPatrol;           // R5·R7만. path의 모든 칸은 'c' 타일이어야 함.
}
```
- 시작 위치 = `S` 타일(정확히 1개). 둥지 = `G`(정확히 1개). `S`, `G`, `c`는 바닥으로 취급.
- 맵 밖 = 벽.

```ts
export type Outcome = 'goal' | 'error' | 'dead' | 'stuck';
export type EventKind = 'mouse' | 'key' | 'door' | 'wall' | 'pit' | 'cat' | 'goal' | 'timeout';

export interface Step {
  tick: number;                 // 0 = 초기 프레임, 1..n = 각 틱
  block: BlockId | null;        // 이 틱에 실행한 액션 블록 (tick 0은 null)
  line: number | null;          // toText 줄 번호(0-based). 보드 하이라이트용
  path: number[] | null;        // AST 경로. 예: [0, 'body', 2] 대신 숫자만: 아래 §5 참조
  owl: OwlState;                // 부엉이 행동 후 상태
  cat: Pos | null;              // 고양이 이동 후 위치 (고양이 없으면 null)
  event: EventKind | null;
  message: string | null;       // 토스트 문구
  mice: number;                 // 누적 획득 쥐
  keys: number;                 // 현재 보유 열쇠
  opened: Pos[];                // 지금까지 열린 문
  eaten: Pos[];                 // 지금까지 먹은 쥐 칸 (렌더링에서 제거용)
  taken: Pos[];                 // 지금까지 주운 열쇠 칸
}

export interface RunResult {
  outcome: Outcome;
  message: string;              // 최종 한 줄 ("둥지 도착", "벽에 부딪혔다" …)
  ticks: number;                // 실행된 틱 수 (= trace.length - 1)
  blocks: number;               // countBlocks(program)
  mice: number;
  distance: number;             // 종료 시점 부엉이~둥지 맨해튼 거리 (goal이면 0)
  owl: OwlState;                // 최종
  cat: Pos | null;
  trace: Step[];                // trace[0] = 틱 0 초기 프레임
}

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
  | 'E_CALL_NO_DEF' | 'E_RECURSION' | 'E_REPEAT_N' | 'E_UNKNOWN_BLOCK';
```

---

## 3. 블록 메타 (`blocks.ts`)

```ts
export type Category = 'move' | 'turn' | 'control' | 'function' | 'special';
export type Role = 'runner' | 'turner' | 'controller' | 'architect';
export type Shape = 'plain' | 'c1' | 'c2';   // 일반 / 입 1개 / 입 2개(그러면·아니면)

export interface BlockMeta {
  id: BlockId; label: string; keyword: string;   // 라벨 "앞으로", 키워드 "forward"
  category: Category; color: string; ink: string; // 분류색/글자색 (cards.html 변수와 동일)
  role: Role; ticks: 0 | 1; shape: Shape;
  deck: number;                                    // 실물 카드 팀당 매수 (참고용, 검증에 안 씀)
}
export const BLOCKS: Record<BlockId, BlockMeta>;
export const BLOCK_ORDER: BlockId[];  // 팔레트 표시 순서: forward, jump, left, right, repeat, if_wall, if_pit, def, call, sleep
export const ROLES: Record<Role, { label: string; blocks: BlockId[]; color: string }>;
export function countBlocks(program: Program): number;
```

| id | label | keyword | category | color / ink | role | ticks | shape | deck |
|---|---|---|---|---|---|---|---|---|
| forward | 앞으로 | forward | move | #8E5CFF / #FFFFFF | runner | 1 | plain | 6 |
| jump | 점프 | jump | move | #8E5CFF / #FFFFFF | runner | 1 | plain | 4 |
| left | 좌회전 | turn left | turn | #2FC4D9 / #0B1C22 | turner | 1 | plain | 4 |
| right | 우회전 | turn right | turn | #2FC4D9 / #0B1C22 | turner | 1 | plain | 4 |
| repeat | 반복 | repeat | control | #FFB020 / #2A1B00 | controller | 0 | c1 | 3 |
| if_wall | 만약 앞이 벽이면 | if wall | control | #FFB020 / #2A1B00 | controller | 0 | c2 | 2 |
| if_pit | 만약 앞이 구덩이면 | if pit | control | #FFB020 / #2A1B00 | controller | 0 | c2 | 2 |
| def | 함수 F | define F | function | #3DD68C / #062A19 | architect | 0 | c1 | 1 |
| call | F 호출 | call F | function | #3DD68C / #062A19 | architect | 0 | plain | 4 |
| sleep | 잠자기 | sleep | special | #FF6B9A / #FFFFFF | architect | 1 | plain | 3 |

`countBlocks`: 모든 블록 1개 = 1. C-블록도 1이고 입 안의 블록은 재귀적으로 따로 센다. 중괄호/아니면은 0.
예) `repeat 4 { repeat 5 { if_wall { right } else { forward } } }` = 5.

**결정**: 덱 매수(`deck`)는 검증에 쓰지 않는다. 디지털 편집기는 상한(cap)만 강제한다. (브리프에 덱 제한 언급 없음. 실물 카드 놀이용 참고 수치.)

---

## 4. 검증 (`validate.ts`)

`validate(program, map): Validation` — 제출 버튼 활성 조건. **전부 검사하고 전부 보고**(첫 에러에서 멈추지 않음).

| code | 조건 | 문구 |
|---|---|---|
| E_EMPTY | 블록 0개 | 블록이 하나도 없다 |
| E_CAP | countBlocks > map.cap | 블록 상한 초과 (n/cap) |
| E_DEF_NESTED | `def`가 최상위가 아닌 곳에 있음 | 함수 F는 맨 바깥에만 둘 수 있다 |
| E_DEF_MULTI | `def`가 2개 이상 | 함수 F는 하나만 정의할 수 있다 |
| E_CALL_NO_DEF | `call`이 있는데 **최상위** `def`가 없음 (중첩된 def는 부를 수 없으므로 E_DEF_NESTED와 함께 보고) | 함수 F가 정의되지 않았다 |
| E_RECURSION | `def` 본문 안(깊이 무관)에 `call` | 함수 F 안에서 F를 부를 수 없다 |
| E_REPEAT_N | repeat.n이 정수 1~9가 아님 | 반복 횟수는 1~9 |
| E_UNKNOWN_BLOCK | id가 BLOCKS에 없음 | 알 수 없는 블록 |

`run()`은 `validate`를 **호출하지 않는다**(호스트가 제출된 것만 실행하므로). 단, run은 방어적으로 E_RECURSION/E_CALL_NO_DEF 상황을 만나면 `outcome:'error'`, message `"컴파일 에러: …"`로 0틱 종료한다(무한 재귀 방지).

---

## 5. 텍스트 & 줄 번호 (`text.ts`)

```ts
export interface TextLine { text: string; depth: number; path: number[] | null; blockId: BlockId | null }
export function toText(program: Program): { text: string; lines: TextLine[] }
export function lineIndex(program: Program): Map<string, number>  // pathKey → line
```

렌더링 규칙(들여쓰기 2칸, depth = 중첩 깊이):
```
반복 4 {
  반복 5 {
    만약 앞이 벽이면 {
      우회전
    } 아니면 {
      앞으로
    }
  }
}
함수 F {
  앞으로
  점프
}
F 호출
잠자기
```
- 일반 블록 1줄. `repeat`/`def`: 머리 줄 + 본문 + `}` 줄. `if_*`: 머리 줄 + then + `} 아니면 {` 줄 + else + `}` 줄. else가 비어 있어도 `} 아니면 {` 줄은 출력한다(카드와 동일하게).
- 머리 줄의 `path`는 그 C-블록의 경로, `}`/`} 아니면 {` 줄의 `path`는 null.
- **AST 경로(path)**: 숫자 배열. 최상위 i번째 블록 = `[i]`. C-블록의 입은 슬롯 번호로 표현: `body`/`then` = 0, `else` = 1. 즉 `repeat`의 body j번째 = `[i, 0, j]`, `if`의 else j번째 = `[i, 1, j]`. pathKey = `path.join('.')`.
- `run()`의 `Step.line`은 **실행한 액션 블록**(forward/jump/left/right/sleep)의 줄 번호. `call`을 통해 실행된 블록은 `def` 본문 안의 원래 줄 번호를 가리킨다(호출 줄이 아님). 이 규칙으로 보드는 "지금 실행 중인 줄"을 항상 하이라이트할 수 있다.

---

## 6. 실행 (`run.ts`)

```ts
export interface RunOptions { maxTicks?: number }  // 기본 300
export function run(map: GameMap, program: Program, opts?: RunOptions): RunResult
```

### 6.1 상태
- `owl {x, y, dir}` — 시작 = `S` 칸, `map.startDir`.
- `catIdx` (path 인덱스), `catDir` (pingpong용 +1/-1). 고양이 위치 = `path[catIdx]`. 틱 0에 `path[0]`.
- `mice`, `keys`, `opened: Set<pos>`, `eaten: Set<pos>`, `taken: Set<pos>`.
- 방향 벡터: N=(0,-1), E=(1,0), S=(0,1), W=(-1,0). 좌회전: N→W→S→E→N. 우회전: N→E→S→W→N.

### 6.2 실행 흐름 = 액션 생성기
프로그램을 전위 순회하며 **액션(1틱 블록)** 을 하나씩 뽑아 실행한다. 제어/함수 블록은 0틱이며 순회 중 즉시 평가한다.
- `repeat n {body}`: body를 n번 순회. **단, body 한 바퀴가 액션을 하나도 내지 않으면 그 반복은 거기서 끝난다**(남은 바퀴 생략). 액션이 없으면 세계 상태가 그대로이고 센서는 상태만 읽으므로 남은 바퀴도 똑같이 아무것도 내지 않는다 — 결과(trace 포함)는 생략하지 않은 것과 같다. maxTicks와 합쳐 어떤 프로그램이든 run의 작업량이 O(maxTicks × 블록 수)로 묶인다(§6.4 "0틱 반복").
- `if_wall {then} else {else}`: 평가 시점(직전 액션이 끝난 뒤 상태)에 `isWallAhead()`이면 then, 아니면 else.
- `if_pit`: `isPitAhead()`.
- `def {body}`: 순회 시 **건너뜀**(정의는 실행되지 않음).
- `call`: def의 body를 그 자리에서 순회. (재귀는 validate에서 막힘; run에서 만나면 컴파일 에러로 종료.)
- 액션마다 §6.3을 수행. 종료 조건이 나오면 즉시 중단(남은 블록 무시).
- 프로그램이 끝났는데 둥지가 아니면 `stuck`.
- `tick`이 `maxTicks`에 도달하면(도달한 틱을 기록한 뒤) `error`, event `timeout`, message `"시간 초과 (300틱)"`.

### 6.3 한 틱의 순서 (브리프 §2 "틱" 그대로 + 세부)
```
tick += 1
1. 부엉이 행동
   left/right : dir 회전. 칸 그대로.
   sleep      : 아무것도 안 함.
   forward    : target = ahead(1)
                if blocked(target)  → event 'wall', 종료 outcome 'error'
                                       message: 잠긴 문이면 "문이 잠겨 있다", 아니면 "벽에 부딪혔다"
                else move(target); enter(target)
   jump       : mid = ahead(1), target = ahead(2)
                if midBlocked(mid)  → event 'wall', 종료 'error', "벽은 뛰어넘을 수 없다"
                if blocked(target)  → event 'wall', 종료 'error', "벽에 부딪혔다"/"문이 잠겨 있다"
                else move(target); enter(target)   // mid 칸의 구덩이/쥐/열쇠/고양이는 전부 무시
2. enter(cell) 순서:
   a. 고양이가 그 칸에 있음  → event 'cat', 종료 'dead', "고양이를 밟았다"
   b. 구덩이 'O'            → event 'pit', 종료 'dead', "구덩이에 빠졌다"
   c. 문 'D' (열려있지 않음, 열쇠 보유) → keys -= 1, opened.add, event 'door', "문을 열었다"   (계속 진행)
   d. 쥐 'M' (안 먹음)      → mice += 1, eaten.add, event 'mouse', "쥐 획득 +20"
   e. 열쇠 'K' (안 주움)    → keys += 1, taken.add, event 'key', "열쇠 획득"
   f. 둥지 'G'              → event 'goal', 종료 'goal', "둥지 도착"   (고양이는 움직이지 않음)
3. 고양이 이동 (map.cat이 있고 아직 종료 안 됐을 때만)
   loop     : catIdx = (catIdx + 1) % path.length
   pingpong : catIdx += catDir; 끝에 닿으면 catDir 반전 (path 길이 1이면 정지)
   이동 후 고양이 칸 == 부엉이 칸 → event 'cat', 종료 'dead', "고양이에게 잡혔다"
4. Step 기록 (종료된 틱도 기록한다. 그 틱의 event/message가 곧 결말)
```
- 한 틱에 이벤트는 최대 1개다. 우선순위는 위 순서(사망 > 문 > 쥐 > 열쇠 > 둥지). 문을 열고 들어간 칸이 곧 둥지인 경우는 맵 설계상 금지(문 칸과 둥지 칸은 다르다).
- `blocked(cell)` = 맵 밖 ∨ `#` ∨ (`D` ∧ 안 열림 ∧ keys == 0).
- `midBlocked(cell)` = 맵 밖 ∨ `#` ∨ (`D` ∧ 안 열림). **열쇠가 있어도 문 위는 뛰어넘지 못한다**(공중에서 못 연다).
- `isWallAhead()` = `blocked(ahead(1))`. **결정**: 열쇠를 들고 있으면 잠긴 문은 벽이 아니다(forward가 성공하므로 센서도 일관되게 false).
- `isPitAhead()` = ahead(1)이 맵 안이고 `O`.
- 사망(dead)이면 mice는 결과에 그대로 남지만(trace용) 점수에서는 무효 처리한다(§7).
- `distance` = |owl.x − G.x| + |owl.y − G.y|.

### 6.4 결정 요약 (브리프가 비운 곳)
| 항목 | 결정 | 이유 |
|---|---|---|
| 고양이 순찰 | 맵에 `path` 명시, `loop`/`pingpong` | `c` 타일만으로는 순서·방향이 정해지지 않음 |
| 부엉이가 고양이 칸으로 들어감 | 즉시 사망 "고양이를 밟았다" | 브리프 수용 기준 5의 문구 |
| 고양이가 부엉이 칸으로 들어옴 | 사망 "고양이에게 잡혔다" | 브리프 "같은 칸이면 사망" |
| 열쇠 | 문 하나 열 때 1개 소모 | 맵당 열쇠·문 1쌍이라 단순화 |
| 열쇠 보유 시 잠긴 문 | 벽 아님 (forward/if_wall 모두). 카드·브리프의 "잠긴 문 = 벽 취급"은 **열쇠가 없을 때**를 말한다. 열쇠를 들고 `만약 앞이 벽이면 {…} 아니면 {앞으로}` 앞에 서면 아니면 쪽이 실행되어 문이 열린다 | 센서와 행동의 일관성 |
| 점프 중간 칸이 문 | 안 열렸으면 벽 취급, 열쇠 무관 | "벽은 못 넘음" |
| 무한 루프 방지 | maxTicks 300 → error "시간 초과" | 상한 12블록에서 repeat 9³ = 729틱 가능 |
| 0틱 반복 | 반복 본문 한 바퀴가 액션을 하나도 내지 않으면 남은 바퀴를 생략(§6.2). 결과는 동일 | maxTicks는 틱만 센다. 생략이 없으면 validate를 통과한 12블록 `반복 9 ×11 { 만약 앞이 벽이면 {} 아니면 {} }` 같은 0틱 중첩(9^11 바퀴)이 run을 몇 시간 멈춘다 |
| 형식이 깨진 블록 문서 | 계약 밖. §2 타입을 어긴 입력(블록이 null·비객체, repeat/def의 `body`나 if의 `then`/`else`가 배열이 아님)은 validate/run/toText/countBlocks가 **검사하지 않으며 예외(TypeError)를 던질 수 있다**. `id`가 BLOCKS에 없는 것만 E_UNKNOWN_BLOCK/컴파일 에러로 보고한다 | 편집기는 엔진 `Block` 타입을 그대로 상태로 쓴다(브리프 §2). jsonb에서 읽은 문서를 믿지 못하면 호스트가 try/catch |
| 컴파일 에러의 점수 | outcome `error`(0틱)이므로 §7 stuck/error 줄 그대로: 미도착 거리 점수 + 쥐 + 최초 제출 − 패치. 잠자기만 둔 프로그램도 같은 규칙(stuck) | 브리프 점수표에 컴파일 에러 예외가 없다. 사망(0점)보다 높은 것은 브리프의 위험/보상 설계. 호스트가 validate 실패 제출에 score()를 부를지는 호스트 결정(DECISIONS F) |
| 고양이 표시 | `c` 타일은 순찰로 표시일 뿐 고양이가 아니다. 고양이는 틱 0 프레임(`trace[0].cat` = `path[0]`)의 한 칸에만 있다. 편집기/보드는 틱 0 프레임에 고양이를 `path[0]`에 그려야 팀이 시각을 계산할 수 있다 | 같은 `c` 타일이라도 출발 칸이 반대 끝이면 교차 틱이 달라진다(R5 대표 정답이 19틱에 죽음) |
| 역할 커버리지 | 라운드 정답이 네 역할의 블록을 모두 쓸 필요는 없다. 새 요소는 라운드 표 순서대로 등장한다(R1·R3·R4 정답엔 Architect 블록이 없다). Architect는 제출 담당이고 누구나 남의 블록을 옮기거나 지울 수 있다 | 브리프 §2 역할·라운드 표. R3 정답은 브리프가 고정 |
| 빈 프로그램 | validate E_EMPTY | 실수 제출 방지 |
| 시작 방향 | 맵 `startDir` | `S` 문자에 방향 정보 없음 |

---

## 7. 점수 (`score.ts`)

`score(result, ctx): Score` — 브리프 §2 "점수" 그대로.

| outcome | lines (순서대로) |
|---|---|
| goal | 둥지 도착 +100 · 쥐 n마리 +20n (n>0일 때만) · 코드 골프 (cap−blocks)×5 (cap−blocks>0일 때만, 음수면 0 & 줄 생략) · 최초 제출 +10 (firstSubmit) · 패치권 사용 −10 (usedPatch) |
| stuck / error | 미도착 (둥지까지 d칸) max(0, 40 − 5d) (0점이어도 줄은 출력) · 쥐 n마리 +20n (n>0일 때만) · 최초 제출 +10 (firstSubmit) · 패치권 사용 −10 (usedPatch) |
| dead | 사망 0 · 패치권 사용 −10 (usedPatch) |

`total = max(0, Σ points)`. dead는 쥐·최초제출 무효(브리프 "0 (쥐 무효)"), 패치 페널티는 적용하되 0 아래로 내려가지 않는다.
"쥐 n마리" 줄은 모든 outcome에서 n>0일 때만 출력한다. 컴파일 에러(run이 0틱 `error`로 끝냄, message `"컴파일 에러: …"`)도 error 줄을 그대로 쓴다 — 예) 둥지까지 3칸, 최초 제출이면 25 + 10 = 35 (§6.4 "컴파일 에러의 점수").
검증값: R3 정답(goal, 5블록/cap7, 쥐2) = 100+40+10 = **150**. R5 정답(goal, 8블록/cap9, 쥐2, usedPatch) = 100+40+5−10 = **135**.

---

## 8. 맵/라운드 (`rounds/r*.ts`, `maps.ts`, `solutions.ts`)

각 `rounds/rN.ts`는 아래를 export 한다.
```ts
export const map: GameMap;
export const solutions: Program[];          // solutions[0]이 대표 정답
export const expect: { outcome: Outcome; ticks: number; mice: number; blocks: number; score: number }[]; // solutions와 1:1
export const naive?: { program: Program; note: string };  // 교육용: 반복/함수 없이 짠 긴 버전 (선택)
```
`maps.ts`: `export const MAPS: Record<1|2|3|4|5|6|7, GameMap>` 과 `MAP_LIST: GameMap[]`(7개, 라운드 순).
`solutions.ts`: `export const SOLUTIONS = { r1: Program[], r2, r3, r4, r5, r6, r7 }` (브리프의 `SOLUTIONS.r3[0]` 형태),
`ROUND_EXTRAS = { r1…r7: { naive }, r5·r7: { naive, noSleep } }`. 정답·부록은 서버 전용(클라이언트 번들 금지).

### 라운드 표 (브리프 고정값 + FEATURE_V4 §1)
| R | name | difficulty | cap | seconds | intro(새 요소) |
|---|---|---|---|---|---|
| 1 | Hello, Owl | 쉬움 | 12 | 300 | 앞으로·회전·반복 |
| 2 | 구덩이 지대 | 쉬움 | 12 | 360 | 점프·함수 |
| 3 | 나선 | 중간 | 7 | 420 | 만약 앞이 벽이면 |
| 4 | 열쇠와 계단 | 중간 | 10 | 480 | 열쇠·문·만약 앞이 구덩이면 |
| 5 | 고양이 순찰 | 어려움 | 9 | 600 | 움직이는 고양이·잠자기 |
| 6 | 밤의 미로 | 어려움 | 8 | 600 | 함수 속 조건 |
| 7 | 둥지 탈환 | 매우 어려움 | 10 | 720 | 모든 요소 |
| 8~10 | 고리 순찰 · 두 갈래 열쇠 · 부엉이의 왕 | 매우 어려움 · 극한 | ≤10 | 720~900 | `docs/ROUNDS_8_10.md` §1 참조 (R8~R10 명세, 이 표의 연장) |

표시 난이도 레벨 = 라운드 번호(1~10). `difficulty` 문자열은 위 표 그대로. 계약(`lib/contracts.ts` RoundNo)·DB(games.round)는 1~10이며, 엔진에 아직 없는 라운드는 앱에서 '준비 중'(400 round_unavailable)이다.

### 반드시 만족할 제약 (verify.ts가 검사)
- 공통: 8×8, `S`·`G` 각 1개, 둥지 칸 ≠ 문 칸, 각 정답은 `validate` 통과, 각 정답의 실행 결과가 `expect`와 일치. 타일 문자는 §2 목록만.
- **R3**: `solutions[0]` = `repeat 4 { repeat 5 { if_wall { right } else { forward } } }` (cards.html 히어로 그대로). 결과 goal, **ticks 20**, **mice 2**, blocks 5, score(firstSubmit=false, usedPatch=false) **150**. 20틱 이전에 둥지에 닿으면 안 된다(닿으면 그 틱에 끝나 20이 안 됨).
- **R5**: `solutions[0]` = 잠자기 1개 포함 8블록, goal, **ticks 37**, **mice 2**, score(usedPatch=true) **135**. 같은 프로그램에서 그 잠자기 블록을 제거한 `noSleep` 프로그램(7블록)은 **18틱째** 부엉이가 **(7,4)** 로 들어가며 event `cat`, message `"고양이를 밟았다"`, outcome dead, score 0. `rounds/r5.ts`는 `noSleep: Program`도 export 한다.
- R2: 정답에 `def`+`call`이 들어가고, `def` 없이 같은 동작을 하려면 블록이 더 많이 든다(naive.note에 비교 수치).
- R4: 열쇠 1개, 문 1개, 구덩이가 "계단" 패턴, 정답에 `if_pit`가 들어간다. 문을 안 열고는 둥지에 못 간다(둥지 영역이 문으로 막혀 있어야 함 — 벽으로 둘러싸기). `if_pit` 없이 상한 이내로 `solutions[0]` 점수 이상을 내는 프로그램이 없어야 한다(안뜰 쥐는 막다른 미끼 — 4열로 곧장 내려가는 지름길은 벽에 막힌다).
- R5 추가: 잠자기가 유일한 해법일 필요는 없다. 좌회전 하나로 2틱 늦게 출발하는 `좌회전 / 반복 9 { 반복 9 { 한 걸음 } }`(8블록, 38틱, 패치 없이 145점)은 같은 비용의 인정 답이며 `solutions`에 싣는다. 대표 정답·noSleep의 고정값(37틱/135, 18틱 (7,4) 사망)은 그대로.
- R1: 구덩이·고양이·문 없음. 정답 ≤ 5블록(repeat 사용). 앞으로만 나열한 naive는 ≥ 9블록. 쥐는 점프(R2 요소)로 건너뛰면 못 먹는 칸에 둔다(점프만 쓴 경로가 반복 정답과 동점이 되지 않게).
- 모든 맵: 정답이 지나는 경로 위의 쥐만 센다(점프 중간 칸의 쥐는 안 먹힘에 유의).
- **R6** (밤의 미로): 고양이·열쇠·문 없음, 구덩이 있음. `solutions[0]` = `함수 F { 반복 9 { 만약 앞이 벽이면 { 우회전 } 아니면 { 앞으로 } } } / F 호출 / 점프 / F 호출` (8블록): goal, **ticks 17**, **mice 2**, score **140**. 10틱째 점프로 (5,0) 구덩이를 넘는다. 맵의 쥐 = 정답이 먹는 쥐(2). 함정 고정: F 안의 반복을 8로 → 9틱째 (5,0) 구덩이 사망, R3 패턴 `반복 9 { 반복 9 { 벽이면 우회전 아니면 앞으로 } }` → 10틱째 (5,0) 구덩이. **새 요소 필요성**(빠짐없는 탐색): 조건 블록(if_wall·if_pit) 없이는 함수를 써도 8블록 이하로 둥지에 아예 못 간다. if_wall 없이는(if_pit·함수 허용) 상한 안에서 140점 이상 불가.
- **R7** (둥지 탈환): 고양이 pingpong (0,7)(1,7)(2,7)(주기 4), 열쇠 1·문 1, 구덩이. 둥지는 문으로만 들어간다(BFS, R4와 같은 검사). `solutions[0]` = `함수 F { 반복 9 { 만약 앞이 벽이면 { 좌회전 } 아니면 { 만약 앞이 구덩이면 { 점프 } 아니면 { 앞으로 } } } } / F 호출 / 잠자기 / F 호출` (10블록): goal, **ticks 16**, **mice 2**, score **140**, 열쇠 4틱·문 15틱(점프 착지로 연다). `noSleep`(잠자기만 뺀 9블록) → **11틱째 (2,7)** 에서 "고양이를 밟았다", dead, 0점. `rounds/r7.ts`는 `noSleep`도 export 한다. **새 요소 필요성**: ① 잠자기 — 잠자기 없는 **어떤 액션 열**로도 둥지에 못 간다(블록 수·함수·조건 무관, 상태 BFS `reachableActions`). 고양이를 치우면 잠자기 없이 쥐 2마리 + 둥지 가능(= 잠자기가 필요한 이유는 고양이). ② 조건 — 조건 블록 없이는 함수를 써도 상한 10 안에서 140점 이상 불가(빠짐없는 탐색). ③ 열쇠·문 — 문을 벽으로 두면 둥지 도달 불가.
- **함수의 한계 (R6·R7, 증명된 사실)**: 블록 8개 이하의 def 프로그램은 언제나 **같은 동작을 더 적은 블록으로 내는 def 없는 프로그램**이 있다. 본문 s블록, 호출 u번, 그 밖 g블록이면 def 비용 = 1+s+u+g, 풀어 쓰면 s·u+g. (s−1)(u−1) ≤ 1이면 풀어 쓰는 쪽이 짧다. 나머지 경우(8블록 이하에서 (s,u) = (3,2),(4,2),(5,2),(2,3),(3,3),(2,4),(2,5))도 모두 줄어든다: 최상위 호출은 시작 상태가 정해져 있어 그 액션 열로 바꿔 쓸 수 있고, "F 호출 / X / F 호출"은 `반복 2 { F 본문 / X }`(마지막 X는 둥지 도착으로 실행 안 됨), 반복 안의 "F / X / F"는 `첫 액션 / 반복 n { X / 반복 2 { 본문 } }`, 연속 호출은 반복으로 묶인다. 따라서 **상한 8인 R6에서는 함수가 점수로 이득일 수 없고**(FEATURE_V4 §1의 "함수 필요성"은 이 상한에서 만족 불가능), R7도 9블록 이상 def가 이득일 수 있는 경우를 빠짐없이 확인하려면 크기 9~10 탐색이 필요해 verify에 넣지 않는다. 두 라운드의 대표 정답은 "함수 속 조건"을 보여 주는 교육용 정답이고, 같은 동작의 def 없는 답을 `solutions[1]`에 싣는다: R6 `반복 2 { 반복 9 { … } / 점프 }` 6블록 150점(함수를 써도 150점 초과 없음 — 탐색), R7 `반복 2 { 반복 9 { 한 걸음 } / 잠자기 }` 8블록 150점(함수 없이 150점 초과 없음 — 탐색). 새 요소 필요성 검사는 조건(R6·R7)·잠자기(R7)·문(R7)에 대해 한다.

---

## 9. verify.ts

`npx tsx engine/verify.ts` — 아래 전부를 검사하고 `✓/✗` 목록을 출력, 하나라도 실패하면 `process.exit(1)`.
1. 단위 의미론: 회전표, forward 벽 에러, 맵 밖 에러, 구덩이 사망, 점프(구덩이 넘기, 중간 벽 에러, 중간 쥐 안 먹음, 착지 구덩이 사망), 열쇠→문(열쇠 없이 에러, 있으면 열림, 소모), if_wall(맵 밖/벽/잠긴 문/열쇠 보유 문), if_pit, repeat n, def/call(0틱, 줄 번호가 def 본문 줄), sleep 1틱, 고양이 loop/pingpong, 밟기/잡히기 두 문구, 둥지 도착 시 고양이 정지, maxTicks 시간 초과, stuck 거리 계산, 종료된 틱도 trace에 기록됨(ticks == trace.length−1). **0틱 중첩 반복이 곧바로 끝남**(validate를 통과하는 12블록 `반복 9` 중첩, 빈 본문/빈 if 본문 — 생략 규칙이 깨지면 verify가 끝나지 않는다). §6.4 결정의 현재 동작 고정: 열쇠 보유 if_wall, 형식이 깨진 문서는 예외, 컴파일 에러 점수.
2. countBlocks / validate 8개 코드 각각.
3. toText 출력 형식(들여쓰기, `} 아니면 {`), line 매핑과 run의 `Step.line` 일치.
4. score: 브리프 표의 모든 줄, dead=0, 음수 방지, 150/135 검증값.
5. 7개 맵의 구조 제약(§8) + 각 정답의 expect 일치 + 브리프 수용 기준 4·5 재현. "더 짧은 프로그램이 없다"는 제약은 목록에 적힌 정답끼리 비교하지 않고 `verify-search.ts`의 **빠짐없는 탐색**으로 확인한다(블록 목록을 상태→결과 함수로 보고 같은 함수는 하나만 남기는 방식. sleep·repeat 1·빈 if는 결과를 바꾸지 않으므로 제외, maxTicks 무시 — "없음" 결론에는 안전). R4: 쥐 1마리 이상 ≤ 5블록 없음, if_pit 없이 쥐 1마리 이상 ≤ 6블록 없음.
   탐색은 고양이 맵도 다룬다(상태에 "시각 mod 순찰 주기"를 넣고 잠자기를 잎으로), `def: true`면 함수 F(def 본문 후보 × "F 호출" 잎)도 쓴다. "목표 점수 이상" 검사는 쥐 m마리마다 블록 한도 b(m) = 상한 − (목표 − 100 − 20m)/5 로 나눠 탐색하고 미도착 최고점(40 + 20·전체 쥐)이 목표 미만인지 따로 본다. `reachableActions`는 블록 수와 무관한 상태 BFS(모든 액션 열)다.
   R6: 조건 없이(함수 허용) 8블록 이하 둥지 도달 없음, if_wall 없이 140점 이상 없음, 함수를 써도 150점 초과 없음. R7: 잠자기 없는 액션 열로 둥지 도달 없음(BFS), 고양이를 치우면 가능, 조건 없이(함수 허용) 140점 이상 없음, 함수 없이 150점 초과 없음, 둥지는 문으로만.
