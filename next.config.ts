import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // SSE 스트림이 압축 버퍼에 막히지 않도록 끈다 (docs/WEBSITE_SPEC.md §7)
  compress: false,
  serverExternalPackages: ['better-sqlite3'],
  poweredByHeader: false,
  // 다른 사이트가 /admin·진행자 콘솔을 iframe에 넣어 버튼을 누르게 하는 것(클릭재킹)을 막는다
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
