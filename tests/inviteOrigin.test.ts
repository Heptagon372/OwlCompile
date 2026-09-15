// 초대 링크 주소 고르기 (lib/server/net.ts pickPreferredOrigin)
// 관리자가 localhost로 접속해도 초대 링크는 다른 기기에서 열리는 주소를 써야 한다.
import { describe, expect, it } from 'vitest';
import { pickPreferredOrigin } from '@/lib/server/net';

describe('pickPreferredOrigin', () => {
  it('참가 주소 후보의 첫 번째(와이파이 주소)를 쓴다', () => {
    expect(pickPreferredOrigin([
      { url: 'http://192.168.0.8:3000', kind: 'lan' },
      { url: 'http://100.87.244.107:3000', kind: 'vpn' },
    ], 'http://localhost:3000')).toEqual({ origin: 'http://192.168.0.8:3000', kind: 'lan' });
  });

  it('공개 주소가 있으면 그것을 쓴다', () => {
    expect(pickPreferredOrigin([{ url: 'https://owl.example.com', kind: 'public' }], 'http://localhost:3000'))
      .toEqual({ origin: 'https://owl.example.com', kind: 'public' });
  });

  it('VPN 주소뿐이면 VPN으로 알린다', () => {
    expect(pickPreferredOrigin([{ url: 'http://100.87.244.107:3000', kind: 'vpn' }], 'http://localhost:3000'))
      .toEqual({ origin: 'http://100.87.244.107:3000', kind: 'vpn' });
  });

  it('후보가 없으면 요청 주소를 이 PC 전용(local)으로 쓴다', () => {
    expect(pickPreferredOrigin([], 'http://localhost:3000')).toEqual({ origin: 'http://localhost:3000', kind: 'local' });
  });
});
