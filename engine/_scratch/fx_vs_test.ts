import { MAPS } from '../maps';
import { run, toText } from '../index';
import { shortestProgram } from '../verify-search';
const t = (label: string, f: () => ReturnType<typeof shortestProgram>, map = MAPS[2]) => {
  const t0 = Date.now(); const r = f(); const ms = Date.now() - t0;
  const rr = r ? run(map, r.program) : null;
  console.log(`${label}: ${r ? r.blocks + ' ' + rr!.outcome + ' mice ' + rr!.mice + ' :: ' + toText(r.program).text.replace(/\n\s*/g, ' / ') : 'none'} (${ms}ms)`);
};
t('R2 current def-free 2 mice <=8', () => shortestProgram(MAPS[2], { maxBlocks: 8, minMice: 2 }));
t('R2 current def-free 2 mice <=6', () => shortestProgram(MAPS[2], { maxBlocks: 6, minMice: 2 }));
t('R4 fixed no-if_pit 1 mouse <=6', () => shortestProgram(MAPS[4], { maxBlocks: 6, minMice: 1, exclude: ['if_pit'] }), MAPS[4]);
t('R4 fixed 1 mouse <=5', () => shortestProgram(MAPS[4], { maxBlocks: 5, minMice: 1 }), MAPS[4]);
t('R4 fixed 2 mice <=7', () => shortestProgram(MAPS[4], { maxBlocks: 7, minMice: 2 }), MAPS[4]);
t('R4 fixed 1 mouse <=6 (finds representative-level)', () => shortestProgram(MAPS[4], { maxBlocks: 6, minMice: 1 }), MAPS[4]);
t('R1 2 mice <=4', () => shortestProgram(MAPS[1], { maxBlocks: 4, minMice: 2 }), MAPS[1]);
