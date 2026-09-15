# OWL COMPILE 웹사이트 구현 명세 (최우선 기준)

이 문서가 웹사이트 구현의 **최우선 기준**이다. `plan/CLAUDE.md`(브리프)와 `docs/` 설계 문서와 충돌하면 이 문서가 이긴다.
게임 규칙은 브리프 §2와 `engine/` 그대로다. 달라진 점은 사용자가 직접 요구한 세 가지다.

1. **초대 기반 회원가입·로그인 + 관리 페이지.** 관리자가 사람마다 초대 링크를 만들어 보내고, 받은 사람만 가입한다. (브리프의 "로그인 없음"은 폐기)
2. **규칙은 그대로, 5라운드.** 팀 4명·역할 4개·진행자 실행·프로젝터 재생·패치권·점수 모두 브리프 §2~§3 그대로. R1~R5.
3. **블록 카드를 연결해서 코딩.** 편집기의 기본 조작은 카드를 끌어 다른 카드에 끼우는 드래그 연결이다. (브리프의 "탭-삽입 기본, DnD 보조"를 뒤집음)

---

## 1. 스택과 실행 형태

- Next.js 15 App Router + React 19 + TypeScript strict + Tailwind CSS v4.
- DB: SQLite 파일 `data/owl.db` (better-sqlite3, WAL). 설치 실패 시 `node:sqlite`의 `DatabaseSync`로 대체하되 `lib/server/db.ts`의 인터페이스는 같게 유지한다.
- 실시간: Server-Sent Events. 단일 Node 프로세스(`next start` 또는 `next dev`) 안의 메모리 pub/sub(`globalThis`에 싱글턴). 서버리스 배포(Vercel) 불가, 노트북·VPS·Render/Railway 같은 상주 Node 서버에서 돌린다.
- 엔진: 루트 `engine/`이 원본. `scripts/sync-engine.mjs`가 `engine/*.ts`, `engine/rounds/*.ts`를 `lib/engine/`으로 복사한다(`_scratch/` 제외). `predev`, `prebuild`, `pretest`에서 자동 실행. 앱 코드는 `@/lib/engine`만 import 하고 `lib/engine/`을 손으로 고치지 않는다.
- 폰트: Pretendard (jsdelivr CDN) → Apple SD Gothic Neo → Noto Sans KR. 항상 다크.
- 새 의존성은 최소: next, react, react-dom, better-sqlite3, @dnd-kit/core, @dnd-kit/utilities, zod, tailwindcss, @tailwindcss/postcss, vitest(dev), @types/better-sqlite3(dev). 그 외 추가 금지(필요하면 이유를 남긴다).

## 2. 폴더

```
app/
  layout.tsx, globals.css          다크 테마 토큰(cards.html), Pretendard
  page.tsx                         홈: 로그인 안 했으면 /login, 했으면 게임 참가·(진행자) 게임 만들기·(관리자) 관리
  setup/page.tsx                   최초 1회: 사용자 0명일 때만 관리자 계정 생성
  login/page.tsx  signup/page.tsx  로그인 / 초대 코드로 가입
  admin/page.tsx                   관리자: 초대·회원·게임 탭
  join/page.tsx                    게임 코드 → 팀 → 역할
  play/[code]/page.tsx             팀 편집기 (폰)
  host/page.tsx                    진행자: 내 게임 목록·새 게임
  host/[code]/page.tsx             진행자 콘솔 (데스크톱)
  board/[code]/page.tsx            프로젝터 (1920×1080)
  api/...                          §5
components/
  blocks/  BlockCard, CBlock, Palette, ProgramEditor(연결 편집기), DropSlot, Trash, RepeatPicker
  map/     MapGrid, OwlSprite, CatSprite
  board/   Playback, CodePanel, Scoreboard
  ui/      Button, Sheet, Toast 등
lib/
  engine/                          (sync-engine 복사본)
  contracts.ts                     API 요청/응답·SSE 이벤트·뷰모델 타입 (클라·서버 공용, 서버 코드 import 금지)
  editor/tree.ts                   Block[] 트리 순수 연산 + uid 생성 + 연결 가능 여부
  client/api.ts  client/useGame.ts SSE 구독 + 상태 스토어
  server/db.ts                     연결·마이그레이션
  server/auth.ts                   비밀번호·세션·초대·권한 헬퍼
  server/game.ts                   게임 상태기계·제출·실행·점수·패치
  server/realtime.ts               pub/sub + 온라인 추적 + 타이머 틱커
  server/http.ts                   JSON 응답·에러·Origin 검사·요청 크기 제한
scripts/
  sync-engine.mjs  create-admin.ts  e2e-api.ts
tests/                             vitest
data/                              owl.db (gitignore)
```

## 3. 데이터 (SQLite, `lib/server/db.ts`가 시작 시 생성)

모든 id는 `crypto.randomUUID()`, 시각은 ISO 문자열(UTC).

```sql
create table if not exists users (
  id text primary key, username text unique not null collate nocase,
  display_name text not null, password_hash text not null,
  role text not null check (role in ('admin','host','player')),
  status text not null default 'active' check (status in ('active','disabled')),
  must_change_password integer not null default 0,
  created_at text not null, last_login_at text);
create table if not exists sessions (
  token_hash text primary key, user_id text not null references users on delete cascade,
  created_at text not null, expires_at text not null);
create table if not exists invites (
  code text primary key, role text not null check (role in ('host','player')),
  note text not null default '', created_by text references users on delete set null,
  created_at text not null, expires_at text,
  used_by text references users on delete set null, used_at text, revoked_at text);
create table if not exists games (
  id text primary key, code text unique not null, host_id text not null references users,
  round integer not null default 1 check (round between 1 and 5),
  phase text not null default 'lobby' check (phase in ('lobby','coding','sealed','running','scored','finished')),
  timer_ends_at text, timer_remaining integer, running_team_id text,
  autoplay integer not null default 1, created_at text not null);
create table if not exists teams (
  id text primary key, game_id text not null references games on delete cascade,
  name text not null, color text not null, seat integer not null, patch_left integer not null default 1);
create table if not exists members (
  id text primary key, game_id text not null references games on delete cascade,
  team_id text not null references teams on delete cascade, user_id text not null references users on delete cascade,
  role text not null check (role in ('runner','turner','controller','architect')),
  joined_at text not null, unique (team_id, role));
create table if not exists programs (
  team_id text not null references teams on delete cascade, round integer not null, game_id text not null,
  doc text not null default '[]', version integer not null default 0, blocks integer not null default 0,
  submitted_at text, submit_order integer, sealed_by text check (sealed_by in ('architect','auto')),
  primary key (team_id, round));
create table if not exists results (
  team_id text not null references teams on delete cascade, round integer not null, game_id text not null,
  outcome text not null, message text not null, ticks integer not null, blocks integer not null, mice integer not null,
  trace text not null, used_patch integer not null default 0, score integer not null, score_lines text not null,
  bonus integer not null default 0, bonus_note text not null default '', run_order integer not null,
  primary key (team_id, round));
```
- 한 사용자는 한 게임에서 한 팀에만 속한다(코드로 강제). 같은 팀의 빈 역할이면 한 사람이 여러 역할을 맡을 수 있다(4명 미만 팀).
- 게임 코드: 4자리 숫자 1000~9999, 진행 중 게임과 겹치지 않게 재시도.
- 팀 이름·색: 수리부엉이 `#8E5CFF`, 올빼미 `#2FC4D9`, 소쩍새 `#FFB020`, 흰올빼미 `#F6F2FF`, 금눈쇠올빼미 `#3DD68C`, 칡부엉이 `#FF6B9A` 순서. 팀 수 4~6.

## 4. 계정·초대·권한

- 계정 역할: `admin`(전부), `host`(게임 생성·진행·보드), `player`(참가). 관리자는 역할을 바꿀 수 있다.
- 최초 실행: 사용자가 0명이면 `/setup`에서만 관리자 생성 가능. 1명 이상이면 `/setup`은 404. 복구용 CLI `npm run admin:create -- --username x --password y`.
- 초대: 관리자가 `/admin`에서 1명 또는 여러 명(메모 줄마다 1장, 예: 이름 목록 붙여넣기) 초대를 만든다. 코드 `XXXX-XXXX`(혼동 글자 0/O/1/I 제외 base32), 링크 `{origin}/signup?code=...`, 역할(player/host), 만료(기본 14일). 1회용. 링크 복사 버튼, 전체 복사(메모\t링크 줄들), 취소(revoke).
- 가입: `/signup?code=` → 초대 확인 → 아이디(영문·숫자·_ 3~20자), 표시 이름(1~20자), 비밀번호(8자 이상) → 가입과 동시에 로그인.
- 로그인/로그아웃: 아이디+비밀번호. 실패 시 "아이디 또는 비밀번호가 맞지 않습니다". 비활성 계정은 "관리자가 사용을 중지한 계정입니다".
- 관리자 회원 탭: 목록(표시 이름, 아이디, 역할, 상태, 가입일, 마지막 로그인, 초대 메모), 역할 변경, 사용 중지/재개, 비밀번호 초기화(임시 비밀번호 1회 표시 + 다음 로그인 때 변경 강제), 삭제(자기 자신과 마지막 관리자는 불가). 게임 탭: 게임 목록·삭제.
- 보안: scrypt(N=16384,r=8,p=1, 16바이트 salt) + timingSafeEqual. 세션 토큰 32바이트 랜덤, DB에는 sha256만 저장, 쿠키 `owl_session` httpOnly·SameSite=Lax·Path=/·14일·https면 Secure. 변경 요청(POST/PUT/PATCH/DELETE)은 `Origin`이 호스트와 같아야 한다. 로그인 시도는 아이디+IP당 5분에 10회 제한(메모리). 모든 API는 서버에서 로그인·역할·게임 소유권·팀 소속을 검사한다. 모든 SQL은 prepared statement.
- 페이지 보호: 서버 컴포넌트/레이아웃에서 세션 확인 후 redirect. `/admin`은 admin, `/host*`·`/board/*`는 그 게임의 진행자 또는 admin, `/play/*`는 그 게임 참가자.

## 5. API (JSON, `app/api/**/route.ts`)

응답 에러 형식은 `{ error: { code, message } }` + 적절한 HTTP 상태. 타입은 전부 `lib/contracts.ts`.

| 메서드·경로 | 권한 | 내용 |
|---|---|---|
| POST /api/setup | 사용자 0명 | 관리자 생성 + 로그인 |
| POST /api/auth/login · POST /api/auth/logout · GET /api/auth/me | - | 세션 |
| POST /api/auth/password | 로그인 | 비밀번호 변경 {current,next} |
| GET /api/invites/[code] | - | 초대 유효 여부 {valid, role, note} |
| POST /api/auth/signup | - | {code, username, displayName, password} |
| GET·POST /api/admin/invites · POST /api/admin/invites/[code]/revoke | admin | 목록·생성 {role, notes[], expiresInDays}·취소 |
| GET /api/admin/users · PATCH·DELETE /api/admin/users/[id] · POST /api/admin/users/[id]/reset-password | admin | 회원 관리 |
| GET /api/admin/games · DELETE /api/admin/games/[code] | admin | 게임 관리 |
| GET·POST /api/games | host·admin | 내 게임 목록 · 새 게임 {teams: 4~6} |
| GET /api/games/[code]/state | 참가자·진행자 | 뷰모델(§6). 역할별로 걸러서 준다 |
| GET /api/games/[code]/events | 참가자·진행자 | SSE (§7) |
| POST /api/games/[code]/join | 로그인 | {teamId, roles[]} lobby·coding 중에만 |
| POST /api/games/[code]/leave | 참가자 | 내 역할 반납 |
| PUT /api/games/[code]/program | 팀원 | {doc, baseVersion} → 200 {version, blocks} 또는 409 {doc, version} |
| POST /api/games/[code]/submit | 그 팀 architect | validate 통과해야 봉인 |
| POST /api/games/[code]/phase | 진행자 | {to, expect} 조건부 전이(§8) |
| POST /api/games/[code]/timer | 진행자 | {action:'pause'|'resume'|'add', seconds?} |
| POST /api/games/[code]/running | 진행자 | {teamId} 보드가 재생할 팀 지정 |
| POST /api/games/[code]/patch | 진행자 | {teamId} 패치 허용 |
| POST /api/games/[code]/rerun | 진행자 | {teamId} 재실행(패치 후) |
| POST /api/games/[code]/bonus | 진행자 | {teamId, points, note} 이벤트 카드 수동 점수 |
| POST /api/games/[code]/kick | 진행자 | {memberId} 팀원 내보내기 |

- 프로그램 저장 검사(서버): 페이즈가 coding(또는 패치 허용된 팀의 running)이고 봉인 전일 것. doc은 zod 재귀 스키마 통과(블록 id 10종, repeat.n 정수 1~9, 필드 모양), 노드 80개·깊이 8·20KB 이하. **역할 검사**: 이전 doc 대비 개수가 늘어난 블록 id는 요청자가 가진 역할의 블록이어야 한다(이동·삭제는 누구나, 새로 놓기는 자기 역할만). 버전은 `baseVersion == 서버 version`일 때만 저장하고 version+1, 아니면 409.
- 제출: architect만. `validate(doc, map).ok`여야 한다. submit_order = 라운드 내 max+1 (트랜잭션).

## 6. 뷰모델 (`GET /state`)

```ts
interface GameView {
  me: { userId: string; displayName: string; accountRole: 'admin'|'host'|'player'; isHost: boolean;
        teamId: string | null; roles: Role[] };
  game: { code: string; round: 1|2|3|4|5; phase: Phase; timerEndsAt: string | null; timerRemaining: number | null;
          runningTeamId: string | null; autoplay: boolean };
  serverNow: string;                  // 시계 보정용
  map: GameMap;                       // 현재 라운드 맵 (엔진 MAPS)
  teams: TeamView[];                  // 모든 팀: id,name,color,seat,patchLeft, members[{id,userId,displayName,role,online}],
                                      // program: { blocks, submittedAt, submitOrder } (doc은 아래 규칙)
  myProgram: { doc: Block[]; version: number; blocks: number; submittedAt: string | null; editable: boolean } | null;
  results: ResultView[];              // 현재 라운드: 진행자·보드엔 trace 포함, 참가자엔 running/scored에서 자기 팀 것만 trace 포함
  standings: { teamId: string; total: number; rounds: (number|null)[]; goals: number; ticks: number }[];
  solutions?: string[];               // 진행자만: toText(SOLUTIONS[rN][i])
  programs?: Record<string, { doc: Block[]; text: string }>; // 진행자·보드만 (보드는 running 이후만 사용)
}
```
- 참가자는 다른 팀의 코드를 볼 수 없다(블록 수·제출 여부만). 정답(`solutions`)은 진행자에게만.
- 동점: 누적 점수 → 도착 라운드 수 많은 팀 → 총 틱 적은 팀.

## 7. 실시간 (SSE)

- `GET /api/games/[code]/events` → `text/event-stream`. 연결되면 `hello` 이벤트, 이후 변경마다 이벤트. 25초마다 주석 핑.
- 이벤트: `game`(페이즈·타이머·재생 팀 바뀜), `teams`(팀·팀원·온라인 바뀜), `program`({teamId, round, doc, version, blocks, submittedAt} — 그 팀원과 진행자에게만), `result`, `standings`.
- 클라이언트 규칙: `program`은 받은 version이 로컬보다 크면 교체. 나머지는 `/state`를 다시 받아 교체(단순함 우선). 연결이 끊기면 1→8초 백오프 재연결 후 `/state` 재조회.
- 온라인 = 그 사용자의 SSE 연결이 1개 이상. 연결·해제 시 `teams` 이벤트.
- 타이머 틱커(서버, 1초): coding 중 `timer_ends_at`이 지난 게임은 자동 sealed(§8).
- 편집 반영 목표: 한 팀원이 카드를 놓으면 다른 팀원 화면에 1초 안에 보인다. 클라이언트 저장 디바운스 120ms.

## 8. 페이즈 (서버 `lib/server/game.ts`)

`lobby → coding → sealed → running → scored → (round<5 ? coding(round+1) : finished)`. 진행자 요청은 `{to, expect}`로 현재 페이즈가 expect일 때만 적용(두 탭 이중 전이 방지).
- coding 진입: 라운드 확정, `timer_ends_at = now + map.seconds`, 모든 팀 programs 행 생성(doc `[]`).
- sealed 진입(진행자 버튼 또는 타이머 만료): 미제출 팀은 현재 doc 그대로 `sealed_by='auto'`로 봉인, 제출 순서는 뒤에 붙인다.
- running 진입: 서버가 submit_order 순으로 각 팀 실행. `validate` 실패면 `outcome:'error'`, message `컴파일 에러: …`, ticks 0, trace는 초기 프레임 1개. 통과면 `run(map, doc)` → `score(result, {cap, firstSubmit: submit_order==1 && sealed_by=='architect', usedPatch:false})` → results 저장. 첫 팀을 running_team_id로.
- 진행자 콘솔: "다음 팀"으로 running_team_id를 넘긴다. autoplay면 콘솔이 `ticks×600ms + 2000ms + 3000ms` 뒤 자동으로 다음 팀.
- 패치: running 중 outcome이 error·dead·stuck이고 patch_left=1인 팀에만 "패치 허용". → patch_left=0, 그 팀 programs.submitted_at=null(봉인 해제) → 팀이 고쳐 재제출(상한 이내) → 진행자 "재실행" → results 덮어쓰기, `usedPatch:true`(−10). 블록 1개 제한은 진행자가 눈으로 판단.
- scored 진입: 점수 확정. finished: 최종 순위.
- 되돌리기: 진행자 콘솔 "이전 페이즈로"(running→sealed는 그 라운드 results 삭제).

## 9. 화면

### 공통
- 다크 토큰: `--night #14102A`, `--night-2 #1E1740`, `--owl #7A4DFF`, `--moon #F6F2FF`, `--moon-dim #B9AEDB`, 분류색 이동 `#8E5CFF` 회전 `#2FC4D9` 제어 `#FFB020` 함수 `#3DD68C` 특수 `#FF6B9A`. 대문자 라벨 금지. 문구는 한국어.
- 상단 바: 로고(부엉이 SVG, cards.html 히어로) + 표시 이름 + 로그아웃.

### /play/[code] 팀 편집기 (폰 390px 세로에서 완결)
```
┌ R3 나선 · ⏱ 04:12 · 7/7 ┐   라운드·타이머·블록 n/상한(초과 빨강)
│ 미니맵 8×8 (탭=전체화면)  │   R5는 고양이 출발 칸과 순찰로 표시
│ 프로그램 (연결 편집기)    │   세로 스크롤
│ 팔레트 (내 역할 카드만)   │   하단 고정, 가로 스크롤
│ 팀원 · [제출](architect) │
└──────────────────────────┘
```
- **연결 편집기**가 핵심이다. 카드 모양·색·아이콘은 `plan/cards.html`의 `.blk/.cblk/.mouth/.else/.foot`와 노치 pseudo-element를 그대로 이식한다(폰에서 카드 높이 44px, 글자 17px).
  - 팔레트 카드를 끌어 프로그램 위로 가져가면 가장 가까운 **연결 지점**에 스냅된다: 그 자리에 보라색 연결선과 반투명 고스트 카드. 놓으면 끼워진다.
  - 연결 지점 = 모든 스택(최상위, 반복·함수 입, 만약의 그러면·아니면 입)의 맨 앞·블록 사이·맨 끝. 빈 입은 "여기에 연결" 점선 칸.
  - 놓인 카드를 끌면 그 카드(C-블록이면 안의 카드까지)가 떨어져 나와 옮겨진다. 휴지통(드래그 중 하단에 나타남)이나 팔레트 위에 놓으면 삭제된다. 남의 카드도 옮기고 지울 수 있다.
  - 규칙상 안 되는 곳엔 연결 지점이 뜨지 않는다: 함수 F는 최상위에만·1개만, F 호출은 함수 F가 있어야, 함수 F 입 안에 F 호출 금지, 자기 자신 안으로 이동 금지. 최종 판정은 서버의 validate.
  - 보조 조작: 팔레트 카드 탭 = 프로그램 맨 끝에 연결. 놓인 카드 탭 = 작은 메뉴(삭제, 반복이면 횟수 1~9 선택).
  - dnd-kit: PointerSensor(distance 4) + TouchSensor(delay 150ms, tolerance 8). 드래그 중 프로그램 영역 자동 스크롤. 드래그 중 페이지 스크롤·텍스트 선택·iOS 롱프레스 메뉴 억제.
  - 트리 연산은 `lib/editor/tree.ts` 순수 함수(경로 규칙은 ENGINE_SPEC §5: 슬롯 0 = body/then, 1 = else). uid는 블록 생성 시 부여, 엔진은 무시.
- 저장: 로컬 즉시 반영 → 120ms 디바운스 PUT → 409면 서버 doc으로 교체 + 토스트 "다른 팀원이 먼저 바꿨어요".
- 제출(architect만 보임): 확인 시트 "봉인하면 더 못 고칩니다" → 성공 시 "봉인됨" 오버레이. validate 실패면 이유 목록 표시. 상한 초과면 버튼 비활성.
- coding이 아니거나 봉인되면 읽기 전용(팔레트 숨김). 패치 허용되면 다시 편집 가능 + 안내.
- running·scored에서는 자기 팀 결과(메시지·점수 줄)를 보여 준다. **팀 화면에 미리 실행(시뮬레이터) 기능은 없다.**

### /join
게임 코드 4자리 → 팀 카드(이름·색·차 있는 역할) → 역할 선택(빈 역할만, 여러 개 가능) → /play/[code]. 이미 참가한 게임이면 바로 /play.

### /host, /host/[code] 진행자 (데스크톱)
- /host: 내 게임 목록 + "새 게임"(팀 수 4~6).
- 콘솔: 왼쪽 라운드·페이즈 패널(다음 페이즈 버튼 1개, 타이머 시작/일시정지/+30초, 보드 열기 링크, 이전 페이즈로), 가운데 팀 표(팀·접속 n/4·블록 수·제출 시각·결과·라운드 점수·누적), 오른쪽 선택 팀 상세(toText 코드, validate 결과, 점수 줄, 패치 허용·재실행·보너스 점수 입력·팀원 내보내기). 정답 보기 토글. 참가 안내(사이트 주소 + 게임 코드 크게).

### /board/[code] 프로젝터 (1920×1080 고정 레이아웃, 브리프 §3 그대로)
- lobby: 게임 코드 크게 + 팀별 접속 인원. coding: 맵 크게 + 타이머 크게 + 팀별 제출 여부·블록 수(코드 비공개). running: 왼쪽 맵(부엉이 칸 사이 보간 이동, 회전은 스프라이트 회전 + 작은 화살표, 고양이), 오른쪽 현재 팀 코드 텍스트(실행 중 줄 하이라이트), 하단 이벤트 토스트, 결말(dead·error 흔들림 + 큰 메시지 1.5초, goal 둥지 글로우 + 점수 줄 팝). 틱 600ms. 다음 팀으로 넘어가기 전까지 마지막 프레임 유지. scored: 라운드 점수 + 누적 순위. finished: 최종 순위(1~3위 강조).
- 새로고침하면 재생 없이 마지막 프레임을 바로 보여 준다.

## 10. 테스트와 수용 기준

- `npm run verify` 엔진 검증 전부 통과. `npm run test`(vitest): tree.ts 연산·연결 가능 규칙, auth(해시·세션·초대 1회용·만료·취소), game(역할 검사, 버전 충돌, 제출 순서, 페이즈 조건부 전이, 자동 봉인, 실행·점수, 패치).
- `npm run e2e:api`(개발 서버 대상 스크립트): setup 관리자 → 초대 5장(진행자 1, 참가자 4) → 가입 → 진행자 게임 생성 → 4명 참가·역할 → 역할 밖 블록 추가 거부(403) → 편집 충돌 409 → R1·R2 진행 → R3에서 `SOLUTIONS.r3[0]` 제출·실행 → goal·20틱·쥐 2·150점 → R5에서 잠자기 없는 코드 → 18틱 (7,4) "고양이를 밟았다" 0점 → 패치 허용 → 잠자기 추가 재제출 → 재실행 → goal·37틱·135점 → finished 순위.
- 브리프 수용 기준 2~7은 브라우저로 확인한다(폰 폭 390px 편집기, 1초 내 반영, 상한 초과 빨강·제출 비활성, 보드 줄 하이라이트, 최종 순위).

## 11. 안 만드는 것
이메일 발송(초대는 링크 복사), 소셜 로그인, 채팅, 맵 에디터, 팀 화면 시뮬레이터, 리플레이 저장, 라이트 테마, 다국어.

## 12. 뼈대 (이미 구현됨, 이름 그대로 쓴다)

| 파일 | 내보내는 것 |
|---|---|
| `lib/contracts.ts` | 모든 요청·응답·뷰모델·SSE 타입, `GAME_ROLES` `ROLE_LABEL` `ROLE_HINT` `ACCOUNT_ROLE_LABEL` `PHASE_LABEL` `PHASE_ORDER` `TEAM_PRESETS` `TICK_MS` `ENDING_MS` `AUTOPLAY_GAP_MS` `LIMITS`, API 경로 `API` |
| `lib/server/db.ts` | `getDb` `one` `all` `run` `tx` `resetDb` `nowIso` `newId` `bool` `dbPath` |
| `lib/server/http.ts` | `HttpError` `badRequest` `unauthorized` `forbidden` `notFound` `conflict` `tooMany` `json` `errorResponse` `assertSameOrigin` `handle<P>(fn)` `readJson(req, zodSchema, maxBytes)` `clientIp` `isHttps` `siteOrigin` |
| `lib/server/password.ts` | `hashPassword` `verifyPassword` `dummyHash` `randomToken` `sha256` `randomCode` `tempPassword` |
| `lib/server/session.ts` | `createSession(userId, req)` `getCurrentUser` `requireUser(roles?)` `requirePageUser(roles?, {next, allowMustChange})` `destroySession` `destroyUserSessions` `userFromToken` `toPublicUser` |
| `lib/server/realtime.ts` | `subscribe` `publish(gameId, event, {teamId?, hostsOnly?})` `onlineUserIds` `setSubscriberTeam` `publishDeleted` `onPresenceChange(name, fn)` `startTicker(name, fn, ms)` `sseResponse(req, sub, hello)` |
| `lib/client/api.ts` · `useGame.ts` · `time.ts` | `api<T>()` `ApiClientError` · `useGame(code)` → `{view, error, status, serverOffsetMs, serverNow, refresh, patchView}` · `useNow` `remainingSeconds` `formatClock` |
| `components/map/*` | `MapGrid` `MapActor` `CatSprite` `OwlSprite` `DIR_DEG` `nextRotation` |
| `components/ui/*` | `Button` `buttonClass` `ToastProvider` `useToast` `Sheet` `ConfirmSheet` `TopBar` |
| `app/globals.css` | 토큰(`bg-night` `bg-night-2` `text-moon` `text-moon-dim` `border-line` `bg-owl` …), 카드 클래스(`.blk` `.cblk` `.mouth` `.else` `.foot` `.stack` 분류색, 폰 크기 `.blk-compact`, 면 색 `--notch-bg`), 맵 클래스(`.map` `.map-cell` `.map-actor`) |

추가 규칙:
- **참가 전 조회.** 게임 코드를 아는 로그인 사용자는 누구나 `GET /state`와 `/events`를 받을 수 있다. 참가하지 않은 사람에게는 로비 수준 정보(페이즈·맵·팀·팀원·순위)만 주고 코드·결과 trace·정답은 주지 않는다. `/join`이 이것으로 팀과 빈 역할을 보여 준다.
- **브라우저 번들에 정답·실행기 금지.** 클라이언트 컴포넌트는 `@/lib/engine`(인덱스), `maps`, `solutions`, `run`, `rounds/*`를 import 하지 않는다. `@/lib/engine/blocks`, `text`, `validate`, `types`만 쓴다. 맵은 서버 뷰모델로 받는다.
- **페이지 구성.** 페이지는 서버 컴포넌트에서 `requirePageUser`로 로그인만 확인하고, 게임 소속·진행자 권한 판단은 API가 한다(클라이언트가 403/404를 받으면 안내 화면).
