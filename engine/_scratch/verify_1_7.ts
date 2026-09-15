// Verifier scratch for finding 1_7 (R2: def not needed via if_pit).
// npx tsx engine/_scratch/verify_1_7.ts
import { run, score, validate, countBlocks, toText } from '../index';
import type { Block, Program } from '../index';
import { MAPS } from '../maps';
import { SOLUTIONS } from '../solutions';

const m = MAPS[2];
const F: Block = { id: 'forward' }, J: Block = { id: 'jump' }, L: Block = { id: 'left' }, R: Block = { id: 'right' };
const rep = (n: number, ...body: Block[]): Block => ({ id: 'repeat', n, body });
const ip = (t: Block[], e: Block[]): Block => ({ id: 'if_pit', then: t, else: e });
const iw = (t: Block[], e: Block[]): Block => ({ id: 'if_wall', then: t, else: e });

const hasDef = (p: Program): boolean => p.some((b) => b.id === 'def' || b.id === 'call' ||
  ('body' in b && hasDef(b.body)) || ('then' in b && (hasDef(b.then) || hasDef(b.else))));
const acts = (p: Program) => run(m, p).trace.slice(1).map((s) => `${s.block}@${s.owl.x},${s.owl.y}${s.owl.dir}`).join(' ');
const report = (label: string, p: Program) => {
  const v = validate(p, m);
  const r = run(m, p);
  const s = score(r, { cap: m.cap, firstSubmit: false, usedPatch: false }).total;
  console.log(`${label}: valid=${v.ok} def=${hasDef(p)} outcome=${r.outcome} ticks=${r.ticks} mice=${r.mice} blocks=${countBlocks(p)} score=${s}`);
  console.log('  ' + toText(p).text.replace(/\n\s*/g, ' | '));
  return { r, s };
};

const sol = SOLUTIONS.r2[0];
const A: Program = [rep(5, F, ip([J, L], []), ip([J], []))];
report('solutions[0]', sol);
report('no-def if_pit A', A);
console.log('identical action trace to solutions[0]:', acts(A) === acts(sol));

// Independent mini-search: rep n { s1 s2 s3 } and rep n { s1 s2 }, slots drawn from small def-free pieces.
const atoms: Block[][] = [[F], [J], [L], [R], [F, J], [J, L], [F, J, L]];
const pieces: Block[] = [F, J, L, R];
for (const t of atoms) for (const e of [[], [F], [J], [L]] as Block[][]) { pieces.push(ip(t, e)); pieces.push(iw(t, e)); }
let found = 0; let best = 0; const hits: string[] = [];
for (let n = 1; n <= 9; n++) {
  for (const a of pieces) for (const b of pieces) {
    const tries: Program[] = [[rep(n, a, b)]];
    for (const c of pieces) tries.push([rep(n, a, b, c)]);
    for (const p of tries) {
      if (countBlocks(p) > 9) continue;
      const r = run(m, p);
      if (r.outcome !== 'goal' || r.mice !== 2) continue;
      const s = score(r, { cap: m.cap, firstSubmit: false, usedPatch: false }).total;
      if (s >= 150) { found++; best = Math.max(best, s); if (hits.length < 8) hits.push(`${countBlocks(p)}b ${s}: ` + toText(p).text.replace(/\n\s*/g, ' | ')); }
    }
  }
}
console.log(`mini-search: def-free programs with goal+2 mice and score>=150: ${found}, best=${best}`);
for (const h of hits) console.log('  ' + h);
