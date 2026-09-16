// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// OWL COMPILE — 제출 가능 여부 검사 (docs/ENGINE_SPEC.md §4)
// 전부 검사하고 전부 보고한다(첫 에러에서 멈추지 않음).
import type { Block, GameMap, Program, Validation, ValidationCode } from './types';
import { countBlocks, isCoopBlockId, isKnownBlockId, slotsOf } from './blocks';

const MESSAGES: Record<Exclude<ValidationCode, 'E_CAP'>, string> = {
  E_EMPTY: '블록이 하나도 없다',
  E_DEF_NESTED: '함수 F는 맨 바깥에만 둘 수 있다',
  E_DEF_MULTI: '함수 F는 하나만 정의할 수 있다',
  E_CALL_NO_DEF: '함수 F가 정의되지 않았다',
  E_RECURSION: '함수 F 안에서 F를 부를 수 없다',
  E_REPEAT_N: '반복 횟수는 1~9',
  E_UNKNOWN_BLOCK: '알 수 없는 블록',
  E_COOP_ONLY: '협동 게임 전용 블록',
};

/** 보고 순서 = 스펙 표 순서. */
const CODE_ORDER: ValidationCode[] = [
  'E_EMPTY', 'E_CAP', 'E_DEF_NESTED', 'E_DEF_MULTI',
  'E_CALL_NO_DEF', 'E_RECURSION', 'E_REPEAT_N', 'E_UNKNOWN_BLOCK', 'E_COOP_ONLY',
];

/** 트리 안 어딘가에 협동 게임 전용 블록(toggle·spawn)이 있는가. 알 수 없는 블록은 내려가지 않는다. */
export function containsCoopBlock(blocks: Block[]): boolean {
  return blocks.some((b) => (isKnownBlockId(b.id) && isCoopBlockId(b.id)) || slotsOf(b).some(containsCoopBlock));
}

/** 트리 안 어딘가(깊이 무관)에 id 블록이 있는가. 알 수 없는 블록은 내려가지 않는다. */
export function containsBlock(blocks: Block[], id: Block['id']): boolean {
  return blocks.some((b) => b.id === id || slotsOf(b).some((s) => containsBlock(s, id)));
}

export function isValidRepeatN(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 9;
}

/** 최상위 def (첫 번째). run()도 같은 규칙으로 함수를 찾는다. */
export function findDef(program: Program): { index: number; body: Block[] } | null {
  const index = program.findIndex((b) => b.id === 'def');
  if (index < 0) return null;
  const d = program[index] as Extract<Block, { id: 'def' }>;
  return { index, body: d.body };
}

export function validate(program: Program, map: GameMap): Validation {
  const found = new Set<ValidationCode>();
  const blocks = countBlocks(program);
  const cap = map.cap;

  if (blocks === 0) found.add('E_EMPTY');
  if (blocks > cap) found.add('E_CAP');

  // 트리 전체를 한 번 훑으며 구조 규칙을 모은다.
  let defCount = 0;
  const walk = (list: Block[], top: boolean): void => {
    for (const b of list) {
      if (!isKnownBlockId(b.id)) { found.add('E_UNKNOWN_BLOCK'); continue; }
      // 협동 게임 전용 블록은 게임 1(라운드 게임)에서 쓸 수 없다 (COOP_SPEC §2). validateCoop은 이 규칙만 뺀다.
      if (isCoopBlockId(b.id)) found.add('E_COOP_ONLY');
      if (b.id === 'def') {
        defCount += 1;
        if (!top) found.add('E_DEF_NESTED');
        if (containsBlock(b.body, 'call')) found.add('E_RECURSION');
      }
      if (b.id === 'repeat' && !isValidRepeatN(b.n)) found.add('E_REPEAT_N');
      for (const slot of slotsOf(b)) walk(slot, false);
    }
  };
  walk(program, true);

  if (defCount >= 2) found.add('E_DEF_MULTI');
  // call이 부를 수 있는 것은 최상위 def뿐이다.
  if (containsBlock(program, 'call') && !findDef(program)) found.add('E_CALL_NO_DEF');

  const codes = CODE_ORDER.filter((c) => found.has(c));
  const errors = codes.map((c) => (c === 'E_CAP' ? `블록 상한 초과 (${blocks}/${cap})` : MESSAGES[c]));
  return { ok: codes.length === 0, errors, codes, blocks, cap };
}
