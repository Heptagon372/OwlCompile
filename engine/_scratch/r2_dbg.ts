import { nondef, withDef, geom } from './r2_search';
for (const s of process.argv.slice(2)) console.log(s, 'nondef', nondef(s), 'def', JSON.stringify(withDef(s)), JSON.stringify(geom(s)));
