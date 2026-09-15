// 대기실·홈 공용 순수 도우미 (훅 없음, 서버·클라이언트 어디서나). contracts 만 가져온다 (엔진·정답 없음).
import {
  PHASE_STATUS, ROLE_LABEL, roundPosition, sortRoles, type GameRole, type OpenGameSummary, type Phase,
} from '@/lib/contracts';

/** 조사 "(으)로": 받침이 없거나 ㄹ 받침이면 '로', 아니면 '으로'. 한글이 아니면 '로' */
export function josaRo(word: string): string {
  const s = word.trim();
  if (!s) return '로';
  const code = s.charCodeAt(s.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '로';
  const jong = (code - 0xac00) % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

/** 역할 이름들 (GAME_ROLES 순서, 가운뎃점으로) — 없으면 "팀원" */
export function rolesText(roles: readonly GameRole[]): string {
  const s = sortRoles(roles);
  return s.length ? s.map((r) => ROLE_LABEL[r]).join('·') : '팀원';
}

/** 배정 토스트: "수리부엉이 팀 · 러너로 배정됐어요" */
export function assignedMessage(e: { teamName: string; roles: readonly GameRole[] }): string {
  const r = rolesText(e.roles);
  return `${e.teamName} 팀 · ${r}${josaRo(r)} 배정됐어요`;
}

/** 게임 코드 입력 정리: 숫자만, 4자리까지 */
export function cleanGameCode(raw: string): string {
  return raw.replace(/[^0-9]/g, '').slice(0, 4);
}

export function isGameCode(v: string): boolean {
  return /^[0-9]{4}$/.test(v);
}

/** 열린 게임 정렬: 참가할 수 있는 게임 먼저, 그 안에서는 원래 순서(최신 먼저) 그대로 */
export function sortOpenGames(games: readonly OpenGameSummary[]): OpenGameSummary[] {
  return games
    .map((g, i) => ({ g, i }))
    .sort((a, b) => Number(b.g.joinable) - Number(a.g.joinable) || a.i - b.i)
    .map((x) => x.g);
}

/** 열린 게임 한 줄 설명: "김진행 · R3 · 2/5 · 난이도 3 · 팀 4 · 13명" */
export function openGameMeta(g: Pick<OpenGameSummary, 'hostName' | 'round' | 'rounds' | 'teams' | 'members'>): string {
  const parts = [g.hostName || '진행자', roundPosition(g.rounds, g.round).label, `팀 ${g.teams}`, `${g.members}명`];
  return parts.join(' · ');
}

/** 페이즈 → 상태 알약 뜻 (대기 호박색 · 진행 보라 · 종료 초록). 모든 화면 공통 값 = contracts PHASE_STATUS */
export function phaseStatus(phase: Phase): 'pending' | 'progress' | 'done' {
  return PHASE_STATUS[phase];
}

/** 기다린 시간 문구: "방금 들어왔어요" / "3분째 기다리는 중" / "1시간 5분째 기다리는 중" */
export function waitText(sinceIso: string | null | undefined, nowMs: number): string {
  const t = sinceIso ? Date.parse(sinceIso) : NaN;
  if (!Number.isFinite(t)) return '';
  const min = Math.floor(Math.max(0, nowMs - t) / 60_000);
  if (min < 1) return '방금 들어왔어요';
  if (min < 60) return `${min}분째 기다리는 중`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}시간${m ? ` ${m}분` : ''}째 기다리는 중`;
}

const DAY = 86_400_000;

function localMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * 최근 days일 동안 날짜별 개수 (오래된 날 먼저, 마지막 칸 = 오늘). 로컬 자정 기준.
 * 범위 밖·잘못된 날짜는 뺀다.
 */
export function dailyCounts(isoList: readonly (string | null | undefined)[], days: number, nowMs: number): number[] {
  const n = Math.max(1, Math.floor(days));
  const out = new Array<number>(n).fill(0);
  const today = localMidnight(nowMs);
  for (const iso of isoList) {
    const t = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(t) || t > nowMs) continue;
    const back = t >= today ? 0 : Math.ceil((today - t) / DAY);
    if (back < n) out[n - 1 - back] += 1;
  }
  return out;
}

/** 최근 days일 각 날의 끝까지 쌓인 개수 (누적, 마지막 칸 = 지금까지 전체) */
export function cumulativeCounts(isoList: readonly (string | null | undefined)[], days: number, nowMs: number): number[] {
  const n = Math.max(1, Math.floor(days));
  const valid = isoList.map((s) => (s ? Date.parse(s) : NaN)).filter((t) => Number.isFinite(t) && t <= nowMs);
  const total = valid.length;
  const daily = dailyCounts(isoList, n, nowMs);
  const out = new Array<number>(n).fill(0);
  let after = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    out[i] = total - after;
    after += daily[i];
  }
  return out;
}
