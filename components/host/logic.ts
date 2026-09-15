// 진행자 화면(/host, /host/[code])의 순수 계산 (훅·JSX 없음 → 단위 테스트 가능).
import {
  AUTOPLAY_GAP_MS, DEFAULT_ROUNDS, ENDING_MS, GAME_ROLES, LIMITS, ROLE_LABEL, ROUND_PRESETS, TEAM_PRESETS, TICK_MS,
  autoRoleSplit, autoRolesForNewcomer, autoTeamSizes, nextRoundOf, prevRoundOf,
  type AssignMode, type AssignResult, type GameRole, type Phase, type RoundNo, type RoundPresetId,
} from '@/lib/contracts';

// ------------------------------------------------------------------ 새 게임 (FEATURE_V4 §1–§3)

/** 서버 페이지가 넘겨 주는 라운드 정보 (맵 이름·난이도·상한·시간만. 정답은 없다) */
export interface RoundMeta {
  round: RoundNo;
  name: string;
  difficulty: string;
  cap: number;
  seconds: number;
}

/** 라운드 칩 켜고 끄기: 오름차순·중복 없음 유지, 마지막 하나는 끌 수 없다 */
export function toggleRound(rounds: readonly RoundNo[], r: RoundNo): RoundNo[] {
  if (rounds.includes(r)) return rounds.length <= 1 ? [...rounds] : rounds.filter((x) => x !== r);
  return [...rounds, r].sort((a, b) => a - b);
}

/** 라운드 목록 짧은 표기: 이어지면 "R1–3", 하나면 "R4", 아니면 "R1 · R3 · R6" */
export function roundsText(rounds: readonly RoundNo[]): string {
  if (rounds.length === 0) return '';
  if (rounds.length === 1) return `R${rounds[0]}`;
  const run = rounds.every((r, i) => i === 0 || r === rounds[i - 1] + 1);
  return run ? `R${rounds[0]}–${rounds[rounds.length - 1]}` : rounds.map((r) => `R${r}`).join(' · ');
}

/** 고른 라운드가 프리셋과 똑같으면 그 id, 아니면 null (직접 조합) */
export function presetOf(rounds: readonly RoundNo[]): RoundPresetId | null {
  const key = rounds.join(',');
  return ROUND_PRESETS.find((p) => p.rounds.join(',') === key)?.id ?? null;
}

export interface PreviewTeam {
  name: string;
  color: string;
  /** 자동 배정으로 들어갈 사람 수 (직접 선택이면 0) */
  size: number;
  /** 들어갈 사람별 역할 (autoRoleSplit) */
  roles: GameRole[][];
}

/**
 * 새 게임 미리보기: 팀별 예상 인원. 자동 배정 = 대기 인원을 i mod T 로 (팀당 최대 6명), 직접 선택 = 모두 0.
 * capacity = 팀 수 × 6, placed = 이번에 팀에 들어갈 사람, leftWaiting = 자리가 없어 남는 사람 (직접 선택이면 0),
 * emptyTeams = 아무도 없을 팀 수 (자동 배정에서 대기 인원이 팀 수보다 적을 때)
 */
export function createPreview(waiting: number, teams: number, mode: AssignMode): {
  teams: PreviewTeam[];
  capacity: number;
  placed: number;
  leftWaiting: number;
  emptyTeams: number;
} {
  const t = Math.max(LIMITS.minTeams, Math.min(LIMITS.maxTeams, Math.floor(teams)));
  const auto = mode === 'auto';
  const { sizes, placed, leftWaiting } = autoTeamSizes(auto ? waiting : 0, t);
  const list = TEAM_PRESETS.slice(0, t).map((p, i) => ({ name: p.name, color: p.color, size: sizes[i] ?? 0, roles: autoRoleSplit(sizes[i] ?? 0) }));
  return {
    teams: list,
    capacity: t * LIMITS.maxMembersPerTeam,
    placed,
    leftWaiting,
    emptyTeams: auto && waiting > 0 ? list.filter((x) => x.size === 0).length : 0,
  };
}

/** 게임을 만든 뒤 알림 문구: "N명 배정, M명 대기" */
export function assignSummary(res: Pick<AssignResult, 'assigned' | 'leftWaiting'>): string {
  return `${res.assigned}명 배정, ${res.leftWaiting}명 대기`;
}

/** 더 데려오기 결과 문구 */
export function pullMessage(res: Pick<AssignResult, 'assigned' | 'leftWaiting'>): string {
  if (res.assigned === 0) return res.leftWaiting > 0 ? `자리가 부족합니다 · ${res.leftWaiting}명 대기` : '데려올 사람이 없습니다';
  return res.leftWaiting > 0 ? `${assignSummary(res)} · 자리가 부족합니다` : assignSummary(res);
}

/** 대기실에서 기다린 시간 "방금" / "3분" / "1시간 5분" */
export function waitLabel(sinceIso: string, nowMs: number | null): string {
  const t = Date.parse(sinceIso);
  if (nowMs == null || Number.isNaN(t)) return '';
  const min = Math.floor(Math.max(0, nowMs - t) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

// ------------------------------------------------------------------ 콘솔: 팀원 도구 (FEATURE_V4 §2–§3)

/** 팀원 넣기·옮기기가 되는 페이즈 (서버 assign·pull 은 lobby·coding 에서만) */
export function canAssignIn(phase: Phase): boolean {
  return phase === 'lobby' || phase === 'coding';
}

/** 이 팀에 한 명 더 넣을 때 기본 역할 (자동 배정 규칙: 빠진 역할 전부, 없으면 순서대로 하나) */
export function newcomerRoles(team: { people: readonly unknown[]; missingRoles: readonly GameRole[] }): GameRole[] {
  const covered = GAME_ROLES.filter((r) => !team.missingRoles.includes(r));
  return autoRolesForNewcomer(team.people.length, covered);
}

/** 옮길 수 있는 팀: 6명이 찬 팀은 막는다 (그 사람이 이미 그 팀이면 역할만 바꾸므로 된다) */
export function moveTargets<T extends { id: string; people: readonly { userId: string }[] }>(
  teams: readonly T[],
  userId: string | null,
): { team: T; count: number; full: boolean; current: boolean }[] {
  return teams.map((team) => {
    const current = userId != null && team.people.some((p) => p.userId === userId);
    const count = team.people.length;
    return { team, count, current, full: !current && count >= LIMITS.maxMembersPerTeam };
  });
}

/** 사람이 가장 적은 팀 (같으면 앞 팀). 넣기 기본값 */
export function fewestTeam<T extends { id: string; people: readonly unknown[] }>(teams: readonly T[]): T | null {
  let best: T | null = null;
  for (const t of teams) if (!best || t.people.length < best.people.length) best = t;
  return best;
}

/** 역할 목록 "러너 · 터너" */
export function rolesText(roles: readonly GameRole[]): string {
  return roles.map((r) => ROLE_LABEL[r]).join(' · ');
}

/** 코딩 타이머 링: 남은 초와 링 전체 (시간을 더해 맵 시간보다 길어져도 링이 넘치지 않게) */
export function timerRing(sec: number | null, mapSeconds: number): { value: number; max: number } {
  const v = Math.max(0, sec ?? 0);
  return { value: v, max: Math.max(1, mapSeconds, v) };
}

/** autoplay: 한 팀 재생이 끝나고 다음 팀으로 넘어가기까지 (spec §8: ticks×600 + 2000 + 3000) */
export function autoplayDelayMs(ticks: number): number {
  return Math.max(0, ticks) * TICK_MS + ENDING_MS + AUTOPLAY_GAP_MS;
}

/** 실행 순서(runOrder)에서 current 다음 팀. current가 없으면 첫 팀, 마지막이면 null */
export function nextRunningTeam(
  results: readonly { teamId: string; runOrder: number }[],
  current: string | null,
): string | null {
  const order = [...results].sort((a, b) => a.runOrder - b.runOrder);
  if (order.length === 0) return null;
  if (!current) return order[0].teamId;
  const i = order.findIndex((r) => r.teamId === current);
  if (i < 0) return order[0].teamId;
  return order[i + 1]?.teamId ?? null;
}

/**
 * autoplay가 넘어갈 다음 팀: 이번 라운드에 이미 보여 준 가장 뒤 순서(shownUpTo)와 지금 팀 중 큰 쪽 다음.
 * 재실행으로 앞 팀을 다시 보여 줘도 이미 본 팀들을 다시 재생하지 않는다. 없으면 null.
 */
export function autoplayNextTeam(
  results: readonly { teamId: string; runOrder: number }[],
  current: string | null,
  shownUpTo: number,
): string | null {
  const order = [...results].sort((a, b) => a.runOrder - b.runOrder);
  const cur = current ? (order.find((r) => r.teamId === current)?.runOrder ?? 0) : 0;
  const mark = Math.max(shownUpTo, cur);
  return order.find((r) => r.runOrder > mark)?.teamId ?? null;
}

/** 재실행 점수 줄 라벨 (엔진 score가 usedPatch일 때 붙인다). 이 줄이 있으면 재실행을 이미 한 결과다 */
export const PATCH_LINE_LABEL = '패치권 사용';

/**
 * 재실행 버튼 상태: 패치를 허용한 팀(usedPatch, 패치권 0장)만.
 * 'waiting' = 팀이 아직 다시 제출하지 않음(버튼 비활성), 'ready' = 누를 수 있음, 'hidden' = 안 보임(재실행 끝남 포함)
 */
export function rerunState(
  phase: Phase,
  result: { usedPatch: boolean; scoreLines: readonly { label: string }[] } | null,
  team: { patchLeft: number; program: { submittedAt: string | null } },
): 'hidden' | 'waiting' | 'ready' {
  if (phase !== 'running' || !result || !result.usedPatch || team.patchLeft !== 0) return 'hidden';
  const submitted = team.program.submittedAt != null;
  const rerunDone = submitted && result.scoreLines.some((l) => l.label === PATCH_LINE_LABEL);
  if (rerunDone) return 'hidden';
  return submitted ? 'ready' : 'waiting';
}

/** 다음 페이즈 버튼: 목적지와 라벨 (finished면 null). rounds = 게임에서 고른 라운드 (진행은 이 순서대로만) */
export function nextPhase(phase: Phase, round: RoundNo, rounds: readonly RoundNo[] = DEFAULT_ROUNDS): { to: Phase; label: string } | null {
  switch (phase) {
    case 'lobby': return { to: 'coding', label: '코딩 시작' };
    case 'coding': return { to: 'sealed', label: '봉인' };
    case 'sealed': return { to: 'running', label: '실행' };
    case 'running': return { to: 'scored', label: '점수 확정' };
    case 'scored': return nextRoundOf(rounds, round) != null ? { to: 'coding', label: '다음 라운드' } : { to: 'finished', label: '최종 순위' };
    default: return null;
  }
}

/** 이전 페이즈로 되돌릴 목적지 (lobby면 null). 고른 라운드의 첫 라운드면 코딩 → 대기실 */
export function prevPhase(phase: Phase, round: RoundNo, rounds: readonly RoundNo[] = DEFAULT_ROUNDS): Phase | null {
  switch (phase) {
    case 'coding': return prevRoundOf(rounds, round) == null ? 'lobby' : 'scored';
    case 'sealed': return 'coding';
    case 'running': return 'sealed';
    case 'scored': return 'running';
    case 'finished': return 'scored';
    default: return null;
  }
}

/** 되돌릴 때 확인 문구 */
export function prevPhaseWarning(phase: Phase): string {
  switch (phase) {
    case 'running': return '이번 라운드 실행 결과와 이벤트(보너스) 점수가 모두 지워지고 봉인 상태로 돌아갑니다. 이번 라운드에 허용한 패치는 취소되고 패치 전 코드로 돌아갑니다.';
    case 'sealed': return '봉인을 풀고 코딩 중으로 돌아갑니다. 타이머는 서버 규칙대로 다시 맞춰집니다.';
    case 'scored': return '점수 확정을 취소하고 실행 화면으로 돌아갑니다.';
    case 'finished': return '최종 순위를 닫고 점수 발표로 돌아갑니다. 팀원이 이미 다른 게임에 배정됐으면 되돌릴 수 없습니다.';
    case 'coding': return '코딩을 멈추고 이전 페이즈로 돌아갑니다. 이번 라운드에 한 제출(아키텍트 봉인과 최초 제출 순서 포함)이 모두 지워지고, 코딩을 다시 시작하면 타이머도 처음부터 다시 갑니다.';
    default: return '';
  }
}

export const OUTCOME_LABEL: Record<'goal' | 'error' | 'dead' | 'stuck', string> = {
  goal: '도착', error: '에러', dead: '사망', stuck: '미도착',
};

/** 패치를 허용할 수 있는 결과 (spec §8) */
export function canPatchOutcome(outcome: string): boolean {
  return outcome === 'error' || outcome === 'dead' || outcome === 'stuck';
}

/** ISO → "14:03:27" (로컬 시각) */
export function clockTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 참가 안내에 보여 줄 주소: 서버가 준 후보(joinUrls, 좋은 것부터)가 있으면 그것, 없으면 지금 브라우저 origin.
 * best = 크게 보여 줄 주소, others = 작게 보여 줄 나머지. localOnly = best가 이 PC에서만 열리는 주소
 */
export function pickJoinUrls(
  joinUrls: readonly { url: string; kind: 'public' | 'lan' | 'vpn' }[] | undefined,
  fallbackOrigin: string,
): {
  best: { url: string; kind: 'public' | 'lan' | 'vpn' | 'local' } | null;
  others: { url: string; kind: 'public' | 'lan' | 'vpn' }[];
} {
  const list = joinUrls ?? [];
  if (list.length > 0) return { best: list[0], others: list.slice(1) };
  if (!fallbackOrigin) return { best: null, others: [] };
  const local = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i.test(fallbackOrigin);
  return { best: { url: fallbackOrigin, kind: local ? 'local' : 'lan' }, others: [] };
}

/** 사람이 옮겨 적기 쉬운 참가 주소: http:// 는 빼고 /join 을 붙인다 (https는 그대로 둔다) */
export function joinDisplay(url: string): string {
  return `${url.replace(/^http:\/\//i, '').replace(/\/+$/, '')}/join`;
}

/**
 * 콘솔 동작 실행기: 경로·본문을 POST 하고 성공 여부를 돌려준다 (오류는 토스트로 보여 준다).
 * okMessage 가 함수면 응답 본문으로 문구를 만든다 (예: 더 데려오기 → "3명 배정, 1명 대기").
 */
export type HostAction = (
  path: string,
  body: unknown,
  okMessage?: string | ((res: never) => string),
) => Promise<boolean>;
