// OWL COMPILE — 실행기 (docs/ENGINE_SPEC.md §6)
// 구조: 액션 생성기(프로그램을 전위 순회하며 1틱 블록을 하나씩 뽑음) + 스테퍼(한 틱 적용).
import type {
  ActionId, Block, CatPatrol, Dir, EventKind, GameMap, Outcome, OwlState, Pos, Program,
  RunOptions, RunResult, Step, Tile,
} from '../types';
import { countBlocks, isKnownBlockId, slotsOf } from '../blocks';
import { lineIndex, pathKey } from '../text';
import { containsBlock, findDef } from '../validate';

export const DEFAULT_MAX_TICKS = 300;
export const GRID = 8;

export const DELTA: Record<Dir, Pos> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
export const LEFT_OF: Record<Dir, Dir> = { N: 'W', W: 'S', S: 'E', E: 'N' };
export const RIGHT_OF: Record<Dir, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' };

const TILES = new Set<string>(['.', '#', 'O', 'M', 'K', 'D', 'S', 'G', 'c']);

export const posKey = (p: Pos): string => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
export const manhattan = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// ---------------------------------------------------------------- 맵 파싱

export interface ParsedMap {
  start: OwlState;
  goal: Pos;
  /** tiles[y][x] */
  tiles: Tile[][];
  inBounds(p: Pos): boolean;
  /** 맵 밖이면 null. */
  tileAt(p: Pos): Tile | null;
}

/** 맵에서 시작/둥지/타일 조회를 뽑는다. S·G가 정확히 1개가 아니면 throw. */
export function parseMap(map: GameMap): ParsedMap {
  const tiles = map.tiles.map((row) => row.split('') as Tile[]);
  const starts: Pos[] = [];
  const goals: Pos[] = [];
  tiles.forEach((row, y) => row.forEach((t, x) => {
    if (t === 'S') starts.push({ x, y });
    if (t === 'G') goals.push({ x, y });
  }));
  if (starts.length !== 1) throw new Error(`맵 "${map.name}": S가 ${starts.length}개`);
  if (goals.length !== 1) throw new Error(`맵 "${map.name}": G가 ${goals.length}개`);
  const inBounds = (p: Pos) => p.y >= 0 && p.y < tiles.length && p.x >= 0 && p.x < (tiles[p.y]?.length ?? 0);
  return {
    start: { ...starts[0], dir: map.startDir },
    goal: goals[0],
    tiles,
    inBounds,
    tileAt: (p) => (inBounds(p) ? tiles[p.y][p.x] : null),
  };
}

/** 맵 구조 제약(§8 공통) 위반 목록. 비어 있으면 정상. 라운드 검증용. */
export function checkMap(map: GameMap): string[] {
  const problems: string[] = [];
  if (map.tiles.length !== GRID) problems.push(`행 수 ${map.tiles.length} ≠ ${GRID}`);
  map.tiles.forEach((row, y) => {
    if (row.length !== GRID) problems.push(`${y}행 길이 ${row.length} ≠ ${GRID}`);
    for (const ch of row) if (!TILES.has(ch)) problems.push(`${y}행에 알 수 없는 타일 '${ch}'`);
  });
  const count = (ch: string) => map.tiles.join('').split('').filter((c) => c === ch).length;
  if (count('S') !== 1) problems.push(`S가 ${count('S')}개`);
  if (count('G') !== 1) problems.push(`G가 ${count('G')}개`);
  if (map.cat) {
    const { path, mode } = map.cat;
    if (path.length === 0) problems.push('고양이 path가 비어 있음');
    path.forEach((p, i) => {
      const t = map.tiles[p.y]?.[p.x];
      if (t !== 'c') problems.push(`고양이 path[${i}] (${p.x},${p.y})가 'c' 타일이 아님`);
      if (i > 0 && manhattan(path[i - 1], p) !== 1) problems.push(`고양이 path[${i - 1}]→[${i}] 인접하지 않음`);
    });
    if (mode === 'loop' && path.length > 1 && manhattan(path[path.length - 1], path[0]) !== 1) {
      problems.push('loop 고양이 path가 닫힌 고리가 아님');
    }
  }
  return problems;
}

// ---------------------------------------------------------------- 액션 생성기

export interface Action { block: ActionId; path: number[]; line: number }

export interface Sensors { wallAhead(): boolean; pitAhead(): boolean }

const ACTIONS = new Set<string>(['forward', 'jump', 'left', 'right', 'sleep']);

/**
 * 프로그램을 전위 순회하며 액션을 하나씩 낸다. 제어/함수 블록은 0틱.
 * if_*는 순회가 도달한 시점(직전 액션 적용 후)의 센서로 평가된다 — 생성기라 자연히 지연 평가.
 */
export function* actionsOf(program: Program, sensors: Sensors): Generator<Action, void, undefined> {
  const lines = lineIndex(program);
  const def = findDef(program);
  const lineOf = (path: number[]) => lines.get(pathKey(path)) ?? -1;

  function* walk(blocks: Block[], prefix: number[]): Generator<Action, void, undefined> {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const path = [...prefix, i];
      if (ACTIONS.has(b.id)) {
        yield { block: b.id as ActionId, path, line: lineOf(path) };
      } else if (b.id === 'repeat') {
        for (let k = 0; k < b.n; k++) {
          let any = false;
          for (const x of walk(b.body, [...path, 0])) { any = true; yield x; }
          if (!any) break; // 0-action pass => world unchanged => all later passes are 0-action too
        }
      } else if (b.id === 'if_wall' || b.id === 'if_pit') {
        const hit = b.id === 'if_wall' ? sensors.wallAhead() : sensors.pitAhead();
        yield* walk(hit ? b.then : b.else, [...path, hit ? 0 : 1]);
      } else if (b.id === 'call') {
        // def 본문을 그 자리에서 순회. path는 def 본문의 원래 경로(줄 번호도 def 본문 줄).
        if (def) yield* walk(def.body, [def.index, 0]);
      }
      // def: 정의는 실행하지 않음(건너뜀)
    }
  }
  yield* walk(program, []);
}

/** run이 방어적으로 잡는 컴파일 에러(validate와 별개). 없으면 null. */
export function compileError(program: Program): string | null {
  const unknown = (list: Block[]): boolean =>
    list.some((b) => !isKnownBlockId(b.id) || slotsOf(b).some(unknown));
  if (unknown(program)) return '알 수 없는 블록';
  const def = findDef(program);
  if (def && containsBlock(def.body, 'call')) return '함수 F 안에서 F를 부를 수 없다';
  if (!def && containsBlock(program, 'call')) return '함수 F가 정의되지 않았다';
  return null;
}

// ---------------------------------------------------------------- 스테퍼

interface Termination { outcome: Outcome; message: string }

interface World {
  tick: number;
  owl: OwlState;
  catIdx: number;
  catDir: 1 | -1;
  mice: number;
  keys: number;
  opened: Map<string, Pos>;
  eaten: Map<string, Pos>;
  taken: Map<string, Pos>;
}

function createStepper(pm: ParsedMap, cat: CatPatrol | undefined) {
  const w: World = {
    tick: 0, owl: { ...pm.start }, catIdx: 0, catDir: 1,
    mice: 0, keys: 0, opened: new Map(), eaten: new Map(), taken: new Map(),
  };
  const catPos = (): Pos | null => (cat ? cat.path[w.catIdx] : null);
  const ahead = (k: number): Pos => ({ x: w.owl.x + DELTA[w.owl.dir].x * k, y: w.owl.y + DELTA[w.owl.dir].y * k });
  const isLockedDoor = (p: Pos) => pm.tileAt(p) === 'D' && !w.opened.has(posKey(p));
  // blocked: 맵 밖 ∨ 벽 ∨ (잠긴 문 ∧ 열쇠 없음). 열쇠가 있으면 잠긴 문은 벽이 아니다.
  const blocked = (p: Pos) => pm.tileAt(p) === null || pm.tileAt(p) === '#' || (isLockedDoor(p) && w.keys === 0);
  // midBlocked: 점프 중간 칸. 열쇠가 있어도 문 위는 못 넘는다(공중에서 못 연다).
  const midBlocked = (p: Pos) => pm.tileAt(p) === null || pm.tileAt(p) === '#' || isLockedDoor(p);

  const sensors: Sensors = {
    wallAhead: () => blocked(ahead(1)),
    pitAhead: () => pm.tileAt(ahead(1)) === 'O',
  };

  const snapshot = (action: Action | null, event: EventKind | null, message: string | null): Step => ({
    tick: w.tick,
    block: action?.block ?? null,
    line: action ? action.line : null,
    path: action ? [...action.path] : null,
    owl: { ...w.owl },
    cat: catPos() ? { ...(catPos() as Pos) } : null,
    event,
    message,
    mice: w.mice,
    keys: w.keys,
    opened: [...w.opened.values()],
    eaten: [...w.eaten.values()],
    taken: [...w.taken.values()],
  });

  type Hit = { event: EventKind; message: string; end?: Outcome };

  /** 칸 진입 처리 (§6.3-2). 부엉이는 이미 옮겨진 상태. */
  const enter = (p: Pos): Hit | null => {
    const c = catPos();
    if (c && samePos(c, p)) return { event: 'cat', message: '고양이를 밟았다', end: 'dead' };
    const t = pm.tileAt(p);
    const k = posKey(p);
    if (t === 'O') return { event: 'pit', message: '구덩이에 빠졌다', end: 'dead' };
    if (t === 'D' && !w.opened.has(k)) {
      // 여기 도달했다면 keys > 0 (blocked 검사를 통과했으므로)
      w.keys -= 1;
      w.opened.set(k, { ...p });
      return { event: 'door', message: '문을 열었다' };
    }
    if (t === 'M' && !w.eaten.has(k)) {
      w.mice += 1;
      w.eaten.set(k, { ...p });
      return { event: 'mouse', message: '쥐 획득 +20' };
    }
    if (t === 'K' && !w.taken.has(k)) {
      w.keys += 1;
      w.taken.set(k, { ...p });
      return { event: 'key', message: '열쇠 획득' };
    }
    if (t === 'G') return { event: 'goal', message: '둥지 도착', end: 'goal' };
    return null;
  };

  const bump = (target: Pos): Hit => ({
    event: 'wall', end: 'error',
    message: isLockedDoor(target) && w.keys === 0 ? '문이 잠겨 있다' : '벽에 부딪혔다',
  });

  /** 1. 부엉이 행동 */
  const act = (block: ActionId): Hit | null => {
    switch (block) {
      case 'left': w.owl.dir = LEFT_OF[w.owl.dir]; return null;
      case 'right': w.owl.dir = RIGHT_OF[w.owl.dir]; return null;
      case 'sleep': return null;
      case 'forward': {
        const target = ahead(1);
        if (blocked(target)) return bump(target);
        w.owl.x = target.x; w.owl.y = target.y;
        return enter(target);
      }
      case 'jump': {
        const mid = ahead(1);
        const target = ahead(2);
        if (midBlocked(mid)) return { event: 'wall', message: '벽은 뛰어넘을 수 없다', end: 'error' };
        if (blocked(target)) return bump(target);
        w.owl.x = target.x; w.owl.y = target.y;   // 중간 칸은 전부 무시
        return enter(target);
      }
    }
  };

  /** 3. 고양이 이동. 잡혔으면 Hit. */
  const moveCat = (): Hit | null => {
    if (!cat || cat.path.length <= 1) return null;
    if (cat.mode === 'loop') {
      w.catIdx = (w.catIdx + 1) % cat.path.length;
    } else {
      let next = w.catIdx + w.catDir;
      if (next < 0 || next >= cat.path.length) { w.catDir = -w.catDir as 1 | -1; next = w.catIdx + w.catDir; }
      w.catIdx = next;
    }
    return samePos(cat.path[w.catIdx], w.owl) ? { event: 'cat', message: '고양이에게 잡혔다', end: 'dead' } : null;
  };

  /** 한 틱 적용 → 기록된 Step과 종료 여부. */
  const step = (action: Action): { step: Step; end: Termination | null } => {
    w.tick += 1;
    let hit = act(action.block);
    if (!hit?.end) {
      const caught = moveCat();          // 종료(둥지 도착 포함) 시에는 고양이가 움직이지 않는다
      if (caught) hit = caught;          // 한 틱 이벤트 최대 1개: 사망이 문/쥐/열쇠 이벤트를 덮는다
    }
    const s = snapshot(action, hit?.event ?? null, hit?.message ?? null);
    return { step: s, end: hit?.end ? { outcome: hit.end, message: hit.message } : null };
  };

  return { w, sensors, snapshot, step };
}

// ---------------------------------------------------------------- run

export function run(map: GameMap, program: Program, opts: RunOptions = {}): RunResult {
  const maxTicks = opts.maxTicks ?? DEFAULT_MAX_TICKS;
  const pm = parseMap(map);
  const st = createStepper(pm, map.cat);
  const trace: Step[] = [st.snapshot(null, null, null)];

  const finish = (outcome: Outcome, message: string): RunResult => ({
    outcome,
    message,
    ticks: st.w.tick,
    blocks: countBlocks(program),
    mice: st.w.mice,
    distance: outcome === 'goal' ? 0 : manhattan(st.w.owl, pm.goal),
    owl: { ...st.w.owl },
    cat: trace[trace.length - 1].cat,
    trace,
  });

  const compile = compileError(program);
  if (compile) return finish('error', `컴파일 에러: ${compile}`);

  for (const action of actionsOf(program, st.sensors)) {
    const { step, end } = st.step(action);
    trace.push(step);
    if (end) return finish(end.outcome, end.message);
    if (st.w.tick >= maxTicks) {
      // 도달한 틱을 기록한 뒤 시간 초과. 그 틱의 이벤트는 timeout으로 대체된다.
      const message = `시간 초과 (${maxTicks}틱)`;
      step.event = 'timeout';
      step.message = message;
      return finish('error', message);
    }
  }
  return finish('stuck', '프로그램이 끝났지만 둥지에 닿지 못했다');
}
