# OWL COMPILE 협동 게임 명세 (게임 2, 최우선 기준)

사용자 요청(2026-09-15): 기존 게임(게임 1, 부엉이 한 마리의 행동 하나하나를 팀이 코딩)을 그대로 두고, **팀 부엉이 4마리가 협동해서 퍼즐을 깨는 게임 2**를 더한다.
이 문서가 `docs/WEBSITE_SPEC.md`·`docs/FEATURE_V4.md`와 충돌하면 **이 문서가 이긴다**. 게임 1의 규칙·화면·API는 바꾸지 않는다(§10에 적힌 최소한의 연결점만 손댄다).

용어: 게임 1 = **라운드 게임** (`/play`, `/host/<코드>`, `/board/<코드>`), 게임 2 = **협동 게임** (`/coop/<코드>`, `/coop/host/<코드>`, `/coop/board/<코드>`).

---

## 0. 요약 (사용자 요청 → 결정)

| 요청 | 결정 |
|---|---|
| 팀 최대 6명, 최소 3명(3명 이상이어야 게임 가동) | 팀당 사람 3~6명. 진행자의 **시작**은 사람이 있는 모든 팀이 3명 이상일 때만 된다(0명 팀은 시작할 때 지워진다). 팀의 **실행**도 3명 이상일 때만 된다(409 `team_too_small`) |
| 4명의 부엉이가 한 팀이 되어 클리어 | 팀마다 맵 위에 **부엉이 4마리(고정)**. 사람은 각자 좋아하는 부엉이 자리(1~4)를 맡지만 **팀원 누구나 어느 부엉이의 코드든 고칠 수 있다**(역할 제한 없음). 라운드는 4마리가 **모두 둥지(G) 칸 위에 서면** 클리어 |
| 총 3라운드(이지·노멀·하드) | 라운드 1 이지, 2 노멀, 3 하드. (요청문의 "5라운드"는 "3라운드(이지,노멀,하드)"와 어긋나므로 이름이 명시된 3라운드를 따른다) |
| 코드블럭 중 빨간색·파란색이 되는 것, 색이 바뀌면 들어갈 수 있는 구역 | **색 바꾸기** 블록(`toggle`). 팀 세계에는 색 상태(빨강/파랑)가 있고, 맵의 **빨강 구역(R)** 은 세계가 빨강일 때만, **파랑 구역(B)** 은 파랑일 때만 들어갈 수 있다 |
| 0·1 발판: 0 위에 서면 1이 되고 길이 생김. 0·1 압력판을 눌러 문을 연다 | **비트 발판(Z)**: 부엉이(또는 상자)가 처음 올라서면 0→1로 영구히 바뀐다. 한 묶음(link)의 발판이 모두 1이 되면 묶인 **다리(~)** 가 생기거나 **문(D)** 이 열린다(영구) |
| 협동 압력판 | **누름판(P)**: 부엉이나 상자가 **올라가 있는 동안만** 눌린다. 한 묶음의 누름판이 **동시에** 모두 눌려 있어야 묶인 문이 열린다(내려오면 닫힌다) → 서로 다른 부엉이가 판을 밟아 주고 다른 부엉이가 지나간다 |
| 코드가 잘못되면 그 줄이 사라지고 그 상태에서부터 계속 / 벽·잘못된 길에서 그 행동을 멈추고 그 상태에서부터 | 실행 중 어떤 행동이 **실패**하면(벽·맵 밖·닫힌 문·색이 안 맞는 구역·구덩이·밀 수 없는 부엉이/상자·상자 없음) 그 부엉이는 **제자리에 멈추고**, 그 블록은 **무너져 사라지며**(이번 실행에서 다시는 실행되지 않음) 실행은 **계속**된다(남은 블록·다른 부엉이). 실행이 끝나면 세계(부엉이 위치·발판·상자·색)는 **그대로 남고** 다음 코드는 그 상태에서 시작한다. 실행한 코드는 **소진**된다(편집기가 비워진다) |
| 부엉이끼리 부딪히면 서로 밀려감 | 부엉이가 다른 부엉이 칸으로 이동하면 상대를 같은 방향으로 한 칸 **민다**(그 뒤 칸이 비어 있으면). 밀 수 없으면 이동 실패(블록 무너짐) |
| 줄이 사라지는 애니메이션, 블럭이 무너지는 것 | 재생 중 실패한 틱에 코드 줄이 **부서져 흩어지고**(shatter) 편집기의 그 카드도 **무너져** 사라진다(§9.4) |
| 처음부터 다시하기 (점수 초기화 대신) | 팀 버튼 **처음부터 다시하기**: 이번 라운드 세계를 처음 상태로 되돌리고 4개 코드를 비운다. **점수는 그대로**(재시작 횟수만 센다) |
| 오브젝트 생성 블록으로 푸는 퍼즐 | **상자 놓기** 블록(`spawn`): 앞 칸에 상자를 만든다. 상자는 구덩이를 메우고(다리), 누름판을 눌러 주며(부엉이가 자유로워짐), 바닥에서는 밀 수 있는 장애물이다. 라운드마다 팀 상자 개수 제한 |
| 게임 2도 한 게임. 최대 10팀이 똑같이 시작, 타이머 안에 점수 최대 | 팀 2~10. 진행자가 **시작**을 누르면 모든 팀이 동시에 시작해 **한 타이머**(기본 20분) 안에서 각자 속도로 라운드를 깬다. 점수 = 라운드 클리어 + 남은 시간 보너스 + 쥐. 타이머가 끝나면 자동 종료·최종 순위 |

---

## 1. 폴더와 파일

```
engine/coop/                    협동 엔진 (의존성 0, 순수 TS, Date·Math.random 금지). sync-engine이 lib/engine/coop/ 로 복사한다
  types.ts    blocks.ts   maps/easy.ts  maps/normal.ts  maps/hard.ts  maps/index.ts
  run.ts      score.ts    verify.ts (npm run verify:coop)   verify-checks.ts
lib/coop/contracts.ts           협동 게임 API 요청/응답·뷰모델·SSE 타입, 경로 상수 (서버 코드 import 금지, 엔진은 타입만)
lib/server/coop/                서버 (rows.ts · lobby.ts · program.ts · run.ts · phase.ts · views.ts · events.ts · index.ts)
app/api/coop/route.ts                            GET 내 협동 게임 목록 · POST 새 협동 게임
app/api/coop/[code]/{state,events,join,leave,program,run,restart,phase,timer,kick,assign,pull,seat}/route.ts
app/coop/[code]/page.tsx        팀 화면 (폰)          components/coop/CoopPlay.tsx …
app/coop/host/[code]/page.tsx   진행자 콘솔           components/coop/host/CoopConsole.tsx …
app/coop/board/[code]/page.tsx  프로젝터              components/coop/board/CoopBoard.tsx …
app/coop/join/page.tsx          팀·부엉이 자리 선택     components/coop/CoopJoin.tsx
components/coop/CoopMapGrid.tsx 10×10 맵 + 4마리 부엉이 + 발판·문·다리·상자·색 구역
components/coop/CoopPlayback.tsx 재생(틱 500ms) + 무너짐 연출
lib/client/useCoop.ts           SSE 구독 + 뷰 스토어 (useGame과 같은 형태)
scripts/e2e-coop.ts             API 종단 시나리오 (npm run e2e:coop)
tests/coop-engine.test.ts  tests/coop-game.test.ts  tests/coop-contracts.test.ts
docs/COOP_SPEC.md               이 문서
```

`scripts/sync-engine.mjs`는 `engine/coop/`와 `engine/coop/maps/`도 복사한다(`_scratch` 제외). 앱 코드는 `@/lib/engine/coop/...`만 import 한다.
클라이언트 번들에는 `lib/engine/coop/maps/*`·`solutions`를 넣지 않는다(맵은 서버 뷰모델로 받는다). 참고: 협동 맵의 **정답은 `maps/*.ts`의 `solution` export**이므로 클라이언트가 `maps/*`를 import 하면 정답이 새어 나간다 → 클라이언트는 `@/lib/engine/coop/types`·`blocks`·`run`(순수 함수, 정답 없음)만.

---

## 2. 블록 (공통 블록 집합 확장)

게임 1의 `engine/types.ts`·`blocks.ts`를 **확장**한다(게임 1 의미론은 불변).

```ts
export type BlockId =
  | 'forward' | 'jump' | 'left' | 'right'
  | 'repeat' | 'if_wall' | 'if_pit'
  | 'def' | 'call' | 'sleep'
  | 'toggle' | 'spawn';                       // 협동 전용
export type ActionId = 'forward' | 'jump' | 'left' | 'right' | 'sleep' | 'toggle' | 'spawn';
// Block의 plain 변형 id 목록에 'toggle' | 'spawn' 추가
```

| id | label | keyword | category | role(참고) | ticks | shape | 파이썬 | 한국어 |
|---|---|---|---|---|---|---|---|---|
| toggle | 색 바꾸기 | toggle | special | architect | 1 | plain | `owl.toggle_color()` | 색 바꾸기 |
| spawn | 상자 놓기 | spawn | special | architect | 1 | plain | `owl.spawn_box()` | 상자 놓기 |

- `BlockMeta`에 `coop?: true`를 더한다(두 블록만). `BLOCK_ORDER` 끝에 `'toggle', 'spawn'`을 붙인다. `ROLES`의 blocks 목록에는 **넣지 않는다** → 게임 1 팔레트·역할 검사(`roleViolations`)에서 자동으로 빠진다.
- `COOP_BLOCKS: readonly BlockId[]` = BLOCK_ORDER 전체(12개) — 협동 팔레트.
- 게임 1 `validate`: 협동 전용 블록이 있으면 새 코드 `E_COOP_ONLY`("협동 게임 전용 블록") 보고. 게임 1 `run`의 `compileError`도 같은 경우 `컴파일 에러: 협동 게임 전용 블록`.
- `lib/server/docSchema.ts`의 PlainSchema enum, `components/blocks/BlockIcon.tsx`의 PATHS, `lib/codegen/python.ts`·`korean.ts`에 두 블록을 더한다. 아이콘: toggle = 반원 두 개가 맞물린 색상환/스위치, spawn = 상자(정육면체 선).
- `ProgramEditor`에 `palette?: readonly BlockId[]` prop을 더한다(주면 roles 기반 팔레트 대신 이 목록, `Palette`는 `ids` prop). 협동 편집기는 `palette={COOP_BLOCKS}`.

---

## 3. 협동 엔진 (`engine/coop/`)

### 3.1 타입 (`types.ts`)

```ts
import type { Block, Dir, OwlState, Pos, Validation } from '../types';
export type CoopRoundNo = 1 | 2 | 3;
export type CoopColor = 'red' | 'blue';
export type CoopTile =
  | '.' | '#' | 'O'            // 바닥 · 벽 · 구덩이 (부엉이는 못 들어감, 점프로 넘음, 상자로 메움)
  | '1' | '2' | '3' | '4'      // 부엉이 k의 시작 칸 (바닥)
  | 'G'                        // 둥지 (4칸 이상). 4마리가 모두 G 위에 서면 클리어
  | 'R' | 'B'                  // 빨강·파랑 구역: 세계 색이 같을 때만 들어갈 수 있다 (틀리면 벽)
  | 'M'                        // 쥐 (+10). 밟으면 사라진다
  | 'Z'                        // 비트 발판 0/1: 처음 올라서면 0→1 (영구)
  | 'P'                        // 누름판: 부엉이·상자가 올라가 있는 동안만 눌림
  | 'D'                        // 문: 링크가 열기 전엔 벽
  | '~';                       // 다리: 링크가 열기 전엔 구덩이

export interface CoopLink {
  id: string;
  kind: 'bit' | 'hold';        // bit: plates(Z)가 모두 1이면 targets 영구 개방 · hold: plates(P)가 모두 눌린 동안만 개방
  plates: Pos[];
  targets: Pos[];              // 'D' 또는 '~' 칸
}

export interface CoopMap {
  round: CoopRoundNo;
  key: 'easy' | 'normal' | 'hard';
  name: string;                // 예: "색의 문", "둘이서 누르기", "네 마리의 탈출"
  label: '이지' | '노멀' | '하드';
  size: 10;                    // 10×10, tiles[y][x]
  tiles: string[];             // 10개 문자열, 각 10글자
  startDirs: [Dir, Dir, Dir, Dir];
  startColor: CoopColor;
  links: CoopLink[];
  boxes: number;               // 라운드당 팀 상자 개수 (spawn 예산)
  cap: number;                 // 부엉이 한 마리 코드의 블록 상한 (12)
  base: number;                // 클리어 기본 점수 (100 · 200 · 300)
  intro: string;               // 새 요소 한 줄
  hints: string[];             // 팀 화면 "규칙" 패널 문구 (2~4줄)
}

export interface CoopWorld {
  round: CoopRoundNo;
  owls: [OwlState, OwlState, OwlState, OwlState];
  color: CoopColor;
  boxes: Pos[];                // 바닥·판·구역 위에 놓인 상자 (구덩이를 메운 상자는 filled로 간다)
  bits: Pos[];                 // 1이 된 비트 발판
  eaten: Pos[];                // 먹은 쥐 칸
  filled: Pos[];               // 상자로 메운 구덩이·다리 칸 (영구 바닥)
  boxesLeft: number;
}

export type CoopEventKind =
  | 'wall' | 'pit' | 'locked' | 'color' | 'bump' | 'nobox'   // 실패 (블록 무너짐)
  | 'push' | 'mouse' | 'bit' | 'toggle' | 'spawn' | 'fill' | 'open' | 'goal';   // 성공 이벤트

export interface CoopAction {
  owl: 0 | 1 | 2 | 3;
  block: ActionId;
  path: number[];              // AST 경로 (ENGINE_SPEC §5). 무너짐·하이라이트용
  line: number;                // toText 줄 번호
  ok: boolean;                 // false = 실패 → 이 블록은 이번 실행에서 무너져 사라진다
  event: CoopEventKind | null;
  message: string | null;      // 토스트 문구 (한국어)
  pushed?: { kind: 'owl' | 'box'; index?: number; from: Pos; to: Pos };
}

export interface CoopStep {
  tick: number;                // 0 = 초기 프레임
  actions: CoopAction[];       // 이 틱에 처리한 순서대로 (부엉이 0→3, 행동이 없는 부엉이는 없음)
  owls: [OwlState, OwlState, OwlState, OwlState];   // 틱 끝 상태
  color: CoopColor;
  boxes: Pos[];
  bits: Pos[];
  held: Pos[];                 // 지금 눌린 누름판
  open: Pos[];                 // 지금 열린 문·다리 (bit 영구 + hold 순간)
  eaten: Pos[];
  filled: Pos[];
  cleared: boolean;            // 이 틱 끝에 4마리 모두 G
}

export interface CoopRunResult {
  cleared: boolean;
  ticks: number;               // = trace.length - 1
  trace: CoopStep[];
  world: CoopWorld;            // 실행 뒤 세계 (클리어해도 마지막 상태)
  crumbles: { owl: 0 | 1 | 2 | 3; path: number[] }[];   // 무너진 블록 (부엉이별, 처음 실패한 틱 순)
  mice: number;                // 이번 실행에서 먹은 쥐
  stoppedBy: 'cleared' | 'done' | 'timeout';   // done = 네 마리 코드가 모두 끝남
}
export interface CoopRunOptions { maxTicks?: number }   // 기본 60
```

### 3.2 공개 함수

```ts
export function initialWorld(map: CoopMap): CoopWorld;
export function parseCoopMap(map: CoopMap): ParsedCoopMap;   // starts[4], goals, tileAt, inBounds, linkOf
export function checkCoopMap(map: CoopMap): string[];          // 구조 제약 위반 목록 (§3.6)
export function openNow(map: CoopMap, world: CoopWorld): { held: Pos[]; open: Pos[] };   // 파생 상태
export function runCoop(map: CoopMap, world: CoopWorld, docs: [Block[], Block[], Block[], Block[]], opts?: CoopRunOptions): CoopRunResult;
export function validateCoop(doc: Block[], map: CoopMap): Validation;   // = validate(doc, {cap}) 규칙 + 협동 블록 허용
export const COOP_MAX_TICKS = 60;
```

`runCoop`는 입력 `world`·`docs`를 바꾸지 않는다(깊은 복사). 결정적: 같은 입력 → 같은 trace.

### 3.3 실행 순서 (한 틱)

```
tick += 1
for k in 0..3:                                   ← 부엉이 번호 순서 (고정)
  a = 부엉이 k 코드의 다음 액션 (생성기: ENGINE_SPEC §6.2와 같은 전위 순회. repeat/if/def/call 0틱.
      if_wall·if_pit은 도달한 순간(앞 부엉이들이 이번 틱에 움직인 뒤) 부엉이 k의 센서로 평가.
      무너진 블록(dead 집합, pathKey)은 건너뛴다 → 반복 본문이 비면 남은 바퀴 생략(§6.2 규칙 그대로))
  없으면 continue (그 부엉이는 끝)
  apply(a)  (아래 §3.4). 실패면 dead에 a.path 추가, ok=false
  파생 상태 갱신: held = 부엉이·상자가 위에 있는 P 칸, open = bit 링크(plates ⊆ bits) 의 targets ∪ hold 링크(plates ⊆ held) 의 targets
Step 기록 (틱 끝 상태). 4마리 모두 G 위 → cleared, 중단.
네 마리 모두 코드가 끝났으면 중단(stoppedBy 'done'). tick == maxTicks면 중단('timeout').
```
- 부엉이 4마리가 **동시에** 움직이는 것처럼 보이지만 규칙은 번호 순 **순차 처리**다(결정적·단순). 재생은 한 틱을 한 번에 그린다.
- 판은 즉시 반응한다: 부엉이 0이 누름판에서 내려오면 같은 틱의 부엉이 2는 닫힌 문에 막힌다.
- 문이 닫힐 때 그 위에 부엉이가 있으면 그대로 있다(갇히지 않고, 다음에 걸어 나갈 수 있다).

### 3.4 행동 규칙

칸 판정(부엉이 k 기준):
- `solid(p)` = 맵 밖 ∨ `#` ∨ (`D` ∧ 열리지 않음) ∨ (`R` ∧ color ≠ red) ∨ (`B` ∧ color ≠ blue)
- `hole(p)` = (`O` ∧ filled에 없음) ∨ (`~` ∧ 열리지 않음 ∧ filled에 없음)
- `owlAt(p)`, `boxAt(p)`
- 센서: `wallAhead` = solid(ahead 1) · `pitAhead` = hole(ahead 1)   (부엉이·상자는 센서에 안 잡힌다)

| 블록 | 규칙 |
|---|---|
| left / right / sleep | 항상 성공 (게임 1과 같음) |
| toggle | color 반전. 성공. event `toggle` "색이 {빨강|파랑}으로 바뀌었다" |
| spawn | t = ahead(1). 실패 조건(순서대로): boxesLeft == 0 → `nobox` "상자가 없다" · solid(t) → `wall` "여기엔 놓을 수 없다" · owlAt/boxAt(t) → `bump` "이미 무언가 있다". 성공: hole(t)면 filled에 추가(`fill` "상자로 메웠다"), 아니면 boxes에 추가(`spawn` "상자를 놓았다"). 상자가 Z 위에 놓이면 bit 발판이 1이 된다. boxesLeft −1 |
| forward | t = ahead(1). solid(t) → 실패 `wall`(맵 밖 "맵 밖이다" · 벽 "벽에 부딪혔다" · 닫힌 문 `locked` "문이 닫혀 있다" · 색 구역 `color` "색이 맞지 않는다"). hole(t) → 실패 `pit` "구덩이 앞에서 멈췄다". owlAt(t)=j → 밀기: b = t+dir; b가 자유(¬solid ∧ ¬hole ∧ ¬owlAt ∧ ¬boxAt)면 부엉이 j를 b로 옮기고(enter(j, b)) 계속(`push` "부엉이 j+1을 밀었다"), 아니면 실패 `bump` "부엉이에 막혔다". boxAt(t) → 밀기: b가 ¬solid ∧ ¬owlAt ∧ ¬boxAt면 상자 이동(hole(b)면 filled로 = 메움 `fill`), 아니면 실패 `bump` "상자에 막혔다". 이동 후 enter(k, t) |
| jump | m = ahead(1), t = ahead(2). m이 맵 밖·`#`·닫힌 문이면 실패 `wall` "벽은 뛰어넘을 수 없다"(m의 구덩이·상자·부엉이·색 구역은 무시). t는 forward의 t 규칙과 같다(solid·hole·밀기). 이동 후 enter(k, t) |

`enter(k, p)`: `M`(안 먹음) → eaten 추가, mice+1, event `mouse` "쥐 획득 +10" · `Z`(bits에 없음) → bits 추가, event `bit` "발판 0 → 1" · 그 결과 새로 열린 링크가 있으면 event `open` "문이 열렸다"/"다리가 생겼다"(이벤트는 틱당 부엉이당 1개, 우선순위 mouse > bit > open > push > 나머지). 밀려 들어간 부엉이/상자도 enter 규칙(쥐·비트)을 적용한다(상자는 쥐를 먹지 않는다).

실패 시 부엉이는 움직이지 않고, `ok=false`, 그 블록은 dead. 같은 블록이 반복 안에 있으면 다음 바퀴부터 건너뛴다(빈 본문 → 반복 종료).

### 3.5 점수 (`score.ts`)

```ts
export const CLEAR_BASE: Record<CoopRoundNo, number> = { 1: 100, 2: 200, 3: 300 };
export const MOUSE_POINTS = 10;
/** 한 번 실행의 점수 줄. remaining/total = 클리어 순간 남은 시간/전체 시간(초). 클리어가 아니면 시간 보너스 없음 */
export function scoreRun(r: CoopRunResult, ctx: { round: CoopRoundNo; remaining: number; total: number }): { total: number; lines: ScoreLine[] }
```
줄: `쥐 n마리 +10n`(n>0) · 클리어면 `{라벨} 클리어 +base` · `남은 시간 보너스 +round(base × remaining/total × 0.5)`(remaining>0). 무너짐·재시작 감점 없음(순위 동점 기준으로만 쓴다).

### 3.6 맵 제약 (`checkCoopMap`, `verify.ts`)

- 10행 × 10글자, 문자는 §3.1 집합만. `1`~`4` 각 1개. `G` ≥ 4.
- 모든 `Z`·`P`는 정확히 한 링크의 plates에 속하고, kind가 맞는다(Z↔bit, P↔hold). 링크의 targets는 `D` 또는 `~`. 모든 `D`·`~`는 링크 1개 이상의 target. hold 링크 plates ≥ 2(협동), bit 링크 plates ≥ 1.
- `maps/*.ts`는 `map`, `solution: [Block[], Block[], Block[], Block[]]`(한 번 실행으로 클리어, 무너짐 0), `expect: { ticks: number; mice: number }`, `traps: { name: string; docs: [..4]; expect: 'not_cleared' | { crumbles: number } }[]`(교육용 함정 ≥ 1)를 export.
- 정답이 쓰는 새 요소 필요성: 이지 = `toggle` 없이는 클리어 불가(색 구역이 둥지를 가른다) · 노멀 = 누름판을 두 곳 동시에 눌러야 문이 열린다(정답에서 한 부엉이를 잠자기로 바꾸면 클리어 불가) · 하드 = 상자 없이는 클리어 불가(정답에서 spawn을 빼면 실패) + 모든 요소.
- **이지**(새 요소: 색 바꾸기 · 비트 발판): 부엉이 넷이 각자 걷고, 색 구역 통과와 발판 4개(각 부엉이 하나씩)로 다리를 만든다. 4마리가 모두 협력해야 하는 첫 경험. 정답 ≤ 8블록/마리, ≤ 20틱.
- **노멀**(새 요소: 누름판 2개 동시 · 상자): 두 부엉이가 판을 밟는 동안 두 부엉이가 문을 지나고, 지나간 쪽이 비트 발판으로 다리를 열어 뒤의 둘을 부른다. 상자 1개로 판 하나를 대신할 수 있게(예산 boxes 1) 두 갈래 정답. 정답 ≤ 10블록/마리, ≤ 30틱.
- **하드**(모든 요소): 색 구역 2색 + 비트 발판 + 누름판 3개 + 상자 2개 + 구덩이 + 쥐. 정답 ≤ 12블록/마리, ≤ 45틱.
- `verify.ts`: 구조 제약 · 정답 실행 = cleared·무너짐 0·expect 일치 · 함정 결과 일치 · 필요성(위) · 재실행 결정성(같은 입력 두 번 = 같은 trace JSON) · 세계 지속성(정답을 두 번으로 나눠 실행해도 클리어) · 밀기·판·상자·색 단위 규칙(작은 합성 맵으로 §3.4 각 줄). `npm run verify:coop` 가 전부 통과해야 한다.

---

## 4. 데이터 (SQLite, 스키마 v3)

`lib/server/db.ts` `SCHEMA_VERSION = 3`. v3 = games.round 1~10 재생성(`docs/ROUNDS_8_10.md`) + 아래 협동 테이블 생성.

```sql
create table if not exists coop_games (
  id text primary key, code text unique not null, host_id text not null references users,
  phase text not null default 'lobby' check (phase in ('lobby','playing','finished')),
  mode text not null default 'auto' check (mode in ('auto','self')),
  minutes integer not null default 20,
  timer_ends_at text, timer_remaining integer,          -- games와 같은 뜻 (ends_at 있으면 진행, 없으면 일시정지/미시작)
  started_at text, finished_at text, created_at text not null
);
create table if not exists coop_teams (
  id text primary key, game_id text not null references coop_games on delete cascade,
  name text not null, color text not null, seat integer not null,
  round integer not null default 1 check (round between 1 and 3),
  done integer not null default 0,                      -- 하드까지 클리어
  score integer not null default 0,
  runs integer not null default 0, crumbles integer not null default 0, restarts integer not null default 0,
  cleared_rounds integer not null default 0,
  finished_at text,                                     -- 완주 시각 (동점 기준)
  run_seq integer not null default 0,                   -- 마지막 실행 번호
  busy_until text                                       -- 재생 중 잠금 (이 시각 전엔 다시 실행 불가)
);
create index if not exists coop_teams_game on coop_teams(game_id);
create table if not exists coop_members (
  id text primary key, game_id text not null references coop_games on delete cascade,
  team_id text not null references coop_teams on delete cascade, user_id text not null references users on delete cascade,
  owl integer not null check (owl between 0 and 3), joined_at text not null,
  unique (game_id, user_id)
);
create index if not exists coop_members_user on coop_members(user_id);
create table if not exists coop_programs (
  team_id text not null references coop_teams on delete cascade, owl integer not null check (owl between 0 and 3),
  doc text not null default '[]', version integer not null default 0, blocks integer not null default 0,
  primary key (team_id, owl)
);
create table if not exists coop_worlds (
  team_id text primary key references coop_teams on delete cascade,
  round integer not null, state text not null, updated_at text not null
);
create table if not exists coop_runs (
  team_id text not null references coop_teams on delete cascade, seq integer not null,
  round integer not null, at text not null,
  docs text not null, trace text not null, cleared integer not null, ticks integer not null,
  mice integer not null, crumbles integer not null, points integer not null default 0, lines text not null default '[]',
  primary key (team_id, seq)
);
create table if not exists coop_clears (
  team_id text not null references coop_teams on delete cascade, round integer not null,
  at text not null, points integer not null, runs integer not null, crumbles integer not null,
  primary key (team_id, round)
);
create table if not exists coop_exits (
  game_id text not null references coop_games on delete cascade, user_id text not null references users on delete cascade,
  reason text not null check (reason in ('kicked','left')), at text not null, primary key (game_id, user_id)
);
```
- 게임 코드는 게임 1과 **같은 4자리 공간**을 나눠 쓴다: `pickCode`는 `games`와 `coop_games` 둘 다 검사한다(양쪽 모두).
- 팀 이름·색은 `TEAM_PRESETS` 순서(10개).
- 한 사람은 끝나지 않은 게임(라운드·협동 통틀어) **하나에만** 속한다.

---

## 5. 서버 규칙 (`lib/server/coop/`)

### 5.1 페이즈
`lobby → playing → finished`. 되돌리기 없음(finished는 최종).
- **시작**(`POST /phase {to:'playing', expect:'lobby'}`): 사람 0명 팀은 삭제. 남은 팀 중 3명 미만이 있으면 409 `team_too_small` `{teams: [이름…]}`. 남은 팀이 2개 미만이면 409 `too_few_teams`. 모든 팀: round 1, 세계 초기화(`coop_worlds`), 프로그램 4개 `[]`, `timer_ends_at = now + minutes×60s`, `started_at`.
- **끝내기**(`{to:'finished', expect:'playing'}`) 또는 1초 틱커 `owl-coop-timer`가 `timer_ends_at <= now`인 게임을 finished로. `finished_at`. 이후 실행·편집·참가 불가.
- 타이머(`POST /timer {action: pause|resume|add, seconds?}`): playing 중에만. 규칙은 게임 1 `controlTimer`와 같다(일시정지 = ends_at→remaining). 남은 시간 계산 `secondsLeft`는 게임 1과 같은 함수 규칙.

### 5.2 참가·자리
- `POST /join {teamId, owl?}`: lobby·playing 중. 팀 사람 ≤ 6(409 `team_full`), 다른 끝나지 않은 게임(양쪽) 팀원이면 409 `in_other_game`, 내보내진 사람 409 `kicked`, 이미 다른 팀이면 409 `other_team`(게임이 시작된 뒤 팀 바꾸기 금지). owl이 없으면 그 팀에서 **사람이 가장 적은 부엉이 자리**(같으면 낮은 번호). `POST /seat {owl}`로 언제든 바꿀 수 있다(표시용).
- `POST /leave`: lobby에서만. `POST /kick {userId}` 진행자: 사람을 빼고 `coop_exits`에 kicked, 게임 채널 `removed`.
- `POST /assign {userId, teamId, owl?}` 진행자: 대기실 사람·이 게임 사람을 팀에 넣거나 옮긴다(lobby·playing). 규칙은 게임 1 `assignMember`와 같다(`not_waiting`·`host_self`·`in_other_game`·`team_full`).
- `POST /pull {userIds?}` 진행자: 대기실 사람을 자동 배정(사람이 가장 적은 팀, i mod T, 부엉이 자리 = 팀 안 k mod 4).
- `POST /api/coop {teams: 2~10, minutes: 5~60, mode: 'auto'|'self'}` → 201 `{code, assigned, leftWaiting, placements}`. auto면 지금 대기 중인 사람을 배정하고 대기실 SSE로 `{type:'assigned', kind:'coop', code, teamId, teamName, teamColor, roles: [], owl}`; self면 `{type:'game-open', kind:'coop', code}`.

### 5.3 코드 저장 (`PUT /program {owl, doc, baseVersion}`)
- playing 중 + 팀원 + 팀이 done 아님 + 팀이 재생 잠금(`busy_until > now`) 아님 → 아니면 409 `not_editable`.
- doc: `parseDoc`(zod, 노드 80·깊이 8·20KB) + `validateCoop` 상한(`map.cap`)은 **저장에서는 검사하지 않고 실행에서 검사**(게임 1과 같이 편집 중 초과 허용, 실행 버튼 비활성). 역할 검사 없음.
- 버전: `baseVersion == version`일 때만 저장, version+1, 아니면 409 `version_conflict {doc, version, blocks}`. 성공 → SSE `program {teamId, owl, doc, version, blocks}` (그 팀 + 진행자).

### 5.4 실행 (`POST /run {round}`)
1. playing · 팀원 · 팀 사람 ≥ 3(`team_too_small`) · done 아님(`already_done`) · `round == team.round`(`not_editable`) · `busy_until <= now`(`run_busy`).
2. 4개 doc 모두 `validateCoop` 통과(빈 코드는 허용 — 그 부엉이는 쉰다. 단 4개가 모두 비면 400 `empty_program`). 하나라도 상한 초과 등 실패면 400 `invalid_program {owl, errors}`.
3. `runCoop(map, world, docs)` → `coop_runs` 행(seq+1, docs·trace·결과), `coop_worlds` 갱신, `coop_programs` 4개 모두 `doc '[]', blocks 0, version+1`, 팀 `runs+1, crumbles += n, run_seq = seq, busy_until = now + ticks×COOP_TICK_MS + 1500ms`.
4. 점수: `scoreRun(result, {round, remaining: secondsLeft(game), total: minutes×60})` → 팀 score += total, run 행에 points·lines.
5. 클리어면 `coop_clears` 행, `cleared_rounds+1`; round < 3이면 round+1·세계 초기화(다음 맵)·(프로그램은 이미 빔); round == 3이면 `done = 1, finished_at = now`.
6. 응답 `{seq, cleared, ticks, points, lines, nextRound, done}`. SSE: `run {teamId, seq}`(그 팀·진행자·보드), `teams`, `standings`.

### 5.5 처음부터 다시하기 (`POST /restart {round}`)
playing · 팀원 · done 아님 · busy 아님. 이번 라운드 세계를 `initialWorld`로, 프로그램 4개 `[]`(version+1), `restarts+1`. 점수 유지. SSE `teams` + `program`×4 + `run`(seq 그대로, 재생 없음 → 클라이언트는 `world` 갱신만).

### 5.6 순위 (`standings`)
정렬: score ↓ → cleared_rounds ↓ → crumbles ↑ → finished_at ↑(있는 팀 먼저) → seat ↑. 모두 같으면 같은 등수.

### 5.7 뷰모델 (`GET /state`)
```ts
interface CoopView {
  me: { userId; displayName; accountRole; isHost; ownsGame; teamId: string|null; owl: 0|1|2|3|null };
  game: { code; phase; mode; minutes; timerEndsAt; timerRemaining; startedAt; finishedAt; hostName };
  serverNow: string;
  maps: CoopMapPublic[3];        // 정답·traps 제외한 맵 (tiles·links·boxes·cap·base·intro·hints·label·name)
  teams: CoopTeamView[];         // { id, name, color, seat, round, done, score, runs, crumbles, restarts, clearedRounds, finishedAt,
                                 //   runSeq, busyUntil, members: [{ id, userId, displayName, owl, online }], world: CoopWorld,
                                 //   lastRun: CoopRunView | null }   // CoopRunView.trace·docs는 진행자·보드·자기 팀에만, 남의 팀엔 null
  myPrograms: [CoopProgramView×4] | null;   // { owl, doc, version, blocks } 자기 팀만
  standings: { teamId; rank; score; clearedRounds; crumbles; finishedAt }[];
  programs?: Record<teamId, [ProgramText×4]>;   // 진행자·보드만
  solutions?: Record<CoopRoundNo, string[4]>;    // 진행자만: 각 라운드 정답 4개의 toText
  joinUrls?: JoinUrl[];                          // 진행자·보드만
}
```
비참가자(코드를 아는 로그인 사용자)에게는 로비 수준(팀·사람·순위·맵)만, 코드·trace 없음(`/coop/join`이 쓴다).

### 5.8 실시간 (SSE `GET /events`, 채널 = coop_games.id)
```ts
type CoopEvent =
  | { type: 'hello'; serverNow }
  | { type: 'game' } | { type: 'teams' } | { type: 'standings' }
  | { type: 'program'; teamId; owl; doc; version; blocks }      // 그 팀 + 진행자
  | { type: 'run'; teamId; seq }                                 // 모두 (보드도)
  | { type: 'removed'; userId } | { type: 'deleted' };
```
`lib/server/realtime.ts`의 `BusEvent`에 `CoopEvent`를 더한다. `publish`·`setSubscriberTeam`·`onlineUserIds`는 그대로 쓴다(채널 id가 다르다).
클라이언트(`useCoop`): `program`은 버전이 크면 교체, `run`은 `/state` 재조회 뒤 재생 시작, 나머지는 `/state` 재조회(게임 1과 같은 규칙).

### 5.9 권한
- `/coop/host/*`·`/coop/board/*` 페이지와 진행자 API: 그 게임 진행자 또는 관리자. `/coop/<코드>`: 참가자(팀원 아니면 `/coop/join?code=`로).
- 변경 요청 Origin 검사·요청 크기·prepared statement는 게임 1과 같은 `handle`·`readJson` 사용.

---

## 6. 게임 1과의 연결점 (§10에 변경 목록)

- `activeGameOf(userId)` 옆에 `activeCoopOf(userId): {code, teamId, phase} | null`. `homePathFor`: 협동 게임 팀원이면 `/coop/<코드>`. `/lobby` 페이지·홈 "게임으로 돌아가기"도 협동 게임을 본다.
- `inOtherUnfinishedGame`(게임 1 참가)·협동 참가 모두 **양쪽 테이블**을 본다. `waitingUsers()`의 busy 집합도 협동 팀원을 뺀다.
- `/join?code=` 페이지: 코드가 협동 게임이면 `/coop/join?code=`로 redirect(서버 컴포넌트). `GameCodeForm`은 그대로.
- 대기실 SSE `assigned`·`game-open`에 `kind?: 'coop'` 필드(없으면 라운드 게임). `LobbyScreen`은 kind가 coop면 `/coop/<코드>` 또는 `/coop/join?code=`로 이동. `lobbyArrive`(늦게 온 사람 자동 배정)는 라운드·협동 통틀어 열린 auto 게임이 **정확히 하나**일 때만 배정한다.
- 진행자 홈 `/host` "새 게임" 패널 위에 탭 **라운드 게임 | 협동 게임**. 협동 탭: 팀 수 2~10(추천 = ceil(대기/4)), 시간 5~60분(기본 20), 배정 방식, 예상 인원, "N팀 · 협동 게임 만들기" → `/coop/host/<코드>`. "내 게임" 목록에 협동 게임도(`kind` 칩 "협동", 진행 링크 `/coop/host/`, 보드 `/coop/board/`).
- 홈(진행자·관리자) 빠른 실행 타일 "협동 게임 만들기" → `/host?mode=coop`. 홈 "진행 중 게임"에 협동 게임 포함.
- 관리자 게임 탭: 협동 게임도 목록·삭제(`DELETE /api/admin/coop/[code]`).

---

## 7. 화면

공통 디자인은 `docs/DESIGN_V4.md`·`docs/THEME_V5.md`(유리 패널, 보라 조명, 나이트·라이트 토큰만 사용). 부엉이 4마리 색: 1 보라 `--color-team-1`, 2 시안 `--color-team-3`, 3 호박 `--color-team-5`, 4 장밋빛 `--color-team-6` — 스프라이트에 번호 배지 + 같은 색 링.

### 7.1 `/coop/join` (폰)
게임 코드 → 팀 카드(이름·색·사람 n/6, 3명 미만이면 "3명 이상 필요" 알약) → 부엉이 자리 1~4(맡은 사람 아바타, 여러 명 가능) → 참가 → `/coop/<코드>`. 이미 팀원이면 바로 이동.

### 7.2 `/coop/<코드>` 팀 화면 (폰 390px에서 완결, 데스크톱 2열)
```
머리: 맵 이름 · [이지] 1/3 · ⏱ 타이머 링 · 점수 · 연결
맵 10×10 (탭 = 전체화면). 4마리 부엉이(번호·색), 색 상태 배지(빨강/파랑), 상자 n개 남음, 이번 라운드 규칙 힌트(접이식)
부엉이 탭 [1 ● 나] [2] [3] [4]  — 맡은 사람 아바타, 블록 수 n/12
ProgramEditor (선택한 부엉이 코드, palette=COOP_BLOCKS, 역할 제한 없음) + 네온 코드 뷰
하단 바: [처음부터 다시하기] [실행 ▶]   실행 = 팀원 누구나. 사람 3명 미만·재생 중·done·비어 있음이면 비활성 + 이유
```
- 저장은 게임 1과 같은 디바운스 PUT + 409 처리(`useProgramSync`를 부엉이별로 일반화하거나 협동용 훅 `useCoopPrograms`).
- **실행 뒤 재생**(§9): 모든 팀원 폰이 같은 trace를 같은 속도로 재생한다(500ms/틱). 재생 중 편집기는 잠기고(오버레이 "실행 중"), 무너지는 줄·카드 연출. 끝나면 결과 시트: 점수 줄, 클리어면 "노멀로!" 전환 연출, 하드 클리어면 "완주!". 편집기는 비워진다(서버가 비웠다).
- 처음부터 다시하기: 확인 시트 "이번 라운드를 처음부터 다시 해요. 점수는 그대로예요."
- finished: 최종 순위 + 우리 팀 결과.

### 7.3 `/coop/host/<코드>` 진행자 콘솔 (데스크톱)
왼쪽 "진행"(페이즈·타이머 링·**시작/일시정지/재개/+30초/끝내기**·참가 안내(주소·코드)·보드 열기) + "대기실"(대기 인원·더 데려오기·넣기) · 가운데 "팀" 표(팀·사람 n/6(3 미만 경고)·라운드·점수·실행 수·무너짐·재시작·완주) + 순위 · 오른쪽 "선택한 팀"(세계 미니맵 · 부엉이 4개 코드 뷰 · 마지막 실행 결과 · 팀원 자리·옮기기·내보내기 · **정답 보기** 토글(라운드별 4개 코드)).
시작 버튼은 조건이 안 맞으면 이유를 보여 준다("소쩍새 팀 2명: 3명 이상 필요").

### 7.4 `/coop/board/<코드>` 프로젝터 (1920×1080, 셸 없음, `Stage` 재사용)
- lobby: 게임 코드·주소 크게 + 팀별 사람 수(3 미만 경고).
- playing: 위 띠(로고 · 협동 게임 · 타이머 **크게** · 게임 코드). 왼쪽 순위(10행: 등수·팀 색·이름·점수·라운드 칩 이지/노멀/하드·완주 ✓). 오른쪽 팀 미니 세계 격자(팀 수에 따라 2~5열): 팀 이름·라운드·부엉이 4마리 현재 위치·색 상태. 어떤 팀이 실행하면 그 카드가 **재생**(작게, 500ms/틱)하고 테두리가 빛난다(`run` 이벤트 → 그 팀 lastRun.trace). 클리어 순간 카드 글로우 + "노멀 진입!" 배지 2초.
- finished: 최종 순위(1~3위 강조, 게임 1 `FinalScoreboard` 모양).
- 새로고침하면 재생 없이 현재 세계만.

---

## 8. 협동 팔레트·편집기·코드 뷰 (공용 컴포넌트 확장점)

- `ProgramEditor`: `palette?: readonly BlockId[]`(§2), `crumbled?: readonly string[]`(무너진 블록 uid 목록 → `StackView`/`BlockView`가 `data-crumble` 속성을 붙이고 CSS가 무너짐 애니메이션(0.7s: 기울며 떨어지고 흩어져 투명, 그 뒤 높이 0)). 무너진 뒤에도 문서에서는 지우지 않는다(재생 끝나면 부모가 문서를 교체한다).
- `CodeView`: `crumbledPaths?: readonly (readonly number[])[]` → 해당 `owner` 경로의 줄에 `data-crumble` → CSS: 글자가 좌우로 흩어지며(letter-spacing↑, blur, 아래로 떨어짐) 0.6s 뒤 줄 높이 0. `highlightPath`는 그대로(현재 실행 줄).
- 팔레트 카드 `toggle`·`spawn`은 `.blk.special` 색(핑크)으로 그린다. 아이콘은 §2.

---

## 9. 재생 (`CoopPlayback`)

- 시계: `startedAt`(performance.now) 기준, 틱 t의 프레임 = `trace[min(floor(elapsed / 500ms), ticks)]`. 새로고침·늦게 들어온 사람은 마지막 프레임.
- 한 틱: 4마리 `MapActor` 이동(400ms transition), 밀린 부엉이·상자도 이동. 실패한 행동은 부엉이가 앞으로 살짝 튕겼다 돌아오는 shake(200ms) + 토스트 문구(그 부엉이 색). 성공 이벤트는 작은 배지(쥐·비트·문).
- 색 바꾸기: 맵의 R·B 구역이 밝아지고/어두워지며(200ms) 상단 색 배지 전환.
- 무너짐: `actions[].ok === false`인 틱에 그 부엉이 코드 뷰의 줄(`path`)과 편집기 카드(uid ← `docs[owl]`에서 `path`로 찾는다)가 무너진다. 그 뒤 프레임에서는 사라진 채(높이 0) 유지.
- 클리어 틱: 둥지 글로우 + "클리어!" 띠 1.5s. 완주면 "완주!".
- `prefers-reduced-motion`: 이동·무너짐은 즉시 전환(투명도만).

---

## 10. 변경 목록 (게임 1 코드에 손대는 곳 — 이 밖에는 새 파일만)

| 파일 | 변경 |
|---|---|
| `engine/types.ts` `blocks.ts` `text.ts` `validate.ts` `run.ts` | §2 블록 2개, `E_COOP_ONLY`, compileError |
| `engine/verify-core.ts` | 협동 블록이 ROLES에 없음·게임 1 validate가 거절함 검사 추가 |
| `lib/server/docSchema.ts` `lib/codegen/python.ts` `korean.ts` `components/blocks/BlockIcon.tsx` | 블록 2개 |
| `components/blocks/ProgramEditor.tsx` `Palette.tsx` `StackView.tsx` `BlockView.tsx` `components/code/CodeView.tsx` `app/globals.css` | `palette`·`crumbled`·`crumbledPaths` prop + 무너짐 CSS |
| `scripts/sync-engine.mjs` | `coop`, `coop/maps` 복사 |
| `lib/server/db.ts` | v3 스키마(§4) |
| `lib/server/realtime.ts` | `BusEvent`에 CoopEvent |
| `lib/contracts.ts` | `LobbyEvent.assigned/game-open`에 `kind?: 'coop'`, `owl?`; `GameSummary.kind?: 'round' \| 'coop'` |
| `lib/server/game/rows.ts` `waiting.ts` `lobbyFeed.ts` `lobby.ts` | §6 연결점(activeCoopOf 합류, busy 집합, pickCode 양쪽, lobbyArrive) |
| `app/join/page.tsx` `components/lobby/LobbyScreen.tsx` `lib/client/useLobby.ts` | 협동 코드 분기 |
| `components/host/HostHome.tsx` `app/host/page.tsx` `components/lobby/HomeViews.tsx` `app/page.tsx` `components/admin/GamesTab.tsx` | 협동 게임 만들기·목록 |
| `package.json` | `verify:coop`, `e2e:coop` 스크립트 |
| `README.md` | 협동 게임 진행 안내 절 |

---

## 11. 수용 기준

1. `npm run verify`(게임 1, 기존 338 + 추가) · `npm run verify:coop` · `npx tsc --noEmit` · `npm test` 전부 통과.
2. `npm run e2e:coop`(개발 서버 대상): 관리자 → 초대 → 참가자 8명 가입 → 진행자 협동 게임 2팀(20분) → 3명 미만 팀이 있으면 시작 거부(`team_too_small`) → 4명·4명 → 시작 → A팀: 이지 정답 4개 저장 → 실행 → cleared·points·round 2 → 노멀 함정 실행 → 무너짐 n·not cleared·세계 지속 → 처음부터 다시하기 → 정답 → 클리어 → 하드 정답 → 완주 → B팀 일부 → 진행자 끝내기 → 순위 A 1위. 버전 충돌 409, 남의 팀 코드 열람 불가(403/빈 값), 비참가자 trace 없음.
3. 브라우저: 폰 390px 팀 화면에서 부엉이 탭 전환·카드 연결·실행·재생(4마리 동시 이동·무너짐 연출)·다시하기; 진행자 콘솔 시작 조건 안내; 보드 미니 세계 재생·순위. 나이트·라이트 모두.
