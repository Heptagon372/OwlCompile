import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ui/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { DEFAULT_THEME, THEME_COOKIE, THEME_META_COLOR, colorSchemeOf, parseTheme, type Theme } from '@/lib/client/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'OWL COMPILE',
  description: 'S.OWL 오리엔테이션 팀 코딩 게임. 블록 카드를 연결해 부엉이를 둥지로 보낸다.',
};

/** 나이트·라이트 모드 (docs/THEME_V5.md §1): 쿠키 owl_theme 를 서버에서 읽어 <html data-theme> 로 그린다 → 새로고침해도 깜빡임 없음 */
async function serverTheme(): Promise<Theme> {
  const jar = await cookies();
  return parseTheme(jar.get(THEME_COOKIE)?.value) ?? DEFAULT_THEME;
}

export async function generateViewport(): Promise<Viewport> {
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    // = 각 모드의 --color-bg (메타데이터는 CSS 변수를 못 읽어 값을 적는다)
    themeColor: THEME_META_COLOR[await serverTheme()],
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await serverTheme();
  return (
    <html lang="ko" data-theme={theme} style={{ colorScheme: colorSchemeOf(theme) }} suppressHydrationWarning>
      <head>
        {/* 한글: Pretendard. 라틴·큰 숫자: Manrope(font-display). 코드·타이머·게임 코드: JetBrains Mono (DESIGN_V4 §2·§5) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap"
        />
      </head>
      <body>
        {/* 바탕 무대 (DESIGN_V4 §2 / THEME_V5 §3): 조명 + 옅은 원근 격자 + 흐린 입체 블록. CSS 만, 스크롤해도 고정. 색은 모드 토큰 */}
        <div className="owl-stage" aria-hidden="true" />
        <ThemeProvider initialTheme={theme}>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
