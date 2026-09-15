// lib/codegen (docs/FEATURE_V4.md §4): 블록 → 파이썬식 코드 · 한국어 코드 · 줄 차이.
import { describe, expect, it } from 'vitest';
import type { Block, BlockId, Program } from '@/lib/engine/types';
import { lineIndex, pathKey, toText } from '@/lib/engine/text';
import { run } from '@/lib/engine/run';
import { MAPS } from '@/lib/engine/maps';
import { SOLUTIONS } from '@/lib/engine/solutions';
import { diffListings, lineOfPath, toKorean, toListing, toPython, toPythonText, type CodeListing } from '@/lib/codegen';

const py = (p: Program) => toPython(p).lines.map((l) => l.text);
const F = (id: 'forward' | 'jump' | 'left' | 'right' | 'call' | 'sleep', uid?: string): Block => (uid ? { id, uid } : { id });

/** 모든 줄: 토큰을 이으면 code, 들여쓰기 + code = text */
function expectWellFormed(listing: CodeListing, unit: string) {
  for (const l of listing.lines) {
    expect(l.tokens.map((t) => t.text).join('')).toBe(l.code);
    expect(l.text).toBe(unit.repeat(l.indent) + l.code);
    for (const t of l.tokens) expect(['keyword', 'builtin', 'call', 'number', 'punct', 'comment']).toContain(t.kind);
  }
  expect(listing.text).toBe(listing.lines.map((l) => l.text).join('\n'));
  expect(new Set(listing.lines.map((l) => l.key)).size).toBe(listing.lines.length);
}

describe('toPython: 블록 하나씩', () => {
  it.each([
    ['forward', 'owl.forward()'],
    ['jump', 'owl.jump()'],
    ['left', 'owl.turn_left()'],
    ['right', 'owl.turn_right()'],
    ['sleep', 'owl.sleep()'],
    ['call', 'F()'],
  ] as const)('%s → %s', (id, text) => {
    const l = toPython([F(id)]);
    expect(l.lines.map((x) => x.text)).toEqual([text]);
    expect(l.lines[0].blockId).toBe(id);
    expect(l.lines[0].path).toEqual([0]);
    expect(l.lineOf.get('0')).toBe(0);
  });

  it('반복 N → for _ in range(N):', () => {
    expect(py([{ id: 'repeat', n: 3, body: [F('forward')] }])).toEqual(['for _ in range(3):', '    owl.forward()']);
  });

  it('만약 앞이 벽이면 / 아니면 → if owl.wall_ahead(): / else:', () => {
    expect(py([{ id: 'if_wall', then: [F('left')], else: [F('forward')] }])).toEqual([
      'if owl.wall_ahead():', '    owl.turn_left()', 'else:', '    owl.forward()',
    ]);
  });

  it('만약 앞이 구덩이면 → if owl.pit_ahead():', () => {
    expect(py([{ id: 'if_pit', then: [F('jump')], else: [] }])).toEqual(['if owl.pit_ahead():', '    owl.jump()']);
  });

  it('함수 F → def F():', () => {
    expect(py([{ id: 'def', body: [F('jump')] }])).toEqual(['def F():', '    owl.jump()']);
  });

  it('토큰 종류 (문법 색)', () => {
    const [rep, fwd] = toPython([{ id: 'repeat', n: 4, body: [F('forward')] }]).lines;
    expect(rep.tokens).toEqual([
      { text: 'for', kind: 'keyword' }, { text: ' _ ', kind: 'punct' }, { text: 'in', kind: 'keyword' },
      { text: ' ', kind: 'punct' }, { text: 'range', kind: 'builtin' }, { text: '(', kind: 'punct' },
      { text: '4', kind: 'number' }, { text: '):', kind: 'punct' },
    ]);
    expect(fwd.tokens).toEqual([
      { text: 'owl', kind: 'builtin' }, { text: '.', kind: 'punct' }, { text: 'forward', kind: 'call' }, { text: '()', kind: 'punct' },
    ]);
    const [iff, , els] = toPython([{ id: 'if_wall', then: [F('left')], else: [F('right')] }]).lines;
    expect(iff.tokens.map((t) => t.kind)).toEqual(['keyword', 'punct', 'builtin', 'punct', 'call', 'punct']);
    expect(els.tokens).toEqual([{ text: 'else', kind: 'keyword' }, { text: ':', kind: 'punct' }]);
    const [def, , call] = toPython([{ id: 'def', body: [F('sleep')] }, F('call')]).lines;
    expect(def.tokens.map((t) => [t.text, t.kind])).toEqual([['def', 'keyword'], [' ', 'punct'], ['F', 'call'], ['():', 'punct']]);
    expect(call.tokens.map((t) => [t.text, t.kind])).toEqual([['F', 'call'], ['()', 'punct']]);
  });

  it('빈 프로그램 → 줄 없음', () => {
    const l = toPython([]);
    expect(l.lines).toEqual([]);
    expect(l.text).toBe('');
    expect(l.lineOf.size).toBe(0);
  });

  it('알 수 없는 블록 → 주석 줄 (엔진 toText 처럼 막지 않고 보여 준다)', () => {
    const l = toPython([{ id: 'zzz' } as unknown as Block]);
    expect(l.lines[0].text).toBe('# ? zzz');
    expect(l.lines[0].tokens).toEqual([{ text: '# ? zzz', kind: 'comment' }]);
    expect(l.lines[0].blockId).toBeNull();
  });
});

describe('toPython: 빈 몸통 pass · 빈 else 생략', () => {
  it('빈 반복·함수 → pass', () => {
    expect(py([{ id: 'repeat', n: 2, body: [] }])).toEqual(['for _ in range(2):', '    pass']);
    expect(py([{ id: 'def', body: [] }])).toEqual(['def F():', '    pass']);
  });
  it('then·else 둘 다 비면 → pass 하나, else 없음', () => {
    expect(py([{ id: 'if_wall', then: [], else: [] }])).toEqual(['if owl.wall_ahead():', '    pass']);
  });
  it('then 만 비면 → pass + else', () => {
    expect(py([{ id: 'if_pit', then: [], else: [F('forward')] }])).toEqual([
      'if owl.pit_ahead():', '    pass', 'else:', '    owl.forward()',
    ]);
  });
  it('else 만 비면 → else 생략', () => {
    expect(py([{ id: 'if_wall', then: [F('left')], else: [] }])).toEqual(['if owl.wall_ahead():', '    owl.turn_left()']);
  });
  it('pass·else 줄은 path 없음, owner 는 감싼 블록', () => {
    const l = toPython([F('jump'), { id: 'if_wall', then: [], else: [F('forward')] }]);
    const pass = l.lines[2];
    const els = l.lines[3];
    expect(pass.code).toBe('pass');
    expect(pass.path).toBeNull();
    expect(pass.owner).toEqual([1]);
    expect(els.code).toBe('else:');
    expect(els.path).toBeNull();
    expect(els.owner).toEqual([1]);
    expect(l.lines[4].path).toEqual([1, 1, 0]);
  });
});

describe('toPython: 중첩과 경로', () => {
  const nested: Program = [
    {
      id: 'repeat', n: 2, body: [
        { id: 'if_wall', then: [F('left')], else: [{ id: 'repeat', n: 3, body: [F('forward')] }] },
        F('jump'),
      ],
    },
    F('sleep'),
  ];

  it('4칸 들여쓰기로 겹겹이', () => {
    expect(py(nested)).toEqual([
      'for _ in range(2):',
      '    if owl.wall_ahead():',
      '        owl.turn_left()',
      '    else:',
      '        for _ in range(3):',
      '            owl.forward()',
      '    owl.jump()',
      'owl.sleep()',
    ]);
    const l = toPython(nested);
    expect(l.lines.map((x) => x.indent)).toEqual([0, 1, 2, 1, 2, 3, 1, 0]);
    expectWellFormed(l, '    ');
  });

  it('머리 줄 path 와 pathKey → 줄 번호 맵 (엔진 경로 규칙)', () => {
    const l = toPython(nested);
    expect(l.lines.map((x) => x.path)).toEqual([
      [0], [0, 0, 0], [0, 0, 0, 0, 0], null, [0, 0, 0, 1, 0], [0, 0, 0, 1, 0, 0, 0], [0, 0, 1], [1],
    ]);
    expect([...l.lineOf.entries()]).toEqual([
      ['0', 0], ['0.0.0', 1], ['0.0.0.0.0', 2], ['0.0.0.1.0', 4], ['0.0.0.1.0.0.0', 5], ['0.0.1', 6], ['1', 7],
    ]);
    expect(lineOfPath(l, [0, 0, 1])).toBe(6);
    expect(lineOfPath(l, [9])).toBe(-1);
    expect(lineOfPath(l, null)).toBe(-1);
    // 모든 블록(C-블록 포함)이 줄을 가진다: 엔진 lineIndex 와 같은 키 집합
    expect(new Set(l.lineOf.keys())).toEqual(new Set(lineIndex(nested).keys()));
  });

  it('toPythonText = 줄을 이은 글', () => {
    expect(toPythonText(nested).split('\n')).toEqual(py(nested));
  });
});

describe('toPython: 함수 정의·호출', () => {
  const prog: Program = [
    { id: 'def', body: [F('left'), F('right'), F('left')] },
    F('call'),
    { id: 'repeat', n: 2, body: [F('call')] },
  ];

  it('def F(): 본문 + F() 호출 줄', () => {
    expect(py(prog)).toEqual([
      'def F():', '    owl.turn_left()', '    owl.turn_right()', '    owl.turn_left()',
      'F()', 'for _ in range(2):', '    F()',
    ]);
  });

  it('F 호출로 실행된 액션의 Step.path 는 def 본문 줄로 이어진다', () => {
    const res = run(MAPS[1], prog);
    const steps = res.trace.filter((s) => s.path);
    expect(steps.length).toBe(9); // 호출 3번 × 본문 3틱 (회전만: 벽에 부딪히지 않는다)
    const l = toPython(prog);
    for (const s of steps) {
      expect(s.path![0]).toBe(0); // def 본문 [0, 0, j]
      const i = lineOfPath(l, s.path);
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(3);
      expect(l.lines[i].blockId).toBe(s.block);
      expect(l.lines[i].indent).toBe(1);
    }
    expect(steps.map((s) => lineOfPath(l, s.path))).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });
});

describe('실제 정답 프로그램: 모든 실행 틱의 path 가 같은 블록 줄로', () => {
  const rounds = Object.entries(SOLUTIONS as Record<string, Program[]>);
  it('라운드 정답이 있다', () => expect(rounds.length).toBeGreaterThanOrEqual(5));
  for (const [key, programs] of rounds) {
    const n = Number(key.slice(1)) as keyof typeof MAPS;
    const map = MAPS[n];
    if (!map) continue;
    programs.forEach((program, pi) => {
      it(`${key} 정답 ${pi}`, () => {
        const res = run(map, program);
        const pyL = toPython(program);
        const koL = toKorean(program);
        expectWellFormed(pyL, '    ');
        expectWellFormed(koL, '  ');
        let checked = 0;
        for (const s of res.trace) {
          if (!s.path) continue;
          const pi2 = lineOfPath(pyL, s.path);
          expect(pi2).toBeGreaterThanOrEqual(0);
          expect(pyL.lines[pi2].blockId).toBe(s.block as BlockId);
          // 한국어 줄 번호 = 엔진 Step.line
          expect(lineOfPath(koL, s.path)).toBe(s.line);
          checked++;
        }
        expect(checked).toBe(res.ticks);
      });
    });
  }
});

describe('toKorean = 엔진 toText (글자·줄 번호 그대로)', () => {
  const samples: Program[] = [
    [],
    [F('forward'), F('jump'), F('left'), F('right'), F('sleep')],
    [{ id: 'def', body: [F('forward')] }, F('call'), { id: 'repeat', n: 5, body: [{ id: 'if_pit', then: [F('jump')], else: [] }] }],
    [{ id: 'if_wall', then: [], else: [] }, { id: 'zzz' } as unknown as Block],
    ...Object.values(SOLUTIONS as Record<string, Program[]>).flat(),
  ];
  it.each(samples.map((p, i) => [i, p] as const))('샘플 %i', (_i, p) => {
    const ko = toKorean(p);
    const t = toText(p);
    expect(ko.lines.map((l) => l.text)).toEqual(t.lines.map((l) => l.text));
    expect(ko.lines.map((l) => l.path)).toEqual(t.lines.map((l) => l.path));
    expect([...ko.lineOf.entries()]).toEqual([...lineIndex(p).entries()]);
    expectWellFormed(ko, '  ');
  });
  it('한국어 토큰: 반복 숫자는 number, 아니면은 keyword', () => {
    const ko = toKorean([{ id: 'repeat', n: 3, body: [] }, { id: 'if_wall', then: [], else: [] }]);
    expect(ko.lines[0].tokens.find((t) => t.kind === 'number')?.text).toBe('3');
    expect(ko.lines[3].tokens.find((t) => t.kind === 'keyword')?.text).toBe('아니면');
    expect(ko.lines[3].owner).toEqual([1]);
  });
  it('toListing 은 언어별로 고른다', () => {
    const p: Program = [F('forward')];
    expect(toListing(p).lines[0].text).toBe('owl.forward()');
    expect(toListing(p, 'python').lines[0].text).toBe('owl.forward()');
    expect(toListing(p, 'korean').lines[0].text).toBe('앞으로');
  });
});

describe('줄 키 (블록 uid) 와 diffListings', () => {
  it('uid 가 있으면 옮겨도 같은 키, 없으면 경로 키', () => {
    const a = toPython([F('forward', 'u1'), F('left', 'u2')]);
    const b = toPython([F('left', 'u2'), F('forward', 'u1')]);
    expect(a.lines.map((l) => l.key)).toEqual(['u:u1', 'u:u2']);
    expect(b.lines.map((l) => l.key)).toEqual(['u:u2', 'u:u1']);
    expect(toPython([F('jump')]).lines[0].key).toBe('p:0');
    // pass·else 줄은 블록 키 + 역할
    const c = toPython([{ id: 'if_wall', then: [], else: [F('jump', 'j')], uid: 'w' }]);
    expect(c.lines.map((l) => l.key)).toEqual(['u:w', 'u:w:pass0', 'u:w:else', 'u:j']);
  });

  it('uid 가 겹쳐도 키는 유일', () => {
    const l = toPython([F('forward', 'dup'), F('jump', 'dup')]);
    expect(l.lines.map((x) => x.key)).toEqual(['u:dup', 'u:dup#1']);
  });

  it('처음 그릴 때(이전 없음)는 변화 없음', () => {
    const d = diffListings(null, toPython([F('forward', 'a')]).lines);
    expect(d.changed).toBe(false);
    expect(d.status.get('u:a')).toBe('same');
    expect(d.removed).toEqual([]);
  });

  it('새 블록 → new, 반복 횟수 → changed, 지운 블록 → removed(앞 줄 뒤)', () => {
    const before = toPython([F('forward', 'a'), { id: 'repeat', n: 2, body: [F('left', 'b')], uid: 'r' }, F('jump', 'c')]);
    const after = toPython([F('forward', 'a'), { id: 'repeat', n: 3, body: [F('left', 'b'), F('right', 'n')], uid: 'r' }]);
    const d = diffListings(before.lines, after.lines);
    expect(d.status.get('u:a')).toBe('same');
    expect(d.status.get('u:r')).toBe('changed');
    expect(d.status.get('u:b')).toBe('same');
    expect(d.status.get('u:n')).toBe('new');
    expect(d.removed.map((r) => [r.line.key, r.after])).toEqual([['u:c', 'u:b']]);
    expect(d.focus).toEqual({ kind: 'new', line: after.lines[3] });
    expect(d.changed).toBe(true);
  });

  it('반복 안으로 옮기면 들여쓰기가 바뀌어 changed, 빈 몸통 pass 는 사라진다', () => {
    const before = toPython([{ id: 'repeat', n: 2, body: [], uid: 'r' }, F('forward', 'f')]);
    const after = toPython([{ id: 'repeat', n: 2, body: [F('forward', 'f')], uid: 'r' }]);
    const d = diffListings(before.lines, after.lines);
    expect(d.status.get('u:f')).toBe('changed');
    expect(d.removed.map((r) => [r.line.key, r.after])).toEqual([['u:r:pass0', 'u:r']]);
    expect(d.focus?.kind).toBe('changed');
  });

  it('맨 앞 줄을 지우면 after = null', () => {
    const d = diffListings(toPython([F('jump', 'x'), F('left', 'y')]).lines, toPython([F('left', 'y')]).lines);
    expect(d.removed.map((r) => [r.line.key, r.after])).toEqual([['u:x', null]]);
    expect(d.focus).toEqual({ kind: 'removed', line: expect.objectContaining({ key: 'u:x' }) });
  });

  it('pathKey 는 엔진 것과 같다', () => {
    expect(pathKey([0, 1, 2])).toBe('0.1.2');
  });
});
