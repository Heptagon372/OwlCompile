'use client';
// 팀원 표시 (FEATURE_V4 §2: 팀당 최대 6명, 한 사람이 역할 여러 개, 한 역할을 여러 명이 공유). team.people · team.missingRoles 기준.
// - TeamBar: 폰 제출 바의 팀원 칩 (사람마다 이름 + 역할 줄임, 접속 점) + "아키텍트 없음"
// - TeamPanel: 데스크톱 "팀" 유리 패널 (사람 줄: 이니셜 아바타 + 접속 점 · 이름 · 역할 알약 여러 개) + 경고 + 아래 액션 칸
import type { ReactNode } from 'react';
import { LIMITS, ROLE_LABEL, type StandingRow, type TeamView } from '@/lib/contracts';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { PanelStat } from '@/components/ui/Panel';
import { IconAlert, IconUsers } from '@/components/ui/icons';
import { RolePill } from './roleStyle';
import { TeamDot } from './TeamDot';
import { lacksArchitect } from './teamInfo';

export { lacksArchitect };

/** 접속 점 (상태 점이라 원형, 접속 중이면 은은한 초록 빛) */
export function OnlineDot({ online, className = '' }: { online: boolean; className?: string }) {
  return (
    <i
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ${online ? 'bg-ok shadow-[0_0_6px_var(--color-ok)]' : 'bg-tint/25'} ${className}`}
    />
  );
}

/** 폰 제출 바의 팀원 칩 */
export function TeamBar({ team, meId }: { team: TeamView; meId: string }) {
  const others = team.missingRoles.filter((r) => r !== 'architect');
  return (
    <ul aria-label={`${team.name} 팀원`} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {lacksArchitect(team) ? (
        <li className="shrink-0">
          <Chip tone="warn" dot className="h-8 px-3">아키텍트 없음</Chip>
        </li>
      ) : null}
      {team.people.map((p) => (
        <li
          key={p.userId}
          className={
            'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold text-text ' +
            (p.userId === meId ? 'border-violet/50 bg-violet-soft' : 'border-stroke-strong bg-tint/[0.05]')
          }
          title={p.online ? '접속 중' : '접속 안 함'}
        >
          <OnlineDot online={p.online} />
          <span className="max-w-[5.5rem] truncate">{p.displayName}</span>
          <span className="font-medium text-text-dim">{p.roles.map((r) => ROLE_LABEL[r]).join('·')}</span>
          <span className="sr-only">{p.online ? '접속 중' : '접속 안 함'}</span>
        </li>
      ))}
      {others.length ? (
        <li className="shrink-0 px-1 text-xs text-text-faint">빈 역할 {others.map((r) => ROLE_LABEL[r]).join('·')}</li>
      ) : null}
    </ul>
  );
}

/** 데스크톱 "팀" 유리 패널. className 으로 표시 방식(hidden lg:flex 등)을 준다 */
export function TeamPanel({
  team, meId, standing, children, className = '',
}: {
  team: TeamView;
  meId: string;
  /** 누적 점수·순위 (scored·finished) */
  standing?: StandingRow | null;
  /** 아래 액션 칸 (제출 버튼·안내) */
  children?: ReactNode;
  className?: string;
}) {
  const people = team.people.length;
  const online = team.people.filter((p) => p.online).length;
  const noArchitect = lacksArchitect(team);
  const others = team.missingRoles.filter((r) => r !== 'architect');
  return (
    <section
      aria-label="팀"
      className={`glass relative min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-stroke shadow-glass ${className}`}
    >
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-5">
        <h2 className="ui-label flex shrink-0 items-center gap-2">
          <IconUsers size={16} className="text-violet-ink" />팀
        </h2>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-text">
          <TeamDot color={team.color} glow={8} />
          <span className="truncate">{team.name}</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {standing ? (
            <>
              <PanelStat label="누적" value={`${standing.total}점`} tone="violet" display />
              <PanelStat label="순위" value={`${standing.rank}위`} />
            </>
          ) : (
            <>
              <PanelStat label="인원" value={`${people}/${LIMITS.maxMembersPerTeam}`} />
              <PanelStat label="접속" value={`${online}/${people}`} />
            </>
          )}
        </div>
      </div>

      {noArchitect ? (
        <p
          role="status"
          className="mx-3 mb-2 flex items-start gap-2 rounded-ctl border border-warn/35 bg-warn/10 px-3 py-2 text-[13px] leading-snug text-text"
        >
          <IconAlert size={16} className="mt-px shrink-0 text-warn" />
          <span>
            <b className="font-semibold text-warn">아키텍트 없음</b> · 제출할 사람이 없어요. 시간이 끝나면 자동으로 봉인돼요.
          </span>
        </p>
      ) : null}

      {/* 사람 줄은 한 줄(36px): 6명이 스크롤 없이 보이게 (1280×800 에서 30dvh = 240px). 줄이 좁으면(@container, ~350px 미만)
          역할 3개 이상은 첫 역할 알약 + "+N", 넓으면 알약 모두 */}
      <ul
        aria-label={`${team.name} 팀원 ${people}명`}
        className="grid max-h-[max(30dvh,15.5rem)] min-h-0 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-1 overflow-y-auto px-3 pb-2"
      >
        {team.people.map((p) => {
          const me = p.userId === meId;
          const many = p.roles.length > 2;
          const rest = p.roles.slice(1).map((r) => ROLE_LABEL[r]).join(', ');
          return (
            <li
              key={p.userId}
              className={
                '@container flex min-h-9 items-center gap-2.5 rounded-ctl px-2.5 py-1 ' +
                (me ? 'bg-violet-soft shadow-[inset_0_0_0_1px_rgba(124,77,255,0.35)]' : 'bg-tint/[0.03]')
              }
            >
              <span className="relative shrink-0" title={p.online ? '접속 중' : '접속 안 함'}>
                <Avatar name={p.displayName} size={28} />
                <OnlineDot online={p.online} className="absolute -bottom-0.5 -right-0.5 size-2.5 ring-2 ring-solid" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{p.displayName}</span>
              {me ? <Chip size="sm" tone="violet">나</Chip> : null}
              <span className="flex shrink-0 items-center gap-1">
                {p.roles.map((r, i) => (
                  <span key={r} className={many && i > 0 ? 'hidden @[22rem]:flex' : 'flex'}>
                    <RolePill role={r} />
                  </span>
                ))}
                {many ? (
                  <span
                    title={rest}
                    className="inline-flex h-6 shrink-0 items-center rounded-full border border-stroke-strong bg-tint/[0.05] px-1.5 font-mono text-[11px] font-semibold leading-none text-text-dim @[22rem]:hidden"
                  >
                    <span aria-hidden="true">+{p.roles.length - 1}</span>
                    <span className="sr-only">{rest}</span>
                  </span>
                ) : null}
              </span>
              <span className="sr-only">{p.online ? '접속 중' : '접속 안 함'}</span>
            </li>
          );
        })}
      </ul>
      {others.length ? (
        <p className="px-5 pb-2 text-xs text-text-faint">빈 역할 · {others.map((r) => ROLE_LABEL[r]).join(', ')}</p>
      ) : null}
      {children ? <div className="mt-auto border-t border-stroke p-4">{children}</div> : null}
    </section>
  );
}
