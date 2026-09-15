// Adversarial spec-conformance review. Independent of verify.ts.
import {
  run, score, validate, toText, lineIndex, countBlocks, MAPS, SOLUTIONS, ROUND_EXTRAS,
  BLOCKS, BLOCK_ORDER, ROLES,
} from '../index';
import type { GameMap, Program, Block } from '../types';

const out: string[] = [];
const log = (...a: unknown[]) => { const s = a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); out.push(s); console.log(s); };

// ---------- Acceptance 4 (fresh) ----------
{
  const m = MAPS[3];
  const p = SOLUTIONS.r3[0];
  const r = run(m, p);
  const goalTicks = r.trace.filter((s) => s.event === 'goal').map((s) => s.tick);
  const firstOnG = r.trace.findIndex((s) => m.tiles[s.owl.y][s.owl.x] === 'G');
  const sc = score(r, { cap: m.cap, firstSubmit: false, usedPatch: false });
  const scFirst = score(r, { cap: m.cap, firstSubmit: true, usedPatch: false });
  log('ACC4', r.outcome, r.ticks, r.mice, r.blocks, 'goalTicks', goalTicks, 'firstOnG', firstOnG, 'score', sc.total, sc.lines, 'firstSubmit score', scFirst.total, 'valid', validate(p, m).ok);
  log('ACC4 text\n' + toText(p).text);
}

// ---------- Acceptance 5 (fresh) ----------
{
  const m = MAPS[5];
  const sol = SOLUTIONS.r5[0];
  // remove the sleep block (anywhere in tree) independently
  const strip = (bs: Block[]): Block[] => bs.filter((b) => b.id !== 'sleep').map((b) => {
    if (b.id === 'repeat' || b.id === 'def') return { ...b, body: strip(b.body) };
    if (b.id === 'if_wall' || b.id === 'if_pit') return { ...b, then: strip(b.then), else: strip(b.else) };
    return b;
  });
  const noSleep = strip(sol);
  const r0 = run(m, noSleep);
  const last = r0.trace[r0.trace.length - 1];
  log('ACC5 noSleep', 'blocks', countBlocks(noSleep), 'valid', validate(noSleep, m).ok, r0.outcome, r0.ticks, 'owl', last.owl, 'cat', last.cat, last.event, last.message,
    'score', score(r0, { cap: m.cap, firstSubmit: false, usedPatch: false }).total, 'score(first)', score(r0, { cap: m.cap, firstSubmit: true, usedPatch: false }).total,
    'sameAsExtras', JSON.stringify(noSleep) === JSON.stringify(ROUND_EXTRAS.r5.noSleep));
  const r1 = run(m, sol);
  log('ACC5 patched', 'blocks', countBlocks(sol), 'valid', validate(sol, m).ok, r1.outcome, r1.ticks, r1.mice,
    'noPatch', score(r1, { cap: m.cap, firstSubmit: false, usedPatch: false }).total,
    'patch', score(r1, { cap: m.cap, firstSubmit: false, usedPatch: true }).total,
    score(r1, { cap: m.cap, firstSubmit: false, usedPatch: true }).lines);
  // "잠자기 1개 추가" at every top-level position / inside loops
  const ins: string[] = [];
  const top = noSleep;
  for (let i = 0; i <= top.length; i++) {
    const p = [...top.slice(0, i), { id: 'sleep' } as Block, ...top.slice(i)];
    const r = run(m, p);
    ins.push(`top@${i}:${r.outcome}/${r.ticks}/${r.message}`);
  }
  log('ACC5 sleep insert positions', ins);
}

// ---------- Spec §5 toText example ----------
{
  const p: Program = [
    { id: 'repeat', n: 4, body: [{ id: 'repeat', n: 5, body: [{ id: 'if_wall', then: [{ id: 'right' }], else: [{ id: 'forward' }] }] }] },
    { id: 'def', body: [{ id: 'forward' }, { id: 'jump' }] },
    { id: 'call' },
    { id: 'sleep' },
  ];
  const expected = [
    '반복 4 {', '  반복 5 {', '    만약 앞이 벽이면 {', '      우회전', '    } 아니면 {', '      앞으로', '    }', '  }', '}',
    '함수 F {', '  앞으로', '  점프', '}', 'F 호출', '잠자기',
  ].join('\n');
  log('TEXT example match', toText(p).text === expected);
}

// ---------- line mapping across all solutions ----------
{
  let bad = 0; let total = 0;
  const rounds = [1, 2, 3, 4, 5] as const;
  for (const n of rounds) {
    const m = MAPS[n];
    const sols = (SOLUTIONS as Record<string, Program[]>)[`r${n}`];
    sols.forEach((p, si) => {
      const t = toText(p);
      const r = run(m, p);
      for (const s of r.trace.slice(1)) {
        total++;
        const L = t.lines[s.line as number];
        if (!L || L.blockId !== s.block || JSON.stringify(L.path) !== JSON.stringify(s.path)) { bad++; if (bad < 5) log('LINE MISMATCH', n, si, s.tick, s.line, s.path, L); }
      }
    });
  }
  log('LINE mapping', total, 'steps checked, bad', bad);
}

// ---------- BLOCKS meta table ----------
{
  const tbl: [string, string, string, string, string, string, string, number, string, number][] = [
    ['forward', '앞으로', 'forward', 'move', '#8E5CFF', '#FFFFFF', 'runner', 1, 'plain', 6],
    ['jump', '점프', 'jump', 'move', '#8E5CFF', '#FFFFFF', 'runner', 1, 'plain', 4],
    ['left', '좌회전', 'turn left', 'turn', '#2FC4D9', '#0B1C22', 'turner', 1, 'plain', 4],
    ['right', '우회전', 'turn right', 'turn', '#2FC4D9', '#0B1C22', 'turner', 1, 'plain', 4],
    ['repeat', '반복', 'repeat', 'control', '#FFB020', '#2A1B00', 'controller', 0, 'c1', 3],
    ['if_wall', '만약 앞이 벽이면', 'if wall', 'control', '#FFB020', '#2A1B00', 'controller', 0, 'c2', 2],
    ['if_pit', '만약 앞이 구덩이면', 'if pit', 'control', '#FFB020', '#2A1B00', 'controller', 0, 'c2', 2],
    ['def', '함수 F', 'define F', 'function', '#3DD68C', '#062A19', 'architect', 0, 'c1', 1],
    ['call', 'F 호출', 'call F', 'function', '#3DD68C', '#062A19', 'architect', 0, 'plain', 4],
    ['sleep', '잠자기', 'sleep', 'special', '#FF6B9A', '#FFFFFF', 'architect', 1, 'plain', 3],
  ];
  const diffs: string[] = [];
  for (const [id, label, kw, cat, color, ink, role, ticks, shape, deck] of tbl) {
    const b = (BLOCKS as Record<string, any>)[id];
    const got = [b.id, b.label, b.keyword, b.category, b.color, b.ink, b.role, b.ticks, b.shape, b.deck];
    const exp = [id, label, kw, cat, color, ink, role, ticks, shape, deck];
    if (JSON.stringify(got) !== JSON.stringify(exp)) diffs.push(`${id}: ${JSON.stringify(got)} vs ${JSON.stringify(exp)}`);
  }
  log('BLOCKS diffs', diffs, 'ORDER', BLOCK_ORDER.join(','), 'ROLES', Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.blocks.join('+')])));
}

// ---------- map table ----------
{
  for (const n of [1, 2, 3, 4, 5] as const) {
    const m = MAPS[n];
    log('MAP', n, m.name, m.difficulty, m.cap, m.seconds, m.intro, m.startDir, m.tiles.length, m.tiles.every((r) => r.length === 8));
  }
}
console.log('done');
