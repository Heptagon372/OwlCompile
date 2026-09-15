// 계정·세션·초대·로그인 제한·관리자 보호 (docs/WEBSITE_SPEC.md §4, §10). lib 함수를 직접 부른다.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_MAX_FAILURES_PER_USER,
  LOGIN_WINDOW_MS,
  changePassword,
  checkInvite,
  createInvites,
  createUser,
  deleteGameById,
  deleteUser,
  findGameIdByCode,
  listInvites,
  listUsers,
  needsSetup,
  normalizeInviteCode,
  resetLoginLimits,
  resetUserPassword,
  revokeInvite,
  safeNextPath,
  setupAdmin,
  signupWithInvite,
  updateUser,
  upsertAdmin,
  verifyLogin,
} from '@/lib/server/auth';
import { one, resetDb, run } from '@/lib/server/db';
import { HttpError, clientIp, readBodyCapped, readJson, requestHost } from '@/lib/server/http';
import { hashPassword, randomToken, sha256, verifyPassword } from '@/lib/server/password';
import { disconnectSession, publish, subscribe, subscriberCount } from '@/lib/server/realtime';
import { z } from 'zod';
import { destroyUserSessions, userFromToken } from '@/lib/server/session';

/** 에러 코드·상태를 확인한다 */
async function expectHttp(p: Promise<unknown> | (() => unknown), status: number, code?: string): Promise<void> {
  let err: unknown = null;
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(HttpError);
  const h = err as HttpError;
  expect(h.status).toBe(status);
  if (code) expect(h.code).toBe(code);
}

/** cookies() 없이 세션 행을 만든다 */
function makeSession(userId: string, expiresInMs = 60_000): string {
  const token = randomToken(32);
  const now = Date.now();
  run('insert into sessions (token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?)',
    sha256(token), userId, new Date(now).toISOString(), new Date(now + expiresInMs).toISOString());
  return token;
}

const PW = 'owl-password-1';

beforeEach(() => {
  resetDb();
  resetLoginLimits();
});

describe('비밀번호 해시', () => {
  it('scrypt 형식으로 저장하고 맞는 비밀번호만 통과한다', async () => {
    const h = await hashPassword('hello world 1');
    expect(h.startsWith('scrypt$16384$8$1$')).toBe(true);
    expect(await verifyPassword('hello world 1', h)).toBe(true);
    expect(await verifyPassword('hello world 2', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('같은 비밀번호도 salt 때문에 해시가 다르다', async () => {
    expect(await hashPassword('same-pass')).not.toBe(await hashPassword('same-pass'));
  });
});

describe('최초 설정', () => {
  it('사용자가 0명일 때만 관리자를 만든다', async () => {
    expect(needsSetup()).toBe(true);
    const admin = await setupAdmin({ username: 'boss', displayName: '관리자', password: PW });
    expect(admin.role).toBe('admin');
    expect(needsSetup()).toBe(false);
    await expectHttp(setupAdmin({ username: 'boss2', displayName: '또', password: PW }), 404);
  });

  it('입력 규칙을 검사한다', async () => {
    await expectHttp(setupAdmin({ username: 'a', displayName: '관리자', password: PW }), 400, 'invalid_username');
    await expectHttp(setupAdmin({ username: 'boss', displayName: '  ', password: PW }), 400, 'invalid_display_name');
    await expectHttp(setupAdmin({ username: 'boss', displayName: '관리자', password: 'short' }), 400, 'weak_password');
  });
});

describe('세션', () => {
  it('토큰으로 사용자를 찾고, DB엔 sha256만 있다', async () => {
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    const token = makeSession(u.id);
    expect(userFromToken(token)?.id).toBe(u.id);
    expect(one('select 1 from sessions where token_hash = ?', token)).toBeUndefined();
    expect(userFromToken('nope')).toBeNull();
    expect(userFromToken(undefined)).toBeNull();
  });

  it('만료된 세션은 null이고 지워진다', async () => {
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    const token = makeSession(u.id, -1000);
    expect(userFromToken(token)).toBeNull();
    expect(one('select 1 from sessions where token_hash = ?', sha256(token))).toBeUndefined();
  });

  it('사용 중지하면 세션이 끊긴다', async () => {
    const admin = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    const token = makeSession(u.id);
    updateUser(admin.id, u.id, { status: 'disabled' });
    expect(userFromToken(token)).toBeNull();
    updateUser(admin.id, u.id, { status: 'active' });
    const t2 = makeSession(u.id);
    expect(userFromToken(t2)?.id).toBe(u.id);
    destroyUserSessions(u.id);
    expect(userFromToken(t2)).toBeNull();
  });
});

describe('초대', () => {
  async function admin() {
    return createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
  }

  it('메모 줄마다 1장, XXXX-XXXX 코드, 빈 줄은 건너뛴다', async () => {
    const a = await admin();
    const codes = createInvites({ role: 'player', notes: ['김철수', '', '  이영희 ', '박민수'], expiresInDays: 14, createdBy: a.id });
    expect(codes).toHaveLength(3);
    for (const c of codes) expect(c).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    const list = listInvites('http://x.test');
    expect(list.map((i) => i.note).sort()).toEqual(['김철수', '박민수', '이영희']);
    expect(list[0].url).toMatch(/^http:\/\/x\.test\/signup\?code=/);
    expect(list.every((i) => i.status === 'pending')).toBe(true);
    expect(createInvites({ role: 'host', notes: [], expiresInDays: 0, createdBy: a.id })).toHaveLength(1);
  });

  it('1회용: 두 번째 가입은 거절된다', async () => {
    const a = await admin();
    const [code] = createInvites({ role: 'host', notes: ['진행자'], expiresInDays: 14, createdBy: a.id });
    expect(checkInvite(code)).toEqual({ valid: true, role: 'host', note: '진행자', reason: null });
    const u = await signupWithInvite({ code: code.toLowerCase().replace('-', ''), username: 'host1', displayName: '진행', password: PW });
    expect(u.role).toBe('host');
    expect(checkInvite(code)).toMatchObject({ valid: false, reason: 'used' });
    await expectHttp(signupWithInvite({ code, username: 'host2', displayName: '둘', password: PW }), 410, 'invite_used');
    expect(one<{ n: number }>('select count(*) as n from users')?.n).toBe(2);
    const row = listInvites('http://x.test').find((i) => i.code === code);
    expect(row?.status).toBe('used');
    expect(row?.usedBy?.username).toBe('host1');
    expect(listUsers().find((x) => x.username === 'host1')?.inviteNote).toBe('진행자');
    await expectHttp(() => revokeInvite(code), 409, 'invite_used');
  });

  it('만료된 초대는 쓸 수 없다', async () => {
    const a = await admin();
    const [code] = createInvites({ role: 'player', notes: ['늦음'], expiresInDays: 1, createdBy: a.id });
    run('update invites set expires_at = ? where code = ?', new Date(Date.now() - 1000).toISOString(), code);
    expect(checkInvite(code)).toMatchObject({ valid: false, reason: 'expired' });
    await expectHttp(signupWithInvite({ code, username: 'late', displayName: '늦음', password: PW }), 410, 'invite_expired');
    expect(listInvites('http://x.test')[0].status).toBe('expired');
  });

  it('취소한 초대는 쓸 수 없다', async () => {
    const a = await admin();
    const [code] = createInvites({ role: 'player', notes: [''], expiresInDays: 14, createdBy: a.id });
    revokeInvite(code);
    revokeInvite(code); // 두 번 눌러도 그대로
    expect(checkInvite(code)).toMatchObject({ valid: false, reason: 'revoked' });
    await expectHttp(signupWithInvite({ code, username: 'nope', displayName: '안됨', password: PW }), 410, 'invite_revoked');
    expect(checkInvite('ZZZZ-ZZZZ')).toMatchObject({ valid: false, reason: 'not_found' });
    await expectHttp(() => revokeInvite('ZZZZ-ZZZZ'), 404);
  });

  it('가입 입력 오류와 아이디 중복은 초대를 소모하지 않는다', async () => {
    const a = await admin();
    const [code] = createInvites({ role: 'player', notes: [''], expiresInDays: 14, createdBy: a.id });
    await expectHttp(signupWithInvite({ code, username: 'BOSS', displayName: '중복', password: PW }), 409, 'username_taken');
    await expectHttp(signupWithInvite({ code, username: 'ok_1', displayName: '짧음', password: '123' }), 400, 'weak_password');
    expect(checkInvite(code).valid).toBe(true);
  });

  it('입력 검사: 60장 초과·만료일 범위', async () => {
    const a = await admin();
    expect(() => createInvites({ role: 'player', notes: Array.from({ length: 61 }, (_, i) => `n${i}`), expiresInDays: 14, createdBy: a.id }))
      .toThrow(HttpError);
    expect(() => createInvites({ role: 'player', notes: ['x'], expiresInDays: 1000, createdBy: a.id })).toThrow(HttpError);
    expect(normalizeInviteCode(' abcd efgh ')).toBe('ABCD-EFGH');
  });
});

describe('로그인', () => {
  it('맞으면 사용자, 틀리면 같은 문구, 비활성은 따로 알린다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    expect((await verifyLogin({ username: 'KIM', password: PW, ip: '1.1.1.1' })).id).toBe(u.id);
    await expectHttp(verifyLogin({ username: 'kim', password: 'wrong-pass', ip: '1.1.1.1' }), 401, 'bad_credentials');
    await expectHttp(verifyLogin({ username: 'ghost', password: PW, ip: '1.1.1.1' }), 401, 'bad_credentials');
    updateUser(a.id, u.id, { status: 'disabled' });
    await expectHttp(verifyLogin({ username: 'kim', password: PW, ip: '1.1.1.1' }), 403, 'account_disabled');
  });

  it('아이디+IP당 5분에 10회 실패하면 막히고, 시간이 지나면 풀린다', async () => {
    await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    const t0 = Date.now();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expectHttp(verifyLogin({ username: 'kim', password: 'wrong', ip: '9.9.9.9' }, t0 + i), 401);
    }
    await expectHttp(verifyLogin({ username: 'kim', password: PW, ip: '9.9.9.9' }, t0 + 100), 429, 'rate_limited');
    // 다른 IP는 영향 없음
    expect((await verifyLogin({ username: 'kim', password: PW, ip: '8.8.8.8' }, t0 + 100)).username).toBe('kim');
    // 5분 뒤 풀림
    expect((await verifyLogin({ username: 'kim', password: PW, ip: '9.9.9.9' }, t0 + LOGIN_WINDOW_MS + 50)).username).toBe('kim');
  });

  it('비밀번호 변경은 지금 비밀번호를 확인하고 변경 강제를 푼다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    const temp = await resetUserPassword(a.id, u.id);
    await expectHttp(verifyLogin({ username: 'kim', password: PW, ip: 'x' }), 401);
    const logged = await verifyLogin({ username: 'kim', password: temp, ip: 'x' });
    expect(logged.mustChangePassword).toBe(true);
    await expectHttp(changePassword(u.id, 'wrong-current', 'new-password-1'), 400, 'bad_current_password');
    await expectHttp(changePassword(u.id, temp, temp), 400, 'same_password');
    await changePassword(u.id, temp, 'new-password-1');
    expect((await verifyLogin({ username: 'kim', password: 'new-password-1', ip: 'x' })).mustChangePassword).toBe(false);
  });
});

describe('로그인 제한 우회 방지', () => {
  it('IP를 바꿔 가며 추측해도 아이디당 5분에 정해진 횟수에서 막힌다', async () => {
    await createUser({ username: 'root', displayName: '관리', password: PW, role: 'admin' });
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: LOGIN_MAX_FAILURES_PER_USER }, (_, i) =>
        expectHttp(verifyLogin({ username: 'root', password: 'wrong', ip: `203.0.${i >> 8}.${i & 255}` }, t0 + i), 401)),
    );
    // 새 IP + 맞는 비밀번호여도 429 (해시 계산 전에 거절)
    await expectHttp(verifyLogin({ username: 'root', password: PW, ip: '198.51.100.1' }, t0 + 100), 429, 'rate_limited');
    expect((await verifyLogin({ username: 'root', password: PW, ip: '198.51.100.1' }, t0 + LOGIN_WINDOW_MS + 100)).username)
      .toBe('root');
  }, 60_000);

  it('clientIp·requestHost는 OWL_TRUST_PROXY=1일 때만 전달 헤더를 쓴다', () => {
    const req = new Request('http://owl.test/api/auth/login', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1', 'x-real-ip': '5.5.5.5', 'x-forwarded-host': 'evil.test' },
    });
    const prev = process.env.OWL_TRUST_PROXY;
    try {
      delete process.env.OWL_TRUST_PROXY;
      expect(clientIp(req)).toBe('direct');
      expect(clientIp(new Request('http://owl.test/', { headers: { 'x-forwarded-for': '9.9.9.9' } }))).toBe('direct');
      expect(requestHost(req)).not.toBe('evil.test');
      process.env.OWL_TRUST_PROXY = '1';
      expect(clientIp(req)).toBe('10.0.0.1'); // 프록시가 붙인 오른쪽 끝 값
      expect(requestHost(req)).toBe('evil.test');
    } finally {
      if (prev === undefined) delete process.env.OWL_TRUST_PROXY;
      else process.env.OWL_TRUST_PROXY = prev;
    }
  });

  it('지금 비밀번호 추측도 10회에서 막힌다', async () => {
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      await expectHttp(changePassword(u.id, `wrong-${i}`, 'new-password-1'), 400, 'bad_current_password');
    }
    await expectHttp(changePassword(u.id, PW, 'new-password-1'), 429, 'rate_limited');
  }, 60_000);

  /** 결과 상태 코드별 개수 */
  async function statusCounts(ps: Promise<unknown>[]): Promise<Record<number, number>> {
    const out: Record<number, number> = {};
    for (const r of await Promise.allSettled(ps)) {
      const s = r.status === 'fulfilled' ? 200 : (r.reason as HttpError).status;
      out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  }

  it('동시에 보낸 로그인 묶음도 아이디+IP당 10회만 비밀번호를 검사한다', async () => {
    await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    resetLoginLimits();
    const t0 = Date.now();
    const c = await statusCounts(
      Array.from({ length: 15 }, () => verifyLogin({ username: 'kim', password: 'wrong', ip: '9.9.9.9' }, t0)),
    );
    expect(c[401]).toBe(LOGIN_MAX_FAILURES);
    expect(c[429]).toBe(15 - LOGIN_MAX_FAILURES);
    // 맞는 비밀번호도 같은 창 안에서는 막힌다
    await expectHttp(verifyLogin({ username: 'kim', password: PW, ip: '9.9.9.9' }, t0 + 1), 429, 'rate_limited');
  }, 60_000);

  it('동시에 보낸 비밀번호 변경 묶음도 10회만 검사한다', async () => {
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    resetLoginLimits();
    const c = await statusCounts(
      Array.from({ length: 15 }, (_, i) => changePassword(u.id, `wrong-${i}`, 'new-password-1')),
    );
    expect(c[400]).toBe(LOGIN_MAX_FAILURES);
    expect(c[429]).toBe(15 - LOGIN_MAX_FAILURES);
  }, 60_000);

  it("IP를 모를 때('direct') 남이 10번 틀려도 진짜 사용자는 로그인된다", async () => {
    await createUser({ username: 'host_xxx', displayName: '진행', password: 'hostpass1', role: 'host' });
    const t0 = Date.now();
    for (let i = 0; i < LOGIN_MAX_FAILURES + 2; i++) {
      await expectHttp(verifyLogin({ username: 'host_xxx', password: 'wrong', ip: 'direct' }, t0 + i), 401);
    }
    expect((await verifyLogin({ username: 'host_xxx', password: 'hostpass1', ip: 'direct' }, t0 + 50)).username)
      .toBe('host_xxx');
  }, 60_000);
});

describe('요청 본문 크기', () => {
  it('Content-Length가 크면 읽지 않고 413', async () => {
    const fake = { headers: new Headers({ 'content-length': '50000000' }), body: null } as unknown as Request;
    await expectHttp(readBodyCapped(fake, 4_000), 413, 'too_large');
  });

  it('길이 표시가 없어도 한도를 넘는 순간 읽기를 멈추고 413', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 1000) c.close();
        else c.enqueue(new Uint8Array(64_000));
      },
    });
    const req = new Request('http://owl.test/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expectHttp(readJson(req, z.object({}), 4_000), 413, 'too_large');
    expect(pulled).toBeLessThan(10);
  });

  it('한도 안의 본문은 그대로 읽는다', async () => {
    const req = new Request('http://owl.test/', { method: 'POST', body: JSON.stringify({ a: 1, s: '한글' }) });
    expect(await readJson(req, z.object({ a: z.number(), s: z.string() }), 4_000)).toEqual({ a: 1, s: '한글' });
  });
});

describe('권한 회수와 실시간 스트림', () => {
  it('사용 중지·역할 변경·비밀번호 초기화·삭제 때 그 사용자의 SSE 구독을 닫는다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const u = await createUser({ username: 'alan', displayName: '앨런', password: PW, role: 'player' });
    const other = await createUser({ username: 'alice', displayName: '앨리스', password: PW, role: 'player' });
    const gid = `g-${randomToken(4)}`;
    const got: string[] = [];
    const open = () => subscribe({ gameId: gid, userId: u.id, teamId: 't0', isHost: false, send: (e) => got.push(e.type) });
    subscribe({ gameId: gid, userId: other.id, teamId: 't0', isHost: false, send: () => {} });

    open();
    expect(subscriberCount(gid, u.id)).toBe(1);
    updateUser(a.id, u.id, { status: 'disabled' });
    expect(subscriberCount(gid, u.id)).toBe(0);
    publish(gid, { type: 'program', teamId: 't0' } as never, { teamId: 't0' });
    expect(got).toEqual([]); // 닫힌 뒤에는 팀 코드를 받지 않는다
    expect(subscriberCount(gid, other.id)).toBe(1); // 다른 사람은 그대로

    updateUser(a.id, u.id, { status: 'active' });
    open();
    updateUser(a.id, u.id, { role: 'host' });
    expect(subscriberCount(gid, u.id)).toBe(0);

    open();
    updateUser(a.id, u.id, { displayName: '새 이름' }); // 역할·상태 변경이 아니면 유지
    expect(subscriberCount(gid, u.id)).toBe(1);
    await resetUserPassword(a.id, u.id);
    expect(subscriberCount(gid, u.id)).toBe(0);

    open();
    deleteUser(a.id, u.id);
    expect(subscriberCount(gid, u.id)).toBe(0);
  });

  it('한 사용자의 연결은 게임당 6개까지, 넘으면 오래된 것부터 닫는다', () => {
    const gid = `g-${randomToken(4)}`;
    for (let i = 0; i < 10; i++) subscribe({ gameId: gid, userId: 'spam', teamId: null, isHost: false, send: () => {} });
    expect(subscriberCount(gid, 'spam')).toBe(6);
  });
});

describe('관리자 보호', () => {
  it('마지막 관리자는 강등·중지·삭제할 수 없다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const b = await createUser({ username: 'boss2', displayName: '관리자2', password: PW, role: 'admin' });
    updateUser(a.id, b.id, { role: 'host' }); // 둘 중 하나는 가능
    await expectHttp(() => updateUser(b.id, a.id, { role: 'player' }), 409, 'last_admin');
    await expectHttp(() => updateUser(b.id, a.id, { status: 'disabled' }), 409, 'last_admin');
    await expectHttp(() => deleteUser(b.id, a.id), 409, 'last_admin');
    updateUser(a.id, b.id, { role: 'admin' });
    updateUser(b.id, a.id, { status: 'disabled' });
    // 비활성 관리자는 "남은 관리자"로 치지 않는다
    await expectHttp(() => updateUser(a.id, b.id, { role: 'player' }), 409, 'last_admin');
  });

  it('자기 자신은 역할·상태 변경·삭제·초기화가 안 된다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    await createUser({ username: 'boss2', displayName: '관리자2', password: PW, role: 'admin' });
    await expectHttp(() => updateUser(a.id, a.id, { role: 'host' }), 403, 'self_change');
    await expectHttp(() => deleteUser(a.id, a.id), 403, 'self_delete');
    await expectHttp(resetUserPassword(a.id, a.id), 403, 'self_change');
    expect(updateUser(a.id, a.id, { displayName: ' 새 이름 ' }).displayName).toBe('새 이름');
  });

  it('게임을 만든 회원은 게임을 지운 뒤에 삭제한다', async () => {
    const a = await createUser({ username: 'boss', displayName: '관리자', password: PW, role: 'admin' });
    const h = await createUser({ username: 'host1', displayName: '진행', password: PW, role: 'host' });
    run("insert into games (id, code, host_id, created_at) values ('g1', '1234', ?, ?)", h.id, new Date().toISOString());
    run("insert into teams (id, game_id, name, color, seat) values ('t1', 'g1', '올빼미', '#2FC4D9', 1)");
    await expectHttp(() => deleteUser(a.id, h.id), 409, 'has_games');
    const gid = findGameIdByCode('1234');
    expect(gid).toBe('g1');
    deleteGameById(gid!);
    expect(one('select 1 from teams where id = ?', 't1')).toBeUndefined();
    deleteUser(a.id, h.id);
    expect(listUsers().map((u) => u.username)).toEqual(['boss']);
    expect(findGameIdByCode('abcd')).toBeNull();
  });

  it('복구 CLI는 기존 계정을 관리자로 되돌린다', async () => {
    expect(await upsertAdmin({ username: 'boss', displayName: '관리자', password: PW })).toBe('created');
    const a = listUsers()[0];
    const u = await createUser({ username: 'kim', displayName: '김', password: PW, role: 'player' });
    updateUser(a.id, u.id, { status: 'disabled' });
    expect(await upsertAdmin({ username: 'kim', displayName: '김', password: 'another-pass' })).toBe('updated');
    const k = await verifyLogin({ username: 'kim', password: 'another-pass', ip: 'x' });
    expect(k.role).toBe('admin');
  });
});

describe('로그아웃과 SSE', () => {
  it('로그아웃한 세션의 스트림만 닫고, 같은 사용자의 다른 기기 스트림은 남긴다', async () => {
    const u = await createUser({ username: 'alan', displayName: '앨런', password: PW, role: 'player' });
    const gid = `g-${randomToken(4)}`;
    const got: string[] = [];
    subscribe({ gameId: gid, userId: u.id, teamId: 't0', isHost: false, tokenHash: 'tab-a', send: (e) => got.push(e.type) });
    subscribe({ gameId: gid, userId: u.id, teamId: 't0', isHost: false, tokenHash: 'phone-b', send: () => {} });
    expect(subscriberCount(gid, u.id)).toBe(2);
    disconnectSession('tab-a');
    expect(subscriberCount(gid, u.id)).toBe(1);
    publish(gid, { type: 'program', teamId: 't0' } as never, { teamId: 't0' });
    expect(got).toEqual([]); // 로그아웃한 탭은 팀 코드를 더 받지 않는다
    disconnectSession('phone-b');
    expect(subscriberCount(gid, u.id)).toBe(0);
  });
});

describe('로그인 뒤 경로', () => {
  it('같은 사이트 상대 경로만 허용한다', () => {
    expect(safeNextPath('/play/1234')).toBe('/play/1234');
    expect(safeNextPath('/join?code=1234')).toBe('/join?code=1234');
    expect(safeNextPath('https://evil.test/')).toBe('/');
    expect(safeNextPath('//evil.test')).toBe('/');
    expect(safeNextPath('/' + String.fromCharCode(92) + 'evil.test')).toBe('/');
    expect(safeNextPath('/a' + String.fromCharCode(10) + 'b')).toBe('/');
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });

  it('점 세그먼트로 정리하면 //로 시작하는 경로도 막는다 (열린 리다이렉트)', () => {
    for (const p of ['/.//evil.test', '/..//evil.test', '/%2e//evil.test', '/a/..//evil.test', '/%2E%2E//evil.test']) {
      expect(safeNextPath(p)).toBe('/');
    }
    expect(safeNextPath('/a/../play/1234')).toBe('/play/1234');
  });
});
