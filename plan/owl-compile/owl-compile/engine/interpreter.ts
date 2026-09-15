// OWL COMPILE — 인터프리터
// 규칙 요약
//  - 앞으로/점프/좌회전/우회전/잠자기 = 1틱. 반복/만약/함수 = 0틱.
//  - 매 틱: 부엉이 행동 → 도착이면 즉시 종료 → 고양이 이동 → 충돌 판정.
//  - 맵 밖 = 벽. 잠긴 문 = 벽 취급(조건 '앞이 벽이면' 참).
//  - 구덩이에 들어가면 사망. 점프는 2칸 전진, 중간 칸은 무엇이든 통과(벽 제외), 착지 칸 규칙은 앞으로와 동일.
//  - 부엉이와 고양이가 같은 칸이면 사망(누가 움직였든).

import type { Block, Dir, GameMap, Outcome, Pos, Program, RunResult, Step } from './types';

const DELTA: Record<Dir, Pos> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const LEFT: Record<Dir, Dir> = { N: 'W', W: 'S', S: 'E', E: 'N' };
const RIGHT: Record<Dir, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' };

export const MAX_TICKS = 600;

/** 블록 개수: 카드 1장 = 1. 중괄호/아니면 구분자는 세지 않음. */
export function countBlocks(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    n += 1;
    if (b.t === 'repeat' || b.t === 'def') n += countBlocks(b.body);
    if (b.t === 'if') n += countBlocks(b.then) + countBlocks(b.else ?? []);
  }
  return n;
}

/** 실행 전 정적 검사. 문제 없으면 null. */
export function validate(program: Program, map: GameMap): string | null {
  const defs = program.filter((b) => b.t === 'def');
  if (defs.length > 1) return '함수 F는 하나만 정의할 수 있다';
  const nested = (bs: Block[]): boolean =>
    bs.some((b) => b.t === 'def' || (b.t === 'repeat' && nested(b.body)) || (b.t === 'if' && (nested(b.then) || nested(b.else ?? []))));
  if (program.some((b) => (b.t === 'repeat' && nested(b.body)) || (b.t === 'if' && (nested(b.then) || nested(b.else ?? []))))) return '함수 정의는 최상위에만 둘 수 있다';
  const hasCall = (bs: Block[]): boolean =>
    bs.some((b) => b.t === 'call' || (b.t === 'repeat' && hasCall(b.body)) || (b.t === 'if' && (hasCall(b.then) || hasCall(b.else ?? []))));
  if (defs.length === 0 && hasCall(program)) return 'F 호출이 있지만 함수 F가 정의되지 않았다';
  if (defs.length === 1 && hasCall((defs[0] as { body: Block[] }).body)) return '함수 안에서 F를 호출할 수 없다 (재귀 금지)';
  const badRepeat = (bs: Block[]): boolean =>
    bs.some((b) => (b.t === 'repeat' && (b.n < 1 || b.n > 9 || badRepeat(b.body))) || (b.t === 'if' && (badRepeat(b.then) || badRepeat(b.else ?? []))) || (b.t === 'def' && badRepeat(b.body)));
  if (badRepeat(program)) return '반복 횟수는 1~9';
  const n = countBlocks(program);
  if (n > map.limit) return `블록 ${n}개 — 상한 ${map.limit}개 초과`;
  if (n === 0) return '블록이 없다';
  return null;
}

class Halt extends Error {
  constructor(public outcome: Outcome, message: string) {
    super(message);
  }
}

export function goalOf(map: GameMap): Pos {
  for (let y = 0; y < map.grid.length; y++) {
    const x = map.grid[y].indexOf('G');
    if (x >= 0) return { x, y };
  }
  throw new Error(`맵 ${map.id}에 G가 없다`);
}

export function run(program: Program, map: GameMap): RunResult {
  const grid = map.grid.map((r) => r.split(''));
  const H = grid.length;
  const W = grid[0].length;
  const owl: Pos & { dir: Dir } = { ...map.start };
  let hasKey = false;
  let mice = 0;
  let tick = 0;
  const trace: Step[] = [];
  let catIdx = map.cat?.start ?? 0;
  let catDir: 1 | -1 = map.cat?.dir ?? 1;
  const catPos = (): Pos | undefined => (map.cat ? map.cat.path[catIdx] : undefined);
  const fn = program.find((b) => b.t === 'def') as { t: 'def'; body: Block[] } | undefined;

  const tileAt = (p: Pos): string => (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H ? '#' : grid[p.y][p.x]);
  const ahead = (k: number): Pos => ({ x: owl.x + DELTA[owl.dir].x * k, y: owl.y + DELTA[owl.dir].y * k });
  const isWall = (p: Pos) => {
    const t = tileAt(p);
    return t === '#' || (t === 'D' && !hasKey);
  };
  const same = (a?: Pos, b?: Pos) => !!a && !!b && a.x === b.x && a.y === b.y;

  const record = (action: Step['action'], event?: string) => {
    trace.push({ tick, action, owl: { ...owl }, cat: catPos() ? { ...catPos()! } : undefined, event });
  };

  const endTick = (action: Step['action'], event?: string) => {
    tick++;
    if (tileAt(owl) === 'G') {
      record(action, event);
      throw new Halt('goal', '둥지 도착');
    }
    if (map.cat) {
      let next = catIdx + catDir;
      if (next < 0 || next >= map.cat.path.length) {
        catDir = (catDir * -1) as 1 | -1;
        next = catIdx + catDir;
      }
      catIdx = next;
    }
    record(action, event);
    if (same(catPos(), owl)) throw new Halt('dead', '고양이에게 잡혔다');
    if (tick >= MAX_TICKS) throw new Halt('stuck', '실행 시간 초과');
  };

  /** 칸 진입 처리. 반환: 이벤트 문자열 */
  const enter = (p: Pos, verb: string): string | undefined => {
    const t = tileAt(p);
    if (t === '#') throw new Halt('error', `${verb} 벽에 부딪혔다`);
    if (t === 'D' && !hasKey) throw new Halt('error', '문이 잠겨 있다 — 열쇠가 없다');
    owl.x = p.x;
    owl.y = p.y;
    if (t === 'O') {
      tick++;
      record(verb === '점프' ? 'jump' : 'forward');
      throw new Halt('dead', '구덩이에 빠졌다');
    }
    if (same(catPos(), owl)) {
      tick++;
      record(verb === '점프' ? 'jump' : 'forward');
      throw new Halt('dead', '고양이를 밟았다');
    }
    let ev: string | undefined;
    if (t === 'M') {
      mice++;
      grid[p.y][p.x] = '.';
      ev = '쥐 획득';
    } else if (t === 'K') {
      hasKey = true;
      grid[p.y][p.x] = '.';
      ev = '열쇠 획득';
    } else if (t === 'D') ev = '문 통과';
    return ev;
  };

  const exec = (blocks: Block[], inFn: boolean): void => {
    for (const b of blocks) {
      switch (b.t) {
        case 'forward': {
          const ev = enter(ahead(1), '앞으로 가다');
          endTick('forward', ev);
          break;
        }
        case 'jump': {
          const mid = ahead(1);
          const t = tileAt(mid);
          if (t === '#' || (t === 'D' && !hasKey)) throw new Halt('error', '점프 중 벽에 부딪혔다');
          const ev = enter(ahead(2), '점프');
          endTick('jump', ev);
          break;
        }
        case 'left':
          owl.dir = LEFT[owl.dir];
          endTick('left');
          break;
        case 'right':
          owl.dir = RIGHT[owl.dir];
          endTick('right');
          break;
        case 'sleep':
          endTick('sleep');
          break;
        case 'repeat':
          for (let i = 0; i < b.n; i++) exec(b.body, inFn);
          break;
        case 'if': {
          const a = ahead(1);
          const hit = b.cond === 'wall' ? isWall(a) : tileAt(a) === 'O';
          exec(hit ? b.then : (b.else ?? []), inFn);
          break;
        }
        case 'def':
          break; // 정의는 실행하지 않음
        case 'call':
          if (!fn) throw new Halt('error', '함수 F가 정의되지 않았다');
          if (inFn) throw new Halt('error', '재귀 호출 금지');
          exec(fn.body, true);
          break;
      }
    }
  };

  let outcome: Outcome = 'stuck';
  let message = '프로그램이 끝났지만 둥지에 못 갔다';
  try {
    exec(program, false);
  } catch (e) {
    if (e instanceof Halt) {
      outcome = e.outcome;
      message = e.message;
    } else throw e;
  }

  return { outcome, message, ticks: tick, blocks: countBlocks(program), mice, hasKey, final: { ...owl }, trace };
}
