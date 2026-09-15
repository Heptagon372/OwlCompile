// 코드 뷰 공용 타입 (docs/FEATURE_V4.md §4). 순수 타입: 서버·클라이언트 어디서나.
import type { BlockId } from '@/lib/engine/types';

/** 토큰 종류 (DESIGN_V4 §5 문법 색): keyword #C4A8FF · builtin #7FF0FF · call #F4F1FF · number #F5B94A · punct #8C86A8 · comment #6F6A8C */
export type CodeTokenKind = 'keyword' | 'builtin' | 'call' | 'number' | 'punct' | 'comment';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

export interface CodeLine {
  /** 렌더 사이에서 같은 줄을 알아보는 키 (블록 uid 기반, 없으면 경로 기반). 새 줄·바뀐 줄·지운 줄 판정에 쓴다 */
  key: string;
  /** 들여쓰기를 포함한 줄 전체 */
  text: string;
  /** 들여쓰기를 뺀 부분 (= tokens 를 이은 것) */
  code: string;
  /** 들여쓰기 깊이 (0 = 최상위) */
  indent: number;
  /** 이 줄이 머리 줄인 블록의 AST 경로 (else·pass·닫는 줄은 null). Step.path 와 같은 규칙 */
  path: number[] | null;
  /** 이 줄이 속한 블록의 경로 (머리 줄은 path 와 같다, else·pass·닫는 줄은 감싸는 C-블록). 호버 연동용 */
  owner: number[] | null;
  /** 머리 줄 블록 id (else·pass·닫는 줄은 null) */
  blockId: BlockId | null;
  tokens: CodeToken[];
}

export interface CodeListing {
  lines: CodeLine[];
  /** pathKey(path) → 줄 번호(0-based). 모든 블록 머리 줄 (C-블록 포함) */
  lineOf: Map<string, number>;
  /** 줄을 \n 으로 이은 전체 글 */
  text: string;
}

/** 코드 뷰 언어: 파이썬식 / 한국어(엔진 toText) */
export type CodeLang = 'python' | 'korean';
