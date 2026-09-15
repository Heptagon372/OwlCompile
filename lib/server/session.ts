// 세션 쿠키와 현재 사용자 (docs/WEBSITE_SPEC.md §4). 서버 전용.
// 라우트 핸들러: requireUser(), 서버 컴포넌트 페이지: requirePageUser().
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { AccountRole, AccountStatus, PublicUser } from '@/lib/contracts';
import { bool, nowIso, one, run } from './db';
import { HttpError, isHttps } from './http';
import { randomToken, sha256 } from './password';
import { disconnectSession, disconnectUser } from './realtime';

export const SESSION_COOKIE = 'owl_session';
const TTL_DAYS = 14;

export interface SessionUser extends PublicUser {
  status: AccountStatus;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  role: AccountRole;
  status: AccountStatus;
  must_change_password: number;
}

export function toPublicUser(u: SessionUser): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, mustChangePassword: u.mustChangePassword };
}

function mapUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: bool(row.must_change_password),
  };
}

/** 세션을 만들고 쿠키를 심는다. 로그인·가입·setup 라우트에서 호출. */
export async function createSession(userId: string, req: Request): Promise<void> {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_DAYS * 86_400_000);
  run('insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)',
    sha256(token), userId, now.toISOString(), expires.toISOString());
  run('update users set last_login_at = ? where id = ?', now.toISOString(), userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_DAYS * 86_400,
    secure: isHttps(req),
  });
}

/** 토큰 → 사용자. 만료·비활성 계정이면 null. */
export function userFromToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const hash = sha256(token);
  const row = one<UserRow & { expires_at: string }>(
    `select u.id, u.username, u.display_name, u.role, u.status, u.must_change_password, s.expires_at
       from sessions s join users u on u.id = s.user_id where s.token_hash = ?`, hash);
  if (!row) return null;
  if (row.expires_at < nowIso()) {
    run('delete from sessions where token_hash = ?', hash);
    return null;
  }
  if (row.status !== 'active') return null;
  return mapUser(row);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

/** API용: 로그인 안 했으면 401, 역할이 안 맞으면 403 */
export async function requireUser(roles?: readonly AccountRole[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, 'unauthorized', '로그인이 필요합니다.');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'forbidden', '권한이 없습니다.');
  return user;
}

/**
 * 페이지용: 로그인 안 했으면 /login?next=..., 비밀번호 변경이 필요하면 /account, 역할이 안 맞으면 404.
 * next는 로그인 후 돌아올 경로 (예: `/play/${code}`).
 */
export async function requirePageUser(
  roles?: readonly AccountRole[],
  opts: { next?: string; allowMustChange?: boolean } = {},
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(opts.next ? `/login?next=${encodeURIComponent(opts.next)}` : '/login');
  if (user.mustChangePassword && !opts.allowMustChange) redirect('/account');
  if (roles && !roles.includes(user.role)) notFound();
  return user;
}

/** 현재 세션 삭제 + 쿠키 제거 (로그아웃) */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const h = sha256(token);
    run('delete from sessions where token_hash = ?', h);
    // 이 세션으로 연 SSE 스트림도 닫는다 (공용 기기에서 로그아웃한 탭이 팀 코드를 계속 받지 않게)
    disconnectSession(h);
  }
  jar.delete(SESSION_COOKIE);
}

/** 사용자의 모든 세션 삭제 + 열려 있는 SSE 스트림 종료 (사용 중지·비밀번호 초기화·삭제 시) */
export function destroyUserSessions(userId: string): void {
  run('delete from sessions where user_id = ?', userId);
  disconnectUser(userId);
}
