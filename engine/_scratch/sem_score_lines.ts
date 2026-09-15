// score(): lines do not sum to total when the floor clamps (visible in the board's line-by-line score pop).
// Run: npx tsx engine/_scratch/sem_score_lines.ts
import { run, score, MAPS } from '../index';

const dead = run(MAPS[2], [{ id: 'forward' }, { id: 'forward' }, { id: 'forward' }]);
const s1 = score(dead, { cap: 12, firstSubmit: true, usedPatch: true });
console.log(`dead+patch: outcome=${dead.outcome} lines=${JSON.stringify(s1.lines)} sum=${s1.lines.reduce((a, l) => a + l.points, 0)} total=${s1.total}`);
const far = run(MAPS[1], [{ id: 'sleep' }]);
const s2 = score(far, { cap: 12, firstSubmit: false, usedPatch: true });
console.log(`stuck d=8 +patch: lines=${JSON.stringify(s2.lines)} sum=${s2.lines.reduce((a, l) => a + l.points, 0)} total=${s2.total}`);
