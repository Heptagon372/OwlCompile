// Scratch: run shorthand programs on a (possibly overridden) round map with the real engine.
// npx tsx engine/_scratch/fx_probe.ts <round> "<prog>" ["<prog>" ...]   env TILES='[...]' DIR=E
// shorthand: F J L R Z(sleep) C(call)  rep3{...}  iw{then|else}  ip{then|else}  def{...}
import { MAPS } from '../maps';
import { run, score, validate, countBlocks } from '../index';
import type { Block, Dir, GameMap, Program } from '../index';

export function parse(src: string): Program {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  function list(stop: string[]): Block[] {
    const out: Block[] = [];
    for (;;) {
      ws();
      if (i >= src.length || stop.includes(src[i])) return out;
      out.push(block());
    }
  }
  function body(): Block[] { ws(); if (src[i] !== '{') throw new Error(`{ expected at ${i}`); i++; const b = list(['}']); i++; return b; }
  function block(): Block {
    const c = src[i];
    const simple: Record<string, Block> = { F: { id: 'forward' }, J: { id: 'jump' }, L: { id: 'left' }, R: { id: 'right' }, Z: { id: 'sleep' }, C: { id: 'call' } };
    if (simple[c]) { i++; return { ...simple[c] }; }
    if (src.startsWith('rep', i)) { i += 3; const m = /^\d+/.exec(src.slice(i))!; i += m[0].length; return { id: 'repeat', n: Number(m[0]), body: body() }; }
    if (src.startsWith('def', i)) { i += 3; return { id: 'def', body: body() }; }
    if (src.startsWith('iw', i) || src.startsWith('ip', i)) {
      const id = src.startsWith('iw', i) ? 'if_wall' : 'if_pit'; i += 2; ws();
      if (src[i] !== '{') throw new Error(`{ expected at ${i}`); i++;
      const t = list(['|', '}']); let e: Block[] = [];
      if (src[i] === '|') { i++; e = list(['}']); }
      i++;
      return { id, then: t, else: e };
    }
    throw new Error(`bad token '${c}' at ${i} in ${src}`);
  }
  const p = list([]);
  return p;
}

export function mapFor(round: 1 | 2 | 3 | 4 | 5): GameMap {
  let map: GameMap = MAPS[round];
  if (process.env.TILES) map = { ...map, tiles: JSON.parse(process.env.TILES) as string[] };
  if (process.env.DIR) map = { ...map, startDir: process.env.DIR as Dir };
  return map;
}

if (process.argv[1]?.includes('fx_probe')) {
  const round = Number(process.argv[2]) as 1 | 2 | 3 | 4 | 5;
  const map = mapFor(round);
  for (const src of process.argv.slice(3)) {
    const p = parse(src);
    const v = validate(p, map);
    const r = run(map, p);
    const acts = r.trace.slice(1).map((s) => ({ forward: 'F', jump: 'J', left: 'L', right: 'R', sleep: 'Z' } as Record<string, string>)[s.block ?? ''] ?? '?').join('');
    const sc = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false }).total;
    console.log(`${src}  => blocks ${countBlocks(p)} valid ${v.ok}${v.ok ? '' : ' ' + v.codes.join(',')} | ${r.outcome} "${r.message}" t${r.ticks} mice ${r.mice} @(${r.owl.x},${r.owl.y}) score ${sc} | ${acts}`);
  }
}
