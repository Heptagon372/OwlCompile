# 라운드 게임 R8·R9·R10 명세 (게임 1 확장)

사용자 요청(2026-09-15): "7라운드까지 내뚜고 다음 라운드도 만들어줘" — R1~R7은 **파일·수치 불변**, 그 뒤에 R8·R9·R10을 더한다.
엔진 의미론(`docs/ENGINE_SPEC.md` §6)·점수(§7)·검증 방식(§9)은 그대로다. 이 문서는 §8 라운드 표의 연장이다.

## 1. 라운드 표 (추가)

| R | name | difficulty | cap | seconds | intro(새 요소) | 고양이 |
|---|---|---|---|---|---|---|
| 8 | 고리 순찰 | 매우 어려움 | 9 | 720 | 고리를 도는 고양이 (loop) | loop |
| 9 | 두 갈래 열쇠 | 매우 어려움 | 10 | 780 | 열쇠를 먼저 찾아 되돌아오는 길 | 없음 또는 pingpong |
| 10 | 부엉이의 왕 | 극한 | 10 | 900 | 총정리 (고리 고양이 + 열쇠·문 + 구덩이 + 함수 속 조건 + 잠자기) | loop |

- `GameMap.round`는 `1 | … | 10`, `difficulty`에 `'극한'` 추가. 표시 난이도 = 라운드 번호(1~10).
- 이름·수치는 설계 결과에 따라 바뀔 수 있으나 **cap ≤ 10, 열쇠 ≤ 1, 문 ≤ 1, 쥐 ≤ 14**(verify-search 한계) 안에서 정한다. 8×8 그대로.
- R8은 **loop 모드 고양이**(닫힌 고리)를 처음 쓴다(R5·R7은 pingpong). R10은 R7보다 어려워야 한다: 잠자기 + 조건 + 함수(또는 반복 중첩)를 모두 요구.

## 2. 각 라운드 파일이 export 하는 것 (ENGINE_SPEC §8 그대로)

```ts
export const map: GameMap;
export const solutions: Program[];      // [0] 대표 정답
export const expect: { outcome; ticks; mice; blocks; score }[];
export const naive: { program: Program; note: string };
export const noSleep?: Program;         // 고양이 라운드: 잠자기만 뺀 실패 버전 (어느 틱·어느 칸에서 죽는지 주석·검사)
```
파일 머리에 R6·R7처럼 **맵 그림·의도한 경로(틱별)·함정·알려진 한계**를 주석으로 적는다.

## 3. verify-rounds에 더할 검사 (라운드마다)

1. 구조: `checkMap` 통과, 표(§1)와 name·difficulty·cap·seconds·intro 일치, 고양이 path가 'c' 칸·인접·(loop면 닫힌 고리).
2. 정답: `validate` 통과, 실행 결과 = `expect`(outcome·ticks·mice·blocks·score). 대표 정답은 상한 이내이고 goal.
3. 함정: `naive`는 상한 초과(E_CAP) 또는 명시된 실패, `noSleep`은 명시된 틱·칸에서 dead.
4. **새 요소 필요성**(빠짐없는 탐색, `verify-search`): 라운드마다 최소 2개. 예) R8 "잠자기 없는 액션 열로는 둥지 불가(BFS)"·"조건 없이(함수 허용) 상한 안에서 대표 정답 점수 이상 불가"; R9 "if_pit(또는 if_wall) 없이 상한 안에서 대표 정답 점수 이상 불가"·"문을 벽으로 두면 둥지 도달 불가(BFS)"; R10 "잠자기 없이 둥지 불가"·"조건 없이 불가"·"문 없이는 불가".
5. 함수 한계(§8 R6·R7): 정답에 def를 쓰면 같은 동작의 def 없는 답도 `solutions[1]`로 싣고 "함수 없이 그 점수보다 높은 프로그램 없음"을 탐색으로 확인한다(가능한 범위에서).
6. 전체 `npm run verify` 실행 시간이 **3분을 넘지 않게** 탐색 범위를 정한다(크기 9~10 def 탐색은 R7처럼 생략 가능, 생략은 주석에 이유).

## 4. 배관 (라운드 1~10)

| 위치 | 변경 |
|---|---|
| `engine/types.ts` `maps.ts` `rounds/index.ts` `solutions.ts` `verify-rounds.ts` | round 1~10, MAPS/MAP_LIST/SOLUTIONS/ROUND_EXTRAS r8~r10, TABLE·ROUNDS·CAT_ROUNDS |
| `lib/contracts.ts` | `RoundNo` 1~10, `ALL_ROUNDS` 1~10, `isRoundList` 상한 10, 프리셋: 입문 [1,2,3] · 표준 [1..5] · 전체 [1..10] · 도전 [4..7] · 심화 [8,9,10] |
| `lib/server/db.ts` | v3: games.round `between 1 and 10` (rebuildTable) — `docs/COOP_SPEC.md` §4의 협동 테이블과 같은 v3 |
| `app/api/games/[code]/program/route.ts` `submit/route.ts` | zod `max(10)` |
| `lib/server/game/rows.ts` `lobby.ts` | availableRounds ≤ 10, 오류 문구 1~10 |
| `components/host/HostHome.tsx` | 라운드 칩 10개(폰 4열 → 넓으면 5열 2줄), aria-label 1~10 |
| `components/lobby/HomeViews.tsx` | RoundsPanel 격자 10개(2xl 5열) |
| `tests/lobby.test.ts` `migration.test.ts` | 10라운드 게임, v3 `between 1 and 10`, 11 거절 |
| `scripts/e2e-api.ts` | `HAS_R67` → 엔진에 있는 라운드 전부(1~10)로 게임 하나 더 돌리기(가능하면) |
| `README.md` `docs/ENGINE_SPEC.md` §8 | 라운드 표 8~10 줄 추가 (짧게, 이 문서 참조) |
