// 계정·초대·로그인·관리자 기능 (docs/WEBSITE_SPEC.md §4). 서버 전용.
// 쿠키는 다루지 않는다: 세션 쿠키는 라우트 핸들러가 session.ts의 createSession/destroySession으로 처리한다.
import { roundsOf } from './game/rows';
import type {
  AccountRole,
  AccountStatus,
  AdminUserRow,
  AssignMode,
  GameSummary,
  InviteCheckResponse,
  InviteInvalidReason,
  InviteRole,
  InviteRow,
  InviteStatus,
  Phase,
  RoundNo,
} from '@/lib/contracts';
import { LIMITS } from '@/lib/contracts';
import { all, bool, newId, nowIso, one, run, tx } from './db';
import { HttpError, badRequest, conflict, forbidden, notFound, tooMany } from './http';
import { dummyHash, hashPassword, randomCode, tempPassword, verifyPassword } from './password';
import { destroyUserSessions, type SessionUser } from './session';
import { disconnectUser } from './realtime';

// ------------------------------------------------------------------ 입력 규칙
export const USERNAME_RE = new RegExp(LIMITS.usernamePattern);
export const INVITE_CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
export const PASSWORD_MAX = 200;
export const INVITE_NOTE_MAX = 60;
export const INVITE_MAX_DAYS = 90;

/** 표시 이름: 앞뒤 공백 제거, 1~20자 */
export function cleanDisplayName(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ');
  if (v.length < 1 || [...v].length > LIMITS.displayNameMax) {
    throw badRequest(`표시 이름은 1~${LIMITS.displayNameMax}자로 입력해 주세요.`, 'invalid_display_name');
  }
  return v;
}

export function checkUsername(raw: string): string {
  const v = raw.trim();
  if (!USERNAME_RE.test(v)) {
    throw badRequest('아이디는 영문·숫자·밑줄(_) 3~20자로 입력해 주세요.', 'invalid_username');
  }
  return v;
}

export function checkNewPassword(pw: string): void {
  if (pw.length < LIMITS.passwordMin) {
    throw badRequest(`비밀번호는 ${LIMITS.passwordMin}자 이상으로 입력해 주세요.`, 'weak_password');
  }
  if (pw.length > PASSWORD_MAX) throw badRequest('비밀번호가 너무 깁니다.', 'invalid_password');
}

/** 로그인 뒤 돌아갈 경로: 같은 사이트의 상대 경로만 허용, 아니면 '/' (구현은 lib/nextPath.ts, 클라이언트와 공용) */
export { safeNextPath } from '@/lib/nextPath';

// ------------------------------------------------------------------ 사용자
interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: AccountRole;
  status: AccountStatus;
  must_change_password: number;
  created_at: string;
  last_login_at: string | null;
}

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: bool(row.must_change_password),
  };
}

export function userCount(): number {
  return one<{ n: number }>('select count(*) as n from users')?.n ?? 0;
}

export function needsSetup(): boolean {
  return userCount() === 0;
}

function userById(id: string): UserRow | undefined {
  return one<UserRow>('select * from users where id = ?', id);
}

function userByUsername(username: string): UserRow | undefined {
  return one<UserRow>('select * from users where username = ?', username.trim());
}

export function getUserById(id: string): SessionUser | null {
  const row = userById(id);
  return row ? toSessionUser(row) : null;
}

function insertUser(input: {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AccountRole;
  mustChange?: boolean;
}): void {
  if (userByUsername(input.username)) throw conflict('이미 쓰고 있는 아이디입니다.', 'username_taken');
  run(
    `insert into users (id, username, display_name, password_hash, role, status, must_change_password, created_at)
     values (?, ?, ?, ?, ?, 'active', ?, ?)`,
    input.id, input.username, input.displayName, input.passwordHash, input.role, input.mustChange ? 1 : 0, nowIso(),
  );
}

export interface NewUserInput {
  username: string;
  displayName: string;
  password: string;
}

/** 아무 조건 없이 사용자를 만든다 (CLI 복구용·테스트용). 아이디가 있으면 409. */
export async function createUser(input: NewUserInput & { role: AccountRole; mustChange?: boolean }): Promise<SessionUser> {
  const username = checkUsername(input.username);
  const displayName = cleanDisplayName(input.displayName);
  checkNewPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const id = newId();
  tx(() => insertUser({ id, username, displayName, passwordHash, role: input.role, mustChange: input.mustChange }));
  return getUserById(id)!;
}

/** 최초 관리자 생성: 사용자가 0명일 때만. 1명 이상이면 404. */
export async function setupAdmin(input: NewUserInput): Promise<SessionUser> {
  if (!needsSetup()) throw notFound();
  const username = checkUsername(input.username);
  const displayName = cleanDisplayName(input.displayName);
  checkNewPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const id = newId();
  tx(() => {
    if (!needsSetup()) throw notFound(); // 동시에 두 번 눌러도 한 명만
    insertUser({ id, username, displayName, passwordHash, role: 'admin' });
  });
  return getUserById(id)!;
}

// ------------------------------------------------------------------ 초대
interface InviteDbRow {
  code: string;
  role: InviteRole;
  note: string;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

/** 붙여 넣은 코드 정리: 공백 제거, 대문자, 8자면 가운데 하이픈 */
export function normalizeInviteCode(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/[\s_]/g, '');
  if (/^[A-Z0-9]{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4)}`;
  return v;
}

export function newInviteCode(): string {
  return `${randomCode(4)}-${randomCode(4)}`;
}

export function inviteStatus(row: Pick<InviteDbRow, 'used_at' | 'revoked_at' | 'expires_at'>, now = nowIso()): InviteStatus {
  if (row.used_at) return 'used';
  if (row.revoked_at) return 'revoked';
  if (row.expires_at && row.expires_at <= now) return 'expired';
  return 'pending';
}

function inviteByCode(code: string): InviteDbRow | undefined {
  const c = normalizeInviteCode(code);
  if (!INVITE_CODE_RE.test(c)) return undefined;
  return one<InviteDbRow>('select * from invites where code = ?', c);
}

const INVITE_REASON_MESSAGE: Record<InviteInvalidReason, string> = {
  not_found: '없는 초대 코드입니다. 받은 링크를 다시 확인해 주세요.',
  used: '이미 사용한 초대입니다. 관리자에게 새 초대를 받아 주세요.',
  expired: '기간이 지난 초대입니다. 관리자에게 새 초대를 받아 주세요.',
  revoked: '취소된 초대입니다. 관리자에게 문의해 주세요.',
};

export function inviteReasonMessage(reason: InviteInvalidReason): string {
  return INVITE_REASON_MESSAGE[reason];
}

/** GET /api/invites/[code] */
export function checkInvite(code: string): InviteCheckResponse {
  const row = inviteByCode(code);
  if (!row) return { valid: false, role: null, note: '', reason: 'not_found' };
  const status = inviteStatus(row);
  if (status !== 'pending') return { valid: false, role: null, note: '', reason: status };
  return { valid: true, role: row.role, note: row.note, reason: null };
}

/** 메모 줄마다 초대 1장. 메모가 없으면 빈 메모로 1장. 만든 코드 목록을 돌려준다. */
export function createInvites(input: {
  role: InviteRole;
  notes: string[];
  expiresInDays: number;
  createdBy: string | null;
}): string[] {
  const notes = input.notes.map((n) => n.trim().replace(/\s+/g, ' ')).filter((n) => n.length > 0);
  const list = notes.length > 0 ? notes : [''];
  if (list.length > LIMITS.inviteMaxBatch) {
    throw badRequest(`한 번에 ${LIMITS.inviteMaxBatch}장까지 만들 수 있습니다.`, 'too_many_invites');
  }
  for (const n of list) {
    if ([...n].length > INVITE_NOTE_MAX) throw badRequest(`메모는 한 줄에 ${INVITE_NOTE_MAX}자까지 쓸 수 있습니다.`, 'note_too_long');
  }
  const days = input.expiresInDays;
  if (!Number.isInteger(days) || days < 0 || days > INVITE_MAX_DAYS) {
    throw badRequest(`만료 기간은 0~${INVITE_MAX_DAYS}일로 입력해 주세요. 0은 만료 없음입니다.`, 'invalid_expiry');
  }
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = days === 0 ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
  return tx(() => {
    const codes: string[] = [];
    for (const note of list) {
      let code = newInviteCode();
      while (one('select 1 from invites where code = ?', code)) code = newInviteCode();
      run(
        'insert into invites (code, role, note, created_by, created_at, expires_at) values (?, ?, ?, ?, ?, ?)',
        code, input.role, note, input.createdBy, createdAt, expiresAt,
      );
      codes.push(code);
    }
    return codes;
  });
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin}/signup?code=${encodeURIComponent(code)}`;
}

/** 관리자 초대 목록 (최근 것 먼저) */
export function listInvites(origin: string): InviteRow[] {
  const rows = all<InviteDbRow & { u_username: string | null; u_display: string | null }>(
    `select i.*, u.username as u_username, u.display_name as u_display
       from invites i left join users u on u.id = i.used_by
      order by i.created_at desc, i.rowid desc`,
  );
  const now = nowIso();
  return rows.map((r) => ({
    code: r.code,
    url: inviteUrl(origin, r.code),
    role: r.role,
    note: r.note,
    status: inviteStatus(r, now),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    usedBy: r.used_by && r.u_username ? { id: r.used_by, username: r.u_username, displayName: r.u_display ?? '' } : null,
  }));
}

/** 초대 취소. 이미 쓴 초대는 409, 이미 취소됐으면 그대로 둔다. */
export function revokeInvite(code: string): void {
  tx(() => {
    const row = inviteByCode(code);
    if (!row) throw notFound('없는 초대 코드입니다.');
    if (row.used_at) throw conflict('이미 사용한 초대는 취소할 수 없습니다.', 'invite_used');
    if (row.revoked_at) return;
    run('update invites set revoked_at = ? where code = ?', nowIso(), row.code);
  });
}

/** 초대 코드로 가입. 초대 확인·사용 처리·사용자 생성을 한 트랜잭션에서 한다 (1회용). */
export async function signupWithInvite(input: NewUserInput & { code: string }): Promise<SessionUser> {
  const username = checkUsername(input.username);
  const displayName = cleanDisplayName(input.displayName);
  checkNewPassword(input.password);
  const pre = checkInvite(input.code);
  if (!pre.valid) throw new HttpError(410, `invite_${pre.reason ?? 'not_found'}`, inviteReasonMessage(pre.reason ?? 'not_found'));
  const passwordHash = await hashPassword(input.password);
  const id = newId();
  tx(() => {
    const row = inviteByCode(input.code);
    const status = row ? inviteStatus(row) : 'not_found';
    if (!row || status !== 'pending') {
      const reason = (status === 'pending' ? 'not_found' : status) as InviteInvalidReason;
      throw new HttpError(410, `invite_${reason}`, inviteReasonMessage(reason));
    }
    insertUser({ id, username, displayName, passwordHash, role: row.role });
    const res = run(
      'update invites set used_by = ?, used_at = ? where code = ? and used_at is null and revoked_at is null',
      id, nowIso(), row.code,
    );
    if (res.changes !== 1) throw new HttpError(410, 'invite_used', inviteReasonMessage('used'));
  });
  return getUserById(id)!;
}

// ------------------------------------------------------------------ 로그인 (시도 제한: 아이디+IP당 5분에 10회)
export const LOGIN_WINDOW_MS = 5 * 60_000;
export const LOGIN_MAX_FAILURES = 10;
/**
 * IP와 상관없이 한 아이디에 대한 5분당 실패 한도 (IP를 바꿔 가며 추측하는 것을 막는다).
 * 남이 아이디만 알고 일부러 틀려서 계정을 잠그기 어렵도록 넉넉하게 둔다 (scrypt + 8자 이상이라 온라인 추측은 여전히 비현실적).
 */
export const LOGIN_MAX_FAILURES_PER_USER = 100;

const limitStore = globalThis as unknown as { __owlLoginFailures?: Map<string, number[]> };
function failures(): Map<string, number[]> {
  limitStore.__owlLoginFailures ??= new Map();
  return limitStore.__owlLoginFailures;
}

export function loginLimitKey(username: string, ip: string): string {
  return `${username.trim().toLowerCase()}|${ip}`;
}

/** 비밀번호 변경의 "지금 비밀번호" 실패 제한 키 */
export function passwordChangeLimitKey(userId: string): string {
  return `pw|${userId}`;
}

/** 아이디만으로 만든 제한 키 (IP 무관) */
export function loginUserKey(username: string): string {
  return `user|${username.trim().toLowerCase()}`;
}

function recentFailures(key: string, now: number): number[] {
  const list = (failures().get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (list.length > 0) failures().set(key, list);
  else failures().delete(key);
  return list;
}

/** 제한에 걸렸으면 429 */
export function assertLoginAllowed(key: string, now = Date.now(), max = LOGIN_MAX_FAILURES): void {
  const list = recentFailures(key, now);
  if (list.length >= max) {
    const waitSec = Math.max(1, Math.ceil((list[0] + LOGIN_WINDOW_MS - now) / 1000));
    throw tooMany(`로그인 시도가 너무 많습니다. ${Math.ceil(waitSec / 60)}분 뒤에 다시 시도해 주세요.`);
  }
}

export function noteLoginFailure(key: string, now = Date.now()): void {
  const list = recentFailures(key, now);
  list.push(now);
  failures().set(key, list);
  if (failures().size > 10_000) {
    for (const k of [...failures().keys()]) recentFailures(k, now); // 오래된 키 청소
  }
}

export function clearLoginFailures(key: string): void {
  failures().delete(key);
}

/** 미리 기록한 시도 1건을 되돌린다 (실패가 아니었던 경우) */
function releaseAttempt(key: string, now: number): void {
  const list = failures().get(key);
  if (!list) return;
  const i = list.lastIndexOf(now);
  if (i >= 0) list.splice(i, 1);
  if (list.length === 0) failures().delete(key);
}

/** 테스트용 */
export function resetLoginLimits(): void {
  failures().clear();
}

export const BAD_CREDENTIALS = '아이디 또는 비밀번호가 맞지 않습니다.';
export const DISABLED_ACCOUNT = '관리자가 사용을 중지한 계정입니다.';

/**
 * 아이디·비밀번호 확인. 성공하면 사용자를 돌려준다(세션은 라우트가 만든다).
 * 없는 아이디도 더미 해시를 검사해 응답 시간을 맞춘다.
 */
export async function verifyLogin(
  input: { username: string; password: string; ip: string },
  now = Date.now(),
): Promise<SessionUser> {
  const key = loginLimitKey(input.username, input.ip);
  const ukey = loginUserKey(input.username);
  // IP를 모르면('direct', 프록시 신뢰 안 함) 모든 요청이 같은 IP로 보이므로 아이디+IP 제한은 쓰지 않는다.
  // 그렇지 않으면 아무나 남의 아이디로 10번 틀려서 그 계정을 잠글 수 있다. 아이디 단위의 넉넉한 제한만 남는다.
  const ipKnown = input.ip !== 'direct';
  // 막힌 요청은 해시 계산 전에 거절한다. 검사와 기록을 await 전에 한 번에 해서
  // 동시에 보낸 요청들이 모두 검사를 통과하지 못하게 한다 (일단 실패로 세고, 성공하면 지운다).
  if (ipKnown) assertLoginAllowed(key, now);
  assertLoginAllowed(ukey, now, LOGIN_MAX_FAILURES_PER_USER);
  if (ipKnown) noteLoginFailure(key, now);
  noteLoginFailure(ukey, now);
  const row = input.username.trim() ? userByUsername(input.username) : undefined;
  const password = input.password.slice(0, PASSWORD_MAX);
  let ok = false;
  if (row) ok = await verifyPassword(password, row.password_hash);
  else await verifyPassword(password, await dummyHash());
  if (!row || !ok) throw new HttpError(401, 'bad_credentials', BAD_CREDENTIALS);
  if (row.status !== 'active') {
    if (ipKnown) releaseAttempt(key, now);
    releaseAttempt(ukey, now);
    throw forbidden(DISABLED_ACCOUNT, 'account_disabled');
  }
  clearLoginFailures(key);
  clearLoginFailures(ukey);
  return toSessionUser(row);
}

/** 비밀번호 변경: 지금 비밀번호 확인 후 새 비밀번호 저장, 변경 강제 해제 */
export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  const row = userById(userId);
  if (!row) throw notFound('계정을 찾을 수 없습니다.');
  // 세션을 가진 사람이 지금 비밀번호를 무한히 추측하지 못하게 로그인과 같은 제한을 건다
  const key = passwordChangeLimitKey(userId);
  const now = Date.now();
  // 검사와 기록을 await 전에 한 번에: 동시 요청 묶음으로 제한을 넘지 못하게 한다
  assertLoginAllowed(key, now);
  noteLoginFailure(key, now);
  if (!(await verifyPassword(current.slice(0, PASSWORD_MAX), row.password_hash))) {
    throw badRequest('지금 비밀번호가 맞지 않습니다.', 'bad_current_password');
  }
  clearLoginFailures(key);
  checkNewPassword(next);
  if (next === current) throw badRequest('지금과 다른 비밀번호를 입력해 주세요.', 'same_password');
  const hash = await hashPassword(next);
  run('update users set password_hash = ?, must_change_password = 0 where id = ?', hash, userId);
}

// ------------------------------------------------------------------ 관리자: 회원
export function listUsers(): AdminUserRow[] {
  const rows = all<UserRow & { invite_note: string | null }>(
    `select u.*, (select i.note from invites i where i.used_by = u.id order by i.used_at desc limit 1) as invite_note
       from users u order by u.created_at asc, u.rowid asc`,
  );
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    status: r.status,
    mustChangePassword: bool(r.must_change_password),
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    inviteNote: r.invite_note,
  }));
}

/** target을 빼고 남는 활성 관리자 수 */
function otherActiveAdmins(targetId: string): number {
  return one<{ n: number }>(
    "select count(*) as n from users where role = 'admin' and status = 'active' and id <> ?", targetId,
  )?.n ?? 0;
}

function requireTarget(targetId: string): UserRow {
  const row = userById(targetId);
  if (!row) throw notFound('회원을 찾을 수 없습니다.');
  return row;
}

const LAST_ADMIN = '마지막 관리자입니다. 다른 관리자를 먼저 만들어 주세요.';

/** 역할·상태·표시 이름 변경. 자기 역할·상태는 못 바꾸고, 마지막 활성 관리자를 없앨 수 없다. */
export function updateUser(
  actorId: string,
  targetId: string,
  patch: { role?: AccountRole; status?: AccountStatus; displayName?: string },
): SessionUser {
  const displayName = patch.displayName !== undefined ? cleanDisplayName(patch.displayName) : undefined;
  let roleChanged = false;
  tx(() => {
    const row = requireTarget(targetId);
    const roleChange = patch.role !== undefined && patch.role !== row.role;
    roleChanged = roleChange;
    const statusChange = patch.status !== undefined && patch.status !== row.status;
    if (actorId === targetId && (roleChange || statusChange)) {
      throw forbidden('자기 계정의 역할과 상태는 바꿀 수 없습니다.', 'self_change');
    }
    const losesAdmin =
      row.role === 'admin' && row.status === 'active' &&
      ((roleChange && patch.role !== 'admin') || (statusChange && patch.status === 'disabled'));
    if (losesAdmin && otherActiveAdmins(targetId) === 0) throw conflict(LAST_ADMIN, 'last_admin');
    if (roleChange && patch.role) run('update users set role = ? where id = ?', patch.role, targetId);
    if (statusChange && patch.status) run('update users set status = ? where id = ?', patch.status, targetId);
    if (displayName !== undefined) run('update users set display_name = ? where id = ?', displayName, targetId);
    if (statusChange && patch.status === 'disabled') destroyUserSessions(targetId);
  });
  // 역할이 바뀌면 열린 SSE 스트림을 닫아 새 역할로 다시 구독하게 한다 (커밋된 뒤에만)
  if (roleChanged) disconnectUser(targetId);
  return getUserById(targetId)!;
}

/** 비밀번호 초기화: 임시 비밀번호(1회 표시) + 다음 로그인 때 변경 강제 + 모든 세션 종료 */
export async function resetUserPassword(actorId: string, targetId: string): Promise<string> {
  requireTarget(targetId);
  if (actorId === targetId) throw forbidden('자기 비밀번호는 계정 화면에서 바꿔 주세요.', 'self_change');
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  tx(() => {
    requireTarget(targetId);
    run('update users set password_hash = ?, must_change_password = 1 where id = ?', hash, targetId);
    destroyUserSessions(targetId);
  });
  return temp;
}

/** 회원 삭제: 자기 자신·마지막 관리자·게임을 만든 회원은 불가 */
export function deleteUser(actorId: string, targetId: string): void {
  tx(() => {
    const row = requireTarget(targetId);
    if (actorId === targetId) throw forbidden('자기 계정은 삭제할 수 없습니다.', 'self_delete');
    if (row.role === 'admin' && row.status === 'active' && otherActiveAdmins(targetId) === 0) {
      throw conflict(LAST_ADMIN, 'last_admin');
    }
    const hosted = one<{ n: number }>('select count(*) as n from games where host_id = ?', targetId)?.n ?? 0;
    if (hosted > 0) {
      throw conflict(`이 회원이 만든 게임이 ${hosted}개 있습니다. 게임 탭에서 먼저 지워 주세요.`, 'has_games');
    }
    destroyUserSessions(targetId);
    run('delete from users where id = ?', targetId);
  });
}

// ------------------------------------------------------------------ 관리자: 게임
export function listAllGames(): GameSummary[] {
  const rows = all<{
    code: string; host_name: string | null; round: number; rounds: string; mode: AssignMode; phase: Phase;
    teams: number; members: number; created_at: string;
  }>(
    `select g.code, u.display_name as host_name, g.round, g.rounds, g.mode, g.phase, g.created_at,
            (select count(*) from teams t where t.game_id = g.id) as teams,
            (select count(distinct m.user_id) from members m where m.game_id = g.id) as members
       from games g left join users u on u.id = g.host_id
      order by g.created_at desc`,
  );
  return rows.map((r) => ({
    code: r.code,
    hostName: r.host_name ?? '(알 수 없음)',
    round: r.round as RoundNo,
    rounds: roundsOf(r),
    mode: r.mode,
    phase: r.phase,
    teams: r.teams,
    members: r.members,
    createdAt: r.created_at,
  }));
}

export function findGameIdByCode(code: string): string | null {
  if (!/^[0-9]{4}$/.test(code)) return null;
  return one<{ id: string }>('select id from games where code = ?', code)?.id ?? null;
}

/** 게임과 딸린 팀·팀원·프로그램·결과 삭제. 라우트가 먼저 publishDeleted를 부른다. */
export function deleteGameById(gameId: string): void {
  tx(() => {
    run('delete from results where game_id = ?', gameId);
    run('delete from programs where game_id = ?', gameId);
    run('delete from members where game_id = ?', gameId);
    run('delete from game_players where game_id = ?', gameId);
    run('delete from game_exits where game_id = ?', gameId);
    run('delete from teams where game_id = ?', gameId);
    run('delete from games where id = ?', gameId);
  });
}

// ------------------------------------------------------------------ 복구 (scripts/create-admin.ts)
/**
 * 관리자 계정을 만들거나, 같은 아이디가 있으면 관리자·활성으로 되돌리고 비밀번호를 새로 정한다.
 * 모든 세션을 끊는다. 돌려주는 값: 'created' | 'updated'
 */
export async function upsertAdmin(input: NewUserInput): Promise<'created' | 'updated'> {
  const username = checkUsername(input.username);
  const displayName = cleanDisplayName(input.displayName);
  checkNewPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return tx(() => {
    const row = userByUsername(username);
    if (!row) {
      insertUser({ id: newId(), username, displayName, passwordHash, role: 'admin' });
      return 'created' as const;
    }
    run(
      `update users set role = 'admin', status = 'active', password_hash = ?, must_change_password = 0, display_name = ?
        where id = ?`,
      passwordHash, displayName, row.id,
    );
    destroyUserSessions(row.id);
    return 'updated' as const;
  });
}
