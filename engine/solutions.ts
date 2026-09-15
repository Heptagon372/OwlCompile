// OWL COMPILE — 라운드별 정답 모음 (docs/ENGINE_SPEC.md §8). rounds/*에서 모은다.
// SOLUTIONS.rN[0]이 대표 정답. 예) SOLUTIONS.r3[0] = 반복 4 { 반복 5 { 만약 앞이 벽이면 { 우회전 } 아니면 { 앞으로 } } }
import type { Program } from './types';
import * as r1 from './rounds/r1';
import * as r2 from './rounds/r2';
import * as r3 from './rounds/r3';
import * as r4 from './rounds/r4';
import * as r5 from './rounds/r5';
import * as r6 from './rounds/r6';
import * as r7 from './rounds/r7';

export const SOLUTIONS: {
  r1: Program[]; r2: Program[]; r3: Program[]; r4: Program[]; r5: Program[]; r6: Program[]; r7: Program[];
} = {
  r1: r1.solutions,
  r2: r2.solutions,
  r3: r3.solutions,
  r4: r4.solutions,
  r5: r5.solutions,
  r6: r6.solutions,
  r7: r7.solutions,
};

/** 교육용 부록: 반복/함수/센서 없이 짠 긴 버전(naive)과 R5·R7의 잠자기 뺀 실패 버전(noSleep). */
export interface NaiveProgram { program: Program; note: string }

export const ROUND_EXTRAS: {
  r1: { naive: NaiveProgram };
  r2: { naive: NaiveProgram };
  r3: { naive: NaiveProgram };
  r4: { naive: NaiveProgram };
  r5: { naive: NaiveProgram; noSleep: Program };
  r6: { naive: NaiveProgram };
  r7: { naive: NaiveProgram; noSleep: Program };
} = {
  r1: { naive: r1.naive },
  r2: { naive: r2.naive },
  r3: { naive: r3.naive },
  r4: { naive: r4.naive },
  r5: { naive: r5.naive, noSleep: r5.noSleep },
  r6: { naive: r6.naive },
  r7: { naive: r7.naive, noSleep: r7.noSleep },
};
