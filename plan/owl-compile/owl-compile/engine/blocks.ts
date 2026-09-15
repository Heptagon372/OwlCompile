// OWL COMPILE — 블록 카탈로그 + 역할 + 점수. 카드 인쇄와 웹 팔레트가 같은 데이터를 쓴다.
import type { GameMap, RunResult } from './types';
import { goalOf } from './interpreter';

export type Category = 'move' | 'turn' | 'control' | 'function' | 'special';
export type Role = 'runner' | 'turner' | 'controller' | 'architect';
export type Shape = 'stack' | 'c' | 'c-else';

export interface BlockDef {
  id: string;
  label: string; // 카드에 크게 찍히는 한국어
  keyword: string; // 영어 키워드(작게)
  category: Category;
  role: Role;
  shape: Shape;
  ticks: 0 | 1;
  desc: string;
  copies: number; // 팀당 카드 세트 수량
  param?: string;
}

export const CATEGORIES: Record<Category, { label: string; color: string; ink: string }> = {
  move: { label: '이동', color: '#8E5CFF', ink: '#FFFFFF' },
  turn: { label: '회전', color: '#2FC4D9', ink: '#0B1C22' },
  control: { label: '제어', color: '#FFB020', ink: '#2A1B00' },
  function: { label: '함수', color: '#3DD68C', ink: '#062A19' },
  special: { label: '특수', color: '#FF6B9A', ink: '#FFFFFF' },
};

export const ROLES: Record<Role, { label: string; ko: string; job: string }> = {
  runner: { label: 'Runner', ko: '러너', job: '경로 설계 — 이동 블록 소유' },
  turner: { label: 'Turner', ko: '터너', job: '방향 계산 — 회전 블록 소유' },
  controller: { label: 'Controller', ko: '컨트롤러', job: '최적화·논리 — 반복/조건 소유' },
  architect: { label: 'Architect', ko: '아키텍트', job: '구조화·최종 제출 — 함수/잠자기 소유' },
};

export const BLOCKS: BlockDef[] = [
  { id: 'forward', label: '앞으로', keyword: 'forward', category: 'move', role: 'runner', shape: 'stack', ticks: 1, desc: '바라보는 방향으로 1칸. 벽이면 에러, 구덩이면 추락.', copies: 6 },
  { id: 'jump', label: '점프', keyword: 'jump', category: 'move', role: 'runner', shape: 'stack', ticks: 1, desc: '정확히 2칸 전진. 중간 칸의 구덩이는 넘고, 벽은 못 넘는다.', copies: 4 },
  { id: 'left', label: '좌회전', keyword: 'turn left', category: 'turn', role: 'turner', shape: 'stack', ticks: 1, desc: '제자리에서 왼쪽으로 90°.', copies: 4 },
  { id: 'right', label: '우회전', keyword: 'turn right', category: 'turn', role: 'turner', shape: 'stack', ticks: 1, desc: '제자리에서 오른쪽으로 90°.', copies: 4 },
  { id: 'repeat', label: '반복', keyword: 'repeat', category: 'control', role: 'controller', shape: 'c', ticks: 0, desc: '안의 블록을 N번 실행. N은 1~9.', copies: 3, param: 'N' },
  { id: 'if_wall', label: '만약 앞이 벽이면', keyword: 'if wall ahead', category: 'control', role: 'controller', shape: 'c-else', ticks: 0, desc: '앞 칸이 벽·맵 밖·잠긴 문이면 위, 아니면 아래를 실행.', copies: 2 },
  { id: 'if_pit', label: '만약 앞이 구덩이면', keyword: 'if pit ahead', category: 'control', role: 'controller', shape: 'c-else', ticks: 0, desc: '앞 칸이 구덩이면 위, 아니면 아래를 실행.', copies: 2 },
  { id: 'def', label: '함수 F', keyword: 'define F', category: 'function', role: 'architect', shape: 'c', ticks: 0, desc: '안의 블록 묶음에 F라는 이름을 붙인다. 프로그램당 1개, 최상위에만.', copies: 1 },
  { id: 'call', label: 'F 호출', keyword: 'call F', category: 'function', role: 'architect', shape: 'stack', ticks: 0, desc: 'F 안의 블록을 그 자리에서 실행. 함수 안에서 호출 불가.', copies: 4 },
  { id: 'sleep', label: '잠자기', keyword: 'sleep', category: 'special', role: 'architect', shape: 'stack', ticks: 1, desc: '1틱 대기. 고양이는 움직인다.', copies: 3 },
];

export interface ScoreInput {
  fastestSubmit?: boolean;
  usedPatch?: boolean;
}

export interface ScoreLine {
  label: string;
  points: number;
}

export function score(res: RunResult, map: GameMap, opt: ScoreInput = {}): { total: number; lines: ScoreLine[] } {
  const lines: ScoreLine[] = [];
  if (res.outcome === 'dead') {
    lines.push({ label: `사망 (${res.message})`, points: 0 });
  } else if (res.outcome === 'goal') {
    lines.push({ label: '둥지 도착', points: 100 });
    if (res.mice) lines.push({ label: `쥐 ${res.mice}마리`, points: res.mice * 20 });
    const golf = map.limit - res.blocks;
    if (golf > 0) lines.push({ label: `코드 골프 (상한 -${golf})`, points: golf * 5 });
  } else {
    const g = goalOf(map);
    const dist = Math.abs(g.x - res.final.x) + Math.abs(g.y - res.final.y);
    lines.push({ label: `미도착 · 남은 거리 ${dist}칸 (${res.message})`, points: Math.max(0, 40 - dist * 5) });
    if (res.mice) lines.push({ label: `쥐 ${res.mice}마리`, points: res.mice * 20 });
  }
  if (opt.fastestSubmit && res.outcome !== 'dead') lines.push({ label: '최단 시간 제출', points: 10 });
  if (opt.usedPatch) lines.push({ label: '패치권 사용', points: -10 });
  return { total: lines.reduce((s, l) => s + l.points, 0), lines };
}
