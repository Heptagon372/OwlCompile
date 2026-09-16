// 단위 의미론 검증 — docs/ENGINE_SPEC.md §9 항목 1~4. 손으로 만든 8×8 맵으로 검사한다.
// + 협동 전용 블록(toggle·spawn)이 게임 1에서 거절되는지 (docs/COOP_SPEC.md §2·§10) — R1 실제 맵으로.
import type { Block, BlockId, CatPatrol, Dir, GameMap, Outcome, Pos, Program, RunResult, Step } from './types';
import { BLOCKS, BLOCK_ORDER, COOP_BLOCKS, ROLES, countBlocks, isCoopBlockId } from './blocks';
import { lineIndex, pathKey, toText } from './text';
import { containsCoopBlock, validate } from './validate';
import { map as r1Map } from './rounds/r1';
import { checkMap, run } from './run';
import type { RunOptions } from './run';
import { score } from './score';
import { check, eq, type Check } from './verify-util';

// ---------------------------------------------------------------- 블록/맵 헬퍼

const F: Block = { id: 'forward' };
const J: Block = { id: 'jump' };
const L: Block = { id: 'left' };
const R: Block = { id: 'right' };
const SL: Block = { id: 'sleep' };
const C: Block = { id: 'call' };
const rep = (n: number, body: Block[]): Block => ({ id: 'repeat', n, body });
const ifw = (then: Block[], els: Block[] = []): Block => ({ id: 'if_wall', then, else: els });
const ifp = (then: Block[], els: Block[] = []): Block => ({ id: 'if_pit', then, else: els });
const def = (body: Block[]): Block => ({ id: 'def', body });

/** 3행(y=3)만 바꾼 8×8 맵. 나머지는 바닥, 둥지는 (7,7). */
function board(row3: string, startDir: Dir = 'E', extra: Partial<GameMap> = {}): GameMap {
  const rows = ['........', '........', '........', row3, '........', '........', '........', '.......G'];
  if (row3.includes('G')) rows[7] = '........';
  return {
    round: 1, name: 'test', difficulty: '쉬움', cap: 12, seconds: 60, intro: '',
    tiles: rows, startDir, ...extra,
  };
}

/** 고양이 순찰 칸(c)을 찍은 맵. */
function catBoard(row3: string, cat: CatPatrol, cells: Pos[], startDir: Dir = 'E'): GameMap {
  const m = board(row3, startDir, { cat });
  const grid = m.tiles.map((r) => r.split(''));
  for (const p of cells) grid[p.y][p.x] = 'c';
  return { ...m, tiles: grid.map((r) => r.join('')) };
}

const RING: Pos[] = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];

const results: RunResult[] = [];
const go = (map: GameMap, program: Program, maxTicks?: number): RunResult => {
  const r = run(map, program, maxTicks === undefined ? undefined : { maxTicks });
  results.push(r);
  return r;
};
const last = (r: RunResult): Step => r.trace[r.trace.length - 1];
const owlOf = (r: RunResult) => [r.owl.x, r.owl.y, r.owl.dir] as const;
const summary = (r: RunResult) => ({ outcome: r.outcome, message: r.message, event: last(r).event, ticks: r.ticks });
const ending = (outcome: Outcome, message: string, event: Step['event'], ticks: number) => ({ outcome, message, event, ticks });

// ---------------------------------------------------------------- §9-1 단위 의미론

function semantics(): Check[] {
  const c: Check[] = [];

  // 회전표
  const LEFT: Record<Dir, Dir> = { N: 'W', W: 'S', S: 'E', E: 'N' };
  const RIGHT: Record<Dir, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' };
  for (const d of ['N', 'E', 'S', 'W'] as Dir[]) {
    c.push(eq(`회전표: ${d} 좌회전 → ${LEFT[d]}`, go(board('...S....', d), [L]).owl.dir, LEFT[d]));
    c.push(eq(`회전표: ${d} 우회전 → ${RIGHT[d]}`, go(board('...S....', d), [R]).owl.dir, RIGHT[d]));
  }
  c.push(eq('회전은 칸 그대로 (1틱)', (() => { const r = go(board('...S....'), [L]); return [...owlOf(r), r.ticks]; })(), [3, 3, 'N', 1]));

  // forward 벽 / 맵 밖 / 구덩이
  {
    const r = go(board('...S#...'), [F, F]);
    c.push(eq('forward 벽 → error/wall/"벽에 부딪혔다", 1틱에 중단', summary(r), ending('error', '벽에 부딪혔다', 'wall', 1)));
    c.push(eq('forward 벽: 부엉이 제자리', owlOf(r), [3, 3, 'E']));
    c.push(eq('종료된 틱도 기록: 마지막 Step이 block=forward, event=wall', [last(r).block, last(r).event, last(r).line], ['forward', 'wall', 0]));
  }
  c.push(eq('forward 맵 밖 → error "벽에 부딪혔다"', summary(go(board('.......S'), [F])), ending('error', '벽에 부딪혔다', 'wall', 1)));
  {
    const r = go(board('...SO...'), [F, F]);
    c.push(eq('forward 구덩이 → dead/pit/"구덩이에 빠졌다"', summary(r), ending('dead', '구덩이에 빠졌다', 'pit', 1)));
    c.push(eq('구덩이 사망: 부엉이는 구덩이 칸에 있음', owlOf(r), [4, 3, 'E']));
  }

  // jump
  {
    const r = go(board('...SOG..'), [J]);
    c.push(eq('jump 구덩이 넘기 → 2칸 착지, goal', [...owlOf(r), r.outcome, r.ticks, r.distance], [5, 3, 'E', 'goal', 1, 0]));
  }
  {
    const r = go(board('...S#...'), [J]);
    c.push(eq('jump 중간 벽 → error "벽은 뛰어넘을 수 없다"', summary(r), ending('error', '벽은 뛰어넘을 수 없다', 'wall', 1)));
    c.push(eq('jump 중간 벽: 부엉이 제자리', owlOf(r), [3, 3, 'E']));
  }
  c.push(eq('jump 중간 맵 밖 → error "벽은 뛰어넘을 수 없다"', summary(go(board('.......S'), [J])), ending('error', '벽은 뛰어넘을 수 없다', 'wall', 1)));
  {
    const r = go(board('...SM...'), [J]);
    c.push(eq('jump 중간 쥐는 안 먹음', [r.mice, last(r).eaten.length, last(r).event, ...owlOf(r)], [0, 0, null, 5, 3, 'E']));
  }
  c.push(eq('jump 착지 구덩이 → dead', summary(go(board('...S.O..'), [J])), ending('dead', '구덩이에 빠졌다', 'pit', 1)));
  c.push(eq('jump 착지 벽 → error "벽에 부딪혔다"', summary(go(board('...S.#..'), [J])), ending('error', '벽에 부딪혔다', 'wall', 1)));
  c.push(eq('jump 착지 맵 밖 → error "벽에 부딪혔다"', summary(go(board('......S.'), [J])), ending('error', '벽에 부딪혔다', 'wall', 1)));
  c.push(eq('jump 착지 잠긴 문(열쇠 없음) → error "문이 잠겨 있다"', summary(go(board('...S.D..'), [J])), ending('error', '문이 잠겨 있다', 'wall', 1)));
  {
    const r = go(board('..SK.D..'), [F, J]);
    c.push(eq('jump 착지 문(열쇠 있음) → 열림, 열쇠 소모', [r.outcome, last(r).event, last(r).keys, last(r).opened], ['stuck', 'door', 0, [{ x: 5, y: 3 }]]));
  }
  {
    const r = go(board('..SKD...'), [F, J]);
    c.push(eq('jump 중간 문은 열쇠가 있어도 못 넘음', [...Object.values(summary(r)), r.trace[2].keys], ['error', '벽은 뛰어넘을 수 없다', 'wall', 2, 1]));
  }

  // 열쇠 → 문
  c.push(eq('문(열쇠 없음) → error "문이 잠겨 있다"', summary(go(board('...SD...'), [F])), ending('error', '문이 잠겨 있다', 'wall', 1)));
  {
    const r = go(board('..SKDG..'), [F, F, F]);
    const t = r.trace;
    c.push(eq('열쇠 획득: event key, keys 1, taken', [t[1].event, t[1].message, t[1].keys, t[1].taken], ['key', '열쇠 획득', 1, [{ x: 3, y: 3 }]]));
    c.push(eq('문 열기: event door, 열쇠 소모, opened', [t[2].event, t[2].message, t[2].keys, t[2].opened], ['door', '문을 열었다', 0, [{ x: 4, y: 3 }]]));
    c.push(eq('문 지나 둥지 도착 (3틱)', summary(r), ending('goal', '둥지 도착', 'goal', 3)));
  }
  {
    const r = go(board('..SKD...'), [F, F, L, L, F, L, L, F]);
    c.push(eq('열린 문은 다시 지나도 이벤트 없음, 열쇠 0 유지', [r.trace[5].event, r.trace[8].event, r.trace[8].keys, ...owlOf(r)], [null, null, 0, 4, 3, 'E']));
  }

  // if_wall / if_pit
  c.push(eq('if_wall: 맵 밖 → 참', go(board('.......S'), [ifw([L], [R])]).owl.dir, 'N'));
  c.push(eq('if_wall: 벽 → 참', go(board('...S#...'), [ifw([L], [R])]).owl.dir, 'N'));
  c.push(eq('if_wall: 잠긴 문(열쇠 없음) → 참', go(board('...SD...'), [ifw([L], [R])]).owl.dir, 'N'));
  c.push(eq('if_wall: 잠긴 문(열쇠 보유) → 거짓', go(board('..SKD...'), [F, ifw([L], [R])]).owl.dir, 'S'));
  c.push(eq('if_wall: 바닥 → 거짓', go(board('...S....'), [ifw([L], [R])]).owl.dir, 'S'));
  c.push(eq('if_wall: 구덩이는 벽이 아님 → 거짓', go(board('...SO...'), [ifw([L], [R])]).owl.dir, 'S'));
  c.push(eq('if_wall은 직전 액션 이후 상태로 평가', go(board('...S.#..'), [F, ifw([L], [R])]).owl.dir, 'N'));
  c.push(eq('if_wall: 0틱, 빈 else', (() => { const r = go(board('...S....'), [ifw([L])]); return [r.ticks, r.outcome]; })(), [0, 'stuck']));
  {
    // §6.4 "열쇠 보유 시 잠긴 문": 카드/브리프의 "잠긴 문 = 벽"은 열쇠가 없을 때 이야기. 열쇠가 있으면 아니면 쪽이 실행되어 문이 열린다.
    const withKey = go(board('..SKD...'), [F, ifw([R], [F])]);
    c.push(eq('if_wall + 열쇠: 아니면{앞으로} 실행 → 문 열림', withKey.trace.slice(1).map((s) => `${s.block}:${s.event}`), ['forward:key', 'forward:door']));
    const noKey = go(board('..S.D...'), [F, ifw([R], [F])]);
    c.push(eq('if_wall + 열쇠 없음: 그러면{우회전} 실행', noKey.trace.slice(1).map((s) => `${s.block}:${s.event}`), ['forward:null', 'right:null']));
  }
  c.push(eq('if_pit: 구덩이 → 참', go(board('...SO...'), [ifp([L], [R])]).owl.dir, 'N'));
  c.push(eq('if_pit: 바닥 → 거짓', go(board('...S....'), [ifp([L], [R])]).owl.dir, 'S'));
  c.push(eq('if_pit: 벽 → 거짓', go(board('...S#...'), [ifp([L], [R])]).owl.dir, 'S'));
  c.push(eq('if_pit: 맵 밖 → 거짓', go(board('.......S'), [ifp([L], [R])]).owl.dir, 'S'));

  // repeat
  {
    const r = go(board('...S....'), [rep(3, [F])]);
    c.push(eq('repeat 3 { forward } → 3틱, 3칸', [r.ticks, ...owlOf(r)], [3, 6, 3, 'E']));
  }
  c.push(eq('repeat 중첩 2×3 → 6틱', go(board('...S....', 'N'), [rep(2, [rep(3, [L])])]).ticks, 6));

  // def / call
  {
    const prog: Program = [def([F, L]), C, C];
    const r = go(board('...S....'), prog);
    c.push(eq('def/call: def·call 0틱, 본문만 틱 (4틱)', [r.ticks, ...owlOf(r)], [4, 4, 2, 'W']));
    c.push(eq('def/call: Step.line은 def 본문 줄 (1,2,1,2)', r.trace.slice(1).map((s) => s.line), [1, 2, 1, 2]));
    c.push(eq('def/call: Step.path는 def 본문 경로', r.trace.slice(1).map((s) => pathKey(s.path ?? [])), ['0.0.0', '0.0.1', '0.0.0', '0.0.1']));
  }
  c.push(eq('def만 있고 call 없음 → 실행 안 됨 (0틱)', go(board('...S....'), [def([F])]).ticks, 0));
  c.push(eq('call 안의 if도 평가됨', go(board('...S#...'), [def([ifw([L], [F])]), C]).owl.dir, 'N'));

  // sleep
  {
    const r = go(board('...S....'), [SL]);
    c.push(eq('sleep = 1틱, 제자리', [r.ticks, ...owlOf(r), last(r).block, r.outcome], [1, 3, 3, 'E', 'sleep', 'stuck']));
  }

  // 고양이 loop / pingpong (부엉이는 멀리서 잠만 잔다)
  const far = 'S.......';
  const catXY = (r: RunResult) => r.trace.map((s) => (s.cat ? `${s.cat.x},${s.cat.y}` : null));
  c.push(eq('고양이 loop: path 순환', catXY(go(catBoard(far, { path: RING, mode: 'loop' }, RING), [SL, SL, SL, SL, SL])),
    ['5,5', '6,5', '6,6', '5,6', '5,5', '6,5']));
  c.push(eq('고양이 pingpong: 끝에서 되돌아옴', catXY(go(catBoard(far, { path: RING.slice(0, 3), mode: 'pingpong' }, RING), [SL, SL, SL, SL, SL])),
    ['5,5', '6,5', '6,6', '6,5', '5,5', '6,5']));
  c.push(eq('고양이 pingpong path 길이 1 → 정지', catXY(go(catBoard(far, { path: RING.slice(0, 1), mode: 'pingpong' }, RING), [SL, SL])), ['5,5', '5,5', '5,5']));
  c.push(eq('고양이 없으면 Step.cat = null', catXY(go(board('...S....'), [SL])), [null, null]));

  // 밟기 / 잡히기
  const patrol: CatPatrol = { path: [{ x: 3, y: 3 }, { x: 2, y: 3 }, { x: 1, y: 3 }], mode: 'pingpong' };
  const catRow = catBoard('Sccc....', patrol, patrol.path);
  {
    const r = go(catRow, [F, F, F]);
    c.push(eq('부엉이가 고양이 칸에 진입 → dead "고양이를 밟았다"', summary(r), ending('dead', '고양이를 밟았다', 'cat', 2)));
    c.push(eq('밟은 틱: 고양이는 움직이지 않음, 같은 칸', [last(r).cat, ...owlOf(r)], [{ x: 2, y: 3 }, 2, 3, 'E']));
  }
  {
    const r = go(catRow, [F, SL, F]);
    c.push(eq('고양이가 부엉이 칸으로 이동 → dead "고양이에게 잡혔다"', summary(r), ending('dead', '고양이에게 잡혔다', 'cat', 2)));
    c.push(eq('잡힌 틱: 고양이 위치 = 부엉이 위치', [last(r).cat, ...owlOf(r)], [{ x: 1, y: 3 }, 1, 3, 'E']));
  }
  {
    const r = go(catBoard('...SG...', { path: RING, mode: 'loop' }, RING), [F]);
    c.push(eq('둥지 도착 틱에는 고양이 정지', [r.outcome, last(r).cat, r.cat], ['goal', RING[0], RING[0]]));
    const r2 = go(catBoard('...SM...', { path: RING, mode: 'loop' }, RING), [F]);
    c.push(eq('일반 틱(쥐 획득)에는 고양이 이동', [last(r2).event, last(r2).cat, r2.mice], ['mouse', RING[1], 1]));
  }

  // maxTicks
  {
    const r = go(board('...S....'), [rep(9, [rep(9, [rep(9, [L])])])]);
    c.push(eq('maxTicks 기본 300 → error/timeout/"시간 초과 (300틱)"', summary(r), ending('error', '시간 초과 (300틱)', 'timeout', 300)));
    c.push(eq('시간 초과: trace 길이 301, 마지막 틱 기록', [r.trace.length, last(r).tick, last(r).block], [301, 300, 'left']));
  }
  c.push(eq('maxTicks 옵션 5 → "시간 초과 (5틱)"', summary(go(board('...S....'), [rep(9, [L])], 5)), ending('error', '시간 초과 (5틱)', 'timeout', 5)));
  c.push(eq('maxTicks 이전에 끝나면 정상', go(board('...S....'), [rep(4, [L])], 5).outcome, 'stuck'));

  // 0틱 반복 (§6.2 repeat, §6.4 "0틱 반복"): 본문 한 바퀴가 액션을 하나도 내지 않으면 그 반복은 끝난다.
  // 세계 상태(=센서)가 그대로이므로 남은 바퀴도 아무것도 내지 않는다 → 결과는 같고, 시간은 블록 수에 비례.
  // (이 규칙이 깨지면 아래 두 실행은 9^12 / 9^11 바퀴를 돌며 verify가 끝나지 않는다.)
  {
    const nest = (depth: number, core: Block[]): Program => {
      let p: Block[] = core;
      for (let i = 0; i < depth; i++) p = [rep(9, p)];
      return p;
    };
    const m = board('...S.#..');   // cap 12
    const empty12 = nest(12, []);
    const r = go(m, empty12);
    c.push(eq('0틱 중첩: 반복 9 ×12 (빈 본문) → validate 통과 12/12, stuck 0틱',
      [validate(empty12, m).ok, countBlocks(empty12), r.outcome, r.ticks], [true, 12, 'stuck', 0]));
    const wallCore = nest(10, [ifw([], [F])]);
    const r2 = go(m, wallCore);
    c.push(eq('0틱 중첩: 반복 9 ×10 { 벽이면 {} 아니면 {앞으로} } → validate 통과(12블록), 1틱 뒤 벽 앞에서 stuck',
      [validate(wallCore, m).ok, countBlocks(wallCore), r2.outcome, r2.ticks, ...owlOf(r2)], [true, 12, 'stuck', 1, 4, 3, 'E']));
    const r3 = go(board('...S#...'), [rep(3, [ifw([L], [])]), R]);
    c.push(eq('0틱 바퀴 생략은 결과를 바꾸지 않음: 반복 3 { 벽이면 {좌회전} } 우회전 → 2틱, 동쪽', [r3.ticks, ...owlOf(r3)], [2, 3, 3, 'E']));
    const r4 = go(board('...S....'), [rep(2, [rep(3, [ifp([], [F])]), L])]);
    c.push(eq('액션을 낸 바퀴는 계속 돈다: 반복 2 { 반복 3 { 구덩이면 {} 아니면 {앞으로} } 좌회전 } → 8틱', [r4.ticks, ...owlOf(r4)], [8, 6, 0, 'W']));
  }
  {
    const opts: RunOptions = { maxTicks: 2 };   // 스펙 §6: RunOptions는 run.ts에서 내보낸다
    c.push(eq('RunOptions(run.ts) maxTicks 2 → 시간 초과 (2틱)', go(board('...S....'), [rep(9, [L])], opts.maxTicks).message, '시간 초과 (2틱)'));
  }

  // stuck 거리
  {
    const r = go(board('...S....'), [F, F]);
    c.push(eq('stuck: 거리 = 맨해튼 (5,3)→(7,7) = 6', [r.outcome, r.distance, r.ticks], ['stuck', 6, 2]));
    c.push(check('stuck: 최종 메시지 있음', r.message.length > 0, r.message));
  }
  c.push(eq('goal이면 distance 0', go(board('...S...G'), [rep(4, [F])]).distance, 0));

  // 컴파일 에러 (방어)
  {
    const r = go(board('...S....'), [C]);
    c.push(eq('call만 있음 → 컴파일 에러, 0틱', [r.outcome, r.message, r.ticks, r.trace.length], ['error', '컴파일 에러: 함수 F가 정의되지 않았다', 0, 1]));
    const r2 = go(board('...S....'), [def([F, rep(2, [C])]), C]);
    c.push(eq('재귀 → 컴파일 에러, 0틱', [r2.outcome, r2.message, r2.ticks], ['error', '컴파일 에러: 함수 F 안에서 F를 부를 수 없다', 0]));
    const r3 = go(board('...S....'), [{ id: 'fly' } as unknown as Block]);
    c.push(eq('알 수 없는 블록 → 컴파일 에러', [r3.outcome, r3.message], ['error', '컴파일 에러: 알 수 없는 블록']));
  }
  {
    // §6.4 "형식이 깨진 블록 문서": 계약 밖 입력(§2 타입 위반)은 검사하지 않는다 — 네 API 모두 예외(TypeError).
    // (id가 BLOCKS에 없는 것만 E_UNKNOWN_BLOCK / 컴파일 에러로 보고.) 호스트는 문서를 읽을 때 try/catch.
    const malformed = [[{ id: 'repeat', n: 2 }], [{ id: 'if_wall', then: [F] }], [null]] as unknown as Program[];
    const map = board('...S....');
    const throws = (fn: () => unknown): string => { try { fn(); return 'ok'; } catch (e) { return (e as Error).constructor.name; } };
    c.push(eq('형식이 깨진 문서(입 없음·null): validate/countBlocks/toText/run 모두 TypeError',
      malformed.map((p) => [throws(() => validate(p, map)), throws(() => countBlocks(p)), throws(() => toText(p)), throws(() => run(map, p))].join(',')),
      malformed.map(() => 'TypeError,TypeError,TypeError,TypeError')));
  }

  // 틱 0 프레임 / 결과 필드
  {
    const r = go(board('...S....', 'W'), [F]);
    const t0 = r.trace[0];
    c.push(eq('trace[0] = 초기 프레임', [t0.tick, t0.block, t0.line, t0.path, t0.owl, t0.event, t0.mice, t0.keys], [0, null, null, null, { x: 3, y: 3, dir: 'W' }, null, 0, 0]));
    c.push(eq('RunResult.blocks = countBlocks', r.blocks, 1));
  }

  return c;
}

// ---------------------------------------------------------------- §9-2 countBlocks / validate

const SPIRAL: Program = [rep(4, [rep(5, [ifw([R], [F])])])];

function counting(): Check[] {
  const c: Check[] = [];
  c.push(eq('countBlocks: 스펙 예시 = 5', countBlocks(SPIRAL), 5));
  c.push(eq('countBlocks: 빈 프로그램 = 0', countBlocks([]), 0));
  c.push(eq('countBlocks: if의 then/else, def 본문 모두 셈', countBlocks([ifw([F, F], [L]), def([J]), C]), 7));

  const map = board('...S....');
  const codes = (p: Program, cap = 12) => validate(p, { ...map, cap }).codes;
  c.push(eq('validate E_EMPTY', codes([]), ['E_EMPTY']));
  c.push(eq('validate E_CAP', codes([F, F, F, F], 3), ['E_CAP']));
  c.push(eq('validate E_CAP 문구', validate([F, F, F, F], { ...map, cap: 3 }).errors, ['블록 상한 초과 (4/3)']));
  c.push(eq('validate E_DEF_NESTED', codes([rep(2, [def([F])])]), ['E_DEF_NESTED']));
  c.push(eq('validate E_DEF_NESTED (if 안)', codes([def([L]), ifw([def([F])])]), ['E_DEF_NESTED', 'E_DEF_MULTI']));
  c.push(eq('validate E_DEF_MULTI', codes([def([F]), def([L])]), ['E_DEF_MULTI']));
  c.push(eq('validate E_CALL_NO_DEF', codes([C]), ['E_CALL_NO_DEF']));
  c.push(eq('validate E_CALL_NO_DEF (중첩 call)', codes([rep(2, [ifw([], [C])])]), ['E_CALL_NO_DEF']));
  c.push(eq('validate E_RECURSION', codes([def([C]), C]), ['E_RECURSION']));
  c.push(eq('validate E_RECURSION (깊이 무관)', codes([def([rep(2, [ifp([], [C])])]), C]), ['E_RECURSION']));
  c.push(eq('validate E_REPEAT_N (0)', codes([rep(0, [F])]), ['E_REPEAT_N']));
  c.push(eq('validate E_REPEAT_N (10)', codes([rep(10, [F])]), ['E_REPEAT_N']));
  c.push(eq('validate E_REPEAT_N (2.5)', codes([rep(2.5, [F])]), ['E_REPEAT_N']));
  c.push(eq('validate E_UNKNOWN_BLOCK', codes([{ id: 'fly' } as unknown as Block]), ['E_UNKNOWN_BLOCK']));
  c.push(eq('validate 전부 보고 (표 순서)', codes([rep(0, [def([C])]), C]), ['E_DEF_NESTED', 'E_CALL_NO_DEF', 'E_RECURSION', 'E_REPEAT_N']));
  c.push(eq('validate 정상 프로그램', validate(SPIRAL, { ...map, cap: 7 }), { ok: true, errors: [], codes: [], blocks: 5, cap: 7 }));
  c.push(eq('validate 문구 개수 = 코드 개수', (() => { const v = validate([def([C]), rep(0, [])], { ...map, cap: 1 }); return [v.ok, v.errors.length, v.codes.length]; })(), [false, 3, 3]));

  c.push(eq('checkMap: 정상 맵 → 문제 없음', checkMap(catBoard('S.......', { path: RING, mode: 'loop' }, RING)), []));
  c.push(check('checkMap: S 2개/짧은 행/이상한 타일 감지', checkMap({ ...map, tiles: ['S.S.....', '.......x', '.......', ...map.tiles.slice(3)] }).length >= 3));
  c.push(check('checkMap: 고양이 path가 c 타일 아님/끊김 감지', checkMap(board('S.......', 'E', { cat: { path: [{ x: 5, y: 5 }, { x: 7, y: 5 }], mode: 'loop' } })).length >= 2));
  return c;
}

// ---------------------------------------------------------------- §9-3 toText / 줄 번호

const SPEC_PROGRAM: Program = [...SPIRAL, def([F, J]), C, SL];
const SPEC_TEXT = [
  '반복 4 {',
  '  반복 5 {',
  '    만약 앞이 벽이면 {',
  '      우회전',
  '    } 아니면 {',
  '      앞으로',
  '    }',
  '  }',
  '}',
  '함수 F {',
  '  앞으로',
  '  점프',
  '}',
  'F 호출',
  '잠자기',
].join('\n');

function text(): Check[] {
  const c: Check[] = [];
  const t = toText(SPEC_PROGRAM);
  c.push(eq('toText: 스펙 예시와 동일 (2칸 들여쓰기, } 아니면 {)', t.text, SPEC_TEXT));
  c.push(eq('toText: 줄 수 15', t.lines.length, 15));
  c.push(eq('toText: 머리 줄 path/blockId', [t.lines[0].path, t.lines[0].blockId, t.lines[2].path, t.lines[2].blockId], [[0], 'repeat', [0, 0, 0, 0, 0], 'if_wall']));
  c.push(eq('toText: 닫는 줄 path null', [t.lines[4].path, t.lines[4].blockId, t.lines[6].path, t.lines[8].path, t.lines[12].path], [null, null, null, null, null]));
  c.push(eq('toText: depth', t.lines.map((l) => l.depth), [0, 1, 2, 3, 2, 3, 2, 1, 0, 0, 1, 1, 0, 0, 0]));
  c.push(eq('toText: else 블록 path 슬롯 1', [t.lines[5].path, t.lines[3].path], [[0, 0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 0, 0]]));
  c.push(eq('toText: 빈 else도 "} 아니면 {" 출력', toText([ifw([F])]).text, '만약 앞이 벽이면 {\n  앞으로\n} 아니면 {\n}'));
  c.push(eq('toText: 빈 then/else', toText([ifp([], [])]).text, '만약 앞이 구덩이면 {\n} 아니면 {\n}'));
  c.push(eq('toText: 빈 repeat/def', toText([rep(2, []), def([])]).text, '반복 2 {\n}\n함수 F {\n}'));
  c.push(eq('toText: 일반 블록 라벨', toText([F, J, L, R, C, SL]).text, '앞으로\n점프\n좌회전\n우회전\nF 호출\n잠자기'));

  const li = lineIndex(SPEC_PROGRAM);
  c.push(eq('lineIndex: pathKey → 줄', [li.get('0'), li.get('0.0.0.0.0.1.0'), li.get('1.0.1'), li.get('3')], [0, 5, 11, 14]));
  c.push(eq('lineIndex: 블록 수만큼 항목', li.size, countBlocks(SPEC_PROGRAM)));

  // run의 Step.line 이 lineIndex/toText 와 일치
  const cases: [string, GameMap, Program][] = [
    ['def/call', board('...S....'), [def([F, L]), C, R, C]],
    ['spiral', board('...S#...'), [rep(2, [rep(3, [ifw([R], [F])])])]],
    ['spec 예시', board('...S....'), SPEC_PROGRAM],
  ];
  for (const [name, map, prog] of cases) {
    const r = go(map, prog);
    const idx = lineIndex(prog);
    const { lines } = toText(prog);
    const steps = r.trace.slice(1);
    const lineOk = steps.every((s) => s.path !== null && s.line === idx.get(pathKey(s.path)));
    const blockOk = steps.every((s) => s.line !== null && lines[s.line].blockId === s.block);
    c.push(check(`Step.line == lineIndex(path) (${name}, ${steps.length}틱)`, steps.length > 0 && lineOk, JSON.stringify(steps.map((s) => [s.line, s.path]))));
    c.push(check(`lines[Step.line].blockId == Step.block (${name})`, blockOk));
  }
  return c;
}

// ---------------------------------------------------------------- §9-4 score

function fakeResult(outcome: Outcome, o: { mice?: number; blocks?: number; distance?: number } = {}): RunResult {
  const owl = { x: 0, y: 0, dir: 'E' as Dir };
  return {
    outcome, message: '', ticks: 0, blocks: o.blocks ?? 1, mice: o.mice ?? 0,
    distance: outcome === 'goal' ? 0 : (o.distance ?? 0), owl, cat: null,
    trace: [{ tick: 0, block: null, line: null, path: null, owl, cat: null, event: null, message: null, mice: 0, keys: 0, opened: [], eaten: [], taken: [] }],
  };
}

function scoring(): Check[] {
  const c: Check[] = [];
  const pts = (s: { lines: { points: number }[] }) => s.lines.map((l) => l.points);
  const labels = (s: { lines: { label: string }[] }) => s.lines.map((l) => l.label);

  const r3 = score(fakeResult('goal', { mice: 2, blocks: 5 }), { cap: 7, firstSubmit: false, usedPatch: false });
  c.push(eq('score R3 검증값 150 (goal, 5/7, 쥐2)', [r3.total, pts(r3)], [150, [100, 40, 10]]));
  const r5 = score(fakeResult('goal', { mice: 2, blocks: 8 }), { cap: 9, firstSubmit: false, usedPatch: true });
  c.push(eq('score R5 검증값 135 (goal, 8/9, 쥐2, 패치)', [r5.total, pts(r5)], [135, [100, 40, 5, -10]]));

  const all = score(fakeResult('goal', { mice: 1, blocks: 4 }), { cap: 12, firstSubmit: true, usedPatch: true });
  c.push(eq('score goal: 모든 줄 순서 (도착·쥐·골프·최초·패치)', pts(all), [100, 20, 40, 10, -10]));
  c.push(check('score goal: 줄 라벨', labels(all)[0] === '둥지 도착' && labels(all)[1] === '쥐 1마리' && labels(all)[2].startsWith('코드 골프') && labels(all)[3] === '최초 제출' && labels(all)[4] === '패치권 사용', JSON.stringify(labels(all))));
  c.push(eq('score goal: 쥐 0·골프 0이면 줄 생략', pts(score(fakeResult('goal', { blocks: 12 }), { cap: 12, firstSubmit: false, usedPatch: false })), [100]));
  c.push(eq('score goal: 골프 음수면 0 & 줄 생략', score(fakeResult('goal', { blocks: 14 }), { cap: 12, firstSubmit: false, usedPatch: false }).total, 100));

  const st = score(fakeResult('stuck', { mice: 1, distance: 3 }), { cap: 12, firstSubmit: true, usedPatch: true });
  c.push(eq('score stuck: 미도착 40−5d, 쥐, 최초, 패치', [st.total, pts(st)], [45, [25, 20, 10, -10]]));
  c.push(eq('score stuck: 라벨에 거리', labels(st)[0], '미도착 (둥지까지 3칸)'));
  c.push(eq('score stuck: 거리 10 → 미도착 0점 (줄은 있음)', pts(score(fakeResult('stuck', { distance: 10 }), { cap: 12, firstSubmit: false, usedPatch: false })), [0]));
  c.push(eq('score error: stuck과 동일 규칙 (d=0 → 40)', pts(score(fakeResult('error', { distance: 0, mice: 2 }), { cap: 12, firstSubmit: false, usedPatch: false })), [40, 40]));
  c.push(eq('score error: 골프 없음', score(fakeResult('error', { distance: 1, blocks: 2 }), { cap: 12, firstSubmit: false, usedPatch: false }).total, 35));

  const dead = score(fakeResult('dead', { mice: 2 }), { cap: 12, firstSubmit: true, usedPatch: false });
  c.push(eq('score dead: 0, 쥐·최초 무효', [dead.total, pts(dead), labels(dead)], [0, [0], ['사망']]));
  const deadPatch = score(fakeResult('dead', { mice: 2 }), { cap: 12, firstSubmit: true, usedPatch: true });
  c.push(eq('score dead + 패치: 줄은 −10, 총점 0 (바닥)', [deadPatch.total, pts(deadPatch)], [0, [0, -10]]));
  c.push(eq('score 음수 방지: 미도착 0 + 패치 −10 → 0', score(fakeResult('stuck', { distance: 8 }), { cap: 12, firstSubmit: false, usedPatch: true }).total, 0));
  {
    // §7 "컴파일 에러": outcome 'error'(0틱)이므로 stuck/error 줄을 그대로 쓴다 — 미도착 거리 점수 + 최초 제출.
    const m = board('...S..G.');   // 둥지까지 3칸
    const ce = score(go(m, [C]), { cap: 12, firstSubmit: true, usedPatch: false });
    c.push(eq('score 컴파일 에러(call만): 미도착(3칸) 25 + 최초 제출 10 = 35', [ce.total, pts(ce)], [35, [25, 10]]));
    const idle = score(go(m, [SL]), { cap: 12, firstSubmit: false, usedPatch: false });
    c.push(eq('score 잠자기만(제자리 stuck): 미도착 25', [idle.total, pts(idle)], [25, [25]]));
  }
  return c;
}

// ---------------------------------------------------------------- 협동 전용 블록 (COOP_SPEC §2): 게임 1은 거절한다

function coopBlocks(): Check[] {
  const c: Check[] = [];
  const TG: Block = { id: 'toggle' };
  const SP: Block = { id: 'spawn' };
  const roleBlocks = (Object.keys(ROLES) as (keyof typeof ROLES)[]).flatMap((r) => ROLES[r].blocks);

  // (a) 메타: 12개, BLOCK_ORDER 순서, 끝 2개가 toggle·spawn, ROLES에는 없음
  c.push(eq('COOP_BLOCKS = BLOCK_ORDER 전체 12개', [COOP_BLOCKS.length, BLOCK_ORDER.length, [...COOP_BLOCKS]], [12, 12, BLOCK_ORDER]));
  c.push(eq('BLOCK_ORDER 끝 = toggle, spawn', BLOCK_ORDER.slice(-2), ['toggle', 'spawn']));
  c.push(eq('BLOCKS: toggle·spawn 메타 (COOP_SPEC §2 표)',
    (['toggle', 'spawn'] as BlockId[]).map((id) => { const m = BLOCKS[id]; return [m.label, m.keyword, m.category, m.role, m.ticks, m.shape, m.deck, m.coop]; }),
    [['색 바꾸기', 'toggle', 'special', 'architect', 1, 'plain', 0, true], ['상자 놓기', 'spawn', 'special', 'architect', 1, 'plain', 0, true]]));
  c.push(eq('coop 플래그는 toggle·spawn에만', BLOCK_ORDER.filter(isCoopBlockId), ['toggle', 'spawn']));
  c.push(check('ROLES는 toggle·spawn을 갖지 않는다', !roleBlocks.includes('toggle') && !roleBlocks.includes('spawn'), JSON.stringify(roleBlocks)));
  c.push(eq('ROLES 블록 합집합 = 게임 1 블록 10개', new Set(roleBlocks).size, 10));
  c.push(eq('containsCoopBlock: 깊이 무관, 알 수 없는 블록은 안 내려감',
    [containsCoopBlock([F, rep(2, [ifw([], [SP])])]), containsCoopBlock([F, SL]), containsCoopBlock([{ id: 'fly' } as unknown as Block])], [true, false, false]));
  c.push(eq('toText: 협동 블록 라벨 (두 줄)', toText([TG, SP]).lines.map((l) => l.text), ['색 바꾸기', '상자 놓기']));

  // (b) validate: R1 실제 맵(cap 12)에서 E_COOP_ONLY (전부 보고, 표 순서 맨 끝)
  c.push(eq('R1 맵 cap = 12', r1Map.cap, 12));
  c.push(eq('validate([toggle], R1) → E_COOP_ONLY "협동 게임 전용 블록"', (() => { const v = validate([TG], r1Map); return [v.ok, v.codes, v.errors]; })(),
    [false, ['E_COOP_ONLY'], ['협동 게임 전용 블록']]));
  c.push(eq('validate: 깊이 무관 (반복·if 안의 spawn), 다른 코드와 함께 보고 (표 순서)',
    validate([rep(0, [ifp([], [SP])]), C], r1Map).codes, ['E_CALL_NO_DEF', 'E_REPEAT_N', 'E_COOP_ONLY']));
  c.push(eq('validate: 협동 블록도 블록 수에 센다', validate([TG, SP, F], r1Map).blocks, 3));

  // (c) run: 컴파일 에러, 0틱
  {
    const r = go(r1Map, [SP]);
    c.push(eq('run(R1, [spawn]) → error, 0틱, 컴파일 에러 문구', [r.outcome, r.ticks, r.trace.length, r.message], ['error', 0, 1, '컴파일 에러: 협동 게임 전용 블록']));
    c.push(check('run: message startsWith 컴파일 에러', r.message.startsWith('컴파일 에러')));
    const r2 = go(r1Map, [rep(4, [F]), rep(2, [TG]), R]);
    c.push(eq('run: 정상 블록 사이에 toggle이 있어도 실행 전 컴파일 에러 (부엉이 제자리)', [r2.outcome, r2.ticks, r2.owl], ['error', 0, r2.trace[0].owl]));
    c.push(eq('run: 알 수 없는 블록이 협동 블록보다 먼저 보고된다', go(r1Map, [TG, { id: 'fly' } as unknown as Block]).message, '컴파일 에러: 알 수 없는 블록'));
  }
  return c;
}

// ---------------------------------------------------------------- 진입점

export function runCore(): Check[] {
  results.length = 0;
  const checks = [...semantics(), ...counting(), ...text(), ...scoring(), ...coopBlocks()];
  // 모든 실행 결과의 공통 불변식
  const badTicks = results.filter((r) => r.ticks !== r.trace.length - 1);
  checks.push(check(`모든 실행(${results.length}건): ticks === trace.length − 1`, badTicks.length === 0));
  const badTickNo = results.filter((r) => r.trace.some((s, i) => s.tick !== i));
  checks.push(check('모든 실행: trace[i].tick === i', badTickNo.length === 0));
  const badEnd = results.filter((r) => r.outcome !== 'stuck' && r.ticks > 0 && r.trace[r.trace.length - 1].event === null);
  checks.push(check('모든 실행: 종료 틱에는 event가 있다 (stuck 제외)', badEnd.length === 0));
  const badOwl = results.filter((r) => JSON.stringify(r.owl) !== JSON.stringify(r.trace[r.trace.length - 1].owl));
  checks.push(check('모든 실행: 최종 owl == 마지막 Step.owl', badOwl.length === 0));
  return checks;
}
