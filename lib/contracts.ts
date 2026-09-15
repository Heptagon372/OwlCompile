// 클라이언트·서버 공용 계약: API 요청/응답, 뷰모델, SSE 이벤트 (docs/WEBSITE_SPEC.md §5–§7, docs/FEATURE_V4.md)
// 이 파일은 서버 전용 모듈을 import 하지 않는다. 엔진은 타입만 가져온다.
import type { Block, GameMap, Outcome, Pos, Role, ScoreLine, Step } from '@/lib/engine';

export type { Block, GameMap, Outcome, Pos, ScoreLine, Step };

// ------------------------------------------------------------------ 기본 타입
export type GameRole = Role;
export type AccountRole = 'admin' | 'host' | 'player';
export type AccountStatus = 'active' | 'disabled';
export type InviteRole = 'host' | 'player';
export type Phase = 'lobby' | 'coding' | 'sealed' | 'running' | 'scored' | 'finished';
/** 라운드 번호 = 난이도 레벨 (1~7, FEATURE_V4 §1) */
export type RoundNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type SealedBy = 'architect' | 'auto';
/** 게임 배정 방식 (FEATURE_V4 §3): auto = 대기실 인원 자동 배정, self = 참가자가 팀·역할 직접 선택 */
export type AssignMode = 'auto' | 'self';

export const GAME_ROLES: readonly GameRole[] = ['runner', 'turner', 'controller', 'architect'];
export const ROLE_LABEL: Record<GameRole, string> = {
  runner: '러너', turner: '터너', controller: '컨트롤러', architect: '아키텍트',
};
export const ROLE_HINT: Record<GameRole, string> = {
  runner: '앞으로 · 점프', turner: '좌회전 · 우회전', controller: '반복 · 만약', architect: '함수 · 호출 · 잠자기 · 제출',
};
export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = { admin: '관리자', host: '진행자', player: '참가자' };
export const PHASE_LABEL: Record<Phase, string> = {
  lobby: '대기실', coding: '코딩 중', sealed: '봉인', running: '실행', scored: '점수 발표', finished: '종료',
};
export const PHASE_ORDER: readonly Phase[] = ['lobby', 'coding', 'sealed', 'running', 'scored', 'finished'];
/**
 * 페이즈 → 상태 알약 뜻 (DESIGN_V4 §3: 대기 호박색 · 진행 중 보라 · 완료 초록). 보드·진행자·대기실·홈·관리·편집기가
 * 모두 이 값을 쓴다 (화면마다 같은 게임이 다른 색으로 보이지 않게). 색은 components/ui/Chip 의 phaseTone.
 */
export const PHASE_STATUS: Record<Phase, 'pending' | 'progress' | 'done'> = {
  lobby: 'pending', coding: 'progress', sealed: 'progress', running: 'progress', scored: 'progress', finished: 'done',
};
export const ASSIGN_MODE_LABEL: Record<AssignMode, string> = { auto: '자동 배정', self: '직접 선택' };

/** 팀 이름·색 (FEATURE_V4 §2). 팀 수만큼 앞에서부터 쓴다. */
export const TEAM_PRESETS: readonly { name: string; color: string }[] = [
  { name: '수리부엉이', color: '#9B6BFF' },
  { name: '올빼미', color: '#5B8CFF' },
  { name: '소쩍새', color: '#3FD6F2' },
  { name: '흰올빼미', color: '#E8E4FF' },
  { name: '금눈쇠올빼미', color: '#F5B94A' },
  { name: '칡부엉이', color: '#FF6B8B' },
  { name: '긴점박이올빼미', color: '#3DDC97' },
  { name: '큰소쩍새', color: '#C065E8' },
  { name: '쇠부엉이', color: '#FF9A5A' },
  { name: '솔부엉이', color: '#7AA2C8' },
];

export const TICK_MS = 600;
/** 보드 결말 연출 시간과 autoplay 대기 (spec §8) */
export const ENDING_MS = 2000;
export const AUTOPLAY_GAP_MS = 3000;

export const LIMITS = {
  minTeams: 2,
  maxTeams: 10,
  /** 한 팀의 서로 다른 사람 수 상한 (역할은 공유 가능) */
  maxMembersPerTeam: 6,
  maxDocNodes: 80,
  maxDocDepth: 8,
  maxDocBytes: 20_000,
  usernamePattern: '^[A-Za-z0-9_]{3,20}$',
  displayNameMax: 20,
  passwordMin: 8,
  inviteDefaultDays: 14,
  inviteMaxBatch: 60,
  timerAddMaxSeconds: 600,
  bonusMaxAbs: 100,
} as const;

// ------------------------------------------------------------------ 라운드 선택 (FEATURE_V4 §1)
export const ALL_ROUNDS: readonly RoundNo[] = [1, 2, 3, 4, 5, 6, 7];
export const DEFAULT_ROUNDS: readonly RoundNo[] = [1, 2, 3, 4, 5];
export type RoundPresetId = 'intro' | 'standard' | 'all' | 'challenge';
export const ROUND_PRESETS: readonly { id: RoundPresetId; label: string; rounds: readonly RoundNo[] }[] = [
  { id: 'intro', label: '입문', rounds: [1, 2, 3] },
  { id: 'standard', label: '표준', rounds: [1, 2, 3, 4, 5] },
  { id: 'all', label: '전체', rounds: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'challenge', label: '도전', rounds: [4, 5, 6, 7] },
];

/** 올바른 라운드 목록인가: 1~7의 정수 1개 이상, 오름차순, 중복 없음 */
export function isRoundList(v: unknown): v is RoundNo[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > ALL_ROUNDS.length) return false;
  for (let i = 0; i < v.length; i += 1) {
    const r: unknown = v[i];
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 7) return false;
    if (i > 0 && r <= (v[i - 1] as number)) return false;
  }
  return true;
}

/** 고른 라운드 안에서 다음 라운드 (마지막이면 null) */
export function nextRoundOf(rounds: readonly RoundNo[], round: RoundNo): RoundNo | null {
  const i = rounds.indexOf(round);
  return i >= 0 && i + 1 < rounds.length ? rounds[i + 1] : null;
}

/** 고른 라운드 안에서 이전 라운드 (첫 라운드면 null) */
export function prevRoundOf(rounds: readonly RoundNo[], round: RoundNo): RoundNo | null {
  const i = rounds.indexOf(round);
  return i > 0 ? rounds[i - 1] : null;
}

/** 화면 표기 "R4 · 3/5 · 난이도 4": step = 1부터 센 진행 순번, level = 라운드 번호 */
export function roundPosition(rounds: readonly RoundNo[], round: RoundNo): {
  index: number; step: number; total: number; level: RoundNo; label: string;
} {
  const index = rounds.indexOf(round);
  const step = index + 1;
  return { index, step, total: rounds.length, level: round, label: `R${round} · ${step}/${rounds.length} · 난이도 ${round}` };
}

// ------------------------------------------------------------------ 자동 배정 규칙 (FEATURE_V4 §3, 서버·진행자 미리보기 공용)
/** 팀 안 k번째 사람의 역할 = AUTO_ROLE_ORDER[k mod 4] */
export const AUTO_ROLE_ORDER: readonly GameRole[] = ['architect', 'runner', 'turner', 'controller'];

/** 역할을 GAME_ROLES 순서로 정렬 (중복 제거) */
export function sortRoles(roles: readonly GameRole[]): GameRole[] {
  return GAME_ROLES.filter((r) => roles.includes(r));
}

/**
 * 한 팀에 n명을 새로 넣을 때 각 사람의 역할 (앞사람부터).
 * k번째 → AUTO_ROLE_ORDER[k mod 4]. 4명 미만이면 남는 역할을 앞사람부터 더 맡겨 4역할을 모두 채운다:
 * 1명 → 4역할, 2명 → [architect, turner] / [runner, controller], 3명 → [architect, controller] / [runner] / [turner].
 * 결과의 각 역할 목록은 GAME_ROLES 순서.
 */
export function autoRoleSplit(n: number): GameRole[][] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const out: GameRole[][] = Array.from({ length: n }, (_, k) => [AUTO_ROLE_ORDER[k % AUTO_ROLE_ORDER.length]]);
  for (let j = n; j < AUTO_ROLE_ORDER.length; j += 1) out[(j - n) % n].push(AUTO_ROLE_ORDER[j]);
  return out.map(sortRoles);
}

/**
 * 이미 사람이 있는 팀에 한 명을 더 넣을 때(늦게 온 사람·더 데려오기)의 역할:
 * 팀에 빠진 역할이 있으면 그 역할 전부, 없으면 AUTO_ROLE_ORDER[지금 인원 mod 4].
 */
export function autoRolesForNewcomer(existingPeople: number, coveredRoles: readonly GameRole[]): GameRole[] {
  const missing = AUTO_ROLE_ORDER.filter((r) => !coveredRoles.includes(r));
  if (missing.length > 0) return sortRoles(missing);
  return [AUTO_ROLE_ORDER[existingPeople % AUTO_ROLE_ORDER.length]];
}

/** 새 게임 자동 배정 미리보기: 대기 인원 waiting명을 팀 teams개에 i mod T로 (팀당 최대 6명) */
export function autoTeamSizes(waiting: number, teams: number): { sizes: number[]; placed: number; leftWaiting: number } {
  const t = Math.max(0, Math.floor(teams));
  const w = Math.max(0, Math.floor(waiting));
  const placed = Math.min(w, t * LIMITS.maxMembersPerTeam);
  const sizes = Array.from({ length: t }, (_, k) => (k < placed % t ? 1 : 0) + Math.floor(placed / t));
  return { sizes, placed, leftWaiting: w - placed };
}

/** 추천 팀 수 = ceil(대기 인원 / 4), 2~10 */
export function suggestedTeamCount(waiting: number): number {
  return Math.min(LIMITS.maxTeams, Math.max(LIMITS.minTeams, Math.ceil(Math.max(0, waiting) / 4)));
}

// ------------------------------------------------------------------ 오류
export interface ApiErrorBody { error: { code: string; message: string } }

// ------------------------------------------------------------------ 계정
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  mustChangePassword: boolean;
}
/** redirect: 로그인한 사용자가 갈 곳 (끝나지 않은 게임의 팀원 → /play/<코드>, 참가자 → /lobby, 진행자·관리자 → /) */
export interface MeResponse { user: PublicUser | null; needsSetup: boolean; redirect: string | null }
export interface SetupRequest { username: string; displayName: string; password: string }
export interface LoginRequest { username: string; password: string }
export interface SignupRequest { code: string; username: string; displayName: string; password: string }
export interface PasswordChangeRequest { current: string; next: string }
/** redirect: 로그인·가입 뒤 갈 곳 (MeResponse.redirect와 같은 규칙) */
export interface AuthResponse { user: PublicUser; redirect: string }

export type InviteInvalidReason = 'not_found' | 'used' | 'expired' | 'revoked';
export interface InviteCheckResponse {
  valid: boolean;
  role: InviteRole | null;
  note: string;
  reason: InviteInvalidReason | null;
}

// ------------------------------------------------------------------ 관리자
export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked';
export interface InviteRow {
  code: string;
  url: string;
  role: InviteRole;
  note: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  usedBy: { id: string; username: string; displayName: string } | null;
}
export interface CreateInvitesRequest { role: InviteRole; notes: string[]; expiresInDays: number }
export interface InviteListResponse {
  invites: InviteRow[];
  /** 초대 링크에 쓴 주소와 종류 (lib/server/net.ts preferredOrigin). 'local'이면 이 PC에서만 열린다 */
  linkOrigin?: string;
  linkKind?: 'public' | 'lan' | 'vpn' | 'local';
}

export interface AdminUserRow {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  status: AccountStatus;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  inviteNote: string | null;
}
export interface AdminUserListResponse { users: AdminUserRow[] }
export interface UpdateUserRequest { role?: AccountRole; status?: AccountStatus; displayName?: string }
export interface ResetPasswordResponse { tempPassword: string }

export interface GameSummary {
  code: string;
  hostName: string;
  /** 현재 라운드 번호 */
  round: RoundNo;
  /** 고른 라운드 (오름차순) */
  rounds: RoundNo[];
  mode: AssignMode;
  phase: Phase;
  teams: number;
  /** 서로 다른 참가자 수 */
  members: number;
  createdAt: string;
}
export interface GameListResponse { games: GameSummary[] }

// ------------------------------------------------------------------ 게임 요청
/**
 * POST /api/games. teams: 2~10, rounds: 1~7 중 1개 이상 오름차순·중복 없음 (없으면 [1,2,3,4,5]),
 * mode: 없으면 'auto'. 잘못된 rounds → 400 invalid_rounds, 엔진에 없는 라운드 → 400 round_unavailable
 */
export interface CreateGameRequest { teams: number; rounds?: RoundNo[]; mode?: AssignMode }
/** 자동 배정 한 건 (누가 어느 팀·역할로) */
export interface LobbyPlacement { userId: string; teamId: string; teamName: string; teamColor: string; roles: GameRole[] }
/** assigned = 이번에 팀에 넣은 사람 수, leftWaiting = 그 뒤에도 대기실에 남은 사람 수 (자리 부족 등) */
export interface AssignResult { assigned: number; leftWaiting: number; placements: LobbyPlacement[] }
export interface CreateGameResponse extends AssignResult { code: string }
/** POST /join: 같은 팀 안에서 역할을 더한다 (이미 가진 역할은 그대로). 팀의 7번째 사람이면 409 team_full */
export interface JoinRequest { teamId: string; roles: GameRole[] }
export interface JoinResponse { ok: true; teamId: string; roles: GameRole[] }
/** round: 이 저장을 만든 라운드 (없어도 되지만 편집기는 보낸다). 지금 라운드와 다르면 409 not_editable */
export interface ProgramSaveRequest { doc: Block[]; baseVersion: number; round?: number }
/** POST /submit 본문 (선택). round가 지금 라운드와 다르면 409 not_editable */
export interface SubmitRequest { round?: number }
export interface ProgramSaveResponse { version: number; blocks: number }
/** 409 version_conflict 응답 본문: 서버의 최신 문서를 함께 준다 */
export interface ProgramConflictBody extends ApiErrorBody { doc: Block[]; version: number; blocks: number }
export interface SubmitResponse { submittedAt: string; submitOrder: number }
/** 400 invalid_program 응답 본문: validate()의 사람이 읽는 오류 목록 */
export interface SubmitRejectedBody extends ApiErrorBody { errors: string[] }
export interface PhaseRequest { to: Phase; expect: Phase }
export interface TimerRequest { action: 'pause' | 'resume' | 'add'; seconds?: number }
export interface TeamIdRequest { teamId: string }
export interface BonusRequest { teamId: string; points: number; note: string }
/**
 * POST /kick: memberId(역할 1개) 또는 userId(그 사람의 역할 전부) 중 하나.
 * 역할이 하나도 남지 않으면 그 사람은 대기실로 돌아가고(자동 배정에서 이 게임은 건너뜀) 게임 채널에 'removed'가 간다.
 */
export interface KickRequest { memberId?: string; userId?: string }
/** POST /pull: 대기실 사람을 자동 배정 규칙으로 데려온다. userIds를 주면 그 사람들만 (내보낸 사람도 포함 가능) */
export interface PullRequest { userIds?: string[] }
export type PullResponse = AssignResult;
/** POST /assign: 진행자가 사람을 팀·역할에 넣거나 옮긴다 (역할은 통째로 바뀐다). lobby·coding 중에만 */
export interface AssignRequest { userId: string; teamId: string; roles: GameRole[] }
export interface AssignResponse { ok: true; teamId: string; roles: GameRole[] }
export interface OkResponse { ok: true }

// ------------------------------------------------------------------ 뷰모델 (GET /state, spec §6)
export interface ViewerInfo {
  userId: string;
  displayName: string;
  accountRole: AccountRole;
  /** 이 게임의 진행자이거나 관리자 (진행자 권한: 콘솔·정답·모든 팀 코드) */
  isHost: boolean;
  /** 이 게임을 만든 진행자 본인 (관리자라도 남의 게임이면 false). 화면 문구용 */
  ownsGame: boolean;
  teamId: string | null;
  roles: GameRole[];
}
export interface GameInfo {
  code: string;
  /** 현재 라운드 번호 (rounds 안의 값) = 난이도 레벨 */
  round: RoundNo;
  /** 고른 라운드 (오름차순). 진행은 이 순서대로만 */
  rounds: RoundNo[];
  /** rounds 안에서 현재 라운드의 위치 (0부터). 표기 "R4 · (roundIndex+1)/rounds.length · 난이도 4" */
  roundIndex: number;
  mode: AssignMode;
  phase: Phase;
  timerEndsAt: string | null;
  timerRemaining: number | null;
  runningTeamId: string | null;
  autoplay: boolean;
  hostName: string;
  /**
   * 이번 라운드 보드가 지금까지 보여 준 가장 뒤 실행 순서 (running 이후).
   * 진행자가 앞 팀을 다시 고르거나 재실행해도 줄지 않는다: 이미 본 팀의 결과를 다시 숨기지 않기 위해 쓴다.
   */
  shownUpTo: number;
}
/** 역할 배정 한 건 (members 행). 한 사람이 역할 여러 개면 여러 개가 온다. 내보내기(역할 1개)에 id를 쓴다 */
export interface MemberView { id: string; userId: string; displayName: string; role: GameRole; online: boolean }
/** 팀의 사람 한 명 (역할 여러 개 가능, 한 역할을 여러 명이 공유 가능) */
export interface TeamPersonView {
  userId: string;
  displayName: string;
  /** GAME_ROLES 순서 */
  roles: GameRole[];
  online: boolean;
  /** 역할별 members 행 id (역할 1개 내보내기용) */
  memberIds: Partial<Record<GameRole, string>>;
}
export interface TeamProgramSummary {
  blocks: number;
  submittedAt: string | null;
  submitOrder: number | null;
  sealedBy: SealedBy | null;
}
export interface TeamView {
  id: string;
  name: string;
  color: string;
  seat: number;
  patchLeft: number;
  /** 이번 라운드 running 중 패치가 허용돼 봉인이 풀린 상태 */
  patchActive: boolean;
  /** 역할 배정 목록 (GAME_ROLES 순서, 같은 역할은 들어온 순서) */
  members: MemberView[];
  /** 사람 목록 (들어온 순서, 최대 LIMITS.maxMembersPerTeam명) */
  people: TeamPersonView[];
  /** 아무도 맡지 않은 역할 (GAME_ROLES 순서). 'architect'가 있으면 "아키텍트 없음" 경고 */
  missingRoles: GameRole[];
  program: TeamProgramSummary;
}
export interface MyProgramView {
  teamId: string;
  doc: Block[];
  version: number;
  blocks: number;
  submittedAt: string | null;
  editable: boolean;
  patchActive: boolean;
}
export interface ResultView {
  teamId: string;
  round: RoundNo;
  outcome: Outcome;
  message: string;
  ticks: number;
  blocks: number;
  mice: number;
  /** 엔진 점수만 (scoreLines 합). 라운드 점수 = score + bonus */
  score: number;
  /** 엔진 점수 줄 (이벤트 점수는 들어 있지 않다) */
  scoreLines: ScoreLine[];
  /** 진행자 이벤트 점수 (별도 표시) */
  bonus: number;
  bonusNote: string;
  usedPatch: boolean;
  runOrder: number;
  /** 보드 재생 회차. 재실행·다시 고르기 때 올라간다 (재생 시작 키) */
  runSeq: number;
  /** 진행자·보드와 자기 팀(running 이후)에만 채워진다 */
  trace: Step[] | null;
  /** 진행자·보드에만: 이 결과를 실제로 만든 코드 (trace의 줄 번호가 가리키는 doc) */
  doc?: Block[];
}
export interface StandingRow {
  teamId: string;
  rank: number;
  total: number;
  /** 고른 라운드(GameInfo.rounds)와 같은 순서·길이의 라운드 점수(score + bonus), 아직 없으면 null */
  rounds: (number | null)[];
  goals: number;
  ticks: number;
}
export interface ProgramText { doc: Block[]; text: string }
/**
 * 폰이 접속할 사이트 주소 후보 (origin, 경로 없음). 좋은 것부터.
 * public = OWL_PUBLIC_URL 또는 도메인, lan = 와이파이·유선 사설 주소, vpn = 100.64.0.0/10 (Tailscale 등)
 */
export interface JoinUrl { url: string; kind: 'public' | 'lan' | 'vpn' }
export interface GameView {
  me: ViewerInfo;
  game: GameInfo;
  /** 서버 시각 (시계 보정용) */
  serverNow: string;
  /** 현재 라운드 맵 */
  map: GameMap;
  teams: TeamView[];
  myProgram: MyProgramView | null;
  results: ResultView[];
  standings: StandingRow[];
  /** 진행자에게만: 현재 라운드 정답들의 toText */
  solutions?: string[];
  /** 진행자·보드에게만: 팀별 현재 라운드 코드 */
  programs?: Record<string, ProgramText>;
  /** 진행자·보드에게만: 폰 참가 주소 후보 (lib/server/net.ts) */
  joinUrls?: JoinUrl[];
}

// ------------------------------------------------------------------ 실시간 (SSE, spec §7)
// 서버는 "data: <JSON>\n\n" 형식으로만 보낸다(event: 줄 없음). 클라이언트는 onmessage 하나로 받는다.
export type GameEvent =
  | { type: 'hello'; serverNow: string }
  | { type: 'game' }
  | { type: 'teams' }
  | {
      type: 'program';
      teamId: string;
      round: number;
      doc: Block[];
      version: number;
      blocks: number;
      submittedAt: string | null;
    }
  | { type: 'result'; teamId: string }
  | { type: 'standings' }
  /** 진행자가 이 사람의 역할을 모두 뺐다 (userId가 나면 대기실로) */
  | { type: 'removed'; userId: string }
  | { type: 'deleted' };

// ------------------------------------------------------------------ 대기실 (FEATURE_V4 §3)
/** 대기 중인 사람 (표시 이름·아이디만). since = 대기실에 들어온 시각 (자동 배정 순서) */
export interface LobbyUser { userId: string; username: string; displayName: string; since: string }
/** 참가할 수 있는 게임 (lobby·coding 페이즈). joinable = 6명 미만인 팀이 있다 */
export interface OpenGameSummary {
  code: string;
  hostName: string;
  phase: Phase;
  round: RoundNo;
  rounds: RoundNo[];
  teams: number;
  members: number;
  mode: AssignMode;
  joinable: boolean;
  createdAt: string;
}
/** 내가 팀원인 끝나지 않은 게임 */
export interface MyGameRef { code: string; teamId: string; phase: Phase }
export interface LobbyMe {
  userId: string;
  username: string;
  displayName: string;
  accountRole: AccountRole;
  /** 지금 대기 명단에 있는가 (대기실 SSE 연결 중 + 끝나지 않은 게임의 팀원이 아님) */
  waiting: boolean;
}
export interface LobbyResponse {
  me: LobbyMe;
  serverNow: string;
  /** 들어온 순서 */
  waiting: LobbyUser[];
  /** 최신 게임 먼저 */
  openGames: OpenGameSummary[];
  myGame: MyGameRef | null;
}
/**
 * GET /api/lobby/events (SSE). 참가자 연결은 대기 명단에 들고, 진행자·관리자 연결은 구경만 한다
 * (?watch=1 이면 누구든 구경, 진행자·관리자가 ?wait=1 이면 대기).
 * hello: 연결 직후. lobby: 대기 명단·열린 게임이 바뀔 때 (묶어서 최대 약 50ms 늦게).
 * assigned: 나를 팀에 넣었다 → /play/<code>. game-open: 직접 선택 게임이 열렸다 → /join?code=<code>.
 */
export type LobbyEvent =
  | { type: 'hello'; serverNow: string; waiting: boolean; myGame: MyGameRef | null }
  | { type: 'lobby'; waiting: LobbyUser[]; openGames: OpenGameSummary[] }
  | { type: 'assigned'; code: string; teamId: string; teamName: string; teamColor: string; roles: GameRole[] }
  | { type: 'game-open'; code: string };
/** POST /api/lobby/join: 자동 배정 게임에 나를 넣는다 (사람이 가장 적은 팀). 직접 선택 게임이면 409 self_mode */
export interface LobbyJoinRequest { code: string }
export interface LobbyJoinResponse { code: string; teamId: string; teamName: string; roles: GameRole[] }

// ------------------------------------------------------------------ API 경로
const enc = encodeURIComponent;
export const API = {
  health: '/api/health',
  setup: '/api/setup',
  me: '/api/auth/me',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  signup: '/api/auth/signup',
  password: '/api/auth/password',
  invite: (code: string) => `/api/invites/${enc(code)}`,
  adminInvites: '/api/admin/invites',
  adminInviteRevoke: (code: string) => `/api/admin/invites/${enc(code)}/revoke`,
  adminUsers: '/api/admin/users',
  adminUser: (id: string) => `/api/admin/users/${enc(id)}`,
  adminUserResetPassword: (id: string) => `/api/admin/users/${enc(id)}/reset-password`,
  adminGames: '/api/admin/games',
  adminGame: (code: string) => `/api/admin/games/${enc(code)}`,
  lobby: '/api/lobby',
  /** watch: 구경만 (대기 명단에 들지 않음). 진행자 화면은 true */
  lobbyEvents: (opts: { watch?: boolean } = {}) => `/api/lobby/events${opts.watch ? '?watch=1' : ''}`,
  lobbyJoin: '/api/lobby/join',
  games: '/api/games',
  gameState: (code: string) => `/api/games/${enc(code)}/state`,
  gameEvents: (code: string) => `/api/games/${enc(code)}/events`,
  gameJoin: (code: string) => `/api/games/${enc(code)}/join`,
  gameLeave: (code: string) => `/api/games/${enc(code)}/leave`,
  gameProgram: (code: string) => `/api/games/${enc(code)}/program`,
  gameSubmit: (code: string) => `/api/games/${enc(code)}/submit`,
  gamePhase: (code: string) => `/api/games/${enc(code)}/phase`,
  gameTimer: (code: string) => `/api/games/${enc(code)}/timer`,
  gameRunning: (code: string) => `/api/games/${enc(code)}/running`,
  gamePatch: (code: string) => `/api/games/${enc(code)}/patch`,
  gameRerun: (code: string) => `/api/games/${enc(code)}/rerun`,
  gameBonus: (code: string) => `/api/games/${enc(code)}/bonus`,
  gameKick: (code: string) => `/api/games/${enc(code)}/kick`,
  gamePull: (code: string) => `/api/games/${enc(code)}/pull`,
  gameAssign: (code: string) => `/api/games/${enc(code)}/assign`,
} as const;
