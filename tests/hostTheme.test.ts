// 진행자 화면 라이트 모드 (THEME_V5 §4): 팀 색은 모드 토큰으로, 흰색·검정 칠은 tint·그림자 토큰으로.
// 나이트는 v4 와 같아야 하므로 팀 토큰의 나이트 값이 서버 팀 색(TEAM_PRESETS)과 같은지도 본다.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEAM_PRESETS } from '@/lib/contracts';
import { teamColor } from '@/components/host/teamColor';

const ROOT = join(__dirname, '..');
const css = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('host team colours follow the theme', () => {
  it('maps every preset colour to its team token, case-insensitively', () => {
    TEAM_PRESETS.forEach((p, i) => {
      expect(teamColor(p.color)).toBe(`var(--color-team-${i + 1})`);
      expect(teamColor(p.color.toLowerCase())).toBe(`var(--color-team-${i + 1})`);
    });
  });

  it('leaves unknown colours alone', () => {
    expect(teamColor('#123456')).toBe('#123456');
    expect(teamColor('rebeccapurple')).toBe('rebeccapurple');
  });

  it('night team tokens are exactly the preset colours (night stays identical)', () => {
    const night = block('@theme static');
    TEAM_PRESETS.forEach((p, i) => {
      const m = night.match(new RegExp(`--color-team-${i + 1}:\\s*(#[0-9A-Fa-f]{6});`));
      expect(m?.[1]?.toUpperCase(), `team-${i + 1}`).toBe(p.color.toUpperCase());
    });
  });

  it('light mode overrides all ten team tokens', () => {
    const light = block(':root[data-theme="light"]');
    TEAM_PRESETS.forEach((_, i) => {
      expect(light).toMatch(new RegExp(`--color-team-${i + 1}:\\s*#[0-9A-Fa-f]{6};`));
    });
  });
});

describe('host screens use theme tokens', () => {
  const dir = join(ROOT, 'components/host');
  const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));

  it.each(files)('%s has no white/black washes or black shadows', (f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    // 흰색 칠은 bg-tint/… · border-tint/… (라이트에서 짙은 남보라), 검정 그림자는 --shadow-soft · --inset-shade* · --shadow-glass
    expect(src).not.toMatch(/\b(?:bg|border|ring|text)-(?:white|black)\/\[?[\d.]+\]?/);
    expect(src).not.toMatch(/rgba\(0,\s*0,\s*0,/);
  });

  it('team colours in inline styles go through teamColor()', () => {
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/(?:background|boxShadow):\s*`?[^`}\n]*\$\{(?:t|team)\.color\}/);
      expect(src, f).not.toMatch(/background:\s*color\b/);
    }
  });
});
