// 블록 → 코드 (파이썬식 / 한국어) 순수 함수 모음. 클라이언트 번들 안전: 엔진 정답(solutions·rounds)을 가져오지 않는다.
import type { Program } from '@/lib/engine/types';
import { toKorean } from './korean';
import { toPython } from './python';
import type { CodeLang, CodeListing } from './types';

export * from './types';
export { toPython, toPythonText, pyHeadTokens, lineOfPath, PY_INDENT } from './python';
export { toKorean, koHeadTokens, KO_INDENT } from './korean';
export { diffListings, type LineChange, type ListingDiff, type RemovedLine } from './diff';

/** 언어별 줄 목록 */
export function toListing(program: Program, lang: CodeLang = 'python'): CodeListing {
  return lang === 'korean' ? toKorean(program) : toPython(program);
}
