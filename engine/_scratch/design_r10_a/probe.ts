// 탐색 비용 측정 (R7 맵에서 def 없는 8·9블록 탐색 시간)
import * as r7 from '../../rounds/r7';
import { reachableActions, shortestProgram } from '../../verify-search';
import { toText } from '../../text';
import type { Program } from '../../types';
const oneLine = (p: Program) => toText(p).text.replace(/\n\s*/g, ' / ');
const time = (name: string, f: () => unknown) => {
  const t0 = performance.now();
  const v = f();
  const shown = v && typeof v === 'object' && 'program' in (v as object) ? `${(v as { blocks: number }).blocks}블록 ${oneLine((v as { program: Program }).program)}` : JSON.stringify(v);
  console.log(`[${((performance.now() - t0) / 1000).toFixed(1)}s] ${name}: ${shown}`);
};
const map = r7.map;
time('R7 BFS sleepless', () => reachableActions(map, { minMice: 0, exclude: ['sleep'] }));
time('R7 def-less ≤7 mice≥2', () => shortestProgram(map, { maxBlocks: 7, minMice: 2 }));
time('R7 def-less ≤8 mice≥2', () => shortestProgram(map, { maxBlocks: 8, minMice: 2 }));
time('R7 def-less ≤9 mice≥3 (none exist)', () => shortestProgram(map, { maxBlocks: 9, minMice: 3 }));
time('R7 def ≤10 no-cond mice≥2', () => shortestProgram(map, { maxBlocks: 10, minMice: 2, def: true, exclude: ['if_wall', 'if_pit'] }));
