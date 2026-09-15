# OWL COMPILE — 빌드 브리프 (Claude Code용)

S.OWL 오리엔테이션용 팀 코딩 게임. 4명이 한 팀. 블록 명령어를 조립해 부엉이를 둥지까지 보낸다.
진행자가 "실행"을 누르면 팀 코드가 프로젝터에서 한 틱씩 재생된다. 버그는 전원 앞에서 터진다.

이 문서가 유일한 스펙이다. 대화 기록 없이 이 파일 + `engine/` + `cards.html`만으로 만든다.

---

## 0. 절대 규칙

1. `engine/`은 수정하지 않는다. 이미 검증 완료(`npx tsx engine/verify.ts` 전부 통과). UI는 `run()`이 돌려주는 `trace`만 소비한다.
2. 게임 로직을 UI에 다시 쓰지 않는다. 블록 수 세기 → `countBlocks`, 제출 가능 여부 → `validate`, 점수 → `score`. 전부 엔진에 있다.
3. 팀 화면에 시뮬레이션/미리 실행 기능을 넣지 않는다. 머리로 시뮬하는 게 게임이다.
4. 로그인 없음. 게임 코드 + 팀 선택 + 역할 선택으로 참가.
5. 모바일 우선. 팀 화면은 폰 세로(390px)에서 완결돼야 한다. 진행자/프로젝터 화면은 데스크톱.

---

## 1. 스택

- Next.js 15 App Router + TypeScript + Tailwind
- Supabase: Postgres + Realtime (Postgres Changes). 인증 안 씀, anon key + RLS는 "전부 허용" (행사용 1회성)
- 드래그앤드롭: `@dnd-kit/core` + `@dnd-kit/sortable`. 모바일은 탭-삽입을 기본으로, DnD는 보조
- 배포: Vercel
- 폴더:
  ```
  app/
    page.tsx              참가 (/)
    play/page.tsx         팀 편집기
    host/page.tsx         진행자
    board/page.tsx        프로젝터
  lib/engine/             ← 이 저장소의 engine/ 그대로 복사
  lib/supabase.ts
  components/blocks/      BlockCard, CBlock, Palette, ProgramStack
  components/map/         MapGrid, OwlSprite, CatSprite
  components/board/       Playback, Scoreboard
  ```

---

## 2. 게임 규칙 (엔진에 구현된 그대로)

### 맵
- 8×8. 좌표 (x, y), 왼쪽 위 (0,0). 부엉이는 방향(N/E/S/W)을 가진다.
- 타일 문자 → 렌더링

  | 문자 | 의미 | 렌더 |
  |---|---|---|
  | `.` | 바닥 | 어두운 보라 사각형 |
  | `#` | 벽 | 밝은 보라회색 블록 |
  | `O` | 구덩이 | 검은 원, 안쪽 그림자 |
  | `M` | 쥐 (+20) | 🐭 |
  | `K` | 열쇠 | 🔑 |
  | `D` | 문 (열쇠 필요) | 🚪, 열리면 반투명 |
  | `S` | 시작 (바닥) | 부엉이 스프라이트 + 방향 화살표 |
  | `G` | 둥지 (도착) | 금색 링 + 은은한 글로우 |
  | `c` | 고양이 순찰로 (바닥) | 바닥 + 분홍 점선 테두리, 고양이 🐱 |

- 맵 밖 = 벽. 잠긴 문 = 벽 취급.

### 블록 10종 (`engine/blocks.ts`의 `BLOCKS`)

| id | 라벨 | 분류/색 | 역할 | 틱 | 모양 |
|---|---|---|---|---|---|
| forward | 앞으로 | 이동 `#8E5CFF` | Runner | 1 | 일반 |
| jump | 점프 | 이동 | Runner | 1 | 일반 |
| left | 좌회전 | 회전 `#2FC4D9` | Turner | 1 | 일반 |
| right | 우회전 | 회전 | Turner | 1 | 일반 |
| repeat | 반복 N | 제어 `#FFB020` | Controller | 0 | C (입 1개, N=1~9) |
| if_wall | 만약 앞이 벽이면 | 제어 | Controller | 0 | C (입 2개: 그러면/아니면) |
| if_pit | 만약 앞이 구덩이면 | 제어 | Controller | 0 | C (입 2개) |
| def | 함수 F | 함수 `#3DD68C` | Architect | 0 | C (입 1개, 최상위만, 1개만) |
| call | F 호출 | 함수 | Architect | 0 | 일반 |
| sleep | 잠자기 | 특수 `#FF6B9A` | Architect | 1 | 일반 |

- 블록 수 = 카드 1장 = 1. C-블록도 1 (안의 블록은 따로 셈). 중괄호/아니면은 안 셈.
- 프로그램 AST는 `engine/types.ts`의 `Block`. 편집기는 이 구조를 그대로 상태로 쓴다.

### 틱
- 앞으로/점프/좌회전/우회전/잠자기 = 1틱. 제어/함수 = 0틱.
- 매 틱: 부엉이 행동 → 둥지면 즉시 종료 → 고양이 1칸 이동 → 같은 칸이면 사망.
- 점프 = 정확히 2칸. 중간 칸의 구덩이는 넘고 벽은 못 넘음. 중간 칸의 쥐는 못 먹음.
- 구덩이 진입 = 사망. 고양이와 같은 칸 = 사망. 벽/잠긴 문 진입 = 에러(그 자리 정지).

### 역할 = "분산 컴파일"
- 팀 4명이 각각 Runner / Turner / Controller / Architect. 팔레트에는 자기 역할 블록만 보인다.
- 남이 놓은 블록은 옮기고 지울 수 있지만 새로 놓지는 못한다.
- 제출은 Architect만.

### 라운드 (`engine/maps.ts`)

| R | 이름 | 난이도 | 상한 | 코딩 시간 | 새 요소 |
|---|---|---|---|---|---|
| 1 | Hello, Owl | 쉬움 | 12 | 5분 | 앞으로·회전·반복 |
| 2 | 구덩이 지대 | 쉬움 | 12 | 6분 | 점프·함수 |
| 3 | 나선 | 중간 | 7 | 7분 | 만약 앞이 벽이면 |
| 4 | 열쇠와 계단 | 중간 | 10 | 8분 | 열쇠·문·만약 앞이 구덩이면 |
| 5 | 고양이 순찰 | 어려움 | 9 | 10분 | 움직이는 고양이·잠자기 |

정답은 `engine/solutions.ts`. 진행자 화면에서만 볼 수 있다.

### 점수 (`score()` 그대로)
- 둥지 도착 +100 · 쥐 1마리 +20 · 코드 골프 (상한 − 사용 블록) × 5 · 최초 제출 팀 +10 · 패치권 사용 −10
- 미도착: 40 − 남은 맨해튼 거리 × 5 (최소 0) + 쥐
- 사망(구덩이·고양이): 0 (쥐 무효)

### 패치권
- 팀당 게임 전체 1장. 실행이 멈췄을 때 진행자가 "패치 허용" → 그 팀 편집기만 잠금 해제 → 재제출(상한 이내) → 재실행, −10점. 블록 1개 변경 제한은 진행자가 눈으로 판단(코드로 강제하지 않음).

---

## 3. 화면

### `/` 참가
게임 코드(4자리) 입력 → 팀 선택(팀 이름 + 색) → 역할 선택(빈 역할만 활성) → `/play`.
`localStorage`에 `{gameId, teamId, memberId, role}` 저장, 새로고침해도 복귀.

### `/play` 팀 편집기 (폰)
```
┌────────────────────────┐
│ R3 나선   ⏱ 04:12   7/7│  ← 라운드, 타이머, 블록 n/상한 (초과 시 빨강)
├────────────────────────┤
│ [맵 미니 8×8]           │  ← 탭하면 전체화면
├────────────────────────┤
│ 프로그램 스택            │  ← 세로 스택, C-블록 입 안에 들여쓰기
│  반복 ⑷ {               │     블록 탭 = 선택(커서), 길게 = 삭제
│    만약 앞이 벽이면 {     │     반복 N 탭 = 1~9 피커
│      우회전              │
│    } 아니면 {            │
│      앞으로 ◀ 커서       │
│    }                    │
│  }                      │
├────────────────────────┤
│ 팔레트 (내 역할만)        │  ← 탭하면 커서 위치에 삽입
│ [앞으로] [점프]          │
├────────────────────────┤
│ 팀원: 🟣러너 🔵터너 …    │  ← 접속 상태
│         [ 제출 ] (Architect만)│
└────────────────────────┘
```
- 블록 모양/색/폰트는 `cards.html`의 CSS를 그대로 이식한다 (`.blk`, `.cblk`, `.mouth`, `.foot`, 노치 pseudo-element).
- 동기화: 팀의 `programs.doc`(jsonb)를 실시간 구독. 편집 시 `version+1`로 낙관적 업데이트, 서버 버전이 더 크면 서버 것으로 교체(마지막 저장 승리). 4명이 동시에 같은 블록을 만지는 일은 드물다 — 복잡한 CRDT 안 한다.
- 제출 후: 스택 잠금 + "봉인됨" 오버레이. 패치 허용 시 해제.
- 페이즈가 `coding`이 아니면 스택 읽기 전용.

### `/host` 진행자 (데스크톱)
- 게임 생성: 팀 수(4~6), 팀 이름 자동(부엉이 종류: 수리부엉이/올빼미/소쩍새/흰올빼미/금눈쇠올빼미/칡부엉이).
- 라운드 패널: 현재 페이즈, 버튼 하나로 다음 페이즈. 타이머 시작/일시정지/+30초.
- 팀 표: 접속 인원(4/4), 블록 수, 제출 시각, 결과, 점수. 제출 코드 텍스트(`toText`) 미리보기.
- 실행: "전체 실행" 누르면 제출 순서대로 팀 하나씩 `run()` → `results` 저장 → 보드가 재생. 팀 하나 재생 끝나면 다음 팀 자동. "패치 허용" 버튼은 정지/사망 팀에만.
- 정답 보기 토글(`SOLUTIONS`), 이벤트 카드 토글(코드 리뷰·핫픽스 — 텍스트 안내만, 점수는 수동 입력란).
- 점수판 확정 → 다음 라운드. 5라운드 끝나면 `finished` → 최종 순위.

### `/board` 프로젝터 (1920×1080, 어두운 배경)
- 페이즈별 화면
  - `lobby`: 게임 코드 크게 + 팀별 접속 인원
  - `coding`: 맵 크게 + 타이머 크게 + 팀별 "제출 완료" 표시 (블록 수 공개, 코드는 비공개)
  - `running`: 왼쪽 맵(부엉이 애니메이션), 오른쪽 현재 팀 코드 텍스트(실행 중 줄 하이라이트), 하단 이벤트 토스트("쥐 획득", "문 통과", "벽에 부딪혔다")
  - `scored`: 라운드 점수 + 누적 순위
- 재생: `trace`를 틱당 600ms로 순회. 부엉이는 칸 사이를 보간 이동, 회전은 스프라이트 회전. 고양이는 `step.cat`으로 이동. `outcome`이 `dead`/`error`면 마지막 틱에서 화면 흔들림 + 메시지 크게 1.5초. `goal`이면 둥지 글로우 + 점수 팝.
- 진행자가 다음 팀으로 넘기기 전까지 마지막 프레임 유지.

---

## 4. 데이터 (Supabase)

```sql
create table games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                -- 4자리
  round int not null default 1,             -- 1~5
  phase text not null default 'lobby',      -- lobby|coding|sealed|running|scored|finished
  timer_ends_at timestamptz,
  running_team_id uuid,                     -- board가 지금 재생할 팀
  created_at timestamptz default now()
);
create table teams (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games on delete cascade,
  name text not null,
  color text not null,
  patch_left int not null default 1,
  seat int not null
);
create table members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams on delete cascade,
  role text not null,                       -- runner|turner|controller|architect
  last_seen timestamptz default now(),
  unique (team_id, role)
);
create table programs (                     -- 팀×라운드 라이브 문서
  team_id uuid references teams on delete cascade,
  round int not null,
  doc jsonb not null default '[]',          -- Block[]
  version int not null default 0,
  submitted_at timestamptz,
  submit_order int,                         -- 라운드 내 제출 순서 (1 = 최초 제출)
  primary key (team_id, round)
);
create table results (
  team_id uuid references teams on delete cascade,
  round int not null,
  outcome text not null,                    -- goal|error|dead|stuck
  message text,
  ticks int, blocks int, mice int,
  trace jsonb not null,
  used_patch boolean default false,
  score int not null,
  score_lines jsonb not null,
  primary key (team_id, round)
);
alter publication supabase_realtime add table games, teams, members, programs, results;
```
RLS: 전부 `using (true) with check (true)`. 행사 1회용.

페이즈 전이(진행자만): `lobby → coding → sealed → running → scored → coding(다음 라운드) … → finished`
- `coding` 진입 시 `timer_ends_at` 세팅, 각 팀 `programs` 행 생성.
- 타이머 만료 시 자동 `sealed` (진행자 화면에서 감지해 전이).
- `running`에서 `running_team_id`를 팀 순서대로 바꾸며 진행.

---

## 5. 디자인

- 토큰: `--night #14102A`, `--night-2 #1E1740`, `--owl #7A4DFF`, `--moon #F6F2FF`, `--moon-dim #B9AEDB`, 분류색 5개는 위 표.
- 폰트: Pretendard (CDN) → Apple SD Gothic Neo → Noto Sans KR. 블록 라벨 800, 나머지 500~700. 전부 대문자 라벨 금지.
- 블록 모양: `cards.html` 참조. 위 홈 + 아래 돌기, C-블록은 머리/입/꼬리. 그대로 컴포넌트화.
- 부엉이 스프라이트: `cards.html` 상단 SVG(원형 머리 + 귀깃 + 큰 눈). 방향은 부리 회전이 아니라 스프라이트 전체 회전 + 작은 화살표.
- 보드는 1920×1080 고정 레이아웃, 폰은 390px 세로. 그 사이는 신경 안 씀.

---

## 6. 수용 기준 — 이게 되면 끝

1. `npx tsx lib/engine/verify.ts` 전부 통과 (엔진 그대로 복사됐는지 확인).
2. 폰 4대로 같은 팀 접속 → 각자 자기 역할 블록만 보임 → 한 명이 블록 놓으면 나머지 셋 화면에 1초 내 반영.
3. 상한 초과 시 제출 버튼 비활성 + 카운터 빨강. Architect 아닌 사람에겐 제출 버튼 없음.
4. 진행자가 R3에서 `SOLUTIONS.r3[0]`을 제출한 팀을 실행 → 보드에서 20틱에 도착, 쥐 2마리, 150점 표시.
5. R5에서 잠자기 없는 코드 실행 → 18틱째 (7,4)에서 "고양이를 밟았다" + 0점. 잠자기 1개 추가 후 패치 재실행 → 37틱 도착, 145 − 10 = 135점.
6. 프로젝터 화면에 팀 코드가 텍스트로 뜨고 실행 중인 줄이 하이라이트된다.
7. 5라운드 끝나면 최종 순위 화면.

---

## 7. 안 만드는 것
로그인, 채팅, 맵 에디터, 시뮬레이터, 리플레이 저장, 다크/라이트 전환(항상 다크).

## 8. 개발 순서 제안
엔진 복사 + verify → Supabase 스키마 → `/play` 편집기(로컬 상태만) → 블록 컴포넌트 → 실시간 동기화 → `/host` 페이즈 제어 → `/board` 재생 → 점수판 → 마감 다듬기.
