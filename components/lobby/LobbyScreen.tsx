'use client';
// /lobby 대기실 (FEATURE_V4 §3, DESIGN_V4 §6). useLobby 로 대기 명단에 든다.
//  - 가운데 큰 GlowCube + "안녕하세요, <표시 이름>님" + 상태 알약·문구
//  - 대기 인원 StatCard(아바타 줄) + 대기 명단, 참가할 수 있는 게임 목록, 보조 "게임 코드로 참가"
//  - 'assigned' → 큐브가 한 번 밝게 + "<팀> 팀 · <역할>로 배정됐어요" 토스트 → /play/<코드>
//  - 'game-open'(직접 선택 게임) → /join?code=<코드>
//  - 끝나지 않은 게임의 팀원이면 그 게임으로 (서버 페이지가 먼저 보내고, 연결 중에 생기면 여기서)
// 빛: 강한 빛 요소는 큐브 하나. 버튼은 모두 보조(유리) 알약.
// 주의: 클라이언트 코드는 '@/lib/engine' 인덱스를 import 하지 않는다 (정답이 번들에 섞임).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  API, ASSIGN_MODE_LABEL, PHASE_LABEL,
  type AccountRole, type GameRole, type LobbyJoinResponse, type OpenGameSummary,
} from '@/lib/contracts';
import { api, ApiClientError } from '@/lib/client/api';
import type { ConnectionStatus } from '@/lib/client/useGame';
import { useLobby } from '@/lib/client/useLobby';
import { Avatar, AvatarStack } from '@/components/ui/Avatar';
import { Button, buttonClass } from '@/components/ui/Button';
import { Chip, StatusPill, type StatusKind } from '@/components/ui/Chip';
import { GlowCube } from '@/components/ui/GlowCube';
import { IconBadge } from '@/components/ui/IconBadge';
import { Panel, PanelStat } from '@/components/ui/Panel';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/Text';
import { IconGrid, IconHost, IconJoin, IconLobby, IconRefresh, IconUsers } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { GameCodeForm } from './GameCodeForm';
import { assignedMessage, openGameMeta, phaseStatus, sortOpenGames, waitText } from './lobbyUtil';

/**
 * 배정 알림 뒤 이동까지. 큐브 번쩍임(1.3초)은 약 0.29초에 가장 밝으니 그 직후에 넘어간다.
 * 수용 기준(FEATURE_V4 §7-3): 게임 생성 → 1초 안에 편집기. 페이지 이동 시간을 남겨 둔다.
 */
const GO_DELAY_MS = 420;
/** 대기 명단에 이름을 다 보여 줄 최대 수 (나머지는 "외 N명") */
const ROSTER_MAX = 60;

interface Leaving {
  href: string;
  teamName: string | null;
  teamColor: string | null;
}

/** 일정 간격으로 다시 그리게 한다 (기다린 시간 문구) */
function useTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export function LobbyScreen({ displayName, accountRole }: { displayName: string; accountRole: AccountRole }) {
  const router = useRouter();
  const toast = useToast();
  const [flash, setFlash] = useState(0);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const leavingRef = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const tick = useTick(30_000);

  /** 팀에 들어갔다: 큐브 번쩍 + 토스트 + 잠깐 뒤 편집기로 (여러 번 와도 한 번만) */
  function arrive(e: { code: string; teamName: string; teamColor?: string | null; roles: readonly GameRole[] }) {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const href = `/play/${e.code}`;
    setFlash((k) => k + 1);
    setLeaving({ href, teamName: e.teamName, teamColor: e.teamColor ?? null });
    toast(assignedMessage(e), 'success');
    router.prefetch(href);
    goTimer.current = setTimeout(() => router.push(href), GO_DELAY_MS);
  }

  const { lobby, error, status, waitingCount, serverNow, refresh } = useLobby({
    onAssigned: (e) => arrive(e),
    onGameOpen: (e) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      const href = `/join?code=${e.code}`;
      setLeaving({ href, teamName: null, teamColor: null });
      toast('새 게임이 열렸어요. 팀과 역할을 골라 주세요', 'info');
      router.push(href);
    },
  });

  useEffect(() => () => clearTimeout(goTimer.current), []);

  useEffect(() => {
    if (error?.status === 401) router.replace(`/login?next=${encodeURIComponent('/lobby')}`);
  }, [error, router]);

  // 이미 끝나지 않은 게임의 팀원이면 그 게임으로 (예: 연결이 끊긴 사이 진행자가 옮겨 넣었다)
  const myCode = lobby?.myGame?.code ?? null;
  useEffect(() => {
    if (!myCode || leavingRef.current) return;
    leavingRef.current = true;
    const href = `/play/${myCode}`;
    setLeaving({ href, teamName: null, teamColor: null });
    router.replace(href);
  }, [myCode, router]);

  async function enter(g: OpenGameSummary) {
    if (leavingRef.current) return;
    if (g.mode === 'self') {
      router.push(`/join?code=${g.code}`);
      return;
    }
    setBusyCode(g.code);
    try {
      const res = await api<LobbyJoinResponse>(API.lobbyJoin, { method: 'POST', body: { code: g.code } });
      arrive({ code: res.code, teamName: res.teamName, roles: res.roles });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'self_mode') {
        router.push(`/join?code=${g.code}`);
        return;
      }
      toast(err instanceof ApiClientError ? err.message : '참가하지 못했어요.', 'error');
      setBusyCode(null);
      void refresh();
    }
  }

  const watchOnly = (lobby?.me.accountRole ?? accountRole) !== 'player';
  const waiting = lobby?.waiting ?? [];
  const meId = lobby?.me.userId ?? null;
  const myIndex = meId ? waiting.findIndex((w) => w.userId === meId) : -1;
  const me = myIndex >= 0 ? waiting[myIndex] : null;
  const games = lobby ? sortOpenGames(lobby.openGames) : [];
  void tick; // 30초마다 다시 그려 기다린 시간을 고친다
  const nowMs = serverNow();
  const loadFailed = !lobby && !!error && error.status !== 0 && error.status !== 401;

  // 상태 알약 + 문구
  let pill: { status: StatusKind; label: string; pulse?: boolean };
  let text: ReactNode;
  if (leaving) {
    pill = { status: 'done', label: leaving.teamName ? '배정 완료' : '이동 중' };
    text = leaving.teamName ? (
      <>
        {leaving.teamColor ? (
          <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ backgroundColor: leaving.teamColor }} />
        ) : null}
        <b className="font-semibold text-text">{leaving.teamName} 팀</b> 편집기로 이동하는 중…
      </>
    ) : (
      '게임으로 이동하는 중…'
    );
  } else if (loadFailed) {
    pill = { status: 'error', label: '연결 실패' };
    text = '대기실을 불러오지 못했어요.';
  } else if (!lobby) {
    pill = { status: 'idle', label: '연결 중', pulse: true };
    text = '대기실에 들어가는 중…';
  } else if (status !== 'live') {
    pill = { status: 'pending', label: '다시 연결하는 중', pulse: true };
    text = '연결이 잠시 끊겼어요. 자동으로 다시 연결합니다.';
  } else if (watchOnly) {
    pill = { status: 'info', label: '구경 중' };
    text = '진행자·관리자 계정은 대기 명단에 들지 않아요. 게임은 진행자 화면에서 만듭니다.';
  } else if (lobby.me.waiting) {
    pill = { status: 'pending', label: '대기 중', pulse: true };
    text = '진행자가 게임을 만들면 자동으로 입장합니다.';
  } else {
    pill = { status: 'idle', label: '준비 중', pulse: true };
    text = '대기 명단에 드는 중이에요…';
  }

  return (
    <div className="flex flex-col">
      {/* 1. 가운데 큐브 + 인사말 + 상태 */}
      <section aria-labelledby="lobby-hello" className="relative flex flex-col items-center overflow-x-clip px-2 pt-6 text-center md:pt-10">
        <div className="grid h-[200px] w-full place-items-center md:h-[260px]">
          <GlowCube size={132} flashKey={flash} className="md:scale-[1.3]" />
        </div>
        <h2
          id="lobby-hello"
          className="mt-4 max-w-full break-keep font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-text md:text-[34px]"
        >
          안녕하세요, {displayName}님
        </h2>
        <div role="status" aria-live="polite" className="mt-3 flex max-w-md flex-col items-center gap-2.5">
          <StatusPill status={pill.status} pulse={pill.pulse}>{pill.label}</StatusPill>
          <p className="text-[15px] leading-relaxed text-text-dim">{text}</p>
        </div>
        {watchOnly && !leaving ? (
          <Link href="/host" className={buttonClass('secondary', 'mt-4', 'md')}>
            <IconHost />
            진행자 화면
          </Link>
        ) : null}
      </section>

      {/* 2. 명단 · 열린 게임 · 코드 입력 */}
      {lobby ? (
        <div className="mt-8 grid gap-4 lg:mt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            <StatCard
              icon={<IconUsers />}
              label="대기 인원"
              value={waitingCount}
              unit="명"
              size="lg"
              // 이 화면의 강한 빛은 GlowCube 하나 (+ 주 버튼): 배지는 빛 없이
              badgeGlow={false}
              right={<LiveChip status={status} />}
              sub={
                me
                  ? `${myIndex + 1}번째로 들어왔어요 · ${waitText(me.since, nowMs)}`
                  : watchOnly
                    ? '구경 중이라 명단에 들지 않아요'
                    : '명단에 드는 중이에요'
              }
              subTone={me ? 'violet' : 'dim'}
            >
              {waiting.length > 0 ? (
                <>
                  {/* 폰(390px): 카드 안쪽 폭이 ~324px 이라 작은 아바타 6개 + "+N" 까지만 */}
                  <span className="block sm:hidden">
                    <AvatarStack names={waiting.map((w) => w.displayName)} max={6} size="sm" label={`대기 중 ${waiting.length}명`} />
                  </span>
                  <span className="hidden sm:block">
                    <AvatarStack names={waiting.map((w) => w.displayName)} max={10} size="md" label={`대기 중 ${waiting.length}명`} />
                  </span>
                </>
              ) : null}
            </StatCard>

            <Panel title="대기 명단" icon={<IconLobby />} right={<span className="text-xs text-text-faint">들어온 순서</span>}>
              {waiting.length === 0 ? (
                <p className="text-[13px] text-text-faint">아직 기다리는 사람이 없어요.</p>
              ) : (
                <ol aria-label="대기 명단 (들어온 순서)" className="flex max-h-72 flex-wrap gap-2 overflow-y-auto p-0.5">
                  {waiting.slice(0, ROSTER_MAX).map((w) => {
                    const mine = w.userId === meId;
                    return (
                      <li
                        key={w.userId}
                        className={
                          'flex h-9 max-w-full items-center gap-2 rounded-full pl-1 pr-3 text-[13px] ring-1 ring-inset ' +
                          (mine ? 'bg-violet/15 text-text ring-violet-ink/45' : 'bg-tint/[0.04] text-text-dim ring-stroke')
                        }
                      >
                        <Avatar name={w.displayName} size={28} />
                        <span className="truncate font-semibold">{w.displayName}</span>
                        {mine ? <span className="text-[11px] font-semibold text-violet-ink">나</span> : null}
                      </li>
                    );
                  })}
                  {waiting.length > ROSTER_MAX ? (
                    <li className="flex h-9 items-center px-2 text-[13px] text-text-faint">외 {waiting.length - ROSTER_MAX}명</li>
                  ) : null}
                </ol>
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel title="참가할 수 있는 게임" icon={<IconJoin />} right={<PanelStat label="열린 게임" value={`${games.length}개`} />}>
              {games.length === 0 ? (
                <EmptyState
                  compact
                  icon={<IconGrid />}
                  title="아직 열린 게임이 없어요"
                  body="진행자가 게임을 만들면 여기에 나타나요. 자동 배정 게임이면 기다리지 않아도 바로 팀에 들어갑니다."
                />
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {games.map((g) => (
                    <OpenGameItem
                      key={g.code}
                      game={g}
                      busy={busyCode === g.code}
                      disabled={!!leaving || busyCode !== null}
                      onEnter={() => void enter(g)}
                    />
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="게임 코드로 참가" icon={<IconGrid />}>
              <p className="mb-3 text-[13px] leading-relaxed text-text-dim">
                진행자가 게임 코드를 알려 줬다면 여기에 입력하세요. 보통은 이 화면을 열어 두고 기다리기만 하면 됩니다.
              </p>
              <GameCodeForm id="lobby-code" disabled={!!leaving} />
            </Panel>
          </div>
        </div>
      ) : loadFailed && error ? (
        <Panel className="mx-auto mt-8 w-full max-w-md">
          <EmptyState
            icon={<IconUsers />}
            title="대기실을 불러오지 못했어요"
            body={error.message}
            action={
              <Button variant="secondary" icon={<IconRefresh />} onClick={() => void refresh()}>
                다시 시도
              </Button>
            }
          />
        </Panel>
      ) : null}
    </div>
  );
}

function LiveChip({ status }: { status: ConnectionStatus }) {
  return status === 'live' ? (
    <Chip tone="ok" dot size="sm">실시간</Chip>
  ) : (
    <Chip tone="warn" dot pulse size="sm">재연결 중</Chip>
  );
}

function OpenGameItem({
  game: g, busy, disabled, onEnter,
}: {
  game: OpenGameSummary;
  busy: boolean;
  disabled: boolean;
  onEnter: () => void;
}) {
  const label = !g.joinable ? '자리 없음' : g.mode === 'self' ? '팀 고르기' : '참가';
  return (
    <li className="surface-inset flex flex-col gap-3 rounded-inset p-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconBadge tone="glass" size="md" glow={false}>
          <IconGrid />
        </IconBadge>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[17px] font-bold tracking-[0.12em] tabular-nums text-text">{g.code}</span>
            <StatusPill status={phaseStatus(g.phase)} size="sm">{PHASE_LABEL[g.phase]}</StatusPill>
            <Chip size="sm" tone={g.mode === 'auto' ? 'violet' : 'blue'}>{ASSIGN_MODE_LABEL[g.mode]}</Chip>
          </p>
          <p className="mt-1 truncate text-[13px] text-text-dim">{openGameMeta(g)}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="max-md:h-11 sm:min-w-24"
        disabled={disabled || !g.joinable}
        loading={busy}
        onClick={onEnter}
        aria-label={`게임 ${g.code} ${label}`}
      >
        {label}
      </Button>
    </li>
  );
}
