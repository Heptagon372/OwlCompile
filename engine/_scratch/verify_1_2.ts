import { run } from '../index';
import type { GameMap, Program } from '../types';
const mk = (tiles: string[]): GameMap => ({ round: 1, name: 't', difficulty: '쉬움', cap: 12, seconds: 60, intro: '', tiles, startDir: 'E' });
const pad = (rows: string[]) => [...rows, ...Array(8 - rows.length).fill('########')];
const fmt = (tag: string, m: GameMap, p: Program) => { const r = run(m, p);
  console.log(tag, r.outcome, `"${r.message}"`, r.trace.slice(1).map((s) => `${s.tick}:${s.block}@${s.owl.x},${s.owl.y}${s.event ? '/' + s.event : ''}`).join(' ')); };
const iw: Program = [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }];
fmt('WITH key :', mk(pad(['########', '#SKD.G.#'])), [{ id: 'forward' }, ...iw]);
fmt('NO key   :', mk(pad(['########', '#S.D.G.#'])), [{ id: 'forward' }, ...iw]);
