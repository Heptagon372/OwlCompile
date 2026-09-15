'use client';
// 진행자 콘솔 팀원 도구 (FEATURE_V4 §2–§3): 역할 알약, 팀·역할 바꾸기 시트(POST /assign), 내보내기 시트(POST /kick).
// 한 사람이 역할 여러 개, 한 역할을 여러 명이 맡을 수 있다. 팀의 서로 다른 사람은 최대 6명.
// 시트는 열 때마다 새로 마운트한다(부모가 key 로): 기본값을 useState 초기값으로만 잡는다.
import { useState } from 'react';
import {
  GAME_ROLES, LIMITS, ROLE_HINT, ROLE_LABEL, sortRoles, type GameRole, type TeamPersonView, type TeamView,
} from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { IconCheck } from '@/components/ui/icons';
import { moveTargets, rolesText } from './logic';
import { onRadioKeys } from './roving';
import { TeamSwatch } from './TeamTable';

/** 역할 알약 색 = 그 역할 블록 색 (이동 파랑 · 회전 시안 · 제어 보라 · 함수 라벤더) */
const ROLE_TONE: Record<GameRole, string> = {
  runner: 'border-move/40 bg-move/15 text-blue-hover',
  turner: 'border-turn/35 bg-turn/12 text-neon-cyan',
  controller: 'border-control/45 bg-control/15 text-violet-ink',
  architect: 'border-function-line/45 bg-function-bg text-function-ink',
};

export function RoleChip({ role, className = '' }: { role: GameRole; className?: string }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11px] font-semibold leading-none ${ROLE_TONE[role]} ${className}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

const OPTION =
  'flex w-full items-center gap-2.5 rounded-ctl border px-3 text-left transition-[background-color,border-color] duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink disabled:cursor-not-allowed disabled:opacity-40';
const OPTION_ON = 'border-violet/50 bg-violet/15 text-text';
const OPTION_OFF = 'border-stroke bg-tint/[0.02] text-text-dim hover:border-stroke-strong hover:bg-tint/[0.05] hover:text-text';

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-[18px] shrink-0 place-items-center rounded-full ${on ? 'bg-violet-grad text-white' : 'border border-stroke-input'}`}
    >
      {on ? <IconCheck size={12} strokeWidth={2.4} /> : null}
    </span>
  );
}

/** 팀에 넣거나 옮길 사람 (teamId null = 대기실에 있는 사람) */
export interface AssignTarget {
  userId: string;
  displayName: string;
  teamId: string | null;
  roles: GameRole[];
}

/**
 * 팀·역할 바꾸기 시트: 팀 하나 + 역할 1개 이상. 서버는 이 게임에서의 역할을 통째로 바꾼다.
 * 대기실 사람이면 팀을 고를 때마다 그 팀 기본 역할(rolesFor)로, 팀원이면 지금 역할을 그대로 두고 팀만 바꾼다.
 */
export function AssignSheet({
  target, teams, initialTeamId, rolesFor, busy, onSubmit, onClose,
}: {
  target: AssignTarget;
  teams: readonly TeamView[];
  initialTeamId: string | null;
  rolesFor: (team: TeamView) => GameRole[];
  busy: boolean;
  onSubmit: (teamId: string, roles: GameRole[]) => void;
  onClose: () => void;
}) {
  const newcomer = target.teamId == null;
  const targets = moveTargets(teams, target.userId);
  const first = targets.find((t) => t.team.id === initialTeamId && !t.full) ?? targets.find((t) => !t.full) ?? null;
  const [teamId, setTeamId] = useState<string | null>(first?.team.id ?? null);
  const [roles, setRoles] = useState<GameRole[]>(() =>
    newcomer ? (first ? rolesFor(first.team) : []) : sortRoles(target.roles));

  const pickTeam = (team: TeamView) => {
    setTeamId(team.id);
    if (newcomer) setRoles(rolesFor(team));
  };
  const toggleRole = (r: GameRole) =>
    setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : sortRoles([...rs, r])));

  const unchanged = !newcomer && teamId === target.teamId && rolesText(roles) === rolesText(sortRoles(target.roles));
  const ok = teamId != null && roles.length > 0 && !unchanged;
  const teamName = teams.find((t) => t.id === teamId)?.name;

  return (
    <Sheet
      open
      onClose={onClose}
      size="md"
      title={newcomer ? `${target.displayName} 님을 팀에 넣기` : `${target.displayName} 님 팀·역할 바꾸기`}
      description="고른 팀과 역할로 통째로 바뀝니다. 그 사람의 폰 화면도 바로 따라갑니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button
            loading={busy}
            disabled={!ok}
            onClick={() => {
              if (ok && teamId) onSubmit(teamId, roles);
            }}
          >
            {busy ? '처리 중…' : newcomer ? `${teamName ?? '팀'}에 넣기` : '바꾸기'}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="ui-caption mb-2">팀 <span className="font-normal">(팀당 최대 {LIMITS.maxMembersPerTeam}명)</span></legend>
        <div role="radiogroup" aria-label="팀" onKeyDown={onRadioKeys} className="grid gap-1.5 sm:grid-cols-2">
          {targets.map(({ team, count, full, current }) => {
            const on = team.id === teamId;
            return (
              <button
                key={team.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (teamId == null && team.id === first?.team.id) ? 0 : -1}
                disabled={full}
                onClick={() => pickTeam(team)}
                className={`${OPTION} min-h-11 ${on ? OPTION_ON : OPTION_OFF}`}
              >
                <Tick on={on} />
                <TeamSwatch color={team.color} size={10} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{team.name}</span>
                {current ? <span className="shrink-0 text-[11px] font-semibold text-violet-ink">지금 팀</span> : null}
                <span className={`shrink-0 font-mono text-xs tabular-nums ${full ? 'text-danger' : 'text-text-faint'}`}>
                  {count}/{LIMITS.maxMembersPerTeam}
                  {full ? <span className="sr-only"> 가득 참</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="ui-caption mb-2">역할 <span className="font-normal">(여러 개 가능 · 같은 역할을 여러 명이 맡아도 됩니다)</span></legend>
        <div className="grid grid-cols-2 gap-1.5">
          {GAME_ROLES.map((r) => {
            const on = roles.includes(r);
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRole(r)}
                className={`${OPTION} min-h-13 py-2 ${on ? OPTION_ON : OPTION_OFF}`}
              >
                <Tick on={on} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text">{ROLE_LABEL[r]}</span>
                  <span className="block truncate text-[11px] text-text-faint">{ROLE_HINT[r]}</span>
                </span>
              </button>
            );
          })}
        </div>
        {roles.length === 0 ? (
          <p role="alert" className="mt-2 text-xs text-danger">역할을 하나 이상 골라 주세요.</p>
        ) : null}
      </fieldset>
    </Sheet>
  );
}

/**
 * 내보내기 시트: 역할이 여러 개면 "모든 역할"(대기실로) 또는 역할 하나만 빼기를 고른다.
 * 모든 역할 → POST /kick {userId}, 역할 하나 → {memberId}. 역할이 하나도 남지 않으면 그 사람은 대기실로 돌아간다.
 */
export function KickSheet({
  person, teamName, busy, onKick, onClose,
}: {
  person: TeamPersonView;
  teamName: string;
  busy: boolean;
  onKick: (body: { userId: string } | { memberId: string }) => void;
  onClose: () => void;
}) {
  const roles = sortRoles(person.roles);
  const [choice, setChoice] = useState<'all' | GameRole>('all');
  const multi = roles.length > 1;
  const memberId = choice === 'all' ? null : person.memberIds[choice] ?? null;
  const confirm = () => {
    if (choice === 'all') onKick({ userId: person.userId });
    else if (memberId) onKick({ memberId });
  };
  const options: { key: 'all' | GameRole; label: string; hint: string }[] = [
    { key: 'all', label: '모든 역할 빼기', hint: '대기실로 돌아가고, 자동 배정에서 이 게임은 건너뜁니다' },
    ...roles.map((r) => ({ key: r, label: `${ROLE_LABEL[r]}만 빼기`, hint: '다른 역할은 그대로 둡니다' })),
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={`${person.displayName} 님을 내보낼까요?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button variant="danger" loading={busy} disabled={choice !== 'all' && !memberId} onClick={confirm}>
            {busy ? '처리 중…' : choice === 'all' ? '내보내기' : '역할 빼기'}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-text-dim">
        {multi
          ? `${teamName} 팀에서 ${person.displayName} 님의 역할(${rolesText(roles)})을 뺍니다. 남은 역할이 없으면 대기실로 돌아갑니다.`
          : `${teamName} 팀에서 ${person.displayName} 님의 ${rolesText(roles)} 역할을 뺍니다. 남은 역할이 없으면 대기실로 돌아갑니다.`}
      </p>
      {multi ? (
        <div role="radiogroup" aria-label="뺄 역할" onKeyDown={onRadioKeys} className="mt-4 flex flex-col gap-1.5">
          {options.map((o) => {
            const on = choice === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => setChoice(o.key)}
                className={`${OPTION} min-h-12 py-2 ${on ? 'border-danger/50 bg-danger/10 text-text' : OPTION_OFF}`}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-[18px] shrink-0 place-items-center rounded-full border ${on ? 'border-danger' : 'border-stroke-input'}`}
                >
                  {on ? <span className="size-2 rounded-full bg-danger" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-text">{o.label}</span>
                  <span className="block text-[11px] text-text-faint">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </Sheet>
  );
}
