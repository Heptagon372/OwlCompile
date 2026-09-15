// 보드 배치·표시 계산 (순수: 훅·DOM·JSX 없음). 10팀까지. 단위 테스트: tests/board-v4.test.ts
// 화면(BoardClient·Scoreboard·Playback)은 무엇을 몇 열로 그릴지 여기서 받는다.
import { TEAM_PRESETS, roundPosition, type RoundNo, type StandingRow, type TeamView } from '@/lib/contracts';

const TEAM_VAR = new Map(TEAM_PRESETS.map((p, i) => [p.color.toUpperCase(), `var(--color-team-${i + 1})`]));

/**
 * 팀 색 (THEME_V5 §4 "모든 색은 토큰으로"): 서버가 주는 팀 색(TEAM_PRESETS 의 나이트 hex) → 모드 토큰 var(--color-team-N).
 * 나이트 토큰 = TEAM_PRESETS 값이라 나이트 보드는 똑같고, 라이트에서는 밝은 유리 위에서 보이는 짙은 같은 색조가 된다
 * (예: 흰올빼미 #E8E4FF → #4A4468). 프리셋에 없는 색(옛 데이터 등)은 그대로. 인라인 style 의 background·box-shadow 에 쓴다.
 */
export function teamColor(color: string): string {
  return TEAM_VAR.get(color.trim().toUpperCase()) ?? color;
}

/** 접속 중인 사람 수 (역할이 여러 개여도 한 사람은 한 번) */
export function onlineCount(team: Pick<TeamView, 'people'>): number {
  return team.people.filter((p) => p.online).length;
}

/** 대기 화면 팀 카드 격자의 열 수: 5팀까지 한 줄, 6팀부터 두 줄 (6→3, 7·8→4, 9·10→5) */
export function lobbyGridCols(n: number): number {
  const count = Math.max(1, Math.floor(n));
  return count <= 5 ? count : Math.ceil(count / 2);
}

/** 코딩 화면 팀 제출 알약의 열 수: 5팀까지 1열, 6팀부터 2열 */
export function pillGridCols(n: number): 1 | 2 {
  return n > 5 ? 2 : 1;
}

/** 순위 카드 배치: 5팀까지 1열, 6팀부터 2열 (세로 먼저: 왼쪽 열 1~5위, 오른쪽 열 6~10위) */
export interface RankLayout {
  cols: 1 | 2;
  /** 한 열의 칸 수 */
  perCol: number;
}
export const RANK_SINGLE_MAX = 5;

export function rankLayout(n: number): RankLayout {
  const count = Math.max(1, Math.floor(n));
  return count <= RANK_SINGLE_MAX ? { cols: 1, perCol: count } : { cols: 2, perCol: Math.ceil(count / 2) };
}

/** 순위 자리 index(0부터)의 칸 */
export function rankSlot(index: number, layout: RankLayout): { col: number; row: number } {
  return { col: Math.floor(index / layout.perCol), row: index % layout.perCol };
}

/**
 * 지난 자리 from 에서 새 자리 to 까지 되돌아갈 칸 수 (새 칸 기준, 열 dx · 행 dy).
 * 칸 크기가 모두 같으므로 카드는 translate(dx·100%, dy·100%) 에서 출발해 제자리(0,0)로 미끄러진다.
 */
export function rankShift(from: number, to: number, layout: RankLayout): { dx: number; dy: number } {
  const a = rankSlot(from, layout);
  const b = rankSlot(to, layout);
  return { dx: a.col - b.col, dy: a.row - b.row };
}

/**
 * 순위 카드 강조(bg-highlight)를 받을 팀: 1위 팀 모두 (동점 1위는 똑같이 보인다).
 * 모든 팀이 1위로 같으면(예: 전원 0점) 앞선 팀이 없으므로 아무도 강조하지 않는다.
 */
export function rankHighlightIds(rows: readonly Pick<StandingRow, 'teamId' | 'rank'>[]): Set<string> {
  const leaders = rows.filter((r) => r.rank === 1);
  if (leaders.length === 0 || (rows.length > 1 && leaders.length === rows.length)) return new Set();
  return new Set(leaders.map((r) => r.teamId));
}

/** 코딩 타이머 링 색: 일시정지 = 호박색, 30초 이하 = 장밋빛, 그 외 보라 */
export type BoardTimerTone = 'violet' | 'warn' | 'danger';
export const URGENT_SEC = 30;

export function timerTone(sec: number | null, paused: boolean): BoardTimerTone {
  if (paused) return 'warn';
  if (sec != null && sec <= URGENT_SEC) return 'danger';
  return 'violet';
}

/** 타이머 링의 최댓값: 맵 코딩 시간 (진행자가 시간을 늘려 남은 초가 더 크면 그 값) */
export function ringMax(sec: number | null, seconds: number): number {
  return Math.max(1, seconds, sec ?? 0);
}

/** 라운드 표기: short "R4", step "3/5 · 난이도 4", label "R4 · 3/5 · 난이도 4" (고른 라운드 안의 위치) */
export function roundCaption(rounds: readonly RoundNo[], round: RoundNo): { short: string; step: string; label: string } {
  const pos = roundPosition(rounds, round);
  if (pos.index < 0) return { short: `R${round}`, step: `난이도 ${round}`, label: `R${round} · 난이도 ${round}` };
  return { short: `R${round}`, step: `${pos.step}/${pos.total} · 난이도 ${round}`, label: pos.label };
}

/** 부호 붙인 점수 ("+12", "0", "-5") */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
