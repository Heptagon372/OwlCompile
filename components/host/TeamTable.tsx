'use client';
// 진행자 콘솔 가운데 "팀" 표 (행 44px, 10팀까지 1440×900 에서 스크롤 없이). 행을 누르면 오른쪽에 그 팀 상세가 열린다.
// DESIGN_V4 §3·§6: 유리 패널 안 표. 재생 중인 팀 행 = 보라 15% + 왼쪽 네온 막대 (Tr selected). 선택만 한 행은 옅은 면 + 왼쪽 팀 색 막대.
// 팀원 칸 = 역할 점 4개(맡은 사람이 있으면 채움, 누가 접속 중이면 초록) + 사람 수 n/6. 아키텍트가 없으면 이름 옆 경고 표시.
// 점수는 Manrope(font-display), 블록 수·제출 시각은 고정폭.
import { GAME_ROLES, LIMITS, ROLE_LABEL, type GameView, type TeamView } from '@/lib/contracts';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { IconAlert } from '@/components/ui/icons';
import { OUTCOME_LABEL, clockTime } from './logic';
import { teamColor } from './teamColor';

export const OUTCOME_TONE: Record<'goal' | 'error' | 'dead' | 'stuck', ChipTone> = {
  goal: 'cyan', error: 'danger', dead: 'danger', stuck: 'warn',
};

/** 팀 색 견본 (작은 원). 색은 모드 토큰(teamColor)으로: 라이트에서 흰올빼미 같은 밝은 색도 보인다 */
export function TeamSwatch({ color, size = 10, className = '' }: { color: string; size?: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] ${className}`}
      style={{ background: teamColor(color), width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/** 역할 점 4개 (GAME_ROLES 순서) + 사람 수. 역할은 여러 명이 공유할 수 있다 (team.people 기준) */
export function MemberDots({ team, showCount = true }: { team: TeamView; showCount?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-1">
        {GAME_ROLES.map((role) => {
          const holders = team.people.filter((p) => p.roles.includes(role));
          const on = holders.some((p) => p.online);
          const label = holders.length
            ? `${ROLE_LABEL[role]} ${holders.map((p) => `${p.displayName} ${p.online ? '접속 중' : '접속 안 함'}`).join(', ')}`
            : `${ROLE_LABEL[role]} 비어 있음`;
          return (
            <span
              key={role}
              title={label}
              aria-label={label}
              role="img"
              className={`size-2 rounded-full ${
                holders.length
                  ? on ? 'bg-ok shadow-[0_0_6px_var(--color-ok)]' : 'bg-text-faint/60'
                  : 'border border-warn/70'
              }`}
            />
          );
        })}
      </span>
      {showCount ? (
        <span className="font-mono text-xs tabular-nums text-text-dim">
          {team.people.length}
          <span className="text-text-faint">/{LIMITS.maxMembersPerTeam}</span>
          <span className="sr-only">명</span>
        </span>
      ) : null}
    </span>
  );
}

export function TeamTable({
  view, selectedId, onSelect,
}: { view: GameView; selectedId: string | null; onSelect: (teamId: string) => void }) {
  const { game, map } = view;
  const results = new Map(view.results.map((r) => [r.teamId, r]));
  const standings = new Map(view.standings.map((s) => [s.teamId, s]));
  const showResults = game.phase === 'running' || game.phase === 'scored' || game.phase === 'finished';
  const warnRoles = game.phase === 'lobby' || game.phase === 'coding';

  return (
    // 폰·태블릿은 넓게 두고 가로 스크롤, 데스크톱(lg+)은 가운데 열에 맞춘다: 셀 여백 8px, 결과 칸이 먼저 줄어든다
    <Table className="min-w-[600px] lg:min-w-0 [&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
      <THead>
        <Tr hover={false}>
          <Th>팀</Th>
          <Th>팀원</Th>
          <Th align="right">블록</Th>
          {/* 결과가 나온 뒤(running·scored·finished)에는 제출 칸을 빼고 결과·점수에 폭을 준다 */}
          {showResults ? null : <Th>제출</Th>}
          <Th>결과</Th>
          <Th align="right">R{game.round}</Th>
          <Th align="right">누적</Th>
        </Tr>
      </THead>
      <TBody>
        {view.teams.map((t) => {
          const r = results.get(t.id);
          const s = standings.get(t.id);
          const p = t.program;
          const selected = t.id === selectedId;
          const isRunning = game.phase === 'running' && game.runningTeamId === t.id;
          const overCap = p.blocks > map.cap;
          const noArchitect = warnRoles && t.missingRoles.includes('architect');
          return (
            <Tr
              key={t.id}
              size="lg"
              selected={isRunning}
              hover={!selected}
              onClick={() => onSelect(t.id)}
              aria-selected={selected || undefined}
              className={!isRunning && selected ? 'bg-tint/[0.05]' : ''}
              style={selected && !isRunning ? { boxShadow: `inset 3px 0 0 ${teamColor(t.color)}` } : undefined}
            >
              <Td className="h-11 py-1">
                {/* 한 줄: 칩이 이름 아래로 떨어져 행이 44px 보다 커지지 않게 (남는 폭은 결과 칸이 먼저 내준다) */}
                <span className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(t.id);
                    }}
                    aria-pressed={selected}
                    className="-ml-1 flex min-h-8 items-center gap-2 whitespace-nowrap rounded-full px-1.5 text-left font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-ink max-md:min-h-11"
                  >
                    <TeamSwatch color={t.color} />
                    {t.name}
                  </button>
                  {noArchitect ? (
                    <span className="flex text-warn" title="아키텍트 없음 (제출할 사람이 없습니다)">
                      <IconAlert size={15} aria-hidden="true" />
                      <span className="sr-only">아키텍트 없음</span>
                    </span>
                  ) : null}
                  {isRunning ? <Chip tone="violet" dot pulse size="sm">재생 중</Chip> : null}
                  {t.patchActive ? <Chip tone="warn" dot size="sm">패치 중</Chip> : null}
                  {t.patchLeft === 0 && !t.patchActive ? <Chip tone="neutral" size="sm">패치권 씀</Chip> : null}
                </span>
              </Td>
              <Td className="h-11">
                <MemberDots team={t} />
              </Td>
              <Td mono align="right" className={`h-11 ${overCap ? 'font-semibold text-danger' : ''}`}>
                {p.blocks}<span className="text-text-faint">/{map.cap}</span>
              </Td>
              {showResults ? null : (
                <Td className="h-11">
                  {p.submittedAt ? (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="font-mono text-[13px] tabular-nums">{clockTime(p.submittedAt)}</span>
                      {p.submitOrder != null ? <span className="hidden font-mono text-xs text-text-dim 2xl:inline">#{p.submitOrder}</span> : null}
                      {p.sealedBy === 'auto' ? <Chip tone="warn" size="sm">자동 봉인</Chip> : null}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-text-faint">{game.phase === 'coding' ? '코딩 중' : '–'}</span>
                  )}
                </Td>
              )}
              {/* 결과: 남는 폭을 모두 받고 가장 먼저 줄어드는 칸 (w-full + max-w-0 → 메시지가 말줄임).
                  overflow-hidden: 좁아져도 결과 칩이 옆 점수 칸으로 넘치지 않는다 */}
              <Td className="h-11 w-full max-w-0 overflow-hidden">
                {showResults && r ? (
                  <span className="flex min-w-0 items-center gap-1.5" title={r.message}>
                    <Chip tone={OUTCOME_TONE[r.outcome]} size="sm">{OUTCOME_LABEL[r.outcome]}</Chip>
                    <span className="truncate text-[13px] text-text-dim">{r.message}</span>
                  </span>
                ) : (
                  <span className="text-text-faint">–</span>
                )}
              </Td>
              <Td align="right" className="h-11 whitespace-nowrap font-display font-semibold tabular-nums">
                {r ? r.score + r.bonus : <span className="font-normal text-text-faint">–</span>}
                {r && r.bonus !== 0 ? (
                  <span className="ml-1 text-xs font-normal text-text-dim">({r.bonus > 0 ? '+' : ''}{r.bonus})</span>
                ) : null}
              </Td>
              <Td align="right" className="h-11 whitespace-nowrap font-display tabular-nums">
                <span className="text-base font-bold tracking-[-0.02em] text-text">{s?.total ?? 0}</span>
                <span className="sr-only">점</span>
                {s ? <span className="ml-1.5 font-sans text-xs text-text-dim">{s.rank}위</span> : null}
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
