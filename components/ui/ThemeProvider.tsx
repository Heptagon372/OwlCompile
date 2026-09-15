'use client';
// 모드 프로바이더 (docs/THEME_V5.md §1): 루트 레이아웃이 서버에서 읽은 쿠키 값(initialTheme)을 받아
//  - useTheme() 의 서버·하이드레이션 스냅숏으로 쓰고 (토글의 aria-checked 가 서버 HTML 과 같다)
//  - 마운트 때 쿠키·localStorage·<html> 을 맞추고(initTheme), 다른 탭의 변경을 즉시 따른다(startThemeSync).
// 토글이 없는 화면(프로젝터 /board)도 루트 레이아웃 아래라 같은 브라우저의 저장값을 따라간다.
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { DEFAULT_THEME, getTheme, initTheme, startThemeSync, subscribeTheme, type Theme } from '@/lib/client/theme';

const InitialTheme = createContext<Theme>(DEFAULT_THEME);

export function ThemeProvider({ initialTheme = DEFAULT_THEME, children }: { initialTheme?: Theme; children: ReactNode }) {
  useEffect(() => {
    initTheme();
    return startThemeSync();
  }, []);
  return <InitialTheme.Provider value={initialTheme}>{children}</InitialTheme.Provider>;
}

/** 지금 모드 ('night' | 'light'). 바뀌면(이 탭·다른 탭) 다시 그린다. 서버·하이드레이션에서는 쿠키 값 */
export function useTheme(): Theme {
  const initial = useContext(InitialTheme);
  return useSyncExternalStore(subscribeTheme, getTheme, () => initial);
}
