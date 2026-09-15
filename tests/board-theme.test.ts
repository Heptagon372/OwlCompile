// 프로젝터 보드 나이트·라이트 (docs/THEME_V5.md §1·§3·§4·§5-4).
//  - 보드는 토글이 없고 저장값을 따른다: 모드 차이는 CSS(토큰·[html[data-theme=light]_&] 변형)로만 → 다른 탭에서 바꿔도
//    React 가 다시 그리지 않아 재생이 이어진다. 그래서 components/board 는 모드를 JS 로 읽지 않는다.
//  - 라이트에서 흰 글자·흰 칠(white/…)·나이트 바탕 hex 가 남아 있지 않다 (1위 카드 bg-highlight 위 흰 글자는 두 모드 같은 짙은 보라 위라 예외).
//  - 팀 색은 모드 토큰, 라이트 상태 알약 글자는 4.5:1 이상.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TEAM_PRESETS } from '@/lib/contracts';
import { teamColor } from '@/components/board/layout';

const ROOT = resolve(__dirname, '..');
const BOARD = join(ROOT, 'components', 'board');
const files = readdirSync(BOARD).filter((f) => /\.tsx?$/.test(f));
const src = (f: string) => readFileSync(join(BOARD, f), 'utf8');

describe('board team colours follow the theme tokens', () => {
  it('preset hex → var(--color-team-N) (case-insensitive), unknown colours unchanged', () => {
    TEAM_PRESETS.forEach((p, i) => {
      expect(teamColor(p.color)).toBe(`var(--color-team-${i + 1})`);
      expect(teamColor(` ${p.color.toLowerCase()} `)).toBe(`var(--color-team-${i + 1})`);
    });
    expect(teamColor('#123456')).toBe('#123456');
  });

  it('TeamDot · RoleDots · lobby team stripe use teamColor, not the raw server hex', () => {
    const ui = src('ui.tsx');
    expect(ui).toMatch(/TeamDot[\s\S]*?const c = teamColor\(color\)/);
    expect(ui).toMatch(/RoleDots[\s\S]*?const c = teamColor\(team\.color\)/);
    expect(ui).not.toMatch(/background:\s*color\b/);
    expect(src('BoardClient.tsx')).toContain('linear-gradient(90deg, ${teamColor(team.color)}');
  });
});

describe('board switches theme with CSS only (no re-render → playback keeps running)', () => {
  it('no component in components/board reads the theme in JS', () => {
    for (const f of files) {
      const s = src(f);
      // 가져오기·호출만 본다 (주석의 설명은 괜찮다)
      expect(s, f).not.toMatch(/^\s*import[^;]*(?:lib\/client\/theme|ThemeProvider)/m);
      expect(s, f).not.toMatch(/\b(?:useTheme|subscribeTheme|getTheme)\s*\(/);
    }
  });

  it('no white washes, night-only literals or white text on light surfaces', () => {
    for (const f of files) {
      const s = src(f);
      expect(s, f).not.toMatch(/\bbg-white\/\[/); // 옅은 칠은 bg-tint/[…]
      expect(s, f).not.toMatch(/rgba\(7,\s*6,\s*13/); // 나이트 바탕 hex (라이트에서 짙은 후광)
    }
    const pb = src('Playback.tsx');
    expect(pb).toMatch(/glass glass-sheet[^`]*text-tint/); // 결말 띠: 라이트 glass-sheet 는 흰 면
    expect(pb).not.toMatch(/glass-sheet[^`]*text-white/);
  });

  it('light-only rules are scoped with [html[data-theme=light]_&] (night keeps the v4 values)', () => {
    const ui = src('ui.tsx');
    expect(ui).toContain('[background:var(--board-bd)] [html[data-theme=light]_&]:[background:var(--board-bd-light)]');
    for (const tone of ['ok', 'warn', 'danger', 'cyan']) {
      expect(ui).toContain(`text-${tone} [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-${tone})_78%,var(--color-text))]`);
    }
  });
});

/* ---------------------------------------------------------------- 라이트 상태 알약 대비 */

const CSS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const lightBlock = /:root\[data-theme="light"\]\s*\{([^}]*)\}/.exec(CSS)![1];
const light = (name: string) => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(lightBlock);
  if (!m) throw new Error(`light ${name} 없음`);
  return m[1].trim();
};
type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const v = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as RGB;
};
const rgba = (s: string): [RGB, number] => {
  const m = /rgba?\(([^)]+)\)/.exec(s)!;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return [[p[0], p[1], p[2]], p[3] ?? 1];
};
const over = (fg: RGB, a: number, bg: RGB): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const lum = ([r, g, b]: RGB) => {
  const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: RGB, b: RGB) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('light status chips on the projector stay readable', () => {
  const bg = hex(light('--color-bg'));
  const [gc, ga] = rgba(light('--color-glass'));
  const glass = over(gc, ga, bg);
  const text = hex(light('--color-text'));
  const okPill = over(hex(light('--color-ok')), 0.07, glass); // 제출한 팀 알약 (bg-ok/[0.07]) 안의 칩

  it.each(['ok', 'warn', 'danger', 'cyan'])('%s chip ink (78%% tone + 22%% text) on its 12%% tint ≥ 4.5:1', (tone) => {
    const c = hex(light(`--color-${tone}`));
    const ink = over(c, 0.78, text);
    for (const [where, surface] of [['glass', glass], ['ok pill', okPill]] as const) {
      expect(contrast(ink, over(c, 0.12, surface)), `${tone} on ${where}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('violet / blue chips keep their token ink (already ≥ 4.5:1 on their tint)', () => {
    const vi = hex(light('--color-violet-ink'));
    expect(contrast(vi, over(hex(light('--color-violet')), 0.15, glass))).toBeGreaterThanOrEqual(4.5);
    const bh = hex(light('--color-blue-hover'));
    expect(contrast(bh, over(hex(light('--color-blue')), 0.12, glass))).toBeGreaterThanOrEqual(4.5);
  });
});
