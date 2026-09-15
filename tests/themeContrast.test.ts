// 두 모드 토큰 대비 (docs/THEME_V5.md §3 "대비: 두 모드 모두 본문 4.5:1, 큰 글자·UI 경계 3:1 이상", §4 테스트).
// app/globals.css 를 직접 읽어 나이트 값(@theme static + :root)과 라이트 값(:root[data-theme="light"])을 풀고
// 반투명 유리는 바탕 위에 겹쳐(합성) WCAG 2.x 대비를 계산한다. CSS 가 바뀌면 이 테스트가 지킨다.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------------------------------------------------------------- CSS 읽기 */

interface Rule { selector: string; body: string }

/** 최상위 규칙들 (@media·@supports·@keyframes 안은 건너뛴다. @theme static 은 selector '@theme static') */
function topRules(css: string): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const selector = css.slice(i, open).replace(/^[\s;]+/, '').trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    // @import 같은 문장이 앞에 붙어 있으면 떼어 낸다
    const sel = selector.includes(';') ? selector.slice(selector.lastIndexOf(';') + 1).trim() : selector;
    out.push({ selector: sel, body });
    i = j;
  }
  return out;
}

/** "--a: 1; --b: x(…;…)" → Map (괄호 안의 ; 는 나누지 않는다) */
function decls(body: string): Map<string, string> {
  const m = new Map<string, string>();
  let depth = 0;
  let cur = '';
  const flush = () => {
    const s = cur.trim();
    cur = '';
    const k = s.indexOf(':');
    if (k < 0) return;
    const name = s.slice(0, k).trim();
    if (name.startsWith('--')) m.set(name, s.slice(k + 1).trim().replace(/\s+/g, ' '));
  };
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) flush();
    else cur += ch;
  }
  flush();
  return m;
}

const RULES = topRules(CSS);
const rulesFor = (sel: string) => RULES.filter((r) => r.selector === sel);

type Vars = Map<string, string>;
const NIGHT: Vars = new Map();
for (const r of [...rulesFor('@theme static'), ...rulesFor(':root')]) for (const [k, v] of decls(r.body)) NIGHT.set(k, v);
const LIGHT_ONLY: Vars = new Map();
for (const r of rulesFor(':root[data-theme="light"]')) for (const [k, v] of decls(r.body)) LIGHT_ONLY.set(k, v);
const LIGHT: Vars = new Map([...NIGHT, ...LIGHT_ONLY]);
const THEMES = { night: NIGHT, light: LIGHT } as const;
type ThemeName = keyof typeof THEMES;

/** var(--x[, fallback]) 를 재귀로 푼다 */
function resolve(value: string, vars: Vars, depth = 0): string {
  if (depth > 20) throw new Error(`var() 순환: ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fb?: string) => {
    const v = vars.get(name);
    if (v !== undefined) return resolve(v, vars, depth + 1);
    if (fb !== undefined) return resolve(fb.trim(), vars, depth + 1);
    throw new Error(`정의되지 않은 토큰 ${name}`);
  });
}

/** 한 모드에서 토큰 하나 또는 클래스 규칙의 변수 (예: .move 의 --blk-c1) */
function token(theme: ThemeName, name: string, extra?: Vars): string {
  const vars = extra ? new Map([...THEMES[theme], ...extra]) : THEMES[theme];
  const v = vars.get(name);
  if (v === undefined) throw new Error(`${theme}: ${name} 없음`);
  return resolve(v, vars);
}

/* ---------------------------------------------------------------- 색 계산 */

type RGBA = [number, number, number, number];

function parseColor(s: string): RGBA {
  const v = s.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  if (/^white$/i.test(v)) return [255, 255, 255, 1];
  throw new Error(`색이 아니다: ${s}`);
}

/** 모든 색 (그라데이션 값에서 순서대로) */
function colorsIn(s: string): RGBA[] {
  return (s.match(/#[0-9a-f]{3,8}\b|rgba?\([^()]*\)/gi) ?? []).map(parseColor);
}

/** fg 를 불투명 bg 위에 합성 */
function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: RGBA): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGBA, b: RGBA): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const color = (theme: ThemeName, name: string, extra?: Vars) => parseColor(token(theme, name, extra));

/** 모드별 면: 유리는 바탕 위, 파인 면(glass-inset)은 유리 패널 안(그리고 바탕 바로 위) */
function surfaces(theme: ThemeName) {
  const bg = color(theme, '--color-bg');
  expect(bg[3]).toBe(1);
  const glass = over(color(theme, '--color-glass'), bg);
  const glass2 = over(color(theme, '--color-glass-2'), bg);
  const insetOnGlass = over(color(theme, '--color-glass-inset'), glass);
  const insetOnBg = over(color(theme, '--color-glass-inset'), bg);
  return { bg, glass, 'glass-2': glass2, 'glass-inset': insetOnGlass, 'glass-inset(bg)': insetOnBg };
}

/** 글자 색이 반투명이면 그 면 위에 합성해 비교한다 */
function textOn(fg: RGBA, surface: RGBA): number {
  return contrast(over(fg, surface), surface);
}

/** 클래스 규칙의 변수 (.move { --blk-c1 … }), 모드 덮어쓰기(:root[data-theme="light"] .move) 포함 */
function classVars(theme: ThemeName, cls: string): Vars {
  const m: Vars = new Map();
  for (const r of rulesFor(cls)) for (const [k, v] of decls(r.body)) m.set(k, v);
  if (theme === 'light') for (const r of rulesFor(`:root[data-theme="light"] ${cls}`)) for (const [k, v] of decls(r.body)) m.set(k, v);
  return m;
}

/** color-mix(in srgb, a p, b) — 둘 다 불투명 */
function mixSrgb(a: RGBA, b: RGBA, p: number): RGBA {
  return [a[0] * p + b[0] * (1 - p), a[1] * p + b[1] * (1 - p), a[2] * p + b[2] * (1 - p), 1];
}

/** 불투명한 바탕(bg·bg-deep) 위 유리 면들 */
function facesOver(theme: ThemeName, base: RGBA) {
  const glass = over(color(theme, '--color-glass'), base);
  return { glass, 'glass-2': over(color(theme, '--color-glass-2'), base), 'glass-inset': over(color(theme, '--color-glass-inset'), glass) };
}

/* 칩 톤 (components/ui/Chip.tsx TONES): 옅은 칠 bg-X/NN · 글자 text-X · 라이트 글자 섞기 color-mix(X NN%, text) */
const CHIP_SRC = fs.readFileSync(path.resolve(process.cwd(), 'components/ui/Chip.tsx'), 'utf8');
interface ChipToneSpec { tone: string; tint: string; alpha: number; ink: string; lightMix: { color: string; pct: number } | null }
function chipTones(): ChipToneSpec[] {
  const out: ChipToneSpec[] = [];
  for (const m of CHIP_SRC.matchAll(/^\s*(\w+):\s*\{\s*box:\s*'([^']*)'/gm)) {
    const [, tone, box] = m;
    const bg = /(?:^|\s)bg-([a-z-]+)\/(?:(\d+)|\[([\d.]+)\])/.exec(box);
    const text = /(?:^|\s)text-([a-z-]+)(?=\s|$)/.exec(box);
    if (!bg || !text) throw new Error(`칩 ${tone}: ${box}`);
    const mix = /\[html\[data-theme=light\]_&\]:text-\[color-mix\(in_srgb,var\((--color-[a-z-]+)\)_(\d+)%,var\(--color-text\)\)\]/.exec(box);
    out.push({
      tone,
      tint: `--color-${bg[1]}`,
      alpha: bg[2] !== undefined ? +bg[2] / 100 : +bg[3],
      ink: `--color-${text[1]}`,
      lightMix: mix ? { color: mix[1], pct: +mix[2] / 100 } : null,
    });
  }
  return out;
}

/* 해·달 토글 하늘 띠 (.owl-tt-band): px 멈춤 사이를 선형 보간한 x 위치의 색, 라이트 창의 시작(translateX) */
const BAND = rulesFor('.owl-tt-band')[0]?.body ?? '';
const BAND_STOPS = [...BAND.matchAll(/(#[0-9a-f]{6})\s+(\d+)px/gi)].map((m) => [+m[2], parseColor(m[1])] as const);
const BAND_LIGHT_X = Number(/translateX\(-(\d+)px\)/.exec(BAND)?.[1] ?? NaN);
function bandAt(x: number): RGBA {
  for (let i = 0; i < BAND_STOPS.length - 1; i++) {
    const [x0, c0] = BAND_STOPS[i];
    const [x1, c1] = BAND_STOPS[i + 1];
    if (x >= x0 && x <= x1) return mixSrgb(c1, c0, x1 === x0 ? 1 : (x - x0) / (x1 - x0));
  }
  return BAND_STOPS[BAND_STOPS.length - 1][1];
}

/* ---------------------------------------------------------------- 테스트 */

describe('THEME_V5 토큰 구조', () => {
  it('라이트는 같은 토큰 이름만 바꾼다 (새 이름 없음)', () => {
    const extra = [...LIGHT_ONLY.keys()].filter((k) => !NIGHT.has(k));
    expect(extra).toEqual([]);
  });

  it('나이트 값은 v4 그대로 (DESIGN_V4 §2)', () => {
    const v4: Record<string, string> = {
      '--color-bg': '#07060D',
      '--color-bg-deep': '#040308',
      '--color-glass': 'rgba(24, 20, 44, 0.55)',
      '--color-glass-2': 'rgba(36, 30, 64, 0.55)',
      '--color-glass-inset': 'rgba(8, 6, 18, 0.65)',
      '--color-stroke': 'rgba(255, 255, 255, 0.08)',
      '--color-stroke-strong': 'rgba(255, 255, 255, 0.16)',
      '--color-sheen': 'rgba(255, 255, 255, 0.06)',
      '--color-text': '#F4F1FF',
      '--color-text-dim': '#B9B2D6',
      '--color-text-faint': '#8C86A8',
      '--color-violet': '#7C4DFF',
      '--color-violet-ink': '#B49BFF',
      '--color-blue': '#5B8CFF',
      '--color-ok': '#3DDC97',
      '--color-warn': '#F5B94A',
      '--color-danger': '#FF6B8B',
      '--color-tint': '#FFFFFF',
      '--shadow-glass': '0 20px 60px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      '--glow-primary': '0 0 0 1px rgba(155, 107, 255, 0.35), 0 10px 40px rgba(124, 77, 255, 0.35)',
    };
    for (const [k, v] of Object.entries(v4)) expect(NIGHT.get(k), k).toBe(v);
  });

  it('라이트 값은 §3 표 (대비 때문에 짙게 조정한 ok·warn·danger·입력 윤곽 제외)', () => {
    const table: Record<string, string> = {
      '--color-bg': '#F3F0FB',
      '--color-bg-deep': '#E9E4F7',
      '--color-glass': 'rgba(255, 255, 255, 0.62)',
      '--color-glass-2': 'rgba(255, 255, 255, 0.82)',
      '--color-glass-inset': 'rgba(246, 243, 255, 0.85)',
      '--color-stroke': 'rgba(40, 24, 110, 0.1)',
      '--color-stroke-strong': 'rgba(40, 24, 110, 0.22)',
      '--color-sheen': 'rgba(255, 255, 255, 0.9)',
      '--color-text': '#1A1430',
      '--color-text-dim': '#4A4468',
      '--color-text-faint': '#6A6488',
      '--color-violet': '#6A3DF0',
      '--color-violet-ink': '#5A2FD8',
      '--color-blue': '#2F62E0',
    };
    for (const [k, v] of Object.entries(table)) expect(LIGHT_ONLY.get(k), k).toBe(v);
  });
});

describe.each(['night', 'light'] as const)('%s 모드 대비', (theme) => {
  const S = surfaces(theme);

  it.each(['--color-text', '--color-text-dim', '--color-text-faint'])('%s: bg·glass·glass-2·glass-inset 위 4.5:1 이상', (name) => {
    const fg = color(theme, name);
    for (const [s, c] of Object.entries(S)) expect(textOn(fg, c), `${name} on ${s}`).toBeGreaterThanOrEqual(4.5);
  });

  it('입력칸 윤곽(stroke-input)은 파인 면·유리 위 3:1 이상', () => {
    const border = color(theme, '--color-stroke-input');
    for (const s of ['glass-inset', 'glass-inset(bg)', 'glass', 'glass-2'] as const) {
      expect(textOn(border, S[s]), `stroke-input on ${s}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('상태·강조 글자색 (violet-ink, blue, blue-hover, cyan, ok, warn, danger)은 유리·파인 면 위 4.5:1 이상', () => {
    for (const name of ['--color-violet-ink', '--color-blue', '--color-blue-hover', '--color-cyan', '--color-ok', '--color-warn', '--color-danger']) {
      const fg = color(theme, name);
      for (const s of ['glass', 'glass-2', 'glass-inset', 'glass-inset(bg)'] as const) {
        expect(textOn(fg, S[s]), `${name} on ${s}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('팀 10색은 유리 위 글자 4.5:1 이상', () => {
    for (let i = 1; i <= 10; i++) {
      const fg = color(theme, `--color-team-${i}`);
      for (const s of ['glass', 'glass-inset'] as const) expect(textOn(fg, S[s]), `team-${i} on ${s}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['.move', '.turn', '.control', '.special'])('%s 블록 글자는 가장 밝은 색 띠 위 4.5:1 이상', (cls) => {
    const v = classVars(theme, cls);
    const stops = ['--blk-c1', '--blk-c2', '--blk-mid'].map((k) => color(theme, k, v));
    const lightest = stops.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));
    const ink = color(theme, '--blk-ink', v);
    expect(contrast(ink, lightest), `${cls} ink`).toBeGreaterThanOrEqual(4.5);
  });

  it('함수(유리형) 블록 글자는 파인 면에 겹친 가장 밝은 채움 위 4.5:1 이상, 테두리는 3:1 이상', () => {
    const v = classVars(theme, '.function');
    for (const surface of [S['glass-inset'], S['glass-inset(bg)']]) {
      const fills = ['--blk-c1', '--blk-c2', '--blk-mid'].map((k) => over(color(theme, k, v), surface));
      const ink = color(theme, '--blk-ink', v);
      for (const f of fills) expect(contrast(ink, f)).toBeGreaterThanOrEqual(4.5);
      const line = color(theme, '--blk-line', v);
      for (const f of fills) expect(contrast(line, f)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(['--code-keyword', '--code-builtin', '--code-call', '--code-number', '--code-punct', '--code-comment'])(
    '코드 %s 는 glass-inset 위 4.5:1 이상',
    (name) => {
      const fg = color(theme, name);
      expect(textOn(fg, S['glass-inset']), `${name} on glass-inset`).toBeGreaterThanOrEqual(4.5);
      expect(textOn(fg, S['glass-inset(bg)']), `${name} on glass-inset(bg)`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('맵 벽(윗면·아랫면)은 바닥 대비 3:1 이상 (바닥 위 은은한 조명까지 겹친 가장 나쁜 경우)', () => {
    const layers = colorsIn(token(theme, '--map-bg'));
    const base = layers[layers.length - 1];
    let floor = base[3] < 1 ? over(base, S.glass) : base;
    for (const l of layers.slice(0, -1)) if (l[3] > 0) floor = over(l, floor);
    for (const name of ['--color-wall-top', '--color-wall']) {
      expect(contrast(color(theme, name), floor), `${name} vs floor`).toBeGreaterThanOrEqual(3);
    }
  });

  it('칩 글자(Chip·StatusPill)는 같은 색 옅은 칠 위 4.5:1 이상 (glass·glass-2·glass-inset, bg·bg-deep 위)', () => {
    const tones = chipTones();
    expect(tones.map((t) => t.tone)).toEqual(['neutral', 'blue', 'violet', 'ok', 'warn', 'danger', 'cyan']);
    for (const t of tones) {
      const ink = theme === 'light' && t.lightMix
        ? mixSrgb(color(theme, t.lightMix.color), color(theme, '--color-text'), t.lightMix.pct)
        : color(theme, t.ink);
      const tint = color(theme, t.tint);
      for (const base of ['--color-bg', '--color-bg-deep']) {
        for (const [n, f] of Object.entries(facesOver(theme, color(theme, base)))) {
          const fill = over([tint[0], tint[1], tint[2], tint[3] * t.alpha], f);
          expect(textOn(ink, fill), `${t.tone} chip on ${n} over ${base}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('코드 글자는 보라 줄 바탕(실행 줄·호버·바뀐 줄·새 줄 형광펜) 위에서도 4.5:1 이상', () => {
    // 라이트: 바탕이 깔린 줄은 -strong 색 (globals.css `:root[data-theme="light"] :is(.cv-row:is(…)) .tk-*`).
    // 나이트(v4): 실행 줄의 괄호·주석만 text-dim, 형광펜은 라이트 전용.
    const kinds = ['keyword', 'builtin', 'call', 'number', 'punct', 'comment'];
    const washes = theme === 'light'
      ? ['--code-cur-bg', '--code-hover-bg', '--code-chg-bg', '--code-highlighter']
      : ['--code-cur-bg', '--code-hover-bg', '--code-chg-bg'];
    const insets = [S['glass-inset'], S['glass-inset(bg)'], facesOver(theme, color(theme, '--color-bg-deep'))['glass-inset']];
    for (const w of washes) {
      const wash = colorsIn(token(theme, w)).reduce((a, b) => (b[3] > a[3] ? b : a));
      for (const s of insets) {
        const row = over(wash, s);
        for (const k of kinds) {
          let name = `--code-${k}`;
          if (theme === 'light' && k !== 'call') name = `--code-${k}-strong`;
          else if (w === '--code-cur-bg' && (k === 'punct' || k === 'comment')) name = '--color-text-dim';
          expect(textOn(color(theme, name), row), `${name} on ${w}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe('라이트 줄 바탕·토글 경계 (나이트는 v4 그대로)', () => {
  it('라이트에서 줄 바탕이 깔린 코드 줄은 -strong 색을 쓴다 (나이트 -strong 은 원래 색)', () => {
    for (const k of ['keyword', 'builtin', 'number', 'punct', 'comment']) {
      expect(CSS).toContain(
        `:root[data-theme="light"] :is(.cv-row:is(.cv-cur, .cv-hover, .cv-new, .cv-chg-a, .cv-chg-b), .ntk-line.is-new) .tk-${k} { color: var(--code-${k}-strong); }`,
      );
      expect(NIGHT.get(`--code-${k}-strong`)).toBe(`var(--code-${k})`);
    }
  });

  it('토글 트랙 윤곽은 바탕·머리 줄·유리 대비 3:1 이상, 해 손잡이 테두리는 둘레 하늘 대비 3:1 이상', () => {
    expect(BAND_STOPS.length).toBeGreaterThanOrEqual(4);
    expect(BAND_LIGHT_X).toBeGreaterThan(72); // 섞이는 구간이 라이트 창(72px) 밖
    const bg = color('light', '--color-bg');
    const pages = [bg, over(color('light', '--header-fill'), bg), over(color('light', '--color-glass'), bg), over(color('light', '--color-glass-2'), bg)];
    const ring = colorsIn(token('light', '--tt-track-shadow'))[0];
    const hover = colorsIn(token('light', '--tt-track-shadow-hover'))[0];
    for (let x = BAND_LIGHT_X; x <= BAND_LIGHT_X + 72; x += 1) {
      for (const p of pages) {
        expect(contrast(over(ring, bandAt(x)), p), `track ring @${x}`).toBeGreaterThanOrEqual(3);
        expect(contrast(over(hover, bandAt(x)), p), `track hover ring @${x}`).toBeGreaterThanOrEqual(3);
      }
    }
    // 손잡이(왼쪽 4px, 28px)와 1.5px 테두리 둘레: 창 0~36px
    const knob = colorsIn(token('light', '--tt-knob-ring'))[0];
    expect(knob[3]).toBe(1);
    for (let x = BAND_LIGHT_X; x <= BAND_LIGHT_X + 36; x += 0.5) {
      expect(contrast(knob, bandAt(x)), `knob ring @${x}`).toBeGreaterThanOrEqual(3);
    }
    // 나이트 손잡이는 테두리 없음 (v4 에 없던 부품이지만 달은 이미 6.8:1)
    expect(colorsIn(token('night', '--tt-knob-ring')).every((c) => c[3] === 0)).toBe(true);
  });
});
