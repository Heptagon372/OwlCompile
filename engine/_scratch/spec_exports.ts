// Type-only check: every name spec §1-§8 declares should be importable from the module the spec names.
import type { RunOptions } from '../run';          // spec §6: run.ts exports RunOptions
import type { TextLine } from '../text';           // spec §5
import type { Category, Role, Shape, BlockMeta } from '../blocks'; // spec §3
import type {
  Dir, Pos, OwlState, BlockId, Block, Program, Tile, CatPatrol, GameMap, Outcome, EventKind, Step,
  RunResult, ScoreLine, ScoreContext, Score, Validation, ValidationCode,
} from '../types';
import { run } from '../run';
import { toText, lineIndex } from '../text';
import { BLOCKS, BLOCK_ORDER, ROLES, countBlocks } from '../blocks';
import { validate } from '../validate';
import { score } from '../score';
import { MAPS, MAP_LIST } from '../maps';
import { SOLUTIONS } from '../solutions';
import { map, solutions, expect, naive, noSleep } from '../rounds/r5';
import * as idx from '../index';

const o: RunOptions = { maxTicks: 1 };
void [o, run, toText, lineIndex, BLOCKS, BLOCK_ORDER, ROLES, countBlocks, validate, score, MAPS, MAP_LIST, SOLUTIONS, map, solutions, expect, naive, noSleep];
// index should re-export the same
void [idx.run, idx.toText, idx.lineIndex, idx.validate, idx.score, idx.MAPS, idx.MAP_LIST, idx.SOLUTIONS, idx.BLOCKS, idx.BLOCK_ORDER, idx.ROLES, idx.countBlocks];
type _t = [Dir, Pos, OwlState, BlockId, Block, Program, Tile, CatPatrol, GameMap, Outcome, EventKind, Step, RunResult, ScoreLine, ScoreContext, Score, Validation, ValidationCode, TextLine, Category, Role, Shape, BlockMeta, idx.RunOptions, idx.TextLine];
