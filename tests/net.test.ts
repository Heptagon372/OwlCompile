// 폰 참가 주소 후보 (lib/server/net.ts): 순서, localhost 처리, OWL_PUBLIC_URL, VPN 표시.
import { describe, expect, it } from 'vitest';
import type os from 'node:os';
import {
  ipv4Rank, isApipaIpv4, isLoopbackHost, isVpnIpv4, listJoinUrls, parsePublicUrl, splitHost,
} from '@/lib/server/net';

type Ifaces = ReturnType<typeof os.networkInterfaces>;

const v4 = (address: string, internal = false): os.NetworkInterfaceInfo => ({
  address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal, cidr: `${address}/24`,
});
const v6 = (address: string): os.NetworkInterfaceInfo => ({
  address, netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:00:00:00:00:00', internal: false,
  cidr: `${address}/64`, scopeid: 0,
});

/** Windows 노트북 흔한 모양 (삽입 순서를 일부러 섞는다) */
const MIXED: Ifaces = {
  Tailscale: [v4('100.101.2.3')],
  'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true), { ...v6('::1'), internal: true }],
  corp: [v4('172.20.1.5')],
  other: [v4('203.0.113.9')],
  eth10: [v4('10.0.0.7')],
  'Wi-Fi': [v6('fe80::1c2d'), v4('192.168.0.12')],
};

const urls = (list: { url: string }[]) => list.map((u) => u.url);

describe('listJoinUrls 순서', () => {
  it('192.168 → 10 → 172.16~31 → 그 밖 → 100.64/10(VPN) 맨 뒤', () => {
    const out = listJoinUrls({ host: 'localhost:3000', https: false, interfaces: MIXED });
    expect(urls(out)).toEqual([
      'http://192.168.0.12:3000',
      'http://10.0.0.7:3000',
      'http://172.20.1.5:3000',
      'http://203.0.113.9:3000',
      'http://100.101.2.3:3000',
    ]);
    expect(out.map((u) => u.kind)).toEqual(['lan', 'lan', 'lan', 'lan', 'vpn']);
  });

  it('대역 경계: 172.15·172.32는 그 밖, 100.63·100.128은 VPN이 아니다', () => {
    expect(ipv4Rank('172.16.0.1')).toBe(2);
    expect(ipv4Rank('172.31.255.1')).toBe(2);
    expect(ipv4Rank('172.15.0.1')).toBe(3);
    expect(ipv4Rank('172.32.0.1')).toBe(3);
    expect(isVpnIpv4('100.64.0.1')).toBe(true);
    expect(isVpnIpv4('100.127.255.254')).toBe(true);
    expect(isVpnIpv4('100.63.0.1')).toBe(false);
    expect(isVpnIpv4('100.128.0.1')).toBe(false);
    const out = listJoinUrls({
      host: 'localhost:3000', https: false,
      interfaces: { a: [v4('100.63.0.1')], b: [v4('100.64.0.9')], c: [v4('172.32.0.1')], d: [v4('172.16.0.1')] },
    });
    expect(urls(out)).toEqual(['http://172.16.0.1:3000', 'http://100.63.0.1:3000', 'http://172.32.0.1:3000', 'http://100.64.0.9:3000']);
    expect(out.at(-1)?.kind).toBe('vpn');
  });

  it('가상 어댑터(WSL·Hyper-V·VirtualBox)는 같은 대역이라도 실제 어댑터 뒤, VPN 앞', () => {
    const out = listJoinUrls({
      host: 'localhost:3000', https: false,
      interfaces: {
        'VirtualBox Host-Only Network': [v4('192.168.56.1')],
        'vEthernet (WSL (Hyper-V firewall))': [v4('172.24.0.1')],
        Tailscale: [v4('100.90.1.1')],
        'Wi-Fi': [v4('10.1.2.3')],
      },
    });
    expect(urls(out)).toEqual([
      'http://10.1.2.3:3000', 'http://192.168.56.1:3000', 'http://172.24.0.1:3000', 'http://100.90.1.1:3000',
    ]);
  });

  it('내부용(internal)·IPv6 어댑터 주소는 뺀다', () => {
    const out = listJoinUrls({ host: 'localhost:3000', https: false, interfaces: MIXED });
    expect(out.some((u) => u.url.includes('127.0.0.1') || u.url.includes('['))).toBe(false);
  });
});

describe('listJoinUrls localhost 처리', () => {
  it('localhost·127.0.0.1·::1로 열었으면 요청 origin은 후보에 넣지 않는다', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000']) {
      const out = listJoinUrls({ host, https: false, interfaces: { 'Wi-Fi': [v4('192.168.0.12')] } });
      expect(urls(out)).toEqual(['http://192.168.0.12:3000']);
    }
    expect(listJoinUrls({ host: 'localhost:3000', https: false, interfaces: {} })).toEqual([]);
  });

  it('포트는 요청 Host 헤더에서, 없으면 붙이지 않는다', () => {
    expect(urls(listJoinUrls({ host: 'localhost:4123', https: false, interfaces: { w: [v4('192.168.1.2')] } })))
      .toEqual(['http://192.168.1.2:4123']);
    expect(urls(listJoinUrls({ host: 'localhost', https: false, interfaces: { w: [v4('192.168.1.2')] } })))
      .toEqual(['http://192.168.1.2']);
  });

  it('LAN 주소로 열었으면 그 origin이 맨 앞, 어댑터 주소와 겹치면 한 번만', () => {
    const same = listJoinUrls({ host: '192.168.0.12:3000', https: false, interfaces: MIXED });
    expect(urls(same).filter((u) => u === 'http://192.168.0.12:3000')).toHaveLength(1);
    expect(same[0]).toEqual({ url: 'http://192.168.0.12:3000', kind: 'lan' });
    const other = listJoinUrls({ host: '10.0.0.7:3000', https: false, interfaces: { 'Wi-Fi': [v4('192.168.0.12')], eth: [v4('10.0.0.7')] } });
    expect(urls(other)).toEqual(['http://10.0.0.7:3000', 'http://192.168.0.12:3000']);
  });

  it('도메인으로 열었으면 public, VPN 주소로 열었으면 vpn으로 맨 뒤', () => {
    const dom = listJoinUrls({ host: 'owl.example.com', https: true, interfaces: { w: [v4('192.168.0.12')] } });
    expect(dom).toEqual([{ url: 'https://owl.example.com', kind: 'public' }]);
    const vpn = listJoinUrls({ host: '100.101.2.3:3000', https: false, interfaces: { w: [v4('192.168.0.12')] } });
    expect(vpn).toEqual([
      { url: 'http://192.168.0.12:3000', kind: 'lan' },
      { url: 'http://100.101.2.3:3000', kind: 'vpn' },
    ]);
  });
});

describe('OWL_PUBLIC_URL', () => {
  it('있으면 그 origin 하나만', () => {
    const out = listJoinUrls({ host: 'localhost:3000', https: false, publicUrl: 'https://owl.example.com/some/path/', interfaces: MIXED });
    expect(out).toEqual([{ url: 'https://owl.example.com', kind: 'public' }]);
  });
  it('종류는 주소로 정한다: 사설 IP는 lan, VPN은 vpn, 도메인·공인 IP는 public', () => {
    const kindOf = (publicUrl: string) => listJoinUrls({ host: 'localhost:3000', https: false, publicUrl, interfaces: MIXED })[0].kind;
    expect(kindOf('http://192.168.0.23:3000')).toBe('lan');
    expect(kindOf('http://100.87.1.2:3000')).toBe('vpn');
    expect(kindOf('http://3.39.12.34')).toBe('public');
    expect(kindOf('https://owl.example.com')).toBe('public');
  });
  it('잘못된 값이면 자동 감지로 돌아간다', () => {
    const out = listJoinUrls({ host: 'localhost:3000', https: false, publicUrl: 'not a url', interfaces: MIXED });
    expect(out[0].url).toBe('http://192.168.0.12:3000');
    expect(listJoinUrls({ host: 'localhost:3000', https: false, publicUrl: 'ftp://x.test', interfaces: {} })).toEqual([]);
  });
});

describe('후속 리뷰: OWL_PUBLIC_URL 검사', () => {
  const WIFI: Ifaces = { 'Wi-Fi': [v4('192.168.0.12')] };

  it('이 PC 전용 주소(localhost·127.x·::1)는 받지 않고 자동 감지로 돌아간다', () => {
    for (const p of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'http://localhost.:3000', 'http://[::ffff:127.0.0.1]:3000']) {
      expect(listJoinUrls({ host: 'localhost:3000', https: false, publicUrl: p, interfaces: WIFI }), p)
        .toEqual([{ url: 'http://192.168.0.12:3000', kind: 'lan' }]);
      const r = parsePublicUrl(p);
      expect(r.origin, p).toBeNull();
      expect(r.warning, p).toContain('이 PC');
    }
  });

  it('스킴 없는 값·http(s) 아닌 값은 버리고 경고, 경로·계정 정보는 떼어 내고 경고', () => {
    expect(parsePublicUrl('owl.example')).toMatchObject({ origin: null });
    expect(parsePublicUrl('owl.example').warning).toContain('http://');
    expect(parsePublicUrl('192.168.0.23:3000').origin).toBeNull();
    expect(parsePublicUrl('ftp://x.test').origin).toBeNull();
    const path = parsePublicUrl('https://owl.example.com/sub/path');
    expect(path.origin).toBe('https://owl.example.com');
    expect(path.warning).toContain('https://owl.example.com');
    expect(parsePublicUrl('http://user:pw@owl.example.com').origin).toBe('http://owl.example.com');
    expect(parsePublicUrl('http://user:pw@owl.example.com').warning).not.toBeNull();
  });

  it('올바른 값이면 경고 없이 그 origin, 비어 있으면 아무것도 없다', () => {
    expect(parsePublicUrl('http://192.168.0.23:3000')).toEqual({ origin: 'http://192.168.0.23:3000', warning: null });
    expect(parsePublicUrl('https://owl.example.com/')).toEqual({ origin: 'https://owl.example.com', warning: null });
    expect(parsePublicUrl('  ')).toEqual({ origin: null, warning: null });
    expect(parsePublicUrl(undefined)).toEqual({ origin: null, warning: null });
  });
});

describe('후속 리뷰: 폰이 못 여는 origin·배포 주소·APIPA', () => {
  it('https나 포트 없는 도메인으로 열었으면 그 origin 하나만 (어댑터 IP를 http로 붙이지 않는다)', () => {
    const ifs: Ifaces = { 'Wi-Fi': [v4('192.168.0.8')], Tailscale: [v4('100.87.244.107')] };
    expect(listJoinUrls({ host: 'owl.example.com', https: false, interfaces: ifs }))
      .toEqual([{ url: 'http://owl.example.com', kind: 'public' }]);
    expect(listJoinUrls({ host: '192.168.0.8:3443', https: true, interfaces: ifs }))
      .toEqual([{ url: 'https://192.168.0.8:3443', kind: 'lan' }]);
    // 포트가 있는 http 도메인(LAN DNS 등)은 예전처럼 맨 앞 + 어댑터 주소
    expect(urls(listJoinUrls({ host: 'owl.lan:3000', https: false, interfaces: ifs })))
      .toEqual(['http://owl.lan:3000', 'http://192.168.0.8:3000', 'http://100.87.244.107:3000']);
  });

  it('컴퓨터 이름·.local로 열었으면 실제·가상 어댑터 뒤 (VPN 앞)', () => {
    const ifs: Ifaces = {
      Tailscale: [v4('100.87.244.107')], 'vEthernet (WSL)': [v4('172.24.0.1')], 'Wi-Fi': [v4('192.168.0.8')],
    };
    for (const host of ['DESKTOP-OWL:3302', 'owl-pc.local:3302']) {
      const name = host.split(':')[0];
      expect(urls(listJoinUrls({ host, https: false, interfaces: ifs })), host).toEqual([
        'http://192.168.0.8:3302', 'http://172.24.0.1:3302', `http://${name}:3302`, 'http://100.87.244.107:3302',
      ]);
    }
  });

  it('IPv6 링크 로컬·::ffff:127.x·"localhost."로 열었으면 origin은 넣지 않는다', () => {
    const ifs: Ifaces = { 'Wi-Fi': [v4('192.168.0.8')] };
    for (const host of ['[fe80::1c2d]:3302', '[::ffff:127.0.0.1]:3302', '[::ffff:7f00:1]:3302', 'localhost.:3302']) {
      expect(urls(listJoinUrls({ host, https: false, interfaces: ifs })), host).toEqual(['http://192.168.0.8:3302']);
    }
  });

  it('169.254.x.x(APIPA)는 가상 어댑터 뒤, VPN 앞', () => {
    const out = listJoinUrls({
      host: 'localhost:3000', https: false,
      interfaces: {
        'Ethernet 2': [v4('169.254.12.3')], 'vEthernet (WSL)': [v4('172.24.0.1')],
        Tailscale: [v4('100.87.1.1')], 'Wi-Fi': [v4('192.168.0.8')],
      },
    });
    expect(urls(out)).toEqual([
      'http://192.168.0.8:3000', 'http://172.24.0.1:3000', 'http://169.254.12.3:3000', 'http://100.87.1.1:3000',
    ]);
    expect(isApipaIpv4('169.254.0.1')).toBe(true);
    expect(isApipaIpv4('169.253.0.1')).toBe(false);
  });

  it('isLoopbackHost: IPv4-mapped 루프백과 끝의 점', () => {
    for (const h of ['localhost.', '[::ffff:127.0.0.1]', '::ffff:7f00:1', '0:0:0:0:0:ffff:127.0.0.1', '127.0.0.1.']) {
      expect(isLoopbackHost(h), h).toBe(true);
    }
    for (const h of ['[::ffff:192.168.0.2]', '::ffff:c0a8:2', 'example.com.']) expect(isLoopbackHost(h), h).toBe(false);
  });
});

describe('Host 헤더 도우미', () => {
  it('splitHost', () => {
    expect(splitHost('localhost:3000')).toEqual({ hostname: 'localhost', port: '3000' });
    expect(splitHost('[::1]:3000')).toEqual({ hostname: '[::1]', port: '3000' });
    expect(splitHost('example.com')).toEqual({ hostname: 'example.com', port: null });
    expect(splitHost('[fe80::1]')).toEqual({ hostname: '[fe80::1]', port: null });
  });
  it('isLoopbackHost', () => {
    for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]', 'app.localhost', '0.0.0.0']) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ['192.168.0.2', 'example.com', '10.0.0.1', '[fe80::1]']) expect(isLoopbackHost(h)).toBe(false);
  });
});
