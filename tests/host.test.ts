// 진행자 화면(/host, /host/[code]) 순수 계산: 새 게임 미리보기·라운드 칩·팀원 도구 (FEATURE_V4 §1–§3)
import { describe, expect, it } from 'vitest';
import { LIMITS, type GameRole, type RoundNo } from '@/lib/contracts';
import {
  assignSummary, canAssignIn, createPreview, fewestTeam, moveTargets, newcomerRoles, presetOf, pullMessage, roundsText,
  timerRing, toggleRound, waitLabel,
} from '@/components/host/logic';

describe('round chips and presets', () => {
  it('toggles a round and keeps the list ascending without duplicates', () => {
    expect(toggleRound([1, 2, 3], 5)).toEqual([1, 2, 3, 5]);
    expect(toggleRound([1, 3, 5], 2)).toEqual([1, 2, 3, 5]);
    expect(toggleRound([1, 2, 3], 2)).toEqual([1, 3]);
  });
  it('never empties the list', () => {
    expect(toggleRound([4], 4)).toEqual([4]);
  });
  it('recognises the five presets and custom mixes', () => {
    // docs/ROUNDS_8_10.md §4: 전체 = 1~10, 심화 = 8~10 (1~7만 고르면 프리셋이 아닌 직접 조합)
    expect(presetOf([1, 2, 3])).toBe('intro');
    expect(presetOf([1, 2, 3, 4, 5])).toBe('standard');
    expect(presetOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('all');
    expect(presetOf([1, 2, 3, 4, 5, 6, 7])).toBeNull();
    expect(presetOf([4, 5, 6, 7])).toBe('challenge');
    expect(presetOf([8, 9, 10])).toBe('advanced');
    expect(presetOf([1, 3])).toBeNull();
  });
  it('writes short round labels', () => {
    expect(roundsText([1, 2, 3])).toBe('R1–3');
    expect(roundsText([4, 5, 6, 7])).toBe('R4–7');
    expect(roundsText([6])).toBe('R6');
    expect(roundsText([1, 3, 6] as RoundNo[])).toBe('R1 · R3 · R6');
  });
});

describe('new game preview (auto assignment)', () => {
  it('spreads waiting people i mod T and fills all four roles per team', () => {
    const p = createPreview(10, 3, 'auto');
    expect(p.teams.map((t) => t.size)).toEqual([4, 3, 3]);
    expect(p.placed).toBe(10);
    expect(p.leftWaiting).toBe(0);
    expect(p.capacity).toBe(18);
    for (const t of p.teams) {
      const covered = new Set(t.roles.flat());
      expect(covered.size).toBe(4);
    }
    expect(p.teams[0].name).toBe('수리부엉이');
  });
  it('caps each team at six people and reports who stays waiting', () => {
    const p = createPreview(15, 2, 'auto');
    expect(p.teams.map((t) => t.size)).toEqual([6, 6]);
    expect(p.leftWaiting).toBe(3);
  });
  it('counts empty teams when fewer people than teams', () => {
    const p = createPreview(3, 5, 'auto');
    expect(p.teams.map((t) => t.size)).toEqual([1, 1, 1, 0, 0]);
    expect(p.emptyTeams).toBe(2);
    expect(createPreview(0, 5, 'auto').emptyTeams).toBe(0);
  });
  it('places nobody in self mode', () => {
    const p = createPreview(12, 4, 'self');
    expect(p.placed).toBe(0);
    expect(p.leftWaiting).toBe(0);
    expect(p.teams.every((t) => t.size === 0)).toBe(true);
  });
  it('clamps the team count to 2..10', () => {
    expect(createPreview(4, 1, 'auto').teams).toHaveLength(LIMITS.minTeams);
    expect(createPreview(4, 12, 'auto').teams).toHaveLength(LIMITS.maxTeams);
  });
  it('summarises create and pull results', () => {
    expect(assignSummary({ assigned: 7, leftWaiting: 2 })).toBe('7명 배정, 2명 대기');
    expect(pullMessage({ assigned: 0, leftWaiting: 0 })).toBe('데려올 사람이 없습니다');
    expect(pullMessage({ assigned: 3, leftWaiting: 0 })).toBe('3명 배정, 0명 대기');
    expect(pullMessage({ assigned: 2, leftWaiting: 4 })).toContain('자리가 부족합니다');
  });
});

describe('console member tools', () => {
  const person = (userId: string) => ({ userId });
  const teams = [
    { id: 'a', people: [person('u1'), person('u2')], missingRoles: ['runner', 'turner'] as GameRole[] },
    { id: 'b', people: Array.from({ length: 6 }, (_, i) => person(`v${i}`)), missingRoles: [] as GameRole[] },
    { id: 'c', people: [person('w1')], missingRoles: [] as GameRole[] },
  ];

  it('assigns only in lobby and coding', () => {
    expect(canAssignIn('lobby')).toBe(true);
    expect(canAssignIn('coding')).toBe(true);
    expect(canAssignIn('sealed')).toBe(false);
    expect(canAssignIn('running')).toBe(false);
  });
  it('gives a newcomer the missing roles, else the next role in order', () => {
    expect(newcomerRoles(teams[0])).toEqual(['runner', 'turner']);
    // 4명이 모두 채운 팀의 5번째 사람 → AUTO_ROLE_ORDER[4 mod 4] = architect
    expect(newcomerRoles({ people: [1, 2, 3, 4], missingRoles: [] })).toEqual(['architect']);
  });
  it('blocks full teams except the person\'s own team', () => {
    const t = moveTargets(teams, 'v0');
    expect(t.find((x) => x.team.id === 'b')).toMatchObject({ full: false, current: true, count: 6 });
    const u = moveTargets(teams, 'u1');
    expect(u.find((x) => x.team.id === 'b')).toMatchObject({ full: true, current: false });
    expect(u.find((x) => x.team.id === 'a')).toMatchObject({ current: true });
  });
  it('picks the team with the fewest people', () => {
    expect(fewestTeam(teams)?.id).toBe('c');
    expect(fewestTeam([])).toBeNull();
  });
});

describe('timer ring and wait labels', () => {
  it('keeps the ring full when time was added past the map time', () => {
    expect(timerRing(120, 300)).toEqual({ value: 120, max: 300 });
    expect(timerRing(330, 300)).toEqual({ value: 330, max: 330 });
    expect(timerRing(null, 300)).toEqual({ value: 0, max: 300 });
  });
  it('formats waiting time', () => {
    const since = '2026-09-14T10:00:00.000Z';
    const t0 = Date.parse(since);
    expect(waitLabel(since, null)).toBe('');
    expect(waitLabel(since, t0 + 20_000)).toBe('방금');
    expect(waitLabel(since, t0 + 5 * 60_000)).toBe('5분');
    expect(waitLabel(since, t0 + 65 * 60_000)).toBe('1시간 5분');
    expect(waitLabel(since, t0 + 120 * 60_000)).toBe('2시간');
  });
});
