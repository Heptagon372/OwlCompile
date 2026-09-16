import { run, checkMap } from '../../run';
import { map } from '../../rounds/r7';
import { reachableActions } from '../../verify-search';
console.log(checkMap(map), run(map, [{ id: 'forward' }]).outcome, reachableActions(map, { minMice: 0, exclude: ['sleep'] }));
