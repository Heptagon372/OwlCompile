// 나이트·라이트 모드 (docs/THEME_V5.md §1·§2·§4). 서버·클라이언트 어디서나 가져올 수 있다 ('use client' 아님):
// 순수 함수(parseTheme·themeFromCookieHeader·colorSchemeOf …)는 서버 루트 레이아웃도 쓰고, DOM 을 만지는 함수는 브라우저에서만 동작한다
// (document·window 가 없으면 조용히 아무것도 하지 않는다).
//
//  저장: 쿠키 owl_theme=night|light (Path=/, 1년, SameSite=Lax, httpOnly 아님) + 같은 값을 localStorage 에도.
//  적용: <html data-theme="night|light" style="color-scheme:dark|light"> + <meta name="theme-color">.
//  방송: 같은 탭은 subscribeTheme 구독자에게, 다른 탭은 localStorage 의 storage 이벤트로 (startThemeSync 가 받아 적용).
//  전환: document.startViewTransition 으로 새 화면을 옆으로 쓸어 드러낸다 (라이트→나이트 = 왼쪽→오른쪽, 반대 = 오른쪽→왼쪽,
//        0.6s cubic-bezier(.65,0,.35,1)). 지원하지 않으면 0.3s 색 교차 전환, prefers-reduced-motion 이면 즉시.
//        전환 중에는 <html data-theme-anim="to-night|to-light"> 가 붙는다 (토글의 해·달 연출과 화면 쓸기 방향이 이것을 본다).
//        화면 쓸기에서는 전환이 끝날 때(vt.finished) 뗀다 — 새 화면을 그리는 데 오래 걸려도 쓸기가 중간에 잘리지 않는다.
//        쓸기 중에는 ::view-transition 층이 포인터를 가로채므로, 토글 자리를 다시 누르면 여기서 받아 반대로 바꾼다.

export type Theme = 'night' | 'light';
export type ThemeAnim = 'to-night' | 'to-light';
export type SwitchMode = 'view-transition' | 'crossfade' | 'instant';

export const THEMES: readonly Theme[] = ['night', 'light'];
export const DEFAULT_THEME: Theme = 'night';
export const THEME_COOKIE = 'owl_theme';
export const THEME_STORAGE_KEY = 'owl_theme';
/** 쿠키 수명 1년 (초) */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** 옆으로 쓸기·토글 연출 시간 (ms) — CSS 의 0.6s 와 짝 */
export const THEME_SWITCH_MS = 600;
/** View Transitions 미지원 브라우저의 색 교차 전환 시간 (ms) — CSS .owl-theme-fade 와 짝 */
export const THEME_FADE_MS = 300;
/** 토글 연출 곡선 (CSS 와 같은 값) */
export const THEME_EASE = 'cubic-bezier(.65,0,.35,1)';
/** 모바일 브라우저 막대 색 (= 각 모드의 --color-bg) */
export const THEME_META_COLOR: Record<Theme, string> = { night: '#07060D', light: '#F3F0FB' };
/** 토글이 전환 동안 받는 view-transition-name (한 번에 한 요소만) */
export const THEME_TOGGLE_VT_NAME = 'owl-theme-toggle';

/* ---------------------------------------------------------------- 순수 함수 */

export function parseTheme(v: unknown): Theme | null {
  return v === 'night' || v === 'light' ? v : null;
}

export function otherTheme(t: Theme): Theme {
  return t === 'night' ? 'light' : 'night';
}

/** CSS color-scheme 값 (폼 컨트롤·스크롤바) */
export function colorSchemeOf(t: Theme): 'dark' | 'light' {
  return t === 'light' ? 'light' : 'dark';
}

/** from → to 전환 방향 (같으면 null) */
export function animOf(from: Theme, to: Theme): ThemeAnim | null {
  if (from === to) return null;
  return to === 'night' ? 'to-night' : 'to-light';
}

/** "a=1; owl_theme=light; b=2" 같은 Cookie 헤더(또는 document.cookie)에서 모드를 읽는다 */
export function themeFromCookieHeader(header: string | null | undefined): Theme | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== THEME_COOKIE) continue;
    let v = part.slice(i + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* 그대로 */
    }
    return parseTheme(v);
  }
  return null;
}

/** document.cookie 에 쓸 문자열 (Path=/, 1년, SameSite=Lax, httpOnly 아님) */
export function themeCookieString(t: Theme): string {
  return `${THEME_COOKIE}=${t}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** 서버 루트 레이아웃이 <html> 에 펼칠 속성 */
export function htmlThemeAttrs(t: Theme): { 'data-theme': Theme; style: { colorScheme: 'dark' | 'light' } } {
  return { 'data-theme': t, style: { colorScheme: colorSchemeOf(t) } };
}

/* ---------------------------------------------------------------- 브라우저 */

function doc(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function win(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function storage(): Storage | null {
  try {
    const w = win();
    return w && w.localStorage ? w.localStorage : null;
  } catch {
    return null; // 사이트 데이터 차단 등
  }
}

/** 지금 화면의 모드 (<html data-theme>, 없으면 기본 night) */
export function getTheme(): Theme {
  const d = doc();
  return parseTheme(d?.documentElement?.getAttribute('data-theme')) ?? DEFAULT_THEME;
}

export function readStoredTheme(): Theme | null {
  try {
    return parseTheme(storage()?.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readCookieTheme(): Theme | null {
  try {
    return themeFromCookieHeader(doc()?.cookie);
  } catch {
    return null;
  }
}

function writeCookie(t: Theme) {
  const d = doc();
  if (!d) return;
  try {
    d.cookie = themeCookieString(t);
  } catch {
    /* 무시 */
  }
}

function writeStorage(t: Theme) {
  try {
    storage()?.setItem(THEME_STORAGE_KEY, t);
  } catch {
    /* 무시 (용량·차단) */
  }
}

/** 쿠키 + localStorage 에 저장 (localStorage 변경은 다른 탭에 storage 이벤트로 퍼진다) */
export function persistTheme(t: Theme): void {
  writeCookie(t);
  writeStorage(t);
}

/* 같은 탭 구독자 */
const listeners = new Set<(t: Theme) => void>();

function notify(t: Theme) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(t);
    } catch {
      /* 구독자 오류는 다른 구독자를 막지 않는다 */
    }
  }
}

let animTimer: ReturnType<typeof setTimeout> | null = null;

function clearAnimTimer() {
  if (animTimer) clearTimeout(animTimer);
  animTimer = null;
}

/** data-theme-anim 을 연출 시간(THEME_SWITCH_MS) 뒤에 뗀다 — 색 교차 전환·다른 탭·거절된 화면 쓸기 */
function scheduleAnimClear(root: HTMLElement) {
  clearAnimTimer();
  animTimer = setTimeout(() => {
    animTimer = null;
    root.removeAttribute('data-theme-anim');
  }, THEME_SWITCH_MS + 80);
}

/**
 * DOM 에만 적용: data-theme · color-scheme · theme-color 메타 (+ anim 을 주면 data-theme-anim 을 THEME_SWITCH_MS 동안,
 * hold 면 시간으로 떼지 않는다 — 화면 쓸기가 끝날 때 setTheme 이 뗀다).
 * 모드가 바뀌면 같은 탭 구독자에게 알린다. 저장은 하지 않는다 (persistTheme).
 */
export function applyTheme(t: Theme, opts: { anim?: ThemeAnim | null; hold?: boolean } = {}): void {
  const d = doc();
  if (!d?.documentElement) return;
  const root = d.documentElement;
  const prev = getTheme();
  root.setAttribute('data-theme', t);
  root.style.colorScheme = colorSchemeOf(t);
  const meta = d.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_META_COLOR[t]);
  if (opts.anim) {
    root.setAttribute('data-theme-anim', opts.anim);
    if (opts.hold) clearAnimTimer();
    else scheduleAnimClear(root);
  }
  if (prev !== t) notify(t);
}

export function prefersReducedMotion(): boolean {
  try {
    return !!win()?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

type VTDocument = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<unknown>;
    ready?: Promise<unknown>;
    updateCallbackDone?: Promise<unknown>;
    skipTransition?: () => void;
  };
};

/** 약속이 거절돼도 "Uncaught (in promise)" 로 새지 않게 (거절은 예상된 일: 연달아 누름·숨은 탭) */
function swallow(p: Promise<unknown> | undefined | null): void {
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

/** 이 브라우저에서 쓸 전환 방식: 움직임 줄이기 → instant, View Transitions → view-transition, 그 밖 → crossfade */
export function pickSwitchMode(): SwitchMode {
  if (prefersReducedMotion()) return 'instant';
  const d = doc() as VTDocument | null;
  if (d && typeof d.startViewTransition === 'function') return 'view-transition';
  return 'crossfade';
}

let fadeTimer: ReturnType<typeof setTimeout> | null = null;
/* 진행 중인 화면 쓸기 (마지막 것만 토글의 view-transition-name 을 뗀다) */
let vtSeq = 0;
let vtSource: HTMLElement | null = null;
/* 화면 쓸기가 적용하기로 한 모드: DOM(<html data-theme>)은 전환의 update 콜백(다음 그림)에서야 바뀌므로
   그 사이에 다시 누르면 이것을 기준으로 반대 모드를 고른다 (빠른 두 번 누름이 한 번으로 줄지 않게) */
let pending: Theme | null = null;

/**
 * 모드를 바꾼다: 저장(쿠키 + localStorage) → 전환 연출과 함께 적용 → 구독자 알림.
 *  - source: 누른 토글. 전환 동안 view-transition-name 을 받아 화면 쓸기 위에서 해·달 연출이 계속 보인다.
 *  - mode: 강제 (테스트·다른 탭). 기본은 pickSwitchMode().
 * 끝난 방식을 돌려준다.
 */
export async function setTheme(next: Theme, opts: { source?: HTMLElement | null; mode?: SwitchMode } = {}): Promise<SwitchMode> {
  const t = parseTheme(next) ?? DEFAULT_THEME;
  const from = pending ?? getTheme();
  persistTheme(t);
  const d = doc() as VTDocument | null;
  if (!d?.documentElement) return 'instant';
  const anim = animOf(from, t);
  if (!anim) {
    // 진행 중인 화면 쓸기가 이미 이 모드로 가는 중이면 그대로 둔다 (옛 화면을 찍기 전에 DOM 을 바꾸지 않게)
    if (pending !== t) applyTheme(t);
    return 'instant';
  }
  let mode = opts.mode ?? pickSwitchMode();
  if (mode === 'view-transition' && typeof d.startViewTransition !== 'function') mode = 'crossfade';
  // 보이지 않는 탭: 브라우저가 화면 쓸기를 InvalidStateError 로 건너뛴다 → 처음부터 즉시 적용 (보는 사람도 없다).
  // 진행 중인 쓸기가 있으면 그 update 콜백이 뒤에 옛 목표를 칠하지 않도록 쓸기 길을 그대로 탄다 (거절은 삼킨다)
  if (mode === 'view-transition' && pending === null && d.visibilityState === 'hidden') mode = 'instant';

  if (mode === 'view-transition') {
    const root = d.documentElement;
    const src = opts.source ?? null;
    // 전환 도중 다시 누르면: 앞 전환은 건너뛰어지고 새 전환이 이름을 이어받는다 (이름이 겹치면 전환이 거절되니 앞 요소 이름은 뗀다)
    const seq = ++vtSeq;
    pending = t;
    if (vtSource && vtSource !== src) vtSource.style.removeProperty('view-transition-name');
    vtSource = src;
    if (src) src.style.setProperty('view-transition-name', THEME_TOGGLE_VT_NAME);
    // 쓸기 동안 ::view-transition 층이 포인터를 가로채 누름이 <html> 로 간다 → 토글 자리면 반대로 (키보드처럼 마우스·터치도).
    // 버튼이 직접 받은 누름(가로채지 않는 브라우저)은 click 이 처리하므로 건드리지 않는다.
    const onPointerDown = (e: Event) => {
      const pe = e as PointerEvent;
      if (seq !== vtSeq || !src || pe.isPrimary === false || pe.target !== root) return;
      const r = src.getBoundingClientRect?.();
      if (!r || pe.clientX < r.left || pe.clientX > r.right || pe.clientY < r.top || pe.clientY > r.bottom) return;
      pe.preventDefault?.();
      void toggleTheme({ source: src });
    };
    const listen = typeof d.addEventListener === 'function';
    if (listen) d.addEventListener('pointerdown', onPointerDown, true);
    let failed = false;
    try {
      // 방향 신호는 시간으로 떼지 않는다: 쓸기는 update 콜백 다음 그림(ready)부터 0.6s 라 무거운 화면에서는 늦게 끝난다
      const vt = d.startViewTransition!(() => applyTheme(t, { anim, hold: true }));
      // 연달아 누르면 앞 전환의 ready 가 AbortError, 숨은 탭이면 InvalidStateError 로 거절된다 — 예상된 거절이라 삼킨다.
      // (update 콜백은 그래도 불리고 finished 는 풀린다. updateCallbackDone 이 거절되면 finished 도 거절돼 아래 catch 로 온다)
      swallow(vt.ready);
      swallow(vt.updateCallbackDone);
      await vt.finished;
    } catch {
      failed = true;
      // 전환이 거절돼도(이름 겹침 등) 새 모드는 적용돼 있어야 한다 (해·달 연출은 시간으로 뗀다)
      if (seq === vtSeq) {
        if (getTheme() !== t) applyTheme(t, { anim });
        else scheduleAnimClear(root);
      }
    } finally {
      if (listen) d.removeEventListener('pointerdown', onPointerDown, true);
      // 앞 전환의 뒷정리가 새 전환의 이름·방향 신호를 떼지 않게 (마지막 전환만 뗀다)
      if (seq === vtSeq) {
        pending = null;
        if (src) src.style.removeProperty('view-transition-name');
        vtSource = null;
        if (!failed) {
          clearAnimTimer();
          root.removeAttribute('data-theme-anim');
        }
      }
    }
    return 'view-transition';
  }

  if (mode === 'crossfade') {
    const root = d.documentElement;
    root.classList.add('owl-theme-fade');
    applyTheme(t, { anim });
    if (fadeTimer) clearTimeout(fadeTimer);
    await new Promise<void>((resolve) => {
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        root.classList.remove('owl-theme-fade');
        resolve();
      }, THEME_FADE_MS + 40);
    });
    return 'crossfade';
  }

  // 움직임 줄이기: 손잡이·아이콘만 즉시 바뀐다 (해·달 연출 신호 data-theme-anim 도 붙이지 않는다)
  applyTheme(t);
  return 'instant';
}

/** 반대 모드로 (화면 쓸기가 아직 DOM 에 닿지 않았으면 그 전환이 가려는 모드의 반대) */
export function toggleTheme(opts: { source?: HTMLElement | null; mode?: SwitchMode } = {}): Promise<SwitchMode> {
  return setTheme(otherTheme(pending ?? getTheme()), opts);
}

/* 다른 탭 동기화: storage 이벤트 (참조 계수: 구독자·프로바이더가 여럿이어도 리스너는 하나) */
let syncCount = 0;

function onStorage(e: StorageEvent) {
  if (e.key !== THEME_STORAGE_KEY) return;
  const t = parseTheme(e.newValue);
  if (!t || t === getTheme()) return;
  // 다른 탭에서 바꿨다: 즉시 반영 (토글의 해·달 연출은 data-theme-anim 으로)
  applyTheme(t, { anim: animOf(getTheme(), t) });
}

/* 뒤로 가기 캐시(bfcache)에서 되살아난 페이지: 얼어 있는 동안 storage 이벤트를 못 받았으니 저장값을 다시 읽는다 (연출 없이) */
function onPageShow(e: PageTransitionEvent) {
  if (!e.persisted) return;
  const t = readCookieTheme() ?? readStoredTheme();
  if (t && t !== getTheme()) applyTheme(t);
}

/**
 * 다른 탭의 변경을 이 탭에 즉시 반영하기 시작한다 (프로젝터 보드처럼 토글이 없는 화면도 따라간다).
 * 뒤로 가기로 되살아난 페이지도 저장값에 맞춘다(pageshow). 멈추는 함수를 돌려준다
 */
export function startThemeSync(): () => void {
  const w = win();
  if (!w) return () => {};
  if (syncCount === 0) {
    w.addEventListener('storage', onStorage);
    w.addEventListener('pageshow', onPageShow);
  }
  syncCount++;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    syncCount--;
    if (syncCount === 0) {
      w.removeEventListener('storage', onStorage);
      w.removeEventListener('pageshow', onPageShow);
    }
  };
}

/**
 * 모드가 바뀔 때마다 cb(모드) — 같은 탭의 setTheme·applyTheme, 다른 탭의 storage 이벤트 모두.
 * (useSyncExternalStore 의 subscribe 로 그대로 쓸 수 있다.) 해지 함수를 돌려준다.
 */
export function subscribeTheme(cb: (t: Theme) => void): () => void {
  listeners.add(cb);
  const stopSync = startThemeSync();
  return () => {
    listeners.delete(cb);
    stopSync();
  };
}

/**
 * 첫 마운트 때 한 번: 쿠키·localStorage·<html> 을 맞춘다.
 *  - 쿠키가 있으면 그것이 기준 (서버가 그 값으로 그렸다). localStorage 가 다르면 맞춘다.
 *  - 쿠키가 없고 localStorage 만 있으면 그 값을 적용하고 쿠키를 다시 쓴다.
 *  - 저장값이 있으면 쿠키 수명을 새로 늘린다 (Safari 는 스크립트가 쓴 쿠키를 7일로 줄인다 → 쿠키가 없어진 날 서버가
 *    나이트로 그려 라이트 사용자에게 깜빡임이 생긴다. 쓸 때마다 늘리면 매주 깜빡이지 않는다).
 *  - 둘 다 없으면 (첫 방문) 아무것도 쓰지 않는다 — 기본 night.
 */
export function initTheme(): Theme {
  const cookie = readCookieTheme();
  const stored = readStoredTheme();
  const t = cookie ?? stored ?? getTheme();
  if (getTheme() !== t) applyTheme(t);
  else if (doc()?.documentElement) doc()!.documentElement.style.colorScheme = colorSchemeOf(t);
  if (cookie !== null || stored !== null) writeCookie(t);
  if (cookie !== null && stored !== cookie) writeStorage(t);
  return t;
}

/** 테스트용: 모듈 상태 초기화 */
export function __resetThemeForTests(): void {
  listeners.clear();
  if (animTimer) clearTimeout(animTimer);
  if (fadeTimer) clearTimeout(fadeTimer);
  animTimer = null;
  fadeTimer = null;
  vtSeq = 0;
  vtSource = null;
  pending = null;
  const w = win();
  if (w && syncCount > 0) {
    w.removeEventListener('storage', onStorage);
    w.removeEventListener('pageshow', onPageShow);
  }
  syncCount = 0;
}
