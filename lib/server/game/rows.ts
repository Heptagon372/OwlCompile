// 게임 테이블 행 타입과 조회 헬퍼. 서버 전용.
import {
  DEFAULT_ROUNDS, isRoundList, type AssignMode, type GameRole, type Phase, type RoundNo, type SealedBy,
} from '@/lib/contracts';
import type { Block, GameMap, ScoreLine, Step } from '@/lib/engine';
import { MAPS } from '@/lib/engine';
import { all, one } from '../db';
import { conflict, forbidden, notFound } from '../http';
import type { SessionUser } from '../session';
import { readStoredDoc } from '../docSchema';

export interface GameRow {
  id: string;
  code: string;
  host_id: string;
  round: RoundNo;
  /** 고른 라운드 JSON 배열 (roundsOf로 읽는다) */
  rounds: string;
  mode: AssignMode;
  phase: Phase;
  timer_ends_at: string | null;
  timer_remaining: number | null;
  running_team_id: string | null;
  autoplay: number;
  created_at: string;
  /** 이번 라운드 보드가 지금까지 보여 준 가장 뒤 실행 순서 */
  shown_up_to: number;
}

export interface TeamRow {
  id: string;
  game_id: string;
  name: string;
  color: string;
  seat: number;
  patch_left: number;
}

export interface MemberRow {
  id: string;
  game_id: string;
  team_id: string;
  user_id: string;
  role: GameRole;
  joined_at: string;
}

export interface ProgramRow {
  team_id: string;
  round: number;
  game_id: string;
  doc: string;
  version: number;
  blocks: number;
  submitted_at: string | null;
  submit_order: number | null;
  sealed_by: SealedBy | null;
  /** 패치 허용 직전의 doc (running→sealed 되돌리기에서 복원). 평소엔 null */
  prepatch_doc: string | null;
}

export interface ResultRow {
  team_id: string;
  round: number;
  game_id: string;
  outcome: string;
  message: string;
  ticks: number;
  blocks: number;
  mice: number;
  trace: string;
  used_patch: number;
  score: number;
  score_lines: string;
  bonus: number;
  bonus_note: string;
  run_order: number;
  /** 보드 재생 회차: 재실행·다시 고르기마다 1씩 오른다 */
  run_seq: number;
  /** 이 결과를 만든 doc JSON (예전 행은 null) */
  doc: string | null;
  /** 패치 후 재실행을 마쳤으면 1 */
  reran: number;
}

export const CODE_PATTERN = /^\d{4}$/;

/** 엔진에 맵이 있는 라운드 (오름차순). R6·R7이 엔진에 아직 없으면 1~5 */
export function availableRounds(): RoundNo[] {
  return Object.keys(MAPS)
    .map(Number)
    .filter((n): n is RoundNo => Number.isInteger(n) && n >= 1 && n <= 7)
    .sort((a, b) => a - b);
}

/** 라운드 맵. 엔진에 없는 라운드면 409 round_unavailable */
export function mapOf(game: Pick<GameRow, 'round'>): GameMap {
  const m = (MAPS as Partial<Record<number, GameMap>>)[game.round];
  if (!m) throw conflict(`R${game.round} 맵이 아직 준비되지 않았습니다.`, 'round_unavailable');
  return m;
}

/** 고른 라운드 목록 (예전 행·잘못된 값이면 기본 [1,2,3,4,5]) */
export function roundsOf(game: Pick<GameRow, 'rounds'>): RoundNo[] {
  try {
    const v: unknown = JSON.parse(game.rounds);
    if (isRoundList(v)) return v;
  } catch {
    // 아래 기본값
  }
  return [...DEFAULT_ROUNDS];
}

/** 팀의 서로 다른 사람 수 (exceptUserId는 빼고 센다) */
export function teamHeadcount(teamId: string, exceptUserId = ''): number {
  return one<{ n: number }>(
    'select count(distinct user_id) as n from members where team_id = ? and user_id <> ?', teamId, exceptUserId,
  )?.n ?? 0;
}

/** 내가 팀원인 끝나지 않은 게임 (가장 최근 것). 없으면 null */
export function activeGameOf(userId: string): { code: string; teamId: string; phase: Phase } | null {
  const r = one<{ code: string; team_id: string; phase: Phase }>(
    `select g.code, m.team_id, g.phase from members m join games g on g.id = m.game_id
      where m.user_id = ? and g.phase <> 'finished' order by g.created_at desc, g.rowid desc limit 1`, userId);
  return r ? { code: r.code, teamId: r.team_id, phase: r.phase } : null;
}

/** 이 게임 말고 다른 끝나지 않은 게임의 팀원인가 */
export function inOtherUnfinishedGame(userId: string, gameId: string): boolean {
  return !!one(
    `select 1 from members m join games g on g.id = m.game_id
      where m.user_id = ? and g.phase <> 'finished' and g.id <> ? limit 1`, userId, gameId);
}

export function gameByCode(code: string): GameRow {
  if (!CODE_PATTERN.test(code)) throw notFound('게임을 찾을 수 없습니다.');
  const g = one<GameRow>('select * from games where code = ?', code);
  if (!g) throw notFound('게임을 찾을 수 없습니다.');
  return g;
}

export function gameById(id: string): GameRow {
  const g = one<GameRow>('select * from games where id = ?', id);
  if (!g) throw notFound('게임을 찾을 수 없습니다.');
  return g;
}

export function teamsOf(gameId: string): TeamRow[] {
  return all<TeamRow>('select * from teams where game_id = ? order by seat', gameId);
}

export function teamOf(game: GameRow, teamId: string): TeamRow {
  const t = one<TeamRow>('select * from teams where id = ? and game_id = ?', teamId, game.id);
  if (!t) throw notFound('팀을 찾을 수 없습니다.');
  return t;
}

export function membersOf(gameId: string): MemberRow[] {
  // 같은 시각에 한꺼번에 넣은 행(자동 배정)은 넣은 순서(rowid)대로
  return all<MemberRow>('select * from members where game_id = ? order by joined_at, rowid', gameId);
}

export function membershipOf(gameId: string, userId: string): { teamId: string | null; roles: GameRole[] } {
  const rows = all<MemberRow>('select * from members where game_id = ? and user_id = ?', gameId, userId);
  if (rows.length === 0) return { teamId: null, roles: [] };
  const order = ['runner', 'turner', 'controller', 'architect'];
  const roles = rows.map((r) => r.role).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { teamId: rows[0].team_id, roles };
}

export function programOf(teamId: string, round: number): ProgramRow | undefined {
  return one<ProgramRow>('select * from programs where team_id = ? and round = ?', teamId, round);
}

export function programsOf(gameId: string, round: number): ProgramRow[] {
  return all<ProgramRow>('select * from programs where game_id = ? and round = ?', gameId, round);
}

export function resultOf(teamId: string, round: number): ResultRow | undefined {
  return one<ResultRow>('select * from results where team_id = ? and round = ?', teamId, round);
}

export function resultsOf(gameId: string, round?: number): ResultRow[] {
  return round === undefined
    ? all<ResultRow>('select * from results where game_id = ? order by round, run_order', gameId)
    : all<ResultRow>('select * from results where game_id = ? and round = ? order by run_order', gameId, round);
}

export function docOf(p: ProgramRow | undefined): Block[] {
  return p ? readStoredDoc(p.doc) : [];
}

export function parseLines(text: string): ScoreLine[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as ScoreLine[]) : [];
  } catch {
    return [];
  }
}

export function parseTrace(text: string): Step[] {
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? (v as Step[]) : [];
  } catch {
    return [];
  }
}

/** 이 게임의 진행자(지금도 host 역할)이거나 관리자. 진행자가 player로 강등되면 권한이 사라진다. */
export function isHostOf(game: GameRow, user: SessionUser): boolean {
  return user.role === 'admin' || (user.role === 'host' && game.host_id === user.id);
}

export function requireHost(game: GameRow, user: SessionUser): void {
  if (!isHostOf(game, user)) throw forbidden('이 게임의 진행자만 할 수 있습니다.', 'not_host');
}

/** running 중 패치가 허용돼 봉인이 풀린 상태 */
export function isPatchActive(game: GameRow, team: TeamRow, program: ProgramRow | undefined): boolean {
  return game.phase === 'running' && team.patch_left === 0 && !!program && program.submitted_at === null;
}
