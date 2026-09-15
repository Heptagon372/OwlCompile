// OWL COMPILE — 7라운드 맵 (docs/ENGINE_SPEC.md §8). rounds/r1.ts … r7.ts 를 모아 export.
import type { GameMap } from './types';
import { map as r1 } from './rounds/r1';
import { map as r2 } from './rounds/r2';
import { map as r3 } from './rounds/r3';
import { map as r4 } from './rounds/r4';
import { map as r5 } from './rounds/r5';
import { map as r6 } from './rounds/r6';
import { map as r7 } from './rounds/r7';

export type RoundNo = GameMap['round'];

export const MAPS: Record<RoundNo, GameMap> = { 1: r1, 2: r2, 3: r3, 4: r4, 5: r5, 6: r6, 7: r7 };

/** 라운드 순서(1 → 7). */
export const MAP_LIST: GameMap[] = [r1, r2, r3, r4, r5, r6, r7];
