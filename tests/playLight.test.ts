// 팀 편집기·참가 화면 라이트 모드 (docs/THEME_V5.md §3·§4·§5-4) 검사:
// - 화면 코드에 밝은 면에서 사라지는 흰·검정 칠(bg-white/… · border-white/… · bg-black/…)이 라이트 덮어쓰기 없이 남지 않는다
//   (옅은 칠은 모드 토큰 tint: 나이트 #FFFFFF 라 v4 와 똑같다)
// - 서버 팀 색(TEAM_PRESETS 나이트 hex)은 화면에서 var(--color-team-N) 으로 (흰올빼미 #E8E4FF 가 흰 면에서 안 보이는 문제)
// - 라이트 블록 빛(--blk-glow)은 파인 면 위 3:1 이상, 휴지통 위 danger 글자는 물든 면 위 4.5:1 이상
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TEAM_PRESETS } from '@/lib/contracts';
import { teamColor } from '@/components/play/teamColor';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const UI_DIRS = ['components/play', 'components/blocks', 'app/play', 'app/join'];
const files = UI_DIRS.flatMap((d) => walk(join(ROOT, d)));
const LIGHT_VARIANT = '[:root[data-theme=light]_&]:';

describe('light-safe classes in play/join/blocks', () => {
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    it(`${rel}: no white/black washes without a light override`, () => {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;
        // 옅은 흰 칠·흰 테두리는 tint 로 (text-white 는 색 면 위 글자라 두 모드 같다)
        expect(line, `${rel}:${i + 1}`).not.toMatch(/\b(bg|border|ring|outline|from|to|via)-white\//);
        // 검정 막은 라이트 덮어쓰기와 짝으로만
        if (/\bbg-black\//.test(line)) expect(line, `${rel}:${i + 1}`).toContain(LIGHT_VARIANT);
        // 검정 그림자 값은 모드 토큰(--shadow-glass · --shadow-panel-active …)으로
        expect(line, `${rel}:${i + 1}`).not.toMatch(/rgba\(0,\s*0,\s*0/);
        // 팀 색은 TeamDot · teamColor 로 (서버 hex 를 바로 칠하지 않는다)
        expect(line, `${rel}:${i + 1}`).not.toMatch(/(background|boxShadow)\s*:\s*[^,}]*\.color\b/);
      });
    });
  }
});

describe('team colours → mode tokens', () => {
  it('each preset maps to var(--color-team-N) in order, case-insensitive', () => {
    TEAM_PRESETS.forEach((p, i) => {
      expect(teamColor(p.color)).toBe(`var(--color-team-${i + 1})`);
      expect(teamColor(` ${p.color.toLowerCase()} `)).toBe(`var(--color-team-${i + 1})`);
    });
  });
  it('unknown colours pass through', () => {
    expect(teamColor('#123456')).toBe('#123456');
  });
});

/* ---------------------------------------------------------------- 대비 (라이트) */

type RGBA = [number, number, number, number];
const CSS = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

function parseColor(s: string): RGBA {
  const v = s.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)).concat(1) as RGBA;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i.exec(v);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`색이 아니다: ${s}`);
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as RGBA;
function luminance([r, g, b]: RGBA): number {
  const f = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: RGBA, b: RGBA): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** 한 규칙 본문 (선택자 그대로, 첫 번째) */
function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`규칙 없음: ${selector}`);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}
function declIn(body: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body);
  if (!m) throw new Error(`${name} 없음`);
  return m[1].trim();
}
const LIGHT_ROOT = ruleBody(':root[data-theme="light"]');
const L = (name: string) => parseColor(declIn(LIGHT_ROOT, name));

/** 라이트 면: 바탕 → 유리 → 파인 면 (편집기 블록 칸 = glass 패널 안의 surface-inset) */
const bg = L('--color-bg');
const glass = over(L('--color-glass'), bg);
const inset = over(L('--color-glass-inset'), glass);

describe('light block glow (hover ring · drop ring) is visible on the editor surface', () => {
  it.each(['.move', '.turn', '.control', '.special', '.function'])('%s --blk-glow ≥ 3:1 on glass-inset and glass', (cls) => {
    const sel = `:root[data-theme="light"] ${cls}`;
    // 같은 선택자 규칙이 여럿이면 마지막 --blk-glow 가 이긴다
    const bodies = CSS.split(`${sel} {`).slice(1).map((s) => s.slice(0, s.indexOf('}')));
    const glows = bodies.map((b) => /--blk-glow\s*:\s*([^;]+);/.exec(b)?.[1]).filter(Boolean) as string[];
    expect(glows.length, `${cls} light --blk-glow`).toBeGreaterThan(0);
    const glow = parseColor(glows[glows.length - 1]);
    expect(contrast(glow, inset), `${cls} on inset`).toBeGreaterThanOrEqual(3);
    expect(contrast(glow, glass), `${cls} on glass`).toBeGreaterThanOrEqual(3);
  });
  it('light flash keyframes exist for both a/b and are wired under no-preference', () => {
    expect(CSS).toMatch(/@keyframes owl-flash-light-a\s*\{/);
    expect(CSS).toMatch(/@keyframes owl-flash-light-b\s*\{/);
    expect(CSS).toMatch(/:root\[data-theme="light"\] \.cblk\[data-flash="b"\]\s*\{\s*animation-name: owl-flash-light-b;/);
  });
});

describe('trash (light): danger label stays ≥ 4.5:1 on the tinted sheet', () => {
  it('uses a light-only danger mix that keeps contrast', () => {
    const src = read('components/blocks/Trash.tsx');
    const m = /data-theme=light\]_&\]:\[--glass-fill:color-mix\(in_srgb,var\(--color-danger\)_(\d+)%,var\(--glass-sheet-fill\)\)\]/.exec(src);
    expect(m, 'light trash fill').not.toBeNull();
    const p = Number(m![1]) / 100;
    const danger = L('--color-danger');
    const sheet = L('--glass-sheet-fill');
    // color-mix(in srgb) 는 알파까지 섞는다 (미리 곱한 값으로 보간)
    const a = danger[3] * p + sheet[3] * (1 - p);
    const mix = [0, 1, 2].map((i) => (danger[i] * danger[3] * p + sheet[i] * sheet[3] * (1 - p)) / a).concat(a) as RGBA;
    // 시트 뒤는 흐린 바탕 (가장 흔한 경우) 과 편집기 파인 면
    for (const behind of [bg, inset]) {
      expect(contrast(danger, over(mix, behind)), `danger on trash (${p * 100}%)`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
