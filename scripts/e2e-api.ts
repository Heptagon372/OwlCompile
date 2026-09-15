// OWL COMPILE — API 종단 시나리오 (docs/WEBSITE_SPEC.md §10).
// 실행 중인 서버(BASE_URL, 기본 http://localhost:3100)에 HTTP로 붙어 관리자 → 초대 → 가입 → 게임 → R1~R5를 돈다.
// 사용: BASE_URL=http://localhost:3100 npm run e2e:api   (빈 DB에서 실행: 사용자 0명이어야 /api/setup이 열린다)
// 서버 쪽 스크립트라 정답(SOLUTIONS)을 엔진에서 직접 가져온다. 실패가 하나라도 있으면 exit 1.
import { MAPS, ROLES, ROUND_EXTRAS, SOLUTIONS, countBlocks, type Block, type BlockId, type Program } from '../lib/engine';
import {
  API, GAME_ROLES, TEAM_PRESETS, autoRoleSplit, autoRolesForNewcomer,
  type GameView, type LobbyEvent, type LobbyResponse, type ResultView,
} from '../lib/contracts';

/** 엔진에 R6·R7이 있으면 7라운드 게임까지 돈다 (없으면 round_unavailable 확인만) */
const HAS_R67 = 6 in MAPS && 7 in MAPS;

const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const PASSWORD = 'owl-e2e-pass-1234';
const ADMIN_USER = process.env.OWL_E2E_ADMIN_USER ?? 'e2e_admin';
const ADMIN_PASS = process.env.OWL_E2E_ADMIN_PASS ?? PASSWORD;
const SUFFIX = Math.random().toString(36).slice(2, 6);

// ------------------------------------------------------------------ 출력
let passed = 0;
let failed = 0;

function check(cond: boolean, label: string, detail?: unknown): boolean {
  if (cond) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    const extra = detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    console.log(`✗ ${label}${extra}`);
  }
  return cond;
}

class Abort extends Error {}

/** 다음 단계가 이것에 기대면 must: 실패 시 시나리오를 멈춘다 */
function must(cond: boolean, label: string, detail?: unknown): void {
  if (!check(cond, label, detail)) throw new Abort(label);
}

// ------------------------------------------------------------------ HTTP (사용자마다 쿠키 통)
interface Res<T = any> { status: number; data: T }

class Client {
  readonly cookies = new Map<string, string>();
  /** 가입·로그인 응답의 사용자 id */
  id = '';
  constructor(readonly name: string) {}

  cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async req<T = any>(
    method: string, path: string, body?: unknown, opts: { origin?: string | null; headers?: Record<string, string> } = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
    const origin = opts.origin === undefined ? BASE : opts.origin;
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size > 0) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const key = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const gone = value === '' || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a))
        || attrs.some((a) => /^\s*expires=/i.test(a) && Date.parse(a.split('=')[1]) < Date.now());
      if (gone) this.cookies.delete(key);
      else this.cookies.set(key, value);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  get<T = any>(path: string) { return this.req<T>('GET', path); }
  post<T = any>(path: string, body: unknown = {}) { return this.req<T>('POST', path, body); }
  put<T = any>(path: string, body: unknown) { return this.req<T>('PUT', path, body); }

  async state(code: string): Promise<GameView> {
    const r = await this.get<GameView>(API.gameState(code));
    if (r.status !== 200) throw new Abort(`${this.name}: GET state ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }
}

const errCode = (r: Res): string | undefined => r.data?.error?.code;
const brief = (r: Res): string => `${r.status} ${JSON.stringify(r.data).slice(0, 300)}`;

// ------------------------------------------------------------------ 프로그램 도우미
let uidSeq = 0;

/** 모든 블록에 uid를 붙인 복사본 (편집기처럼) */
function withUids(doc: Program): Block[] {
  return doc.map((b): Block => {
    const uid = `e2e${(uidSeq += 1)}`;
    switch (b.id) {
      case 'repeat': return { id: 'repeat', n: b.n, body: withUids(b.body), uid };
      case 'def': return { id: 'def', body: withUids(b.body), uid };
      case 'if_wall':
      case 'if_pit': return { id: b.id, then: withUids(b.then), else: withUids(b.else), uid };
      default: return { id: b.id, uid };
    }
  });
}

/**
 * allowed 블록만 남긴 doc. 빠지는 C-블록의 안쪽 블록은 그 자리로 끌어올린다.
 * 그래서 허용 집합이 커지는 순서로 저장하면 각 블록 id의 개수는 줄지 않고, 늘어나는 건 그 단계 역할의 블록뿐이다.
 */
function keepOnly(doc: Block[], allowed: Set<BlockId>): Block[] {
  const out: Block[] = [];
  for (const b of doc) {
    if (allowed.has(b.id)) {
      switch (b.id) {
        case 'repeat': out.push({ ...b, body: keepOnly(b.body, allowed) }); break;
        case 'def': out.push({ ...b, body: keepOnly(b.body, allowed) }); break;
        case 'if_wall':
        case 'if_pit': out.push({ ...b, then: keepOnly(b.then, allowed), else: keepOnly(b.else, allowed) }); break;
        default: out.push(b);
      }
    } else if (b.id === 'repeat' || b.id === 'def') {
      out.push(...keepOnly(b.body, allowed));
    } else if (b.id === 'if_wall' || b.id === 'if_pit') {
      out.push(...keepOnly(b.then, allowed), ...keepOnly(b.else, allowed));
    }
  }
  return out;
}

/** uid를 뺀 비교용 문자열 */
function shape(doc: Block[]): string {
  return JSON.stringify(doc, (k, v) => (k === 'uid' ? undefined : v));
}

// ------------------------------------------------------------------ 시나리오 상태
const ROLE_ORDER = ['runner', 'turner', 'controller', 'architect'] as const;
type RoleName = (typeof ROLE_ORDER)[number];

interface World {
  admin: Client;
  host: Client;
  players: Record<RoleName, Client>;
  code: string;
  teamId: string;
  roundScores: number[];
}

async function waitForServer(): Promise<void> {
  const until = Date.now() + 60_000;
  let last = '';
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}${API.health}`);
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (err) {
      last = (err as Error).message;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Abort(`서버에 연결할 수 없습니다 (${BASE}): ${last}`);
}

// ------------------------------------------------------------------ 1. 계정·초대·가입
async function accounts(): Promise<Pick<World, 'admin' | 'host' | 'players'>> {
  const admin = new Client('admin');
  const anon = new Client('anon');

  const me0 = await anon.get(API.me);
  check(me0.status === 200 && me0.data?.user === null, 'GET /api/auth/me (로그인 전) → user null', brief(me0));

  const setup = await admin.post(API.setup, { username: ADMIN_USER, displayName: '관리자', password: ADMIN_PASS });
  if (setup.status === 201) {
    check(setup.data?.user?.role === 'admin' && setup.data?.redirect === '/', 'POST /api/setup → 관리자 생성 + 로그인, redirect /', brief(setup));
    const again = await anon.post(API.setup, { username: 'e2e_second', displayName: '두번째', password: PASSWORD });
    check(again.status >= 400 && again.status < 500, '사용자가 있으면 /api/setup 거부', brief(again));
  } else {
    // 빈 DB가 아니면 같은 관리자 계정으로 로그인해 이어 간다
    const login = await admin.post(API.login, { username: ADMIN_USER, password: ADMIN_PASS });
    must(login.status === 200, `setup 불가(${setup.status}) → 기존 관리자 로그인`, brief(login));
  }

  const noOrigin = await anon.req('POST', API.login, { username: ADMIN_USER, password: ADMIN_PASS }, { origin: null });
  check(noOrigin.status === 403 && errCode(noOrigin) === 'bad_origin', 'Origin 없는 변경 요청 → 403 bad_origin', brief(noOrigin));
  const evil = await anon.req('POST', API.login, { username: ADMIN_USER, password: ADMIN_PASS }, { origin: 'http://evil.example' });
  check(evil.status === 403, '다른 Origin → 403', brief(evil));

  const badLogin = await anon.post(API.login, { username: ADMIN_USER, password: 'wrong-password-x' });
  check(badLogin.status === 401 && errCode(badLogin) === 'bad_credentials', '틀린 비밀번호 → 401 bad_credentials', brief(badLogin));

  // 프록시를 믿지 않으면(OWL_TRUST_PROXY 없음) 모든 요청이 같은 IP('direct')로 보인다.
  // 그래서 아이디+IP 제한(10회)은 쓰지 않는다: 남이 아이디만 알고 10번 틀려도 진짜 사용자는 잠기지 않는다.
  for (let i = 0; i < 10; i += 1) await anon.post(API.login, { username: ADMIN_USER, password: 'wrong-password-x' });
  const spoofed = await anon.req('POST', API.login, { username: ADMIN_USER, password: 'wrong-password-x' },
    { headers: { 'X-Forwarded-For': `203.0.113.${Math.floor(Math.random() * 200) + 1}`, 'X-Real-IP': '198.51.100.7' } });
  check(spoofed.status === 401 && errCode(spoofed) === 'bad_credentials',
    '실패 10회 + X-Forwarded-For 위조 → 여전히 401 (헤더를 믿지 않음)', brief(spoofed));
  const realUser = await admin.post(API.login, { username: ADMIN_USER, password: ADMIN_PASS });
  check(realUser.status === 200, '남이 10번 틀려도 진짜 사용자는 로그인된다 (계정 잠그기 방지)', brief(realUser));

  // 계정 전환: 로그인한 채 /login을 열면 조용히 넘기지 않고 누구 세션인지 보여 준다
  const loginPage = await admin.req('GET', '/login?next=%2Fhost', undefined, { headers: { Accept: 'text/html' } });
  const loginHtml = typeof loginPage.data === 'string' ? loginPage.data : '';
  check(loginPage.status === 200 && loginHtml.includes(ADMIN_USER) && loginHtml.includes('계정으로 로그인되어 있습니다')
    && loginHtml.includes('로그아웃하고 다른 계정으로 로그인'),
  'GET /login (로그인 상태) → 200 (리다이렉트 아님), 계정 이름·전환 버튼', `${loginPage.status} ${loginHtml.slice(0, 160)}`);
  const anonLogin = await anon.req('GET', '/login', undefined, { headers: { Accept: 'text/html' } });
  check(anonLogin.status === 200 && typeof anonLogin.data === 'string' && !anonLogin.data.includes('계정으로 로그인되어 있습니다'),
    'GET /login (로그인 전) → 200, 전환 패널 없음', anonLogin.status);

  // 큰 본문은 다 읽기 전에 413
  const bigRes = await fetch(BASE + API.login, {
    method: 'POST',
    headers: { Origin: BASE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'x', password: 'y'.repeat(300_000) }),
  });
  await bigRes.text().catch(() => '');
  check(bigRes.status === 413, '300 KB 로그인 본문 → 413', bigRes.status);

  // 클릭재킹 방지 헤더
  const headRes = await fetch(BASE + '/login', { redirect: 'manual' });
  await headRes.text().catch(() => '');
  check(headRes.headers.get('x-frame-options') === 'DENY' && !headRes.headers.get('x-powered-by'),
    '/login 응답에 X-Frame-Options: DENY, X-Powered-By 없음', Object.fromEntries(headRes.headers));

  const me = await admin.get(API.me);
  must(me.data?.user?.role === 'admin', 'GET /api/auth/me → admin', brief(me));

  const hostInv = await admin.post(API.adminInvites, { role: 'host', notes: ['진행자'], expiresInDays: 14 });
  must(hostInv.status === 201 && hostInv.data?.invites?.length === 1, '진행자 초대 1장 생성', brief(hostInv));
  const playerInv = await admin.post(API.adminInvites, {
    role: 'player', notes: ['러너', '터너', '컨트롤러', '아키텍트'], expiresInDays: 14,
  });
  must(playerInv.status === 201 && playerInv.data?.invites?.length === 4, '참가자 초대 4장 생성', brief(playerInv));
  const hostCode: string = hostInv.data.invites[0].code;
  check(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(hostCode), `초대 코드 형식 XXXX-XXXX (${hostCode})`);
  check(String(hostInv.data.invites[0].url).includes(`/signup?code=${hostCode}`), '초대 링크 /signup?code=');

  const inviteCheck = await anon.get(API.invite(hostCode));
  check(inviteCheck.status === 200 && inviteCheck.data?.valid === true && inviteCheck.data?.role === 'host',
    'GET /api/invites/[code] → valid, host', brief(inviteCheck));

  const playerAsAdmin = await anon.get(API.adminInvites);
  check(playerAsAdmin.status === 401, '로그인 없이 관리자 API → 401', brief(playerAsAdmin));

  const host = new Client('host');
  const hs = await host.post(API.signup, { code: hostCode, username: `e2e_host_${SUFFIX}`, displayName: '진행자', password: PASSWORD });
  must(hs.status === 201 && hs.data?.user?.role === 'host', '진행자 가입 + 로그인', brief(hs));
  check(hs.data?.redirect === '/', '진행자 가입 → redirect / (홈)', hs.data?.redirect);
  host.id = hs.data.user.id;

  const signupPage = await host.req('GET', `/signup?code=${hostCode}`, undefined, { headers: { Accept: 'text/html' } });
  const signupHtml = typeof signupPage.data === 'string' ? signupPage.data : '';
  check(signupPage.status === 200 && signupHtml.includes(`e2e_host_${SUFFIX}`) && signupHtml.includes('계정으로 로그인되어 있습니다'),
    'GET /signup?code= (로그인 상태) → 먼저 로그아웃하라는 패널 + 지금 계정', signupPage.status);

  const reuse = await anon.post(API.signup, { code: hostCode, username: `e2e_dup_${SUFFIX}`, displayName: '중복', password: PASSWORD });
  check(reuse.status === 410 && errCode(reuse) === 'invite_used', '쓴 초대 재사용 → 410 invite_used', brief(reuse));

  const players = {} as Record<RoleName, Client>;
  const invites: { code: string; note: string }[] = playerInv.data.invites;
  for (let i = 0; i < ROLE_ORDER.length; i += 1) {
    const role = ROLE_ORDER[i];
    const c = new Client(role);
    const r = await c.post(API.signup, {
      code: invites[i].code, username: `e2e_${role}_${SUFFIX}`, displayName: invites[i].note, password: PASSWORD,
    });
    must(r.status === 201 && r.data?.user?.role === 'player', `참가자 가입: ${invites[i].note}`, brief(r));
    check(r.data?.redirect === '/lobby', `참가자 가입 → redirect /lobby (대기실): ${invites[i].note}`, r.data?.redirect);
    c.id = r.data.user.id;
    players[role] = c;
  }

  const listed = await admin.get(API.adminInvites);
  const used = (listed.data?.invites ?? []).filter((i: { status: string }) => i.status === 'used').length;
  check(used >= 5, `관리자 초대 목록: 사용됨 ${used}장`, brief(listed));

  const forbiddenGames = await players.runner.post(API.games, { teams: 4 });
  check(forbiddenGames.status === 403, '참가자는 게임 생성 불가 → 403', brief(forbiddenGames));
  return { admin, host, players };
}

// ------------------------------------------------------------------ 2. 게임 생성·참가
async function lobby(base: Pick<World, 'admin' | 'host' | 'players'>): Promise<World> {
  const { host, players } = base;
  // 본 시나리오는 직접 선택(self) 게임: 대기실 자동 배정과 섞이지 않게
  const created = await host.post(API.games, { teams: 4, rounds: [1, 2, 3, 4, 5], mode: 'self' });
  must(created.status === 201 && /^\d{4}$/.test(created.data?.code ?? '') && created.data?.assigned === 0,
    '진행자 게임 생성 (팀 4, R1~R5, 직접 선택)', brief(created));
  const code: string = created.data.code;

  const mine = await host.get(API.games);
  const listed = mine.data?.games?.find((g: { code: string }) => g.code === code);
  check(mine.status === 200 && listed?.mode === 'self' && JSON.stringify(listed?.rounds) === '[1,2,3,4,5]',
    'GET /api/games 목록에 새 게임 (rounds·mode)', brief(mine));

  const hv = await host.state(code);
  check(hv.me.isHost && hv.game.phase === 'lobby' && hv.game.round === 1 && hv.game.roundIndex === 0
    && JSON.stringify(hv.game.rounds) === '[1,2,3,4,5]' && hv.game.mode === 'self',
  '진행자 뷰: lobby·R1·isHost·rounds [1..5]·roundIndex 0', hv.game);
  check(hv.teams.length === 4 && hv.teams[0].name === '수리부엉이' && hv.teams[0].color === '#9B6BFF', '팀 4개, 첫 팀 수리부엉이 #9B6BFF');
  check(Array.isArray(hv.solutions) && hv.solutions.length > 0, '진행자 뷰에 정답(solutions) 있음');
  const joinUrls = hv.joinUrls;
  check(Array.isArray(joinUrls)
    && joinUrls.every((u) => /^https?:\/\/[^/]+$/.test(u.url) && ['public', 'lan', 'vpn'].includes(u.kind))
    && !joinUrls.some((u) => /\/\/(localhost|127\.|\[::1\])/.test(u.url)),
  `진행자 /state에 joinUrls (localhost 제외): ${JSON.stringify(joinUrls)}`);
  // 초대 링크도 다른 기기에서 열리는 주소를 쓴다 (진행자 참가 주소의 첫 후보와 같다)
  const inviteAdmin = new Client('관리자 (초대 주소 확인)');
  await inviteAdmin.post(API.login, { username: ADMIN_USER, password: ADMIN_PASS });
  const invList = await inviteAdmin.get(API.adminInvites);
  const firstLink: string = invList.data?.invites?.[0]?.url ?? '';
  const wantOrigin = Array.isArray(joinUrls) && joinUrls.length > 0 ? joinUrls[0].url : null;
  check(invList.status === 200 && (wantOrigin === null
    || (firstLink.startsWith(`${wantOrigin}/signup?code=`) && invList.data?.linkOrigin === wantOrigin)),
  `초대 링크 주소 = 참가 주소 첫 후보: ${firstLink} (${invList.data?.linkKind})`);
  const teamId = hv.teams[0].id;

  // 참가 전 조회: 로비 수준만
  const pre = await players.runner.state(code);
  check(pre.me.teamId === null && pre.myProgram === null && pre.solutions === undefined && pre.programs === undefined
    && pre.joinUrls === undefined,
  '비참가자 뷰: 팀 없음, 코드·정답·참가 주소 후보 없음');

  const anon = new Client('anon');
  const anonState = await anon.get(API.gameState(code));
  check(anonState.status === 401, '로그인 없이 /state → 401', brief(anonState));

  for (const role of ROLE_ORDER) {
    const r = await players[role].post(API.gameJoin(code), { teamId, roles: [role] });
    must(r.status === 200 && r.data?.teamId === teamId && r.data?.roles?.includes(role), `참가: ${role}`, brief(r));
  }
  // 역할 공유 (FEATURE_V4 §2): 남이 맡은 역할도 맡을 수 있다 (role_taken 없음)
  const shared = await players.architect.post(API.gameJoin(code), { teamId, roles: ['runner'] });
  check(shared.status === 200 && JSON.stringify(shared.data?.roles) === '["runner","architect"]',
    '역할 공유: 아키텍트가 러너도 맡음 → 200 (러너 2명)', brief(shared));
  const sv = await host.state(code);
  const team0 = sv.teams.find((t) => t.id === teamId)!;
  check(team0.members.filter((m) => m.role === 'runner').length === 2 && team0.people.length === 4
    && team0.missingRoles.length === 0
    && JSON.stringify(team0.people.find((p) => p.userId === players.architect.id)?.roles) === '["runner","architect"]',
  '팀 뷰: people 4명, 러너 2명, 한 사람이 역할 여러 개, missingRoles 없음', team0.people);
  // 진행자가 역할 1개만 내보내기 (memberId) → 아키텍트만 남는다
  const extra = team0.people.find((p) => p.userId === players.architect.id)?.memberIds.runner;
  const kickOne = await host.post(API.gameKick(code), { memberId: extra });
  check(kickOne.status === 200, '진행자: 역할 1개 내보내기 {memberId} → 200', brief(kickOne));
  const other = await players.runner.post(API.gameJoin(code), { teamId: hv.teams[1].id, roles: ['runner'] });
  check(other.status === 409 && errCode(other) === 'other_team', '다른 팀 참가 → 409 other_team', brief(other));

  const pv = await players.architect.state(code);
  check(pv.me.teamId === teamId && pv.me.roles.join() === 'architect', '참가자 뷰: 내 팀·역할 architect');
  check(pv.joinUrls === undefined, '참가자 /state에는 joinUrls 없음', pv.joinUrls);
  check(pv.teams[0].members.length === 4 && pv.teams[0].people.length === 4, '팀 1 팀원 4명', pv.teams[0].members.map((m) => m.role));
  check(pv.teams[1].missingRoles.length === 4, '빈 팀의 missingRoles = 4역할', pv.teams[1].missingRoles);

  // 로그인 뒤 갈 곳: 끝나지 않은 게임의 팀원 → /play/<코드>
  const relogin = new Client('러너 (다시 로그인)');
  const rl = await relogin.post(API.login, { username: `e2e_runner_${SUFFIX}`, password: PASSWORD });
  check(rl.status === 200 && rl.data?.redirect === `/play/${code}`, `팀원 로그인 → redirect /play/${code}`, brief(rl));
  const hostMe = await host.get(API.me);
  check(hostMe.data?.redirect === '/', '진행자 /api/auth/me → redirect /', brief(hostMe));

  // 이중 전이 방지
  const notHost = await players.runner.post(API.gamePhase(code), { to: 'coding', expect: 'lobby' });
  check(notHost.status === 403, '참가자 페이즈 전이 → 403', brief(notHost));
  const start = await host.post(API.gamePhase(code), { to: 'coding', expect: 'lobby' });
  must(start.status === 200, '진행자: lobby → coding', brief(start));
  const twice = await host.post(API.gamePhase(code), { to: 'coding', expect: 'lobby' });
  check(twice.status === 409 && errCode(twice) === 'phase_changed', '같은 expect로 두 번 → 409 phase_changed', brief(twice));

  const cv = await players.runner.state(code);
  check(cv.game.phase === 'coding' && cv.myProgram?.editable === true && cv.myProgram.version === 0,
    'coding: 내 프로그램 편집 가능, version 0', cv.myProgram);
  check(cv.game.timerEndsAt !== null && Date.parse(cv.game.timerEndsAt) > Date.now(), 'coding 타이머 시작');

  // 역할 밖 블록 → 403
  const outside = await players.runner.put(API.gameProgram(code), { doc: withUids([{ id: 'left' }]), baseVersion: 0 });
  check(outside.status === 403 && errCode(outside) === 'role_block', '러너가 좌회전 추가 → 403 role_block', brief(outside));

  // 편집 충돌 → 409
  const first = await players.runner.put(API.gameProgram(code), { doc: withUids([{ id: 'forward' }]), baseVersion: 0 });
  check(first.status === 200 && first.data?.version === 1 && first.data?.blocks === 1, '러너 앞으로 저장 → version 1', brief(first));
  const stale = await players.turner.put(API.gameProgram(code), { doc: withUids([{ id: 'left' }]), baseVersion: 0 });
  check(stale.status === 409 && errCode(stale) === 'version_conflict' && stale.data?.version === 1
    && shape(stale.data?.doc ?? []) === shape([{ id: 'forward' }]),
    '낡은 baseVersion → 409 + 서버 doc·version', brief(stale));

  // 이동·삭제는 누구나 (터너가 러너의 앞으로를 지운다)
  const removed = await players.turner.put(API.gameProgram(code), { doc: [], baseVersion: 1 });
  check(removed.status === 200 && removed.data?.version === 2, '남의 블록 삭제는 허용 → version 2', brief(removed));

  const early = await players.runner.post(API.gameSubmit(code));
  check(early.status === 403 && errCode(early) === 'not_architect', '아키텍트가 아니면 제출 → 403', brief(early));
  const empty = await players.architect.post(API.gameSubmit(code));
  check(empty.status === 400 && errCode(empty) === 'invalid_program' && Array.isArray(empty.data?.errors),
    '빈 프로그램 제출 → 400 invalid_program + errors[]', brief(empty));

  return { ...base, code, teamId, roundScores: [] };
}

// ------------------------------------------------------------------ 3. 라운드
/** 역할 순서대로 나눠 저장해 target을 만든다 (각 단계는 자기 역할 블록만 늘린다). 저장이 모두 200이면 true */
async function buildProgram(w: World, target: Block[], label: string): Promise<boolean> {
  const stages: RoleName[] = ['controller', 'runner', 'turner', 'architect'];
  const allowed = new Set<BlockId>();
  let version = (await w.players.architect.state(w.code)).myProgram?.version ?? 0;
  for (const role of stages) {
    for (const id of ROLES[role].blocks) allowed.add(id);
    const doc = keepOnly(target, allowed);
    const r = await w.players[role].put(API.gameProgram(w.code), { doc, baseVersion: version });
    if (r.status !== 200) return check(false, `${label}: ${role} 저장`, brief(r));
    version = r.data.version;
  }
  const v = await w.players.runner.state(w.code);
  return check(shape(v.myProgram?.doc ?? []) === shape(target) && v.myProgram?.blocks === countBlocks(target)
    && v.myProgram?.doc.every((b, i) => b.uid === target[i].uid),
    `${label}: 역할별 저장으로 ${countBlocks(target)}블록 완성 (uid 유지)`);
}

async function phase(w: World, to: string, expect: string): Promise<void> {
  const r = await w.host.post(API.gamePhase(w.code), { to, expect });
  must(r.status === 200, `진행자: ${expect} → ${to}`, brief(r));
}

function lastPos(res: ResultView): string {
  const s = res.trace?.[res.trace.length - 1];
  return s ? `(${s.owl.x},${s.owl.y})` : '-';
}

/** 한 라운드: 코딩 → 제출 → 봉인 → 실행 → (패치) → 점수 확정. 우리 팀 결과를 돌려준다 */
async function playRound(w: World, round: 1 | 2 | 3 | 4 | 5, program: Program, opts: { submit?: boolean } = {}): Promise<ResultView> {
  if (round > 1) await phase(w, 'coding', 'scored');
  const v0 = await w.host.state(w.code);
  must(v0.game.round === round && v0.game.phase === 'coding', `R${round} coding 시작`, v0.game);

  const target = withUids(program);
  must(await buildProgram(w, target, `R${round}`), `R${round} 프로그램 저장`);
  if (round === 2) {
    // 지난 라운드(R1)에서 만든 저장·제출이 늦게 도착 → 409 not_editable, 새 라운드 프로그램은 그대로
    const cur = (await w.players.runner.state(w.code)).myProgram!;
    const late = await w.players.runner.put(API.gameProgram(w.code), { doc: [], baseVersion: cur.version, round: 1 });
    check(late.status === 409 && errCode(late) === 'not_editable', 'R2: round 1용 저장 → 409 not_editable', brief(late));
    const lateSub = await w.players.architect.post(API.gameSubmit(w.code), { round: 1 });
    check(lateSub.status === 409 && errCode(lateSub) === 'not_editable', 'R2: round 1용 제출 → 409 not_editable', brief(lateSub));
    const kept = (await w.players.runner.state(w.code)).myProgram!;
    check(kept.version === cur.version && kept.submittedAt === null, 'R2: 늦은 요청 뒤에도 프로그램 그대로', kept.version);
  }
  if (opts.submit !== false) {
    const sub = await w.players.architect.post(API.gameSubmit(w.code), round === 2 ? { round } : undefined);
    must(sub.status === 200 && sub.data?.submitOrder === 1, `R${round} 아키텍트 제출 → 봉인, 제출 순서 1`, brief(sub));
    const after = await w.players.runner.put(API.gameProgram(w.code), { doc: [], baseVersion: 999 });
    check(after.status === 409 && errCode(after) === 'sealed', `R${round} 봉인 후 저장 → 409 sealed`, brief(after));
  }

  await phase(w, 'sealed', 'coding');
  const sv = await w.host.state(w.code);
  check(sv.teams.every((t) => t.program.submittedAt !== null), `R${round} 봉인: 미제출 팀 자동 봉인`,
    sv.teams.map((t) => t.program.sealedBy));
  await phase(w, 'running', 'sealed');

  const hv = await w.host.state(w.code);
  const res = hv.results.find((r) => r.teamId === w.teamId);
  must(!!res, `R${round} 실행 결과 있음`);
  check(hv.results.length === 4 && hv.results.every((r) => Array.isArray(r.trace)), `R${round} 진행자 뷰: 4팀 결과·trace`);
  check(hv.game.runningTeamId === w.teamId, `R${round} 첫 재생 팀 = 제출 1번 팀`);
  const pv = await w.players.turner.state(w.code);
  check(pv.results.every((r) => (r.teamId === w.teamId) === Array.isArray(r.trace)),
    `R${round} 참가자 뷰: 자기 팀 결과만 trace`);
  check(pv.solutions === undefined && pv.programs === undefined, `R${round} 참가자 뷰: 정답·다른 팀 코드 없음`);
  return res!;
}

async function score(w: World, round: number, res: ResultView): Promise<void> {
  const next = round === 5 ? 'finished' : 'scored';
  await phase(w, 'scored', 'running');
  w.roundScores.push(res.score);
  const v = await w.host.state(w.code);
  const row = v.standings.find((s) => s.teamId === w.teamId);
  // 순위표 열 = 고른 라운드 순서 (GameInfo.rounds)
  check(row?.rounds[v.game.rounds.indexOf(round as GameView['game']['round'])] === res.score,
    `R${round} 점수 확정: 순위표 R${round} = ${res.score}`, row);
  if (next === 'finished') await phase(w, 'finished', 'scored');
}

async function rounds(w: World): Promise<void> {
  for (const round of [1, 2] as const) {
    const res = await playRound(w, round, SOLUTIONS[`r${round}`][0]);
    check(res.outcome === 'goal', `R${round} 정답[0] → goal (${res.ticks}틱, ${res.score}점)`, res);
    if (round === 1) {
      // 진행자 탭 두 개의 자동 진행 이중 넘김 방지: 지금 재생 팀이 expectTeamId와 다르면 409
      const other = (await w.host.state(w.code)).teams.find((t) => t.id !== w.teamId)!.id;
      const stale = await w.host.post(API.gameRunning(w.code), { teamId: other, expectTeamId: other });
      check(stale.status === 409 && errCode(stale) === 'running_changed',
        'POST /running expectTeamId 불일치 → 409 running_changed', brief(stale));
      // 409면 같이 보낸 autoplay도 저장되지 않는다 (반쯤 적용된 요청 없음)
      const autoBefore = (await w.host.state(w.code)).game.autoplay;
      const mixed = await w.host.post(API.gameRunning(w.code), { teamId: other, expectTeamId: other, autoplay: !autoBefore });
      check(mixed.status === 409 && errCode(mixed) === 'running_changed',
        'POST /running {teamId, expectTeamId 불일치, autoplay} → 409 running_changed', brief(mixed));
      const autoAfter = (await w.host.state(w.code)).game.autoplay;
      check(autoAfter === autoBefore, '409 난 POST /running은 autoplay도 바꾸지 않는다', { autoBefore, autoAfter });
      const okSel = await w.host.post(API.gameRunning(w.code), { teamId: w.teamId, expectTeamId: w.teamId });
      check(okSel.status === 200, 'POST /running expectTeamId 일치 → 200', brief(okSel));
      const after = await w.host.state(w.code);
      check(after.game.runningTeamId === w.teamId, '409 뒤에도 재생 팀은 그대로', after.game.runningTeamId);
    }
    await score(w, round, res);
  }

  const r3 = await playRound(w, 3, SOLUTIONS.r3[0]);
  const first = r3.scoreLines.find((l) => l.label === '최초 제출')?.points ?? 0;
  check(r3.outcome === 'goal' && r3.ticks === 20 && r3.mice === 2 && r3.blocks === 5,
    `R3 SOLUTIONS.r3[0] → goal·20틱·쥐 2·5블록`, r3);
  check(r3.score - first === 150 && first === 10,
    `R3 점수 150 (+ 최초 제출 10 = ${r3.score})`, r3.scoreLines);
  await score(w, 3, r3);

  const r4 = await playRound(w, 4, SOLUTIONS.r4[0]);
  check(typeof r4.score === 'number', `R4 실행 → ${r4.outcome} ${r4.score}점`, r4);
  await score(w, 4, r4);

  // R5: 잠자기 없는 코드 → 고양이 → 패치 → 정답 재제출 → 재실행
  const dead = await playRound(w, 5, ROUND_EXTRAS.r5.noSleep);
  check(dead.outcome === 'dead' && dead.ticks === 18 && dead.message === '고양이를 밟았다' && dead.score === 0
    && lastPos(dead) === '(7,4)',
    `R5 noSleep → dead·18틱·${lastPos(dead)}·"${dead.message}"·${dead.score}점`, { ...dead, trace: undefined });

  const notYet = await w.host.post(API.gameRerun(w.code), { teamId: w.teamId });
  check(notYet.status === 409 && errCode(notYet) === 'no_patch', '패치 전 재실행 → 409 no_patch', brief(notYet));
  const patch = await w.host.post(API.gamePatch(w.code), { teamId: w.teamId });
  must(patch.status === 200, 'R5 진행자 패치 허용', brief(patch));
  const again = await w.host.post(API.gamePatch(w.code), { teamId: w.teamId });
  check(again.status === 409 && errCode(again) === 'no_patch_left', '패치권 두 번 → 409 no_patch_left', brief(again));

  const pv = await w.players.architect.state(w.code);
  check(pv.myProgram?.editable === true && pv.myProgram.patchActive && pv.myProgram.submittedAt === null,
    'R5 패치: 봉인 풀림, 다시 편집 가능', pv.myProgram);
  must(await buildProgram(w, withUids(SOLUTIONS.r5[0]), 'R5 패치'), 'R5 패치 코드 저장 (잠자기 추가)');
  const resub = await w.players.architect.post(API.gameSubmit(w.code));
  must(resub.status === 200, 'R5 패치 코드 재제출', brief(resub));

  const rerun = await w.host.post(API.gameRerun(w.code), { teamId: w.teamId });
  must(rerun.status === 200, 'R5 진행자 재실행', brief(rerun));
  const hv = await w.host.state(w.code);
  const fixed = hv.results.find((r) => r.teamId === w.teamId)!;
  check(fixed.outcome === 'goal' && fixed.ticks === 37 && fixed.mice === 2 && fixed.score === 135 && fixed.usedPatch,
    `R5 재실행 → goal·${fixed.ticks}틱·쥐 ${fixed.mice}·${fixed.score}점 (패치 −10)`, { ...fixed, trace: undefined });
  check(fixed.scoreLines.some((l) => l.label === '패치권 사용' && l.points === -10), 'R5 점수 줄에 패치권 사용 −10');
  await score(w, 5, fixed);
}

// ------------------------------------------------------------------ 4. SSE·최종 순위
/** /events 첫 메시지가 hello인지 본다 (쿠키 포함, 5초 제한) */
async function sseHello(c: Client, code: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(BASE + API.gameEvents(code), {
      headers: { Accept: 'text/event-stream', Cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      signal: ctrl.signal,
    });
    const type = res.headers.get('content-type') ?? '';
    let text = '';
    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    while (reader && !text.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
    }
    check(res.status === 200 && type.includes('text/event-stream') && /"type"\s*:\s*"hello"/.test(text),
      'SSE /events 연결 → hello', `${res.status} ${type} ${text.slice(0, 120)}`);
    ctrl.abort();
  } catch (err) {
    check(false, 'SSE /events 연결 → hello', (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

async function finish(w: World): Promise<void> {
  const v = await w.host.state(w.code);
  check(v.game.phase === 'finished' && v.game.round === 5, '게임 종료: finished·R5', v.game);
  const ranks = v.standings.map((s) => s.rank);
  check(v.standings.length === 4 && ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), '최종 순위 4팀, 순위 오름차순', ranks);
  const ours = v.standings.find((s) => s.teamId === w.teamId);
  const total = w.roundScores.reduce((a, b) => a + b, 0);
  check(ours?.rank === 1 && ours.total === total && ours.rounds.length === 5 && ours.rounds.every((r) => typeof r === 'number'),
    `우리 팀 1위, 누적 ${ours?.total} = R1~R5 합 ${total}`, ours);
  check(ours?.goals === 5, `우리 팀 도착 라운드 ${ours?.goals}`, ours);
  for (const s of v.standings) {
    const team = v.teams.find((t) => t.id === s.teamId);
    console.log(`   ${s.rank}위 ${team?.name ?? s.teamId} ${s.total}점 [${s.rounds.join(', ')}] 도착 ${s.goals} 틱 ${s.ticks}`);
  }
  const pv = await w.players.runner.state(w.code);
  check(pv.standings.length === 4 && pv.solutions === undefined, '참가자도 최종 순위를 받는다 (정답 없음)');

  const del = await w.players.runner.req('DELETE', API.adminGame(w.code));
  check(del.status === 403, '참가자가 관리자 게임 삭제 → 403', brief(del));
  // 계정 전환 패널이 쓰는 로그아웃: Origin 붙은 POST + Accept: application/json → {ok:true}
  const logout = await w.players.runner.post(API.logout);
  const me = await w.players.runner.get(API.me);
  check(logout.status === 200 && logout.data?.ok === true && me.data?.user === null, '로그아웃(POST, JSON) → 세션 해제',
    `${brief(logout)} / ${brief(me)}`);
  const afterLogout = await w.players.runner.req('GET', '/login', undefined, { headers: { Accept: 'text/html' } });
  check(afterLogout.status === 200 && typeof afterLogout.data === 'string'
    && !afterLogout.data.includes('계정으로 로그인되어 있습니다'), '로그아웃 뒤 /login → 로그인 폼', afterLogout.status);
  const noOriginLogout = await w.players.architect.req('POST', API.logout, {}, { origin: null });
  check(noOriginLogout.status === 403, 'Origin 없는 로그아웃 POST → 403', brief(noOriginLogout));
}

// ------------------------------------------------------------------ 5. v4: 팀 10·인원 6·라운드 선택·대기실 (FEATURE_V4)
/** 대기실 SSE를 fetch 스트리밍으로 붙잡고 있는 폰 흉내. 받은 이벤트와 도착 시각을 모은다 */
class LobbyStream {
  readonly events: { at: number; e: LobbyEvent }[] = [];
  status = 0;
  private readonly ctrl = new AbortController();

  constructor(readonly c: Client, readonly query = '') {}

  async open(): Promise<void> {
    const res = await fetch(BASE + API.lobbyEvents() + this.query, {
      headers: { Accept: 'text/event-stream', Cookie: this.c.cookieHeader() },
      signal: this.ctrl.signal,
    });
    this.status = res.status;
    if (!res.ok || !res.body) {
      await res.text().catch(() => '');
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              try {
                this.events.push({ at: Date.now(), e: JSON.parse(line.slice(6)) as LobbyEvent });
              } catch {
                // 무시
              }
            }
          }
        }
      } catch {
        // abort
      }
    })();
  }

  /** 조건에 맞는 이벤트를 ms 안에 기다린다 (이미 받은 것 포함) */
  async waitFor(pred: (e: LobbyEvent) => boolean, ms: number, after = 0): Promise<{ at: number; e: LobbyEvent } | null> {
    const until = Date.now() + ms;
    for (;;) {
      const hit = this.events.find((x) => x.at >= after && pred(x.e));
      if (hit) return hit;
      if (Date.now() >= until) return null;
      await new Promise((r) => setTimeout(r, 15));
    }
  }

  close(): void {
    this.ctrl.abort();
  }
}

async function signupPlayers(admin: Client, n: number, prefix: string): Promise<Client[]> {
  const inv = await admin.post(API.adminInvites, {
    role: 'player', notes: Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`), expiresInDays: 1,
  });
  must(inv.status === 201 && inv.data?.invites?.length === n, `참가자 초대 ${n}장 (${prefix})`, brief(inv));
  const out: Client[] = [];
  for (let i = 0; i < n; i += 1) {
    const c = new Client(`${prefix}${i + 1}`);
    const r = await c.post(API.signup, {
      code: inv.data.invites[i].code, username: `e2e_${prefix}${i + 1}_${SUFFIX}`, displayName: `${prefix}${i + 1}`, password: PASSWORD,
    });
    must(r.status === 201, `가입 ${prefix}${i + 1}`, brief(r));
    c.id = r.data.user.id;
    out.push(c);
  }
  return out;
}

/** 페이즈를 끝까지 돌며 coding에 들어간 라운드를 모은다. 마지막 라운드 다음 coding은 400이어야 한다 */
async function playAllRounds(host: Client, code: string, label: string): Promise<number[]> {
  const seen: number[] = [];
  const go = async (to: string, expect: string) => {
    const r = await host.post(API.gamePhase(code), { to, expect });
    must(r.status === 200, `${label}: ${expect} → ${to}`, brief(r));
  };
  await go('coding', 'lobby');
  for (;;) {
    const v = await host.state(code);
    seen.push(v.game.round);
    check(v.game.roundIndex === seen.length - 1 && v.map.round === v.game.round,
      `${label}: R${v.game.round} coding (${v.game.roundIndex + 1}/${v.game.rounds.length})`, v.game);
    await go('sealed', 'coding');
    await go('running', 'sealed');
    await go('scored', 'running');
    const last = v.game.roundIndex === v.game.rounds.length - 1;
    if (last) {
      const beyond = await host.post(API.gamePhase(code), { to: 'coding', expect: 'scored' });
      check(beyond.status === 400 && errCode(beyond) === 'bad_transition',
        `${label}: 마지막 선택 라운드(R${v.game.round}) 다음 coding → 400 bad_transition`, brief(beyond));
      break;
    }
    await go('coding', 'scored');
  }
  await go('finished', 'scored');
  const end = await host.state(code);
  check(end.game.phase === 'finished' && end.standings.every((s) => s.rounds.length === end.game.rounds.length),
    `${label}: finished, 순위표 열 = 고른 라운드 ${end.game.rounds.length}개`, end.game);
  return seen;
}

async function teamsAndRounds(w: World, ps: Client[]): Promise<void> {
  const { host } = w;
  // 입력 검사
  for (const [body, label] of [
    [{ teams: 11, mode: 'self' }, '팀 11개'], [{ teams: 1, mode: 'self' }, '팀 1개'],
  ] as const) {
    const r = await host.post(API.games, body);
    check(r.status === 400, `${label} → 400`, brief(r));
  }
  for (const rounds of [[3, 1], [], [8], [1, 1]]) {
    const r = await host.post(API.games, { teams: 2, rounds, mode: 'self' });
    check(r.status === 400 && ['invalid_rounds', 'invalid_input'].includes(errCode(r) ?? ''),
      `rounds ${JSON.stringify(rounds)} → 400`, brief(r));
  }
  if (!HAS_R67) {
    const r = await host.post(API.games, { teams: 2, rounds: [6, 7], mode: 'self' });
    check(r.status === 400 && errCode(r) === 'round_unavailable', '엔진에 없는 라운드 → 400 round_unavailable', brief(r));
  }

  // 팀 10개 게임 (가능하면 7라운드)
  const allRounds = HAS_R67 ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const big = await host.post(API.games, { teams: 10, rounds: allRounds, mode: 'self' });
  must(big.status === 201, `팀 10개 게임 생성 (rounds ${JSON.stringify(allRounds)})`, brief(big));
  const code: string = big.data.code;
  const bv = await host.state(code);
  check(bv.teams.length === 10 && bv.teams.every((t, i) => t.name === TEAM_PRESETS[i].name && t.color === TEAM_PRESETS[i].color),
    '팀 10개: 프리셋 이름·색 (마지막 솔부엉이 #7AA2C8)', bv.teams.map((t) => `${t.name} ${t.color}`));
  const t0 = bv.teams[0].id;

  // 팀당 6명 (역할 공유), 7번째는 409 team_full
  const roles = [['runner'], ['runner'], ['turner'], ['controller'], ['architect'], ['architect']];
  for (let i = 0; i < 6; i += 1) {
    const r = await ps[i].post(API.gameJoin(code), { teamId: t0, roles: roles[i] });
    must(r.status === 200, `팀 1에 ${i + 1}번째 사람 (${roles[i].join()}) → 200`, brief(r));
  }
  const seventh = await ps[6].post(API.gameJoin(code), { teamId: t0, roles: ['runner'] });
  check(seventh.status === 409 && errCode(seventh) === 'team_full', '팀의 7번째 사람 → 409 team_full', brief(seventh));
  const more = await ps[0].post(API.gameJoin(code), { teamId: t0, roles: ['turner'] });
  check(more.status === 200 && JSON.stringify(more.data?.roles) === '["runner","turner"]',
    '이미 팀원인 사람은 역할을 더 맡을 수 있다 (인원 그대로)', brief(more));
  const fv = await host.state(code);
  check(fv.teams[0].people.length === 6 && fv.teams[0].missingRoles.length === 0
    && fv.teams[0].members.filter((m) => m.role === 'runner').length === 2
    && fv.teams[0].members.filter((m) => m.role === 'architect').length === 2,
  '팀 1: 6명, 러너 2·아키텍트 2, 빠진 역할 없음', fv.teams[0].people.map((p) => p.roles));

  // 같은 역할 2명이 각자 블록을 놓고, 두 번째 아키텍트가 제출
  const start = await host.post(API.gamePhase(code), { to: 'coding', expect: 'lobby' });
  must(start.status === 200, '팀 10개 게임: lobby → coding', brief(start));
  const s1 = await ps[0].put(API.gameProgram(code), { doc: withUids([{ id: 'forward' }]), baseVersion: 0 });
  const s2 = await ps[1].put(API.gameProgram(code), { doc: withUids([{ id: 'forward' }, { id: 'forward' }]), baseVersion: 1 });
  check(s1.status === 200 && s2.status === 200 && s2.data?.version === 2 && s2.data?.blocks === 2,
    '러너 2명이 각자 블록을 놓는다 (v1, v2)', `${brief(s1)} / ${brief(s2)}`);
  const sub = await ps[5].post(API.gameSubmit(code));
  check(sub.status === 200 && sub.data?.submitOrder === 1, '두 번째 아키텍트도 제출 → 200', brief(sub));
  // 되돌려서 대기실부터 전체 라운드를 돈다
  const back = await host.post(API.gamePhase(code), { to: 'lobby', expect: 'coding' });
  must(back.status === 200, '팀 10개 게임: coding → lobby', brief(back));
  const seen = await playAllRounds(host, code, `팀 10개·${allRounds.length}라운드`);
  check(JSON.stringify(seen) === JSON.stringify(allRounds), `진행한 라운드 ${JSON.stringify(seen)}`, seen);
  if (HAS_R67) check(seen.includes(6) && seen.includes(7), '7라운드 게임은 R6·R7까지 간다', seen);

  // [1,3,5]만 고른 게임
  const pick = await host.post(API.games, { teams: 2, rounds: [1, 3, 5], mode: 'self' });
  must(pick.status === 201, '라운드 [1,3,5] 게임 생성', brief(pick));
  const pv = await host.state(pick.data.code);
  check(JSON.stringify(pv.game.rounds) === '[1,3,5]' && pv.game.round === 1, '[1,3,5]: rounds·첫 라운드 1', pv.game);
  const seen135 = await playAllRounds(host, pick.data.code, '라운드 [1,3,5]');
  check(JSON.stringify(seen135) === '[1,3,5]', `[1,3,5]: R1 → R3 → R5 → finished (${JSON.stringify(seen135)})`, seen135);
}

async function lobbyFlow(w: World, ps: Client[]): Promise<void> {
  const { host, admin } = w;
  const anon = new Client('anon');
  const anonLobby = await anon.get(API.lobby);
  check(anonLobby.status === 401, '로그인 없이 GET /api/lobby → 401', brief(anonLobby));
  const anonEvents = await fetch(BASE + API.lobbyEvents());
  await anonEvents.text().catch(() => '');
  check(anonEvents.status === 401, '로그인 없이 대기실 SSE → 401', anonEvents.status);

  const [p7, p8, p9, p10, p11, p12, p13] = ps.slice(6);
  const first = await p7.get<LobbyResponse>(API.lobby);
  must(first.status === 200 && first.data.me.userId === p7.id && first.data.myGame === null, 'GET /api/lobby → me, myGame null', brief(first));
  const openAuto = first.data.openGames.filter((g) => g.mode === 'auto' && g.joinable);
  if (openAuto.length > 0) {
    check(false, '대기실 흐름은 열린 자동 배정 게임이 없을 때만 확인한다 (빈 DB에서 실행)', openAuto.map((g) => g.code));
    return;
  }

  // 5명이 대기실 SSE를 붙잡고 기다린다
  const five = [p7, p8, p9, p10, p11];
  const streams: LobbyStream[] = [];
  try {
    for (const c of five) {
      const s = new LobbyStream(c);
      streams.push(s);
      await s.open();
      const hello = await s.waitFor((e) => e.type === 'hello', 5000);
      must(s.status === 200 && hello !== null && hello.e.type === 'hello' && hello.e.waiting === true,
        `${c.name}: 대기실 SSE → hello (waiting)`, `${s.status} ${JSON.stringify(hello?.e)}`);
    }
    const hl = await host.get<LobbyResponse>(API.lobby);
    const ids = hl.data.waiting.map((u) => u.userId);
    check(five.every((c) => ids.includes(c.id)) && JSON.stringify(ids.filter((id) => five.some((c) => c.id === id))) === JSON.stringify(five.map((c) => c.id)),
      '진행자 GET /api/lobby: 대기 5명, 들어온 순서', ids);
    check(hl.data.waiting.every((u) => Object.keys(u).sort().join() === 'displayName,since,userId,username'),
      '대기 명단에는 표시 이름·아이디·들어온 시각만', hl.data.waiting[0]);
    check(!ids.includes(host.id), '진행자(구경)는 대기 명단에 없다');

    // 참가자는 데려오기·옮기기 불가
    const notHostPull = await p13.post(API.gamePull(w.code), {});
    check(notHostPull.status === 403, '참가자 POST /pull → 403', brief(notHostPull));

    // 자동 배정 게임 생성 → 1초 안에 각자 assigned
    const t0 = Date.now();
    const created = await host.post(API.games, { teams: 2, rounds: [1, 2, 3], mode: 'auto' });
    must(created.status === 201 && created.data?.assigned === 5 && created.data?.leftWaiting === 0,
      '자동 배정 게임 생성 → assigned 5, leftWaiting 0', brief(created));
    const codeA: string = created.data.code;
    const got = await Promise.all(streams.map((s) => s.waitFor((e) => e.type === 'assigned' && e.code === codeA, 3000)));
    const worst = Math.max(...got.map((g) => (g ? g.at - t0 : Infinity)));
    check(got.every((g) => g !== null) && worst <= 1000, `대기 5명 모두 1초 안에 'assigned' 수신 (가장 늦은 ${worst}ms)`, worst);
    const av = await host.state(codeA);
    const expectSplit = [autoRoleSplit(3), autoRoleSplit(2)];
    const order = [[p7, p9, p11], [p8, p10]];
    check(av.teams.length === 2 && av.teams.every((t, ti) => t.people.length === order[ti].length
      && t.people.every((p, k) => p.userId === order[ti][k].id && JSON.stringify(p.roles) === JSON.stringify(expectSplit[ti][k]))),
    '팀 i mod 2, 팀 안 역할 규칙 (3명: [아키·컨트롤러]/[러너]/[터너], 2명: [터너·아키]/[러너·컨트롤러])',
    av.teams.map((t) => t.people.map((p) => p.roles)));
    check(av.teams.every((t) => t.missingRoles.length === 0), '모든 팀 4역할이 채워짐', av.teams.map((t) => t.missingRoles));
    const ev = got[0]!.e;
    check(ev.type === 'assigned' && ev.teamId === av.teams[0].id && ev.teamName === av.teams[0].name
      && JSON.stringify(ev.roles) === JSON.stringify(expectSplit[0][0]), "'assigned' 이벤트: 팀·역할", ev);
    const pl = await p7.get<LobbyResponse>(API.lobby);
    check(pl.data.myGame?.code === codeA && !pl.data.me.waiting, 'p7 GET /api/lobby → myGame', pl.data.myGame);
    const again = new Client('p7 (다시 로그인)');
    const rl = await again.post(API.login, { username: `e2e_v${7}_${SUFFIX}`, password: PASSWORD });
    check(rl.status === 200 && rl.data?.redirect === `/play/${codeA}`, `배정된 참가자 로그인 → /play/${codeA}`, brief(rl));

    // 늦게 온 사람: 열린 자동 게임이 하나 → 들어오자마자 사람이 가장 적은 팀으로
    const late = new LobbyStream(p12);
    streams.push(late);
    const tLate = Date.now();
    await late.open();
    const lateGot = await late.waitFor((e) => e.type === 'assigned', 3000);
    check(lateGot !== null && lateGot.at - tLate <= 1000 && lateGot.e.type === 'assigned' && lateGot.e.code === codeA
      && lateGot.e.teamId === av.teams[1].id && JSON.stringify(lateGot.e.roles) === JSON.stringify(autoRolesForNewcomer(2, GAME_ROLES)),
    '늦게 온 사람 → 곧바로 인원이 적은 팀2에 배정 (역할 규칙)', lateGot?.e);

    // 내보내면 대기실로 돌아간다 (자동 배정은 그 게임을 건너뜀) → 진행자가 직접 넣기(assign)
    const tKick = Date.now();
    const kick = await host.post(API.gameKick(codeA), { userId: p12.id });
    check(kick.status === 200, '진행자: {userId} 내보내기 → 200', brief(kick));
    const back = await late.waitFor((e) => e.type === 'lobby' && e.waiting.some((u) => u.userId === p12.id), 3000, tKick);
    check(back !== null, "내보낸 사람은 대기실로: 'lobby' 이벤트에 다시 대기 중", back?.e.type);
    const tSelf = Date.now();
    const selfGame = await host.post(API.games, { teams: 2, rounds: [1], mode: 'self' });
    must(selfGame.status === 201 && selfGame.data?.assigned === 0 && selfGame.data?.leftWaiting >= 1,
      '직접 선택 게임 생성 → assigned 0, 대기 인원 그대로', brief(selfGame));
    const codeC: string = selfGame.data.code;
    const open = await late.waitFor((e) => e.type === 'game-open' && e.code === codeC, 1000, tSelf);
    check(open !== null, "대기 중인 사람에게 'game-open' (직접 선택 → /join?code=)", open?.e);
    const pullSkip = await host.post(API.gamePull(codeA), {});
    check(pullSkip.status === 200 && pullSkip.data?.assigned === 0, '내보낸 사람은 데려오기(전체)에서 빠진다 → assigned 0', brief(pullSkip));
    const notHostAssign = await p13.post(API.gameAssign(codeA), { userId: p12.id, teamId: av.teams[0].id, roles: ['runner'] });
    check(notHostAssign.status === 403, '참가자 POST /assign → 403', brief(notHostAssign));
    const tAssign = Date.now();
    const assign = await host.post(API.gameAssign(codeA), { userId: p12.id, teamId: av.teams[0].id, roles: ['runner'] });
    check(assign.status === 200 && assign.data?.teamId === av.teams[0].id, '진행자 POST /assign → 200', brief(assign));
    const reassigned = await late.waitFor((e) => e.type === 'assigned' && e.code === codeA, 1000, tAssign);
    check(reassigned !== null, "진행자가 넣은 사람에게 'assigned'", reassigned?.e);

    // 열린 자동 게임이 둘이면 자동 참가 없음 → 데려오기(pull)로
    const b = await host.post(API.games, { teams: 2, rounds: [1], mode: 'auto' });
    must(b.status === 201 && b.data?.assigned === 0, '대기 인원 0에서 자동 게임 B 생성 → assigned 0', brief(b));
    const codeB: string = b.data.code;
    const s13 = new LobbyStream(p13);
    streams.push(s13);
    await s13.open();
    await s13.waitFor((e) => e.type === 'hello', 5000);
    const none = await s13.waitFor((e) => e.type === 'assigned', 700);
    check(none === null, '열린 자동 게임이 둘이면 들어와도 자동 배정하지 않는다');
    const l13 = await p13.get<LobbyResponse>(API.lobby);
    check([codeA, codeB].every((c) => l13.data.openGames.some((g) => g.code === c && g.mode === 'auto' && g.joinable))
      && l13.data.me.waiting, '대기실 openGames에 자동 게임 A·B (참가 가능)', l13.data.openGames.map((g) => g.code));
    const selfJoin = await p13.post(API.lobbyJoin, { code: codeC });
    check(selfJoin.status === 409 && errCode(selfJoin) === 'self_mode', '직접 선택 게임에 참가 버튼 → 409 self_mode', brief(selfJoin));
    const tPull = Date.now();
    const pull = await host.post(API.gamePull(codeB), {});
    check(pull.status === 200 && pull.data?.assigned === 1 && pull.data?.placements?.[0]?.userId === p13.id,
      '진행자 POST /pull → 대기 1명 배정', brief(pull));
    const pulled = await s13.waitFor((e) => e.type === 'assigned' && e.code === codeB, 1000, tPull);
    check(pulled !== null && pulled.e.type === 'assigned' && pulled.e.roles.length === 4,
      "데려온 사람에게 1초 안에 'assigned' (빈 팀 → 4역할)", pulled?.e);

    // 한 사람은 끝나지 않은 게임 하나에만: A의 팀원(p7)이 B에 /join → 409 in_other_game, 계속 A의 팀원
    const bTeams = (await host.state(codeB)).teams;
    const dup = await p7.post(API.gameJoin(codeB), { teamId: bTeams[1].id, roles: ['runner'] });
    check(dup.status === 409 && errCode(dup) === 'in_other_game', '다른 게임 팀원이 /join 으로 두 번째 게임 → 409 in_other_game', brief(dup));
    const p7Still = await p7.get<LobbyResponse>(API.lobby);
    check(p7Still.data.myGame?.code === codeA, 'p7은 계속 게임 A의 팀원 (B에 들어가지 않음)', p7Still.data.myGame);
    const bAfter = await host.state(codeB);
    check(!bAfter.teams.some((t) => t.people.some((p) => p.userId === p7.id)), '게임 B 팀원 목록에 p7 없음');

    // 정리: 이번에 연 게임은 지운다 (다시 돌려도 열린 자동 게임이 남지 않게)
    for (const c of [codeA, codeB, codeC]) {
      const del = await admin.req('DELETE', API.adminGame(c));
      check(del.status === 200, `정리: 게임 ${c} 삭제`, brief(del));
    }
    const after = new Client('p7 (정리 뒤 로그인)');
    const rl2 = await after.post(API.login, { username: `e2e_v${7}_${SUFFIX}`, password: PASSWORD });
    check(rl2.status === 200 && rl2.data?.redirect === '/lobby', '게임이 없어진 참가자 로그인 → /lobby', brief(rl2));
  } finally {
    for (const s of streams) s.close();
  }
}

async function v4(w: World): Promise<void> {
  const ps = await signupPlayers(w.admin, 13, 'v');
  await teamsAndRounds(w, ps);
  await lobbyFlow(w, ps);
}

async function main(): Promise<void> {
  console.log(`OWL COMPILE e2e:api → ${BASE}`);
  await waitForServer();
  const base = await accounts();
  const w = await lobby(base);
  await sseHello(w.players.architect, w.code);
  await rounds(w);
  await finish(w);
  await v4(w);
}

main()
  .catch((err) => {
    failed += 1;
    if (err instanceof Abort) console.log(`✗ 중단: ${err.message}`);
    else console.log(`✗ 예외: ${(err as Error)?.stack ?? err}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
