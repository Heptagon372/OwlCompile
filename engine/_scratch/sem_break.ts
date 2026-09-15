// Adversarial semantics probe (reviewer scratch). Run: npx tsx engine/_scratch/sem_break.ts
import { run, validate, score, toText, countBlocks, lineIndex, pathKey, MAPS } from '../index';
import type { Block, GameMap, Program, RunResult, CatPatrol, Dir } from '../types';

const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const SL: Block = { id: 'sleep' }, C: Block = { id: 'call' };
const rep = (n: number, body: Block[]): Block => ({ id: 'repeat', n, body });
const ifw = (then: Block[], els: Block[] = []): Block => ({ id: 'if_wall', then, else: els });
const ifp = (then: Block[], els: Block[] = []): Block => ({ id: 'if_pit', then, else: els });
const def = (body: Block[]): Block => ({ id: 'def', body });

function mk(rows: string[], dir: Dir = 'E', cat?: CatPatrol, cap = 12): GameMap {
  const tiles = [...rows];
  while (tiles.length < 8) tiles.push('########');
  if (!tiles.join('').includes('G')) tiles[7] = '#######G';
  return { round: 1, name: 't', difficulty: '쉬움', cap, seconds: 1, intro: '', tiles: tiles.map((r) => r.padEnd(8, '#')), startDir: dir, cat };
}
const last = (r: RunResult) => r.trace[r.trace.length - 1];
const brief = (r: RunResult) => ({ o: r.outcome, m: r.message, t: r.ticks, mice: r.mice, d: r.distance, owl: r.owl, cat: r.cat, ev: last(r).event, keys: last(r).keys });
let n = 0;
const show = (label: string, v: unknown) => console.log(`[${++n}] ${label}: ${JSON.stringify(v)}`);

function invariants(r: RunResult, label: string) {
  const bad: string[] = [];
  if (r.ticks !== r.trace.length - 1) bad.push('ticks!=len-1');
  r.trace.forEach((s, i) => { if (s.tick !== i) bad.push(`tick[${i}]=${s.tick}`); });
  const t0 = r.trace[0];
  if (t0.block !== null || t0.line !== null || t0.path !== null || t0.event !== null) bad.push('tick0 not null');
  for (let i = 1; i < r.trace.length; i++) {
    const a = r.trace[i - 1], b = r.trace[i];
    if (b.mice < a.mice || b.opened.length < a.opened.length || b.eaten.length < a.eaten.length || b.taken.length < a.taken.length) bad.push(`nonmono@${i}`);
    if (b.block === null || b.line === null || b.path === null) bad.push(`null action@${i}`);
  }
  if (r.mice !== last(r).mice) bad.push('mice mismatch');
  if (JSON.stringify(r.owl) !== JSON.stringify(last(r).owl)) bad.push('owl mismatch');
  if (JSON.stringify(r.cat) !== JSON.stringify(last(r).cat)) bad.push('cat mismatch');
  // line check
  const idx = lineIndex(([] as Program)); void idx;
  show(`INV ${label}`, bad.length ? bad : 'ok');
}

// ---------- 1. nested if inside repeat inside def called from inside repeat; line numbers through call
{
  const m = mk(['#S.....#', '########'], 'E');
  const prog: Program = [
    rep(2, [C]),
    def([rep(3, [ifw([R, R], [F])])]),
  ];
  const r = run(m, prog);
  const { lines } = toText(prog);
  show('nested def/call text', lines.map((l) => l.text));
  show('nested def/call run', brief(r));
  show('lines per step', r.trace.slice(1).map((s) => [s.tick, s.block, s.line, s.path, lines[s.line!]?.text.trim()]));
  const li = lineIndex(prog);
  show('line==lineIndex(path) all', r.trace.slice(1).every((s) => s.line === li.get(pathKey(s.path!))));
  invariants(r, 'nested');
}

// ---------- 2. repeat n bounds / invalid
{
  const m = MAPS[1];
  for (const nn of [1, 9, 0, 10, 2.5, NaN, -1, Infinity]) {
    const prog = [rep(nn, [SL])];
    const v = validate(prog, m);
    const r = run(m, prog, { maxTicks: 50 });
    show(`repeat n=${nn}`, { v: v.codes, ticks: r.ticks, o: r.outcome, text: toText(prog).text.split('\n')[0] });
  }
}

// ---------- 3. call before def, after def, two calls, def in middle
{
  const m = mk(['#S.....G'], 'E');
  const progs: Record<string, Program> = {
    callBefore: [C, def([F, F])],
    callAfter: [def([F, F]), C],
    twoCalls: [C, def([F, F]), C],
    defMiddle: [F, def([F]), C, C, F],
    defOnly: [def([F])],
    defEmptyCall: [def([]), C, C],
  };
  for (const [k, p] of Object.entries(progs)) {
    const r = run(m, p);
    show(`call ${k}`, { v: validate(p, m).codes, ...brief(r), lines: r.trace.slice(1).map((s) => s.line) });
  }
}

// ---------- 4. jump edges
{
  // jump from x=6 facing E: mid x=7 in bounds, landing x=8 OOB
  const m1 = mk(['######S.'], 'E');
  show('jump landing OOB', brief(run(m1, [J])));
  const m2 = mk(['#######S'], 'E');
  show('jump mid OOB', brief(run(m2, [J])));
  // jump over pit landing exactly on goal
  const m3 = mk(['#SOG####'], 'E');
  show('jump onto goal', brief(run(m3, [J])));
  // landing on key
  const m4 = mk(['#S.KD.G#'], 'E');
  const r4 = run(m4, [J, F, F, F]);
  show('jump onto key then door then goal', { ...brief(r4), events: r4.trace.map((s) => s.event) });
  // key then two doors
  const m5 = mk(['#SKD.D.G'], 'E');
  const r5 = run(m5, [F, F, F, F, F, F]);
  show('key then two doors', { ...brief(r5), events: r5.trace.map((s) => s.event) });
  // door on the edge (x=7), holding key
  const m6 = mk(['#.....SD', '######G#'], 'E');
  show('door on edge no key', brief(run(m6, [F])));
  // jump landing on locked door without key, with key
  const m7 = mk(['#S.D.G##'], 'E');
  show('jump onto locked door no key', brief(run(m7, [J])));
  const m8 = mk(['#SKD.G##'], 'E');
  const r8 = run(m8, [F, J]);
  show('jump over locked door with key (mid)', brief(r8));
  const m9 = mk(['#SK.D.G#'], 'E');
  const r9 = run(m9, [F, J, F, F]);
  show('jump onto locked door with key', { ...brief(r9), events: r9.trace.map((s) => s.event) });
}

// ---------- 5. goal adjacent / goal at maxTicks
{
  const m = mk(['#SG.....'], 'E');
  show('goal adjacent', brief(run(m, [F])));
  const m2 = mk(['#S....G#'], 'E');
  // 5 forwards reach goal at tick 5; set maxTicks 5
  const r = run(m2, [F, F, F, F, F], { maxTicks: 5 });
  show('goal exactly on maxTicks', { ...brief(r), lastEv: last(r).event });
  const r2 = run(m2, [SL, SL, SL], { maxTicks: 3 });
  show('program ends exactly on maxTicks (no goal)', { ...brief(r2), lastEv: last(r2).event });
  const r3 = run(m2, [F, F, F], { maxTicks: 0 });
  show('maxTicks 0', brief(r3));
  const mm = mk(['#SM...G#'], 'E');
  const r4 = run(mm, [F, F], { maxTicks: 1 });
  show('mouse on timeout tick (event overwritten?)', { ...brief(r4), lastEv: last(r4).event, lastMsg: last(r4).message });
}

// ---------- 6. cats
{
  const row = '#S.ccc.G';
  // path length 1 both modes, owl walks into stationary cat
  for (const mode of ['loop', 'pingpong'] as const) {
    const m = mk([row], 'E', { path: [{ x: 3, y: 0 }], mode });
    const r = run(m, [F, F]);
    show(`cat len1 ${mode}`, { ...brief(r), cats: r.trace.map((s) => s.cat) });
  }
  for (const mode of ['loop', 'pingpong'] as const) {
    const m = mk([row], 'E', { path: [{ x: 4, y: 0 }, { x: 5, y: 0 }], mode });
    const r = run(m, [SL, SL, SL, SL]);
    show(`cat len2 ${mode}`, { cats: r.trace.map((s) => s.cat && s.cat.x) });
  }
  // cat starting on owl's start cell
  {
    const m = mk(['#c.ccc.G'.replace('c', 'S')], 'E', { path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
    const r = run(m, [SL]);
    show('cat starts on owl (tick0 overlap)', { o: r.outcome, t0cat: r.trace[0].cat, t0owl: r.trace[0].owl, t1: brief(r) });
  }
  // owl sleeping while cat walks onto it
  {
    const m = mk(['#.Sccc.G'], 'E', { path: [{ x: 3, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
    const r = run(m, [SL]);
    show('cat walks onto sleeping owl', brief(r));
  }
  // swap: owl at 2 forward to 3 while cat at 3 moves to 2
  {
    const m = mk(['#.S.cc.G'], 'E', { path: [{ x: 3, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
    const r = run(m, [F]);
    show('swap via forward', brief(r));
  }
  // jump over cat while cat moves to owl's old cell (pass-through)
  {
    const m = mk(['#.S...G#'], 'E', { path: [{ x: 3, y: 0 }, { x: 2, y: 0 }], mode: 'pingpong' });
    const r = run(m, [J]);
    show('jump over cat, cat takes owl old cell', { ...brief(r), cats: r.trace.map((s) => s.cat) });
  }
  // mice on dead outcome + score
  {
    const m = mk(['#SMO...G'], 'E');
    const r = run(m, [F, F]);
    const s = score(r, { cap: 12, firstSubmit: true, usedPatch: true });
    show('mice on dead', { ...brief(r), score: s });
  }
}

// ---------- 7. if_wall facing door with key, then losing key
{
  const m = mk(['#SKDD..G'], 'E');
  // pick key (t1), sense wall ahead (door with key) -> not wall -> forward opens door (t2), sense next door (no key) -> wall -> right
  const prog: Program = [F, ifw([L], [F]), ifw([R], [F])];
  const r = run(m, prog);
  show('if_wall door key then lose key', { ...brief(r), blocks: r.trace.map((s) => s.block), ev: r.trace.map((s) => s.event) });
}

// ---------- 8. score edge
{
  const base = run(mk(['#S....G#'], 'E'), [SL]);
  show('stuck d=5 score', score(base, { cap: 12, firstSubmit: true, usedPatch: false }));
  const comp = run(mk(['#S....G#'], 'E'), [C]);
  show('compile error run + score', { ...brief(comp), s: score(comp, { cap: 12, firstSubmit: true, usedPatch: false }) });
  for (const k of [1, 2, 3, 4, 5] as const) {
    const r = run(MAPS[k], [SL]);
    show(`R${k} single sleep score`, { o: r.outcome, d: r.distance, s: score(r, { cap: MAPS[k].cap, firstSubmit: true, usedPatch: false }).total });
  }
}

// ---------- 9. countBlocks / validate combos
{
  const m = MAPS[1];
  const cases: Record<string, Program> = {
    emptyThenElse: [ifw([], [])],
    nestedDef: [rep(2, [def([F])]), C],
    defInDefCall: [def([def([C])])],
    twoDefsRecSecond: [def([F]), def([C]), C],
    unknownInsideRepeat: [rep(2, [{ id: 'teleport' } as unknown as Block])],
    protoId: [{ id: '__proto__' } as unknown as Block],
    repeatNString: [{ id: 'repeat', n: '3', body: [F] } as unknown as Block],
  };
  for (const [k, p] of Object.entries(cases)) {
    let out: unknown;
    try { const v = validate(p, m); out = { codes: v.codes, blocks: v.blocks, count: countBlocks(p) }; } catch (e) { out = `THROW ${(e as Error).message}`; }
    let rr: unknown;
    try { const r = run(m, p); rr = { o: r.outcome, m: r.message, t: r.ticks }; } catch (e) { rr = `THROW ${(e as Error).message}`; }
    let tt: unknown;
    try { tt = toText(p).text.replace(/\n/g, ' | '); } catch (e) { tt = `THROW ${(e as Error).message}`; }
    show(`validate ${k}`, { v: out, run: rr, text: tt });
  }
  // malformed shapes (e.g. JSON from DB)
  const malformed: Record<string, unknown> = {
    ifNoElse: [{ id: 'if_wall', then: [F] }],
    repeatNoBody: [{ id: 'repeat', n: 2 }],
    defNoBody: [{ id: 'def' }],
    nullBlock: [null],
  };
  for (const [k, p] of Object.entries(malformed)) {
    const res: Record<string, string> = {};
    for (const [fn, f] of Object.entries({ validate: () => validate(p as Program, m), countBlocks: () => countBlocks(p as Program), toText: () => toText(p as Program), run: () => run(m, p as Program) })) {
      try { f(); res[fn] = 'ok'; } catch (e) { res[fn] = `THROW ${(e as Error).constructor.name}: ${(e as Error).message}`; }
    }
    show(`malformed ${k}`, res);
  }
}

// ---------- 10. invariants across rounds' solutions + cat null when no cat
{
  for (const k of [1, 2, 3, 4, 5] as const) {
    const r = run(MAPS[k], [rep(9, [rep(9, [ifw([R], [ifp([J], [F])])])])]);
    invariants(r, `R${k} sensor-walker ${r.outcome}/${r.ticks}`);
    if (!MAPS[k].cat) show(`R${k} cat null everywhere`, r.trace.every((s) => s.cat === null) && r.cat === null);
  }
}
