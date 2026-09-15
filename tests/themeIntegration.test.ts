// 라이트 모드 통합 검사 (docs/THEME_V5.md §3·§4·§5-4): 화면별 스윕 뒤 공통 부품에 남은 라이트 문제를 막는다.
// 모두 라이트 전용 덮어쓰기라 나이트(v4)는 같은 값 그대로다.
//  - 보라 면 카드 링크의 포커스 링은 카드 바깥 바탕 위에 그려진다 → 흰색 고정이면 라이트 바탕에서 사라진다 (tint 사용)
//  - 상태 칩 점 빛: 라이트에서는 같은 색 네온 대신 은은한 모드 토큰 그림자
//  - 프로젝터 새 1위 카드가 미끄러지는 동안(유리 면 + 흰 글자): 라이트 유리는 흰색이라 짙은 보라 유리로
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const LIGHT = '[html[data-theme=light]_&]:';

describe('light-mode integration fixes', () => {
  it('on-violet card links use a mode-aware focus ring (tint = white at night)', () => {
    const src = read('components/ui/Cards.tsx');
    const line = src.split('\n').find((l) => l.startsWith('const LINK_FX_ON_VIOLET'));
    expect(line).toBeDefined();
    expect(line).toContain('focus-visible:outline-tint');
    expect(line).not.toContain('outline-white');
    // tint 는 나이트 #FFFFFF (v4 의 흰 링과 같다)
    expect(read('app/globals.css')).toMatch(/@theme static \{[\s\S]*--color-tint: #FFFFFF;/);
  });

  it('chip status dots swap the neon glow for a soft token shadow in light only', () => {
    const src = read('components/ui/Chip.tsx');
    for (const tone of ['blue', 'violet', 'ok', 'warn', 'danger', 'cyan']) {
      const line = src.split('\n').find((l) => l.trimStart().startsWith(`${tone}: {`));
      expect(line, tone).toBeDefined();
      // 나이트 = v4 그대로 (같은 색 6px)
      expect(line, tone).toMatch(/shadow-\[0_0_6px_var\(--color-[a-z]+\)\]/);
      expect(line, tone).toContain('[--dot-glow-light:var(');
      expect(line, tone).toContain('${LIGHT_DOT}');
    }
    expect(src).toContain(`const LIGHT_DOT = '${LIGHT}shadow-[0_0_6px_var(--dot-glow-light)]'`);
  });

  it('projector: the sliding new 1st-place card stays readable in light', () => {
    const src = read('components/board/Scoreboard.tsx');
    expect(src).toContain(`const REVEAL_LIGHT_FILL = '${LIGHT}[--glass-fill:var(--color-violet-deep)]'`);
    expect(src).toMatch(/glass glass-sheet border border-stroke-strong \$\{REVEAL_LIGHT_FILL\}/);
    // violet-deep 는 라이트에서 바꾸지 않는다 (흰 글자 대비가 두 모드 같다)
    const css = read('app/globals.css');
    const light = css.slice(css.indexOf(':root[data-theme="light"] {'));
    expect(light.slice(0, light.indexOf('\n}'))).not.toContain('--color-violet-deep');
  });
});
