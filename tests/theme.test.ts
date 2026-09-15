// 나이트·라이트 모드 로직 (docs/THEME_V5.md §1·§2·§4): 쿠키·localStorage·<html data-theme> 갱신, 다른 탭 storage 이벤트 동기화,
// 화면 전환 방식(View Transitions / 색 교차 / 움직임 줄이기 = 즉시). node 환경이라 document·window 는 가짜로 세운다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_FADE_MS,
  THEME_META_COLOR,
  THEME_STORAGE_KEY,
  THEME_SWITCH_MS,
  THEME_TOGGLE_VT_NAME,
  __resetThemeForTests,
  animOf,
  applyTheme,
  colorSchemeOf,
  getTheme,
  htmlThemeAttrs,
  initTheme,
  otherTheme,
  parseTheme,
  persistTheme,
  pickSwitchMode,
  readCookieTheme,
  readStoredTheme,
  setTheme,
  startThemeSync,
  subscribeTheme,
  themeCookieString,
  themeFromCookieHeader,
  toggleTheme,
} from '@/lib/client/theme';

/* ---------------------------------------------------------------- 가짜 브라우저 */

class FakeStorage {
  map = new Map<string, string>();
  blocked = false;
  getItem(k: string) {
    if (this.blocked) throw new Error('blocked');
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.blocked) throw new Error('blocked');
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

interface FakeEl {
  style: { props: Map<string, string>; setProperty(k: string, v: string): void; removeProperty(k: string): void };
  getBoundingClientRect(): { left: number; right: number; top: number; bottom: number };
}

/** 토글 버튼 (화면 왼쪽 위 72×44) */
function fakeEl(): FakeEl {
  const props = new Map<string, string>();
  return {
    style: {
      props,
      setProperty: (k, v) => void props.set(k, v),
      removeProperty: (k) => void props.delete(k),
    },
    getBoundingClientRect: () => ({ left: 0, right: 72, top: 0, bottom: 44 }),
  };
}

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** vt: true = 바로 끝나는 전환, 'manual' = finished 를 테스트가 풀어 준다, 'deferred' = update 콜백도 테스트가 부른다(다음 그림) */
function makeEnv(opts: { reduced?: boolean; vt?: boolean | 'manual' | 'deferred'; cookie?: string; stored?: string | null; html?: string | null } = {}) {
  const { reduced = false, vt = false, cookie = '', stored = null, html = 'night' } = opts;
  const attrs = new Map<string, string>();
  if (html) attrs.set('data-theme', html);
  const classes = new Set<string>();
  const rootStyle = { colorScheme: '' };
  const root = {
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, String(v)),
    removeAttribute: (k: string) => void attrs.delete(k),
    classList: { add: (c: string) => void classes.add(c), remove: (c: string) => void classes.delete(c) },
    style: rootStyle,
  };
  const meta = { content: '', setAttribute(k: string, v: string) { if (k === 'content') this.content = v; } };
  const jar = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const cookieWrites: string[] = [];
  const transitions: Deferred[] = [];
  const updates: (() => void)[] = [];
  const startViewTransition = vi.fn((update: () => void) => {
    if (vt === 'deferred') {
      updates.push(update);
      const d = deferred();
      transitions.push(d);
      return { finished: d.promise, ready: Promise.resolve() };
    }
    // 실제처럼: 옛 화면을 찍은 뒤 비동기로 update 를 부른다 (여기서는 바로)
    update();
    if (vt === 'manual') {
      const d = deferred();
      transitions.push(d);
      return { finished: d.promise, ready: Promise.resolve() };
    }
    return { finished: Promise.resolve(), ready: Promise.resolve() };
  });
  const document: Record<string, unknown> = {
    documentElement: root,
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(s: string) {
      cookieWrites.push(s);
      const pair = s.split(';')[0];
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    },
  };
  if (vt) document.startViewTransition = startViewTransition;
  const docListeners = new Map<string, Set<(e: unknown) => void>>();
  document.addEventListener = (t: string, fn: (e: unknown) => void) => {
    if (!docListeners.has(t)) docListeners.set(t, new Set());
    docListeners.get(t)!.add(fn);
  };
  document.removeEventListener = (t: string, fn: (e: unknown) => void) => void docListeners.get(t)?.delete(fn);
  const storage = new FakeStorage();
  if (stored !== null) storage.map.set(THEME_STORAGE_KEY, stored);
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const window = {
    localStorage: storage,
    matchMedia: (q: string) => ({ matches: reduced && q.includes('prefers-reduced-motion: reduce') }),
    addEventListener: (t: string, fn: (e: unknown) => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set());
      listeners.get(t)!.add(fn);
    },
    removeEventListener: (t: string, fn: (e: unknown) => void) => void listeners.get(t)?.delete(fn),
  };
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', window);
  return {
    attrs,
    classes,
    rootStyle,
    meta,
    jar,
    cookieWrites,
    storage,
    startViewTransition,
    transitions,
    updates,
    root,
    /** 다른 탭이 localStorage 를 바꿨을 때 이 탭에 오는 storage 이벤트 */
    fireStorage(key: string | null, newValue: string | null) {
      for (const fn of listeners.get('storage') ?? []) fn({ key, newValue });
    },
    /** window 이벤트 (pageshow 등) */
    fire(type: string, e: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(e);
    },
    /** document 의 pointerdown (쓸기 층이 가로채면 target 은 <html>) */
    firePointerDown(target: unknown, clientX: number, clientY: number) {
      for (const fn of [...(docListeners.get('pointerdown') ?? [])]) fn({ target, clientX, clientY, isPrimary: true, preventDefault() {} });
    },
    storageListeners: () => listeners.get('storage')?.size ?? 0,
    listenerCount: (t: string) => listeners.get(t)?.size ?? 0,
    docListenerCount: (t: string) => docListeners.get(t)?.size ?? 0,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  __resetThemeForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- 순수 함수 */

describe('순수 함수 (서버 루트 레이아웃도 쓴다)', () => {
  it('기본은 night, 값 검사·반대·color-scheme·방향', () => {
    expect(DEFAULT_THEME).toBe('night');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('night')).toBe('night');
    expect(parseTheme('dark')).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
    expect(otherTheme('night')).toBe('light');
    expect(otherTheme('light')).toBe('night');
    expect(colorSchemeOf('night')).toBe('dark');
    expect(colorSchemeOf('light')).toBe('light');
    expect(animOf('light', 'night')).toBe('to-night');
    expect(animOf('night', 'light')).toBe('to-light');
    expect(animOf('night', 'night')).toBeNull();
    expect(htmlThemeAttrs('light')).toEqual({ 'data-theme': 'light', style: { colorScheme: 'light' } });
  });

  it('Cookie 헤더에서 owl_theme 를 읽는다 (다른 쿠키·인코딩·잘못된 값)', () => {
    expect(themeFromCookieHeader(null)).toBeNull();
    expect(themeFromCookieHeader('')).toBeNull();
    expect(themeFromCookieHeader('owl_session=abc; owl_theme=light; x=1')).toBe('light');
    expect(themeFromCookieHeader('owl_theme=night')).toBe('night');
    expect(themeFromCookieHeader('xowl_theme=light')).toBeNull();
    expect(themeFromCookieHeader('owl_theme=%6Cight')).toBe('light');
    expect(themeFromCookieHeader('owl_theme=blue')).toBeNull();
    expect(themeFromCookieHeader('owl_theme=%E0%A4%A')).toBeNull();
  });

  it('쿠키 문자열: Path=/, 1년, SameSite=Lax, httpOnly 아님', () => {
    const s = themeCookieString('light');
    expect(s.startsWith(`${THEME_COOKIE}=light;`)).toBe(true);
    expect(s).toContain('Path=/');
    expect(s).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
    expect(THEME_COOKIE_MAX_AGE).toBe(31536000);
    expect(s).toContain('SameSite=Lax');
    expect(s.toLowerCase()).not.toContain('httponly');
  });

  it('document 가 없으면(서버) DOM 함수는 조용히 기본값', async () => {
    expect(getTheme()).toBe('night');
    expect(readCookieTheme()).toBeNull();
    expect(readStoredTheme()).toBeNull();
    expect(() => persistTheme('light')).not.toThrow();
    expect(() => applyTheme('light')).not.toThrow();
    expect(pickSwitchMode()).toBe('crossfade');
    await expect(setTheme('light')).resolves.toBe('instant');
    expect(startThemeSync()).toBeTypeOf('function');
  });
});

/* ---------------------------------------------------------------- 저장·적용 */

describe('setTheme: 쿠키 + localStorage + <html data-theme>', () => {
  it('라이트로: 쿠키·localStorage 에 쓰고 data-theme·color-scheme·theme-color 를 바꾸고 구독자에게 알린다', async () => {
    const env = makeEnv({ reduced: true });
    const seen: string[] = [];
    subscribeTheme((t) => seen.push(t));
    await expect(setTheme('light')).resolves.toBe('instant');
    expect(env.jar.get(THEME_COOKIE)).toBe('light');
    expect(env.cookieWrites).toEqual([themeCookieString('light')]);
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('light');
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.rootStyle.colorScheme).toBe('light');
    expect(env.meta.content).toBe(THEME_META_COLOR.light);
    expect(getTheme()).toBe('light');
    expect(readCookieTheme()).toBe('light');
    expect(readStoredTheme()).toBe('light');
    expect(seen).toEqual(['light']);

    await setTheme('night');
    expect(env.attrs.get('data-theme')).toBe('night');
    expect(env.rootStyle.colorScheme).toBe('dark');
    expect(env.meta.content).toBe(THEME_META_COLOR.night);
    expect(env.jar.get(THEME_COOKIE)).toBe('night');
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('night');
    expect(seen).toEqual(['light', 'night']);
  });

  it('data-theme 가 없으면 night 로 본다, 같은 모드로 바꾸면 알리지 않는다', async () => {
    const env = makeEnv({ html: null, vt: true });
    expect(getTheme()).toBe('night');
    const cb = vi.fn();
    subscribeTheme(cb);
    await expect(setTheme('night')).resolves.toBe('instant');
    expect(env.startViewTransition).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
    expect(env.attrs.get('data-theme')).toBe('night');
  });

  it('toggleTheme 은 반대 모드로', async () => {
    const env = makeEnv({ reduced: true, html: 'light' });
    await toggleTheme();
    expect(env.attrs.get('data-theme')).toBe('night');
    await toggleTheme();
    expect(env.attrs.get('data-theme')).toBe('light');
  });

  it('localStorage 가 막혀도 쿠키와 화면은 바뀐다', async () => {
    const env = makeEnv({ reduced: true });
    env.storage.blocked = true;
    await expect(setTheme('light')).resolves.toBe('instant');
    expect(env.jar.get(THEME_COOKIE)).toBe('light');
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(readStoredTheme()).toBeNull();
  });
});

/* ---------------------------------------------------------------- 전환 방식 */

describe('화면 전환 (§2)', () => {
  it('View Transitions: 새 화면을 쓸어 드러낸다 — 방향 신호 data-theme-anim, 누른 토글은 view-transition-name', async () => {
    const env = makeEnv({ vt: true });
    const btn = fakeEl();
    expect(pickSwitchMode()).toBe('view-transition');
    const p = setTheme('light', { source: btn as unknown as HTMLElement });
    // 옛 화면을 찍기 전에 이름이 붙어 있어야 한다
    expect(env.startViewTransition).toHaveBeenCalledTimes(1);
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.attrs.get('data-theme-anim')).toBe('to-light');
    await expect(p).resolves.toBe('view-transition');
    expect(btn.style.props.has('view-transition-name')).toBe(false);
    // 쓸기가 끝나면(finished) 방향 신호를 뗀다
    expect(env.attrs.has('data-theme-anim')).toBe(false);
    vi.advanceTimersByTime(THEME_SWITCH_MS + 100);
    expect(env.attrs.has('data-theme-anim')).toBe(false);

    const p2 = setTheme('night', { source: btn as unknown as HTMLElement });
    expect(env.attrs.get('data-theme-anim')).toBe('to-night');
    await p2;
    expect(env.attrs.has('data-theme-anim')).toBe(false);
  });

  it('방향 신호는 시간이 아니라 쓸기가 끝날 때 뗀다 (무거운 화면에서 늦게 끝나도 쓸기·해달 연출이 잘리지 않는다)', async () => {
    const env = makeEnv({ vt: 'manual' });
    const p = setTheme('light', { source: fakeEl() as unknown as HTMLElement });
    expect(env.attrs.get('data-theme-anim')).toBe('to-light');
    await vi.advanceTimersByTimeAsync(900);
    expect(env.attrs.get('data-theme-anim')).toBe('to-light');
    env.transitions[0].resolve();
    await p;
    expect(env.attrs.has('data-theme-anim')).toBe(false);
  });

  it('빠른 두 번 누름: 쓸기가 아직 DOM 에 닿기 전 두 번째 누름은 반대(원래) 모드로 간다', async () => {
    const env = makeEnv({ vt: 'deferred' });
    const p1 = toggleTheme(); // night → light (update 콜백은 다음 그림)
    expect(env.attrs.get('data-theme')).toBe('night');
    const p2 = toggleTheme(); // light → night
    expect(env.startViewTransition).toHaveBeenCalledTimes(2);
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('night');
    expect(env.jar.get(THEME_COOKIE)).toBe('night');
    for (const u of env.updates) u();
    expect(env.attrs.get('data-theme')).toBe('night');
    expect(env.attrs.get('data-theme-anim')).toBe('to-night');
    for (const d of env.transitions) d.resolve();
    await Promise.all([p1, p2]);
    expect(env.attrs.get('data-theme')).toBe('night');
    expect(env.attrs.has('data-theme-anim')).toBe(false);
  });

  it('쓸기 동안 가로채진 누름이 토글 자리면 반대로 바꾼다 (마우스·터치도 키보드처럼)', async () => {
    const env = makeEnv({ vt: 'manual' });
    const btn = fakeEl();
    const src = btn as unknown as HTMLElement;
    const p1 = setTheme('light', { source: src });
    expect(env.docListenerCount('pointerdown')).toBe(1);
    // 토글 밖은 무시
    env.firePointerDown(env.root, 300, 300);
    expect(env.startViewTransition).toHaveBeenCalledTimes(1);
    // 버튼이 직접 받은 누름은 click 이 처리한다 (두 번 바뀌지 않게)
    env.firePointerDown(btn, 30, 20);
    expect(env.startViewTransition).toHaveBeenCalledTimes(1);
    // 쓸기 층이 가로챈 누름(<html>)이 토글 자리 → 반대로
    env.firePointerDown(env.root, 30, 20);
    expect(env.startViewTransition).toHaveBeenCalledTimes(2);
    expect(env.attrs.get('data-theme')).toBe('night');
    expect(env.attrs.get('data-theme-anim')).toBe('to-night');
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('night');
    expect(btn.style.props.get('view-transition-name')).toBe(THEME_TOGGLE_VT_NAME);
    for (const d of env.transitions) d.resolve();
    await p1;
    await vi.advanceTimersByTimeAsync(1);
    expect(env.docListenerCount('pointerdown')).toBe(0);
    expect(btn.style.props.has('view-transition-name')).toBe(false);
    expect(env.attrs.has('data-theme-anim')).toBe(false);
    expect(env.attrs.get('data-theme')).toBe('night');
  });

  it('전환 중 이름은 누른 토글에 붙고, 연달아 누르면 마지막 전환만 뗀다', async () => {
    const env = makeEnv({ vt: 'manual' });
    const btn = fakeEl();
    const src = btn as unknown as HTMLElement;
    const p1 = setTheme('light', { source: src });
    expect(btn.style.props.get('view-transition-name')).toBe(THEME_TOGGLE_VT_NAME);
    const p2 = setTheme('night', { source: src });
    env.transitions[0].resolve();
    await p1;
    expect(btn.style.props.get('view-transition-name')).toBe(THEME_TOGGLE_VT_NAME);
    env.transitions[1].resolve();
    await p2;
    expect(btn.style.props.has('view-transition-name')).toBe(false);
    expect(env.attrs.get('data-theme')).toBe('night');
  });

  it('전환이 거절돼도 새 모드는 적용된다', async () => {
    const env = makeEnv({ vt: true });
    env.startViewTransition.mockImplementationOnce(() => {
      throw new Error('InvalidStateError');
    });
    await expect(setTheme('light')).resolves.toBe('view-transition');
    expect(env.attrs.get('data-theme')).toBe('light');
  });

  it('연달아 누름(AbortError)·update 실패로 ready·updateCallbackDone 이 거절돼도 "Uncaught (in promise)" 로 새지 않는다', async () => {
    vi.useRealTimers(); // Node 의 unhandledRejection 판정은 진짜 틱에서 난다
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => void unhandled.push(r);
    process.on('unhandledRejection', onUnhandled);
    try {
      const env = makeEnv({ vt: true });
      // 건너뛴 전환: ready 만 AbortError, update 는 불리고 finished 는 풀린다
      env.startViewTransition.mockImplementationOnce((update: () => void) => {
        update();
        const skipped = { finished: Promise.resolve(), ready: Promise.reject(new Error('AbortError: Transition was skipped')), updateCallbackDone: Promise.resolve() };
        return skipped;
      });
      await expect(setTheme('light')).resolves.toBe('view-transition');
      expect(env.attrs.get('data-theme')).toBe('light');
      expect(env.attrs.has('data-theme-anim')).toBe(false);
      // update 가 실패한 전환: ready·updateCallbackDone·finished 모두 거절 → 새 모드는 그래도 적용
      env.startViewTransition.mockImplementationOnce(() => {
        const err = new Error('InvalidStateError: Transition was aborted because of invalid state');
        const aborted = { finished: Promise.reject(err), ready: Promise.reject(err), updateCallbackDone: Promise.reject(err) };
        return aborted;
      });
      await expect(setTheme('night')).resolves.toBe('view-transition');
      expect(env.attrs.get('data-theme')).toBe('night');
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('보이지 않는 탭: 화면 쓸기 없이 즉시 (브라우저가 InvalidStateError 로 건너뛰므로)', async () => {
    const env = makeEnv({ vt: true });
    (globalThis as unknown as { document: Record<string, unknown> }).document.visibilityState = 'hidden';
    await expect(setTheme('light', { source: fakeEl() as unknown as HTMLElement })).resolves.toBe('instant');
    expect(env.startViewTransition).not.toHaveBeenCalled();
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.attrs.has('data-theme-anim')).toBe(false);
    expect(env.jar.get(THEME_COOKIE)).toBe('light');
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('light');
  });

  it('View Transitions 미지원: 0.3초 색 교차 전환 (html.owl-theme-fade)', async () => {
    const env = makeEnv({ vt: false });
    expect(pickSwitchMode()).toBe('crossfade');
    const p = setTheme('light');
    expect(env.classes.has('owl-theme-fade')).toBe(true);
    expect(env.attrs.get('data-theme')).toBe('light');
    await vi.advanceTimersByTimeAsync(THEME_FADE_MS + 60);
    await expect(p).resolves.toBe('crossfade');
    expect(env.classes.has('owl-theme-fade')).toBe(false);
  });

  it('움직임 줄이기: 즉시 — 화면 전환·교차 전환·해달 연출 신호 없음', async () => {
    const env = makeEnv({ reduced: true, vt: true });
    expect(pickSwitchMode()).toBe('instant');
    await expect(setTheme('light', { source: fakeEl() as unknown as HTMLElement })).resolves.toBe('instant');
    expect(env.startViewTransition).not.toHaveBeenCalled();
    expect(env.classes.has('owl-theme-fade')).toBe(false);
    expect(env.attrs.has('data-theme-anim')).toBe(false);
    expect(env.attrs.get('data-theme')).toBe('light');
  });

  it('mode 를 강제할 수 있다 (VT 가 없으면 교차 전환으로 내려간다)', async () => {
    const env = makeEnv({ vt: false });
    const p = setTheme('light', { mode: 'view-transition' });
    await vi.advanceTimersByTimeAsync(THEME_FADE_MS + 60);
    await expect(p).resolves.toBe('crossfade');
    expect(env.attrs.get('data-theme')).toBe('light');
  });
});

/* ---------------------------------------------------------------- 다른 탭 */

describe('다른 탭 동기화 (storage 이벤트)', () => {
  it('다른 탭이 localStorage 를 바꾸면 이 탭 <html> 과 구독자가 바로 따라간다', () => {
    const env = makeEnv();
    const seen: string[] = [];
    const stop = subscribeTheme((t) => seen.push(t));
    env.fireStorage(THEME_STORAGE_KEY, 'light');
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.rootStyle.colorScheme).toBe('light');
    expect(env.attrs.get('data-theme-anim')).toBe('to-light');
    expect(seen).toEqual(['light']);
    // 다른 키·잘못된 값·같은 값은 무시
    env.fireStorage('owl_other', 'night');
    env.fireStorage(THEME_STORAGE_KEY, 'blue');
    env.fireStorage(THEME_STORAGE_KEY, 'light');
    env.fireStorage(null, null);
    expect(seen).toEqual(['light']);
    stop();
    env.fireStorage(THEME_STORAGE_KEY, 'night');
    expect(env.attrs.get('data-theme')).toBe('light');
  });

  it('리스너는 하나만 (참조 계수): 구독·프로바이더가 여럿이어도, 모두 멈추면 뗀다', () => {
    const env = makeEnv();
    const a = startThemeSync();
    const b = subscribeTheme(() => {});
    const c = startThemeSync();
    expect(env.storageListeners()).toBe(1);
    a();
    a(); // 두 번 불러도 한 번만
    b();
    expect(env.storageListeners()).toBe(1);
    c();
    expect(env.storageListeners()).toBe(0);
  });

  it('뒤로 가기 캐시에서 되살아난 페이지(pageshow persisted)는 저장값을 다시 읽는다 (연출 없이)', () => {
    const env = makeEnv({ cookie: 'owl_theme=night', html: 'night' });
    const stop = startThemeSync();
    expect(env.listenerCount('pageshow')).toBe(1);
    env.jar.set(THEME_COOKIE, 'light'); // 다음 페이지에서 바꾸고 뒤로 왔다
    env.fire('pageshow', { persisted: false });
    expect(env.attrs.get('data-theme')).toBe('night');
    env.fire('pageshow', { persisted: true });
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.rootStyle.colorScheme).toBe('light');
    expect(env.attrs.has('data-theme-anim')).toBe(false);
    stop();
    expect(env.listenerCount('pageshow')).toBe(0);
  });

  it('구독 해지 뒤에는 알리지 않는다', async () => {
    makeEnv({ reduced: true });
    const cb = vi.fn();
    const stop = subscribeTheme(cb);
    stop();
    await setTheme('light');
    expect(cb).not.toHaveBeenCalled();
  });

  it('구독자 하나가 던져도 다른 구독자는 알림을 받는다', async () => {
    makeEnv({ reduced: true });
    const good = vi.fn();
    subscribeTheme(() => {
      throw new Error('boom');
    });
    subscribeTheme(good);
    await setTheme('light');
    expect(good).toHaveBeenCalledWith('light');
  });
});

/* ---------------------------------------------------------------- 첫 마운트 */

describe('initTheme: 쿠키·localStorage·<html> 맞추기', () => {
  it('쿠키가 기준 (서버가 그 값으로 그렸다): localStorage 를 맞추고 쿠키 수명을 새로 늘린다 (Safari 7일 제한)', () => {
    const env = makeEnv({ cookie: 'owl_theme=light', stored: 'night', html: 'light' });
    expect(initTheme()).toBe('light');
    expect(env.storage.map.get(THEME_STORAGE_KEY)).toBe('light');
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.rootStyle.colorScheme).toBe('light');
    expect(env.cookieWrites).toEqual([themeCookieString('light')]);
  });

  it('쿠키가 없고 localStorage 만 있으면 그 값을 적용하고 쿠키를 다시 쓴다', () => {
    const env = makeEnv({ stored: 'light', html: 'night' });
    expect(initTheme()).toBe('light');
    expect(env.attrs.get('data-theme')).toBe('light');
    expect(env.jar.get(THEME_COOKIE)).toBe('light');
  });

  it('첫 방문(저장값 없음)은 night, 아무것도 쓰지 않는다', () => {
    const env = makeEnv({ html: 'night' });
    expect(initTheme()).toBe('night');
    expect(env.attrs.get('data-theme')).toBe('night');
    expect(env.rootStyle.colorScheme).toBe('dark');
    expect(env.cookieWrites).toEqual([]);
    expect(env.storage.map.size).toBe(0);
  });
});
