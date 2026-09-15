// 폰이 접속할 주소 후보 (진행자 콘솔·보드 대기실의 참가 안내). 서버 전용.
// 진행자는 흔히 localhost로 콘솔을 열지만 폰은 이 PC의 와이파이(LAN) 주소로 들어와야 한다.
//
// 규칙
// - OWL_PUBLIC_URL이 올바른 http(s) 주소면 그 origin 하나만 ('public'). 잘못된 값·이 PC 전용 주소(localhost 등)는
//   무시하고 자동 감지로 넘어간다 (서버 로그에 한 번 경고).
// - 요청이 https이거나, 포트 없는 도메인(프록시·배포)으로 열렸으면 그 origin 하나만 (어댑터 주소는 그 뒤에서 안 열린다).
// - 아니면: 요청의 origin(이 PC 전용 주소가 아닐 때) + os.networkInterfaces()의
//   내부용이 아닌 IPv4마다 http://<ip>:<port> (포트는 요청 Host 헤더에서).
// - 순서: 192.168.x → 10.x → 172.16~31.x → 그 밖 → 100.64.0.0/10(Tailscale 같은 VPN·CGNAT, 'vpn') 맨 뒤.
//   진행자가 IPv4 주소나 점 있는 도메인으로 연 경우 그 origin을 맨 앞에 둔다(그 주소로 실제 접속 중이므로).
//   컴퓨터 이름(DESKTOP-OWL)·.local·IPv6로 연 origin은 폰이 못 열 수 있어 가상 어댑터 뒤에 둔다. IPv6 링크 로컬은 뺀다.
//   WSL·Hyper-V·VirtualBox·VMware·Docker 같은 가상 어댑터는 같은 대역이라도 실제 어댑터 뒤, VPN 앞에 둔다.
//   169.254.x.x(APIPA, DHCP를 못 받은 어댑터)는 가상 어댑터 뒤에 둔다.
import os from 'node:os';
import type { JoinUrl } from '@/lib/contracts';
import { isHttps, requestHost, siteOrigin } from './http';

type Interfaces = ReturnType<typeof os.networkInterfaces>;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const VIRTUAL_IF_RE = /vethernet|virtualbox|vbox|vmware|vmnet|hyper-?v|wsl|docker|virbr|veth|zerotier|hamachi|tailscale|utun/i;

function octets(ip: string): number[] | null {
  const m = IPV4_RE.exec(ip);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n >= 0 && n <= 255) ? o : null;
}

/** 100.64.0.0/10 (CGNAT, Tailscale 등) */
export function isVpnIpv4(ip: string): boolean {
  const o = octets(ip);
  return !!o && o[0] === 100 && o[1] >= 64 && o[1] <= 127;
}

/** 순서 등급: 0 = 192.168, 1 = 10, 2 = 172.16~31, 3 = 그 밖, 4 = 100.64/10 */
export function ipv4Rank(ip: string): number {
  const o = octets(ip);
  if (!o) return 3;
  if (o[0] === 192 && o[1] === 168) return 0;
  if (o[0] === 10) return 1;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return 2;
  if (isVpnIpv4(ip)) return 4;
  return 3;
}

/** 169.254.0.0/16 (APIPA: DHCP를 못 받은 Windows 어댑터) */
export function isApipaIpv4(ip: string): boolean {
  const o = octets(ip);
  return !!o && o[0] === 169 && o[1] === 254;
}

function bare(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

/** localhost·127.x·::1·0.0.0.0·::ffff:127.x (이 PC에서만 열리는 주소). 끝의 점("localhost.")도 같은 주소로 본다 */
export function isLoopbackHost(hostname: string): boolean {
  const h = bare(hostname);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '::' || h === '0.0.0.0') return true;
  // IPv4-mapped IPv6: ::ffff:127.0.0.1 또는 URL이 바꿔 쓴 ::ffff:7f00:1
  const mapped = /^(?:0:0:0:0:0|:):ffff:(.+)$/.exec(h)?.[1];
  if (mapped !== undefined) {
    if (/^7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(mapped)) return true;
    const mo = octets(mapped);
    return !!mo && mo[0] === 127;
  }
  const o = octets(h);
  return !!o && o[0] === 127;
}

/** IPv6 링크 로컬 (fe80::/10): 폰 브라우저 주소창에서 쓸 수 없다 */
function isLinkLocalV6(hostname: string): boolean {
  return /^fe[89ab][0-9a-f]:/.test(bare(hostname));
}

/** 점 있는 도메인 이름 (IP·IPv6·컴퓨터 이름·.local 아님) */
function isDottedDomain(hostname: string): boolean {
  const h = bare(hostname);
  return h.includes('.') && !h.includes(':') && !octets(h) && !h.endsWith('.local');
}

/**
 * OWL_PUBLIC_URL 해석. origin = 쓸 주소(없으면 자동 감지), warning = 서버 로그에 남길 말.
 * 스킴 없는 값·http(s) 아닌 값·이 PC 전용 주소는 버리고, 경로·계정 정보는 떼어 내고 origin만 쓴다.
 */
export function parsePublicUrl(raw: string | null | undefined): { origin: string | null; warning: string | null } {
  const v = raw?.trim();
  if (!v) return { origin: null, warning: null };
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { origin: null, warning: `OWL_PUBLIC_URL="${v}"은(는) 주소가 아닙니다. http:// 또는 https://로 시작해야 합니다. 자동 감지를 씁니다.` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { origin: null, warning: `OWL_PUBLIC_URL="${v}"은(는) http:// 또는 https:// 주소가 아닙니다. 자동 감지를 씁니다.` };
  }
  if (isLoopbackHost(u.hostname)) {
    return { origin: null, warning: `OWL_PUBLIC_URL="${v}"은(는) 이 PC에서만 열리는 주소라 폰이 들어올 수 없습니다. 자동 감지를 씁니다.` };
  }
  const dropped = (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || u.username || u.password;
  return {
    origin: u.origin,
    warning: dropped ? `OWL_PUBLIC_URL="${v}"에서 경로·계정 정보는 쓰지 않고 ${u.origin}만 씁니다.` : null,
  };
}

/** Host 헤더 → 호스트 이름과 포트 ("[::1]:3000", "localhost:3000", "example.com") */
export function splitHost(host: string): { hostname: string; port: string | null } {
  const h = host.trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    const hostname = end > 0 ? h.slice(0, end + 1) : h;
    const rest = end > 0 ? h.slice(end + 1) : '';
    return { hostname, port: /^:\d{1,5}$/.test(rest) ? rest.slice(1) : null };
  }
  const i = h.lastIndexOf(':');
  if (i > 0 && h.indexOf(':') === i && /^\d{1,5}$/.test(h.slice(i + 1))) {
    return { hostname: h.slice(0, i), port: h.slice(i + 1) };
  }
  return { hostname: h, port: null };
}

function kindOfHostname(hostname: string): JoinUrl['kind'] {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (octets(h)) return isVpnIpv4(h) ? 'vpn' : ipv4Rank(h) === 3 ? 'public' : 'lan';
  if (h.includes(':')) return 'lan'; // IPv6 (링크 로컬 등)
  if (h.endsWith('.local') || !h.includes('.')) return 'lan'; // mDNS·컴퓨터 이름
  return 'public';
}

export interface JoinUrlInput {
  /** 요청의 Host 헤더 (프록시를 믿을 때는 X-Forwarded-Host) */
  host: string | null;
  https: boolean;
  /** OWL_PUBLIC_URL */
  publicUrl?: string | null;
  interfaces: Interfaces;
}

/** 순수 함수: 입력만으로 후보 목록을 만든다 (단위 테스트용) */
export function listJoinUrls(input: JoinUrlInput): JoinUrl[] {
  const pub = parsePublicUrl(input.publicUrl).origin;
  if (pub) return [{ url: pub, kind: 'public' }];

  const { hostname, port } = input.host ? splitHost(input.host) : { hostname: '', port: null };
  const portPart = port ? `:${port}` : '';
  const originUsable = !!hostname && !isLoopbackHost(hostname) && !isLinkLocalV6(hostname);
  const origin = `${input.https ? 'https' : 'http'}://${hostname}${portPart}`;

  // https, 또는 포트 없는 도메인(프록시·배포 뒤): 어댑터 주소는 http·그 포트로 열리지 않는다 → 그 origin 하나만
  if (originUsable && (input.https || (isDottedDomain(hostname) && !port))) {
    return [{ url: origin, kind: kindOfHostname(hostname) }];
  }

  // group: 0 = 진행자가 연 origin(IPv4·도메인), 1 = 실제 어댑터, 2 = 가상 어댑터,
  //        3 = 폰이 못 열 수도 있는 origin(컴퓨터 이름·.local·IPv6)과 APIPA, 4 = VPN
  const cands: { url: string; kind: JoinUrl['kind']; group: number; rank: number; seq: number }[] = [];
  let seq = 0;

  if (originUsable) {
    const kind = kindOfHostname(hostname);
    const o = octets(hostname);
    const promoted = !!o || isDottedDomain(hostname);
    cands.push({
      url: origin,
      kind,
      group: kind === 'vpn' ? 4 : promoted ? 0 : 3,
      rank: o ? ipv4Rank(hostname) : -1,
      seq: seq++,
    });
  }

  for (const [name, addrs] of Object.entries(input.interfaces)) {
    for (const a of addrs ?? []) {
      // Node 18.0~18.3은 family가 숫자(4)였다
      const fam = (a.family as unknown) === 4 ? 'IPv4' : a.family;
      if (fam !== 'IPv4' || a.internal || !octets(a.address) || isLoopbackHost(a.address)) continue;
      const vpn = isVpnIpv4(a.address);
      cands.push({
        url: `http://${a.address}${portPart}`,
        kind: vpn ? 'vpn' : 'lan',
        group: vpn ? 4 : isApipaIpv4(a.address) ? 3 : VIRTUAL_IF_RE.test(name) ? 2 : 1,
        rank: ipv4Rank(a.address),
        seq: seq++,
      });
    }
  }

  cands.sort((x, y) => x.group - y.group || x.rank - y.rank || x.seq - y.seq);
  const seen = new Set<string>();
  const out: JoinUrl[] = [];
  for (const c of cands) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({ url: c.url, kind: c.kind });
  }
  return out;
}

/** 같은 OWL_PUBLIC_URL 경고는 서버 로그에 한 번만 */
const warnedPublicUrls = new Set<string>();

/** 라우트용: 요청과 이 PC의 네트워크 어댑터로 후보를 만든다 */
export function joinUrlsFor(req: Request): JoinUrl[] {
  let interfaces: Interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch {
    interfaces = {};
  }
  const publicUrl = process.env.OWL_PUBLIC_URL ?? null;
  if (publicUrl && !warnedPublicUrls.has(publicUrl)) {
    warnedPublicUrls.add(publicUrl);
    const { warning } = parsePublicUrl(publicUrl);
    if (warning) console.warn(`[owl] ${warning}`);
  }
  return listJoinUrls({
    host: requestHost(req),
    https: isHttps(req),
    publicUrl,
    interfaces,
  });
}

/** 다른 기기에서 열 링크(초대 링크 등)에 쓸 origin: 참가 주소 후보의 첫 번째, 없으면 요청 주소('local'). */
export function pickPreferredOrigin(urls: JoinUrl[], fallback: string): { origin: string; kind: JoinUrl['kind'] | 'local' } {
  const first = urls[0];
  return first ? { origin: first.url, kind: first.kind } : { origin: fallback, kind: 'local' };
}

export function preferredOrigin(req: Request): { origin: string; kind: JoinUrl['kind'] | 'local' } {
  return pickPreferredOrigin(joinUrlsFor(req), siteOrigin(req));
}
