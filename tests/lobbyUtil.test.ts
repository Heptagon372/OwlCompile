// 대기실·홈 화면 순수 도우미 (components/lobby/lobbyUtil.ts)
import { describe, expect, it } from 'vitest';
import type { OpenGameSummary } from '@/lib/contracts';
import {
  assignedMessage, cleanGameCode, cumulativeCounts, dailyCounts, isGameCode, josaRo, openGameMeta, phaseStatus,
  rolesText, sortOpenGames, waitText,
} from '@/components/lobby/lobbyUtil';

function game(code: string, joinable: boolean): OpenGameSummary {
  return {
    code, hostName: '진행', phase: 'lobby', round: 1, rounds: [1, 2, 3], teams: 2, members: 3, mode: 'auto', joinable,
    createdAt: '2026-09-14T00:00:00.000Z',
  };
}

describe('josaRo', () => {
  it('받침 없음·ㄹ 받침은 로, 그 밖의 받침은 으로', () => {
    expect(josaRo('러너')).toBe('로');
    expect(josaRo('아키텍트')).toBe('로');
    expect(josaRo('컨트롤러')).toBe('로');
    expect(josaRo('서울')).toBe('로');
    expect(josaRo('수리부엉이 팀')).toBe('으로');
    expect(josaRo('ABC')).toBe('로');
    expect(josaRo('')).toBe('로');
  });
});

describe('assignedMessage', () => {
  it('팀 이름과 역할(GAME_ROLES 순서)로 배정 문구를 만든다', () => {
    expect(assignedMessage({ teamName: '수리부엉이', roles: ['runner'] })).toBe('수리부엉이 팀 · 러너로 배정됐어요');
    expect(assignedMessage({ teamName: '올빼미', roles: ['architect', 'turner'] })).toBe('올빼미 팀 · 터너·아키텍트로 배정됐어요');
  });
  it('역할이 없으면 팀원', () => {
    expect(rolesText([])).toBe('팀원');
    expect(assignedMessage({ teamName: '소쩍새', roles: [] })).toBe('소쩍새 팀 · 팀원으로 배정됐어요');
  });
});

describe('게임 코드', () => {
  it('숫자만 4자리까지 남긴다', () => {
    expect(cleanGameCode(' 12a3-45 ')).toBe('1234');
    expect(isGameCode('1234')).toBe(true);
    expect(isGameCode('123')).toBe(false);
    expect(isGameCode('12345')).toBe(false);
  });
});

describe('열린 게임', () => {
  it('참가할 수 있는 게임을 먼저, 나머지는 원래 순서', () => {
    const out = sortOpenGames([game('1111', false), game('2222', true), game('3333', false), game('4444', true)]);
    expect(out.map((g) => g.code)).toEqual(['2222', '4444', '1111', '3333']);
  });
  it('설명 줄에 라운드 위치 표기를 쓴다', () => {
    expect(openGameMeta({ hostName: '김진행', round: 4, rounds: [1, 2, 4, 5, 7], teams: 4, members: 13 }))
      .toBe('김진행 · R4 · 3/5 · 난이도 4 · 팀 4 · 13명');
  });
  it('페이즈 → 상태 알약', () => {
    expect(phaseStatus('lobby')).toBe('pending');
    expect(phaseStatus('coding')).toBe('progress');
    expect(phaseStatus('scored')).toBe('progress');
    expect(phaseStatus('finished')).toBe('done');
  });
});

describe('waitText', () => {
  const now = Date.parse('2026-09-14T10:00:00.000Z');
  it('분·시간 단위로', () => {
    expect(waitText('2026-09-14T09:59:30.000Z', now)).toBe('방금 들어왔어요');
    expect(waitText('2026-09-14T09:57:00.000Z', now)).toBe('3분째 기다리는 중');
    expect(waitText('2026-09-14T08:55:00.000Z', now)).toBe('1시간 5분째 기다리는 중');
    expect(waitText('2026-09-14T08:00:00.000Z', now)).toBe('2시간째 기다리는 중');
    expect(waitText('엉터리', now)).toBe('');
    expect(waitText(null, now)).toBe('');
  });
});

describe('날짜별 개수', () => {
  // 로컬 시각으로 만든다 (자정 경계를 테스트 시간대와 무관하게)
  const at = (d: number, h: number) => new Date(2026, 8, d, h, 0, 0).toISOString();
  const now = new Date(2026, 8, 14, 15, 0, 0).getTime();

  it('dailyCounts: 오래된 날 먼저, 마지막 칸이 오늘', () => {
    const list = [at(14, 1), at(14, 9), at(13, 23), at(12, 0), at(1, 12), null, 'x', at(15, 1)];
    expect(dailyCounts(list, 3, now)).toEqual([1, 1, 2]);
    expect(dailyCounts([], 4, now)).toEqual([0, 0, 0, 0]);
  });

  it('cumulativeCounts: 각 날 끝까지 쌓인 수, 마지막 칸 = 전체', () => {
    const list = [at(14, 1), at(14, 9), at(13, 23), at(12, 0), at(1, 12)];
    // 12일 끝: 1일·12일 = 2, 13일 끝: +1 = 3, 오늘까지: 5
    expect(cumulativeCounts(list, 3, now)).toEqual([2, 3, 5]);
  });
});
