# OWL COMPILE — 공통 설계 결정 (모든 설계 섹션이 따르는 기준)

브리프(`plan/CLAUDE.md`)가 비워 둔 곳을 여기서 확정한다. 섹션 문서끼리 수치·용어가 어긋나면 이 문서가 이긴다.
엔진 의미론은 `docs/ENGINE_SPEC.md`가 기준.

## A. 용어
- 게임(game) · 팀(team) · 팀원(member) · 역할(role: runner/turner/controller/architect) · 라운드(round 1~5) · 페이즈(phase)
- 프로그램 문서(programs.doc = `Block[]`) · 제출(submit) · 봉인(sealed) · 실행(run) · 재생(playback) · 패치권(patch)
- 화면: 참가(`/`), 팀 편집기(`/play`), 진행자(`/host`), 보드(`/board`)
- 문체: 설계 문서는 "~한다/~이다" 개조식. 대문자 영문 라벨 금지(브리프 §5).

## B. 클라이언트 상태/스택
- Next.js 15 App Router, TypeScript strict, Tailwind. 클라이언트 컴포넌트 위주(실시간 구독). 서버 액션 없음.
- 상태: `zustand` 스토어 3개 — `useSession`(localStorage 미러: gameId/teamId/memberId/role), `useGame`(games/teams/members 실시간 캐시), `useProgram`(팀 프로그램 문서 + 커서 + 로컬 version).
- 엔진 호출 위치: `/host`(run·validate·score·toText), `/play`(countBlocks·validate만), `/board`(toText만, trace는 results에서 읽음). 엔진 코드는 `lib/engine/`으로 그대로 복사.
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. 그 외 없음.

## C. 데이터 모델 보강 (브리프 §4 스키마 + 아래 추가)
- `members.game_id`, `programs.game_id`, `results.game_id` 컬럼 추가(비정규화) → Realtime 필터를 전부 `game_id=eq.<id>` 하나로 통일한다.
- `games.timer_remaining int` 추가: 일시정지 시 남은 초를 저장하고 `timer_ends_at`을 null로. 재개 시 `timer_ends_at = now() + timer_remaining`.
- `games.autoplay boolean default true`: 재생 끝나면 자동으로 다음 팀으로.
- `games.server_now`는 두지 않는다. 시각 보정은 §E.
- RPC 2개(plpgsql, security definer 아님, anon 호출 가능):
  - `submit_program(p_team uuid, p_round int, p_doc jsonb) returns programs` — 트랜잭션 안에서 `pg_advisory_xact_lock(hashtext(game_id||round))` 후 `submit_order = coalesce(max(submit_order),0)+1`, `submitted_at = now()` 설정. 이미 제출됐으면 그대로 반환(멱등).
  - `heartbeat(p_member uuid)` — `members.last_seen = now()`.
- 인덱스: `programs(game_id, round)`, `results(game_id, round)`, `members(game_id)`.

## D. 실시간 동기화 규약
- 클라이언트당 Supabase 채널 1개: `game:<gameId>`. `postgres_changes` 구독은 테이블별 `game_id=eq.<gameId>` 필터. 보드/진행자는 전 테이블, 팀 편집기는 games·teams·members·programs(자기 팀만 사용, 필터는 game_id).
- 프로그램 문서 동기화 = **낙관적 갱신 + 버전 비교(마지막 저장 승리)**:
  1. 로컬 편집 즉시 화면 반영, `version+1`을 로컬에 기록.
  2. 150ms 디바운스 후 `update programs set doc=:doc, version=:v where team_id=:t and round=:r and version < :v`.
  3. 영향 행 0이면(서버가 더 큼) 서버 행을 다시 읽어 로컬을 교체하고 토스트 "다른 팀원이 먼저 저장했어요".
  4. Realtime UPDATE 수신 시 `payload.version > local.version`이면 교체, 아니면 무시.
  5. 커서 위치는 로컬 전용(동기화 안 함). 교체 후 커서가 가리키던 경로가 사라지면 커서를 스택 끝으로.
- 하트비트: 팀 편집기가 10초마다 `heartbeat()`. `last_seen`이 25초 이상 지나면 오프라인 표시. 탭 비활성화(visibilitychange) 시에도 계속 보낸다.
- Realtime 재연결: 채널 `CLOSED`/`CHANNEL_ERROR` 시 지수 백오프(1s→8s) 재구독 후 **전체 스냅샷 재조회**(놓친 이벤트 보정). 모든 화면 공통 훅 `useGameChannel(gameId)`.

## E. 시각/타이머
- 기준 시각은 서버(Postgres `now()`). 클라이언트는 첫 요청 때 `select now()`로 오프셋(서버−로컬)을 구해 저장하고 60초마다 갱신.
- 남은 시간 = `timer_ends_at − (localNow + offset)`. 화면 갱신 250ms.
- 만료 감지는 **진행자 화면**만 한다(브리프). 진행자 화면이 `coding`에서 남은 시간 ≤ 0을 보면 `phase='sealed'`로 전이. 팀 화면은 0:00에서 멈추고 읽기 전용으로만 바뀐다(자기 전이 금지, 이중 전이 방지).
- `+30초` = `timer_ends_at += 30s`. 일시정지/재개는 §C `timer_remaining`.

## F. 페이즈 전이 (진행자만 쓴다)
`lobby → coding → sealed → running → scored → (round<5 ? coding : finished)`
- `coding` 진입: `round` 확정, `timer_ends_at = now()+seconds`, 각 팀 `programs(team_id, round)` 행 upsert(doc `[]`, version 0).
- `sealed` 진입: 미제출 팀은 진행자 화면이 현재 `doc`으로 **자동 제출**(`submit_program` 호출, 순서는 봉인 시점 순). 자동 제출은 "최초 제출 +10" 대상이 될 수 있으나(수동 제출이 하나도 없던 경우) 실제로는 거의 없다 — 그대로 둔다.
- `running` 진입: 진행자 화면이 `submit_order` 순으로 팀을 돌며 (a) `validate` 실패면 `outcome:'error', message:'컴파일 에러: …', ticks 0, trace [초기 프레임]`으로 결과 저장, (b) 통과면 `run()` → `score()` → `results` upsert, `running_team_id` 갱신 → 보드가 재생. 재생 길이 = `ticks × 600ms + 2000ms(결말 연출)`. `autoplay`면 그 시간 + 3초 후 다음 팀, 아니면 진행자가 "다음 팀". 마지막 프레임은 다음 팀으로 넘어가기 전까지 유지.
- 패치권: `running` 중 `outcome ∈ {error, dead, stuck}`인 팀에 "패치 허용" 버튼. 누르면 `teams.patch_left=0`, 해당 팀 `programs.submitted_at=null`(봉인 해제, `submit_order`는 유지) → 팀이 수정·재제출 → 진행자 "재실행" → `results` 덮어쓰기(`used_patch=true`, 점수에 −10). 패치는 그 라운드 실행 흐름 안에서만 가능(scored 이후 불가).
- `scored` 진입: 진행자가 이벤트 카드 수동 점수(있으면)를 `results.score`에 반영하고 확정. 누적 = 라운드별 `results.score` 합.
- 동점: 누적 동점이면 (1) 둥지 도착 라운드 수 많은 팀, (2) 총 틱 수 적은 팀 순. 그래도 같으면 공동 순위.
- 되돌리기: 진행자 화면에 "이전 페이즈로" 버튼(사고 대응용). `running→sealed`로 돌아가면 그 라운드 `results` 삭제.

## G. 편집기 상호작용 (폰 390px)
- **커서 모델**: 스택 안의 "삽입 지점". 블록을 탭하면 그 블록 **뒤**가 커서, C-블록 머리를 탭하면 그 입의 **맨 앞**이 커서, 빈 입/`아니면` 줄을 탭하면 그 입의 끝, 스택 빈 곳 탭 = 최상위 끝. 커서는 얇은 보라색 가로선 + 작은 ◀.
- 팔레트 탭 = 커서 위치에 삽입(내 역할 블록만 팔레트에 있음). 삽입 후 커서는 새 블록 뒤(C-블록이면 그 입 안).
- 블록 길게 누르기(450ms) = 삭제 확인 없이 삭제 + 3초 "되돌리기" 토스트(로컬 되돌리기: 삭제 전 doc 스냅샷 복원 후 저장). C-블록 삭제는 안의 블록까지 함께 삭제.
- 드래그(dnd-kit, PointerSensor 250ms 지연·5px 허용)는 보조: 같은 스택 안/다른 입으로 이동만. 남의 블록도 이동·삭제 가능(브리프).
- 반복 N 탭 = 1~9 바텀시트 피커. 기본 N=2.
- `def` 삽입은 최상위 커서에서만 활성, 이미 있으면 팔레트에서 비활성. `call`은 `def`가 있어야 활성. `def` 안에 커서가 있으면 `call` 비활성(재귀 금지). — 전부 `validate`와 같은 규칙을 팔레트 단계에서 미리 막는 것이고, 최종 판정은 `validate`.
- 상단 카운터 `n/cap`: `countBlocks`. 초과 시 빨강 + 제출 비활성. 제출 버튼은 architect에게만 렌더.
- 제출 = 확인 시트("봉인하면 수정 불가") → `submit_program`. 제출 후 스택 위에 "봉인됨" 오버레이. 페이즈가 `coding`이 아니면 읽기 전용(팔레트 숨김, 롱프레스 무시).
- 블록 스타일은 `plan/cards.html`의 `.blk/.cblk/.mouth/.else/.foot` CSS를 `components/blocks/*`로 이식. 폰에서는 `--blk-h 44px`, 폰트 17px, 폭 100%.

## H. 보드 재생
- 틱 600ms. 부엉이 이동은 CSS transform 전환 450ms, 회전 300ms. 고양이도 동일.
- 코드 패널: `toText(doc).lines`를 그대로 출력, 현재 `Step.line`을 하이라이트(배경 `--owl` 30%, 좌측 바). C-블록 머리 줄은 하이라이트하지 않는다(0틱).
- 이벤트 토스트(하단 중앙, 1.2초): `Step.message` 그대로. 결말 연출: `dead`/`error` 화면 흔들림 400ms + 메시지 크게 1.5초, `goal` 둥지 글로우 + 점수 팝(점수 줄 순서대로 300ms 간격).
- 보드 새로고침 복구: `games.running_team_id`와 `results` 행에서 즉시 마지막 프레임을 재구성(재생은 처음부터 다시 하지 않고 마지막 프레임 표시).
- 렌더 규칙은 브리프 §2 타일 표 그대로. 먹은 쥐/주운 열쇠는 `Step.eaten/taken`으로 제거, 열린 문은 `Step.opened`로 반투명.

## I. 참가/신원
- `/`에서 코드 4자리 → 팀 선택 → 역할 선택(이미 찬 역할은 비활성) → `members` insert(unique(team_id, role) 충돌 시 "방금 다른 사람이 골랐어요") → localStorage 저장 → `/play`.
- 새로고침·재접속: localStorage의 memberId로 `members` 행이 있으면 바로 복귀. 없으면(진행자가 지움) `/`로.
- 진행자 화면에서 팀원 행 삭제 가능(폰 고장 대응) → 그 역할이 다시 빈 역할이 된다.

## J. 이벤트 카드 (진행자 재량, 텍스트 안내 + 수동 점수)
- 코드 리뷰: `scored` 전에 다른 팀 코드 한 개를 보드에 띄우고 30초 안에 버그/개선점 말하기, 맞히면 +10(진행자 입력).
- 핫픽스: 실행 전 진행자가 무작위 팀의 블록 1개를 가리고 "이 블록이 없으면 어떻게 되나" 맞히기, 맞히면 +5.
- 엔진/점수 로직에 넣지 않는다. `results.score`에 진행자가 더하는 수동 보정란만 둔다(`results.score_lines`에 `{label:'이벤트: …', points}` 추가).

## K. 안 하는 것 (브리프 §7 + 추가)
로그인, 채팅, 맵 에디터, 팀 화면 시뮬레이터, 리플레이 저장, 테마 전환, CRDT, 서비스워커/오프라인, 다국어.
