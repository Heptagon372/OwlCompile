'use client';
// /join (DESIGN_V4 §3·§6: 유리 카드, 둥근 입력, 알약 버튼): 게임 코드 4자리 → 팀 카드(n/6 · 역할별 맡은 사람) → 역할 여러 개 선택 → 참가 → /play
// 역할 공유 (FEATURE_V4 §2): 누가 맡은 역할도 고를 수 있다. 팀의 서로 다른 사람은 최대 6명, 7번째는 409 team_full.
// 참가 전에도 GET /state(로비 수준 정보)와 SSE를 받아 팀 인원·맡은 사람이 실시간으로 바뀐다. 셸(AppShell)은 페이지가 감싼다.
// 직접 선택 게임(mode 'self')이 열리면 대기실이 여기로 보낸다 (/join?code=).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  API, GAME_ROLES, LIMITS, PHASE_LABEL, ROLE_HINT, ROLE_LABEL, roundPosition, type GameRole, type MeResponse, type TeamView,
} from '@/lib/contracts';
import { api, ApiClientError } from '@/lib/client/api';
import { useGame } from '@/lib/client/useGame';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button, Spinner, buttonClass } from '@/components/ui/Button';
import { Chip, StatusPill } from '@/components/ui/Chip';
import { Panel } from '@/components/ui/Panel';
import { EmptyState, Notice } from '@/components/ui/Text';
import { IconAlert, IconCheck, IconChevronRight, IconHost, IconJoin, IconLobby } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { RoleSwatch } from './roleStyle';
import { OnlineDot, lacksArchitect } from './TeamBar';
import { TeamDot } from './TeamDot';

const CODE_RE = /^\d{4}$/;

export function JoinScreen({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(CODE_RE.test(initialCode) ? initialCode : '');
  if (!code) {
    return (
      <CodeForm
        onSubmit={(c) => {
          setCode(c);
          router.replace(`/join?code=${c}`);
        }}
      />
    );
  }
  return (
    <JoinTeams
      key={code}
      code={code}
      onReset={() => {
        setCode('');
        router.replace('/join');
      }}
    />
  );
}

function CodeForm({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState('');
  const valid = CODE_RE.test(value);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) onSubmit(value);
  };
  return (
    <div className="flex flex-1 items-start justify-center pt-4 sm:pt-14">
      <Panel title="게임 코드" icon={<IconJoin />} className="w-full max-w-sm" bodyClassName="px-5 pb-5">
        <form onSubmit={submit}>
          <p className="text-[13px] leading-relaxed text-text-dim">프로젝터에 보이는 게임 코드 4자리를 입력하세요.</p>
          <label htmlFor="game-code" className="ui-caption mt-4 block">
            게임 코드
          </label>
          <input
            id="game-code"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={4}
            pattern="\d{4}"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
            className={
              // 입력칸 윤곽은 Field 와 같은 처리: stroke-input (3:1 이상), 포커스 violet-ink 테두리 + 1px 링 + violet-soft 번짐
              'mt-1.5 block h-16 w-full rounded-ctl border border-stroke-input bg-glass-inset pl-[calc(1rem+0.45em)] pr-4 text-center ' +
              'font-mono text-4xl font-semibold tracking-[0.45em] text-text tabular-nums ' +
              'transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint/70 hover:border-tint/50 ' +
              'focus:border-violet-ink focus:shadow-[0_0_0_1px_var(--color-violet-ink),0_0_0_4px_var(--color-violet-soft)] focus:outline-none'
            }
          />
          <Button type="submit" size="lg" fullWidth className="mt-4" disabled={!valid} iconRight={<IconChevronRight />}>
            들어가기
          </Button>
          <Link href="/lobby" className={buttonClass('ghost', 'mt-2 max-md:min-h-11', 'sm', true)}>
            <IconLobby />
            대기실에서 기다리기
          </Link>
        </form>
      </Panel>
    </div>
  );
}

function JoinTeams({ code, onReset }: { code: string; onReset: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { view, error, refresh } = useGame(code);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [roles, setRoles] = useState<GameRole[]>([]);
  const [busy, setBusy] = useState(false);
  /** 참가 실패 문구 (팀 꽉 참 등). 다시 고르면 지운다 */
  const [failure, setFailure] = useState<string | null>(null);
  /** 409 in_other_game: 지금 참가 중인 게임 경로 (/api/auth/me 의 redirect, /play/<코드>) */
  const [otherGame, setOtherGame] = useState<string | null>(null);

  const memberTeam = view?.me.teamId ?? null;
  useEffect(() => {
    if (memberTeam) router.replace(`/play/${code}`);
  }, [memberTeam, router, code]);
  useEffect(() => {
    if (error?.status === 401) router.replace(`/login?next=${encodeURIComponent(`/join?code=${code}`)}`);
  }, [error, router, code]);

  // 역할은 여러 명이 공유할 수 있다: 누가 맡은 역할도 고를 수 있다. 고른 팀이 꽉 차면(6명) 선택을 푼다
  const selectedTeam = view?.teams.find((t) => t.id === teamId) ?? null;
  const selectedFull = !!selectedTeam && selectedTeam.people.length >= LIMITS.maxMembersPerTeam;
  useEffect(() => {
    if (selectedFull) setRoles((rs) => (rs.length ? [] : rs));
  }, [selectedFull]);

  if (!view) {
    if (error && error.status !== 0) {
      return (
        <div className="flex flex-1 items-start justify-center pt-4 sm:pt-14">
          <Panel className="w-full max-w-md">
            <EmptyState
              icon={<IconAlert />}
              title={error.status === 404 ? '게임 코드를 찾을 수 없어요' : '게임을 불러오지 못했어요'}
              body={error.status === 404 ? `${code} 게임이 없어요. 코드를 다시 확인해 주세요.` : error.message}
              action={<Button onClick={onReset}>코드 다시 입력</Button>}
            />
          </Panel>
        </div>
      );
    }
    return (
      <p className="flex items-center justify-center gap-2 pt-14 text-sm text-text-dim" role="status">
        <Spinner className="size-4 text-violet-ink" />
        게임을 찾는 중…
      </p>
    );
  }

  const phase = view.game.phase;
  const open = phase === 'lobby' || phase === 'coding';
  const pos = roundPosition(view.game.rounds, view.game.round);
  const roundLabel = pos.index >= 0 ? pos.label : `R${view.game.round}`;

  const toggle = (team: TeamView, role: GameRole) => {
    setFailure(null);
    setOtherGame(null);
    if (teamId !== team.id) {
      setTeamId(team.id);
      setRoles([role]);
      return;
    }
    setRoles((rs) => (rs.includes(role) ? rs.filter((r) => r !== role) : [...rs, role]));
  };

  const join = async () => {
    if (!teamId || roles.length === 0) return;
    setBusy(true);
    setFailure(null);
    setOtherGame(null);
    try {
      await api(API.gameJoin(code), { method: 'POST', body: { teamId, roles } });
      router.push(`/play/${code}`);
    } catch (err) {
      const e = err instanceof ApiClientError ? err : null;
      if (e?.code === 'team_full') {
        const msg = `${selectedTeam?.name ?? '이 팀'}은 가득 찼어요 (최대 ${LIMITS.maxMembersPerTeam}명). 다른 팀을 골라 주세요.`;
        setFailure(msg);
        setTeamId(null);
        setRoles([]);
        toast(msg, 'error');
      } else if (e?.code === 'in_other_game') {
        // 한 사람은 끝나지 않은 게임 하나에만: 지금 게임으로 가는 링크를 함께 보여 준다
        setFailure('이미 다른 게임에 참가 중이에요. 그 게임이 끝난 뒤에 다른 게임에 참가할 수 있어요.');
        setTeamId(null);
        setRoles([]);
        toast(e.message, 'error');
        void api<MeResponse>(API.me)
          .then((me) => setOtherGame(me.redirect?.startsWith('/play/') ? me.redirect : null))
          .catch(() => setOtherGame(null));
      } else {
        toast(e ? e.message : '참가하지 못했어요.', 'error');
      }
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl pb-36">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-text">
          게임 <span className="font-mono tabular-nums text-violet-ink">{code}</span>
        </h2>
        <StatusPill size="sm" status={open ? 'progress' : 'idle'}>{PHASE_LABEL[phase]}</StatusPill>
        <Chip size="sm" mono>{roundLabel}</Chip>
        <span className="text-[13px] text-text-dim">진행자 {view.game.hostName}</span>
        <Button variant="ghost" size="sm" className="ml-auto max-md:h-11" onClick={onReset}>
          코드 바꾸기
        </Button>
      </div>

      {view.me.isHost ? (
        <Notice className="mt-3">
          <p className="font-semibold">
            {view.me.ownsGame ? '이 게임의 진행자 계정이에요.' : '관리자 계정이에요. 이 게임의 진행자 콘솔도 열 수 있어요.'}
          </p>
          {open ? (
            <p className="mt-1 text-text-dim">
              시험 삼아 직접 해 보거나 함께 플레이하려면 아래에서 팀과 역할을 골라 참가할 수도 있어요.
            </p>
          ) : null}
          <Link href={`/host/${code}`} className={buttonClass('secondary', 'mt-3 max-md:min-h-11', 'sm')}>
            <IconHost />
            진행자 콘솔 열기
          </Link>
        </Notice>
      ) : null}

      {!open ? (
        <Notice tone="warn" role="status" className="mt-3 font-semibold">
          지금은 참가할 수 없어요. 대기실이나 코딩 중일 때만 들어갈 수 있어요.
        </Notice>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-text-dim">
          팀을 고르고 맡을 역할을 누르세요. 한 역할을 여러 명이 함께 맡거나 한 사람이 역할을 여러 개 맡아도 돼요.
          팀당 최대 <span className="font-display font-semibold tabular-nums text-text">{LIMITS.maxMembersPerTeam}</span>명이에요.
        </p>
      )}

      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {view.teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            chosen={teamId === team.id}
            picked={teamId === team.id ? roles : []}
            disabled={!open || busy}
            onToggle={(r) => toggle(team, r)}
          />
        ))}
      </ul>

      {open ? (
        <div className="glass fixed inset-x-0 bottom-0 z-20 border-t border-stroke px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:left-[var(--shell-rail,0px)]">
          <div className="mx-auto max-w-5xl">
            {failure ? (
              <div role="alert" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="flex min-w-0 flex-1 items-start gap-2 text-[13px] font-semibold leading-snug text-danger">
                  <IconAlert size={16} className="mt-px shrink-0" />
                  {failure}
                </p>
                {otherGame ? (
                  <Link href={otherGame} className={buttonClass('secondary', 'max-md:min-h-11', 'sm')}>
                    지금 참가 중인 게임으로
                    <IconChevronRight />
                  </Link>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <p className="flex min-w-0 flex-1 items-center gap-2 truncate text-sm text-text-dim" aria-live="polite">
                {selectedTeam && roles.length ? (
                  <>
                    <TeamDot color={selectedTeam.color} />
                    <span className="truncate">
                      <span className="font-semibold text-text">{selectedTeam.name}</span> · {roles.map((r) => ROLE_LABEL[r]).join(', ')}
                    </span>
                  </>
                ) : (
                  '맡을 역할을 하나 이상 고르세요'
                )}
              </p>
              <Button
                size="lg"
                onClick={() => void join()}
                disabled={!selectedTeam || roles.length === 0 || busy || selectedFull}
                loading={busy}
                icon={busy ? undefined : <IconJoin />}
              >
                {busy ? '참가하는 중…' : '참가하기'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 팀 카드: 머리(색 점 · 이름 · n/6 자리 점) · 팀원 아바타 · 역할 2×2 (맡은 사람 이름 또는 설명) */
function TeamCard({
  team, chosen, picked, disabled, onToggle,
}: {
  team: TeamView;
  chosen: boolean;
  picked: readonly GameRole[];
  disabled: boolean;
  onToggle: (role: GameRole) => void;
}) {
  const people = team.people.length;
  const full = people >= LIMITS.maxMembersPerTeam;
  const noArchitect = people > 0 && lacksArchitect(team);
  return (
    <li
      className={
        'glass relative overflow-hidden rounded-card border transition-[border-color,box-shadow] duration-150 ' +
        (chosen
          ? 'border-violet/60 shadow-[0_0_0_1px_rgba(124,77,255,0.25),var(--shadow-glass)]'
          : 'border-stroke shadow-glass')
      }
    >
      {/* 머리 줄: 색 점 · 팀 이름 · 인원 (자리 점 6개) */}
      <div className="flex h-12 items-center gap-2.5 px-4">
        <TeamDot color={team.color} glow={10} className="size-3" />
        <h3 className="min-w-0 truncate text-[15px] font-semibold text-text">{team.name}</h3>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="hidden gap-1 sm:flex">
            {Array.from({ length: LIMITS.maxMembersPerTeam }, (_, i) => (
              <i key={i} className={`size-1.5 rounded-full ${i < people ? 'bg-violet-ink' : 'bg-tint/15'}`} />
            ))}
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums text-text-dim">
            {people}/{LIMITS.maxMembersPerTeam}명
          </span>
          {full ? <Chip size="sm" tone="warn">꽉 참</Chip> : null}
        </span>
      </div>

      {/* 팀원 줄 */}
      <div className="flex min-h-8 items-center gap-2 px-4">
        {people ? (
          <AvatarStack names={team.people.map((p) => p.displayName)} max={6} size="xs" label={`팀원 ${people}명`} />
        ) : (
          <span className="text-xs text-text-faint">아직 아무도 없어요</span>
        )}
        {noArchitect ? <Chip size="sm" tone="warn" dot className="ml-auto">아키텍트 없음</Chip> : null}
      </div>

      {full && !chosen ? (
        <p className="mx-4 mt-2 text-xs font-medium text-warn">이 팀은 가득 찼어요. 다른 팀을 골라 주세요.</p>
      ) : null}

      {/* 역할 2×2: 선택 = violet-soft 면 + violet 테두리 */}
      <ul className="grid grid-cols-2 gap-2 p-3" aria-label={`${team.name} 역할`}>
        {GAME_ROLES.map((r) => {
          // 역할은 공유 가능: 이미 맡은 사람이 있어도 고를 수 있다 (맡은 사람 이름을 함께 보여 준다)
          const holders = team.people.filter((p) => p.roles.includes(r));
          const on = chosen && picked.includes(r);
          return (
            <li key={r} className="flex">
              <button
                type="button"
                aria-pressed={on}
                disabled={disabled || full}
                onClick={() => onToggle(r)}
                className={
                  'flex min-h-16 w-full flex-col justify-center gap-1 rounded-ctl border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] duration-150 ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink disabled:cursor-not-allowed disabled:opacity-40 ' +
                  (on
                    ? 'border-violet/60 bg-violet-soft shadow-[inset_0_0_0_1px_rgba(124,77,255,0.45)]'
                    : 'border-stroke bg-glass-inset hover:border-stroke-strong hover:bg-tint/[0.05]')
                }
              >
                <span className="flex w-full items-center gap-1.5 text-[13px] font-semibold text-text">
                  <RoleSwatch role={r} />
                  {ROLE_LABEL[r]}
                  {on ? (
                    <IconCheck size={15} className="ml-auto text-violet-ink" />
                  ) : holders.length === 0 ? (
                    <span className="ui-caption ml-auto">빈 자리</span>
                  ) : holders.length > 1 ? (
                    <span className="ml-auto font-mono text-[11px] font-semibold tabular-nums text-text-faint">{holders.length}명</span>
                  ) : null}
                </span>
                {holders.length ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-text">
                    <OnlineDot online={holders.some((p) => p.online)} />
                    <span className="truncate">{holders.map((p) => p.displayName).join(', ')}</span>
                  </span>
                ) : (
                  <span className="text-xs text-text-dim">{ROLE_HINT[r]}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
