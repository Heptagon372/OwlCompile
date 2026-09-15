// 해·달 토글 접근성·자리 (docs/THEME_V5.md §1·§2·§5-1). .tsx 는 vitest 가 못 읽어(jsx: preserve) 소스를 읽어 확인한다.
//  - role="switch" + aria-checked={night} + 바뀌지 않는 이름 "나이트 모드" → "나이트 모드, 스위치, 켜짐/꺼짐" (이름이 상태와 어긋나지 않는다)
//  - 툴팁(보이는 글자)은 바뀔 모드 이름
//  - 셸 머리 줄은 compactHeader(/play)에서도 토글을 숨기지 않는다 (폰에서는 작은 토글)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const TOGGLE = read('components/ui/ThemeToggle.tsx');
const SHELL = read('components/ui/AppShell.tsx');
const CSS = read('app/globals.css');

describe('ThemeToggle 스위치 이름·상태', () => {
  it('role=switch, aria-checked 는 나이트, 이름은 두 모드 모두 "나이트 모드"', () => {
    expect(TOGGLE).toContain('role="switch"');
    expect(TOGGLE).toContain('aria-checked={night}');
    expect(TOGGLE).toContain('aria-label="나이트 모드"');
    // 상태에 따라 바뀌는 행동 문구("…로 바꾸기")를 이름으로 쓰지 않는다
    expect(TOGGLE).not.toMatch(/aria-label=\{/);
    expect(TOGGLE).not.toMatch(/로 바꾸기`/);
  });

  it('툴팁은 바뀔 모드 이름 (보이는 글자, 스크린리더에는 숨김)', () => {
    expect(TOGGLE).toContain("const target = night ? '라이트 모드' : '나이트 모드'");
    expect(TOGGLE).toMatch(/<span className="owl-tt-tip" aria-hidden="true">\s*\{target\}/);
  });
});

describe('셸 머리 줄의 토글', () => {
  it('compactHeader(/play)에서도 폰에서 숨기지 않는다 — 작은 토글', () => {
    expect(SHELL).not.toContain('max-sm:hidden');
    expect(SHELL).toContain("<ThemeToggle size={compact ? 'compact' : 'md'} />");
    expect(TOGGLE).toContain("data-size={size === 'compact' ? 'compact' : undefined}");
  });

  it('작은 토글도 버튼 높이 44px (터치 영역), 트랙만 줄인다', () => {
    const m = /@media \(max-width: 639\.98px\) \{\s*\.owl-tt\[data-size="compact"\] \{\s*width: (\d+)px;\s*\}\s*\.owl-tt\[data-size="compact"\] \.owl-tt-track \{\s*scale: ([\d.]+);\s*margin-inline: -(\d+)px;/.exec(CSS);
    expect(m).not.toBeNull();
    const [, w, s, mi] = m!;
    expect(+w).toBeGreaterThanOrEqual(44);
    // 72px 트랙의 레이아웃 폭(72 - 2·여백)이 버튼 폭과 같고, 줄인 트랙(72·s)이 버튼 안에 들어간다
    expect(72 - 2 * +mi).toBe(+w);
    expect(72 * +s).toBeLessThanOrEqual(+w);
    expect(/\.owl-tt \{[^}]*height: 44px;/.exec(CSS)).not.toBeNull();
  });
});
