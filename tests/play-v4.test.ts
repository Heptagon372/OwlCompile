// 팀 편집기·참가 화면 v4 (FEATURE_V4 §2·§4, DESIGN_V4 §6) 검사:
// - 팔레트 = 내 역할들의 블록 합집합 (팔레트 순서)
// - 놓는 순간 네온 링 flashKey → data-flash a/b 번갈이
// - "아키텍트 없음" 판정 = team.missingRoles
// - 라운드 표기 "R4 · 3/5 · 난이도 4"
// - 클라이언트 파일에 정답·서버·시뮬레이터 import 없음, 이모지 없음
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GAME_ROLES, roundPosition, type GameRole, type TeamView } from '@/lib/contracts';
import { BLOCK_ORDER, ROLES } from '@/lib/engine/blocks';
// .tsx 는 tsconfig jsx: preserve 라 vitest 가 못 읽는다 → 순수 .ts 모듈에서 가져온다 (Palette.tsx·TeamBar.tsx 가 다시 내보낸다)
import { paletteBlocks } from '@/components/blocks/paletteBlocks';
import { lacksArchitect } from '@/components/play/teamInfo';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const CLIENT_DIRS = ['components/play', 'components/blocks', 'components/code', 'lib/codegen', 'app/play', 'app/join'];
const files = CLIENT_DIRS.flatMap((d) => walk(join(ROOT, d)));

describe('palette = union of my roles', () => {
  it('single role → that role only, in palette order', () => {
    for (const r of GAME_ROLES) {
      const expected = BLOCK_ORDER.filter((id) => ROLES[r].blocks.includes(id));
      expect(paletteBlocks([r])).toEqual(expected);
    }
  });
  it('several roles → union without duplicates, in palette order', () => {
    const roles: GameRole[] = ['architect', 'runner'];
    const got = paletteBlocks(roles);
    const mine = new Set([...ROLES.architect.blocks, ...ROLES.runner.blocks]);
    expect(got).toEqual(BLOCK_ORDER.filter((id) => mine.has(id)));
    expect(new Set(got).size).toBe(got.length);
    expect(paletteBlocks([...GAME_ROLES])).toEqual(BLOCK_ORDER.filter((id) => GAME_ROLES.some((r) => ROLES[r].blocks.includes(id))));
  });
  it('no roles → empty palette', () => {
    expect(paletteBlocks([])).toEqual([]);
  });
});

describe('drop flash ring + hover sync wiring (source check)', () => {
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
  it('placed cards receive highlight + flashKey, editor feeds CodeView flashPaths/flashKey/hoverPath', () => {
    const stack = read('components/blocks/StackView.tsx');
    expect(stack).toMatch(/highlight=\{highlight\}/);
    expect(stack).toMatch(/flashKey=\{flashKey\}/);
    const code = read('components/blocks/EditorCode.tsx');
    expect(code).toMatch(/flashPaths=\{flashPaths\}/);
    expect(code).toMatch(/hoverPath=\{hoverPath\}/);
    expect(code).toMatch(/onHoverPath=\{onHoverPath\}/);
    expect(code).toMatch(/NeonTicker/);
  });
});

describe('architect warning', () => {
  const team = (missing: GameRole[]) => ({ missingRoles: missing }) as unknown as TeamView;
  it('follows team.missingRoles', () => {
    expect(lacksArchitect(team(['architect']))).toBe(true);
    expect(lacksArchitect(team(['runner', 'architect']))).toBe(true);
    expect(lacksArchitect(team(['runner']))).toBe(false);
    expect(lacksArchitect(team([]))).toBe(false);
  });
});

describe('round label', () => {
  it('"R4 · 3/5 · 난이도 4"', () => {
    expect(roundPosition([1, 2, 4, 5, 6], 4).label).toBe('R4 · 3/5 · 난이도 4');
  });
});

describe('client bundle safety (no answers, no simulator)', () => {
  it('scans the play/join/blocks/code sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });
  const FORBIDDEN = /from\s+['"][^'"]*(solutions|\/rounds\/|ROUND_EXTRAS|naive|noSleep|engine\/(run|sim|simulate|interp|exec)|lib\/db)[^'"]*['"]/;
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    it(`${rel}: no answer/simulator imports`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(FORBIDDEN);
      // 'use client' 파일은 서버 모듈을 가져오지 않는다 (서버 페이지만 세션 확인에 lib/server 사용)
      if (/^['"]use client['"]/.test(src.trimStart())) expect(src).not.toMatch(/from\s+['"]@\/lib\/server\//);
    });
    it(`${rel}: no emoji`, () => {
      // 이모지 표시 문자만 (주석의 ↔ 같은 화살표 기호는 Extended_Pictographic 이지만 이모지가 아니다)
      expect(readFileSync(f, 'utf8')).not.toMatch(/\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u);
    });
  }
});
