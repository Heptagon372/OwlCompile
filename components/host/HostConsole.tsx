'use client';
// 진행자 콘솔 (spec §9 동작 · DESIGN_V4 §6 모양): 유리 패널 3열.
//   왼쪽 "진행"(라운드 R4 · 3/5 · 난이도 4 · 다음 단계 · 타이머 링) + "대기실"(lobby·coding: 더 데려오기·넣기) + 참가 안내
//   가운데 "팀" 표(10팀까지 44px 행, 1440×900 에서 스크롤 없이) + running 실행 제어 + 정답
//   오른쪽 "선택한 팀"(빠진 역할 경고 · 네온 코드 뷰 · 결과 · 팀원 옮기기/내보내기)
// lg~1599px는 2열: 왼쪽 진행 | 가운데 위 팀 표 · 아래 선택한 팀. 1600px 부터 3열
// (사이드바 256px 옆에서 가운데 열이 팀 표 10팀을 가로 스크롤 없이 담으려면 ~620px 필요 → xl(1280)에서는 모자란다).
// 재생 중에는 보드와 같은 시계(frameAt)로 재생 팀 코드의 현재 실행 줄을 path 기준으로 강조한다 (FEATURE_V4 §4). 부엉이는 움직이지 않는다.
// 셸(AppShell)도 여기서 그린다: 헤더 맥락(R3 · 3/5 · 나선 · 게임 2176)과 연결 상태가 게임 뷰에서 나오기 때문.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API, PHASE_LABEL, roundPosition } from '@/lib/contracts';
import { api, ApiClientError } from '@/lib/client/api';
import { useGame } from '@/lib/client/useGame';
import { formatClock, remainingSeconds, useNow } from '@/lib/client/time';
import { useToast } from '@/components/ui/Toast';
import { Button, buttonClass } from '@/components/ui/Button';
import { AppShell, type ShellUser } from '@/components/ui/AppShell';
import { Panel, PanelStat } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/Text';
import { Spinner } from '@/components/ui/Button';
import { IconAlert, IconEye, IconEyeOff, IconTimer, IconUsers } from '@/components/ui/icons';
import { PhasePanel } from './PhasePanel';
import { TeamTable } from './TeamTable';
import { TeamDetail, CodeLines } from './TeamDetail';
import { RunControls } from './RunControls';
import { ConsoleLobby } from './ConsoleLobby';
import { autoplayDelayMs, autoplayNextTeam, canAssignIn, nextRunningTeam, type HostAction } from './logic';
import { frameAt } from '@/components/board/frame';

export function HostConsole({ code, user }: { code: string; user?: ShellUser | null }) {
  const { view, error, status, serverOffsetMs, refresh } = useGame(code);
  const now = useNow(serverOffsetMs, 250);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [autoplayPref, setAutoplayPref] = useState<boolean | null>(null);
  const [showSolutions, setShowSolutions] = useState(false);
  /** 이번 running에서 보드에 보여 준 가장 뒤 실행 순서 (autoplay가 이미 본 팀을 다시 틀지 않게) */
  const [shownUpTo, setShownUpTo] = useState(0);
  const [autoplayAt, setAutoplayAt] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const act = useCallback<HostAction>(async (path, body, okMessage) => {
    setBusy(true);
    try {
      const res = await api<unknown>(path, { method: 'POST', body });
      const msg = typeof okMessage === 'function' ? (okMessage as (r: unknown) => string)(res) : okMessage;
      if (msg) toast(msg, 'success');
      void refresh();
      return true;
    } catch (err) {
      const e = err instanceof ApiClientError ? err : null;
      toast(e?.message ?? '요청을 처리하지 못했습니다.', 'error');
      if (e && (e.status === 409 || e.status === 400)) void refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh, toast]);

  const game = view?.game;
  const phase = game?.phase;
  const round = game?.round;
  const runningTeamId = game?.runningTeamId ?? null;
  const autoplay = autoplayPref ?? game?.autoplay ?? true;
  const results = view?.results ?? [];
  const runningResult = results.find((r) => r.teamId === runningTeamId) ?? null;
  // 재생 회차(runSeq)는 재실행·다시 고르기 때만 오른다 (패치 허용만으로는 바뀌지 않는다)
  const runningKey = runningResult ? `${runningResult.teamId}|${runningResult.round}|${runningResult.runSeq}` : null;
  const nextTeam = phase === 'running' ? nextRunningTeam(results, runningTeamId) : null;
  const inRunning = phase === 'running';
  const autoplayNext = inRunning ? autoplayNextTeam(results, runningTeamId, shownUpTo) : null;

  // 재생 중인 팀이 바뀌면 오른쪽 상세도 그 팀으로
  useEffect(() => {
    if (runningTeamId) setSelected(runningTeamId);
  }, [runningTeamId]);

  // 재생 중인 팀의 현재 실행 줄 (Step.path): 재생 회차(runningKey)가 바뀐 순간부터 보드와 같은 frameAt 시계로
  const [runPath, setRunPath] = useState<readonly number[] | null>(null);
  const traceRef = useRef(runningResult?.trace ?? null);
  traceRef.current = runningResult?.trace ?? null;
  useEffect(() => {
    setRunPath(null);
    const trace = traceRef.current;
    if (!inRunning || !runningKey || !trace || trace.length === 0) return;
    const startedAt = performance.now();
    let last: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const f = frameAt(trace, performance.now() - startedAt);
      const path = f.step.path ?? null;
      const key = path ? path.join('.') : '';
      if (key !== last) {
        last = key;
        setRunPath(path);
      }
      if (f.stage !== 'done') timer = setTimeout(tick, 100);
    };
    tick();
    return () => clearTimeout(timer);
  }, [inRunning, runningKey]);

  // 라운드가 바뀌거나 running을 벗어나면 "보여 준 순서"를 비우고, 재생 팀이 생기면 올린다
  useEffect(() => setShownUpTo(0), [round, inRunning]);
  const runningOrder = runningResult?.runOrder ?? null;
  useEffect(() => {
    if (runningOrder != null) setShownUpTo((m) => Math.max(m, runningOrder));
  }, [runningTeamId, runningOrder]);

  // autoplay가 다음 팀으로 넘긴다. expectTeamId로 "지금 재생 팀이 아직 이 팀일 때만" 조건을 건다:
  // 진행자 탭이 두 개 열려 있어도 한 탭만 넘기고, 다른 탭은 409 running_changed를 받아 조용히 새로 고친다.
  const autoAdvance = useCallback(async (teamId: string, expectTeamId: string | null) => {
    try {
      await api(API.gameRunning(code), { method: 'POST', body: { teamId, expectTeamId } });
    } catch (err) {
      const e = err instanceof ApiClientError ? err : null;
      if (!(e && e.status === 409)) toast(e?.message ?? '다음 팀으로 넘기지 못했습니다.', 'error');
    } finally {
      void refresh();
    }
  }, [code, refresh, toast]);

  // autoplay: ticks×TICK_MS + ENDING_MS + AUTOPLAY_GAP_MS 뒤 아직 안 보여 준 다음 팀
  const runningTicks = runningResult?.ticks ?? null;
  useEffect(() => {
    setAutoplayAt(null);
    if (!autoplay || phase !== 'running' || !runningKey || runningTicks == null || !autoplayNext) return;
    const delay = autoplayDelayMs(runningTicks);
    const expectTeamId = runningTeamId;
    setAutoplayAt(Date.now() + delay);
    const t = setTimeout(() => {
      setAutoplayAt(null);
      void autoAdvance(autoplayNext, expectTeamId);
    }, delay);
    return () => clearTimeout(t);
  }, [autoplay, phase, runningKey, runningTicks, autoplayNext, runningTeamId, autoAdvance]);

  // 헤더 오른쪽: 연결 상태 (+ 코딩 중이면 남은 시간)
  const connection = status === 'live'
    ? <Chip tone="ok" dot size="sm">연결됨</Chip>
    : <Chip tone="warn" dot pulse size="sm" role="status">다시 연결하는 중</Chip>;
  const headerTimer = game && game.phase === 'coding' ? (
    <span className="hidden items-center gap-1 font-mono text-[13px] font-semibold tabular-nums text-text sm:inline-flex" aria-hidden="true">
      <IconTimer size={14} className="text-text-dim" />
      {formatClock(remainingSeconds(game.timerEndsAt, game.timerRemaining, now))}
    </span>
  ) : null;

  if (!view || !game) {
    return (
      <AppShell user={user} title="진행" context={`게임 ${code}`} fluid>
        {error ? (
          <ErrorScreen status={error.status} message={error.message} />
        ) : (
          <p className="flex flex-1 items-center justify-center gap-2 pt-14 text-sm text-text-dim" role="status">
            <Spinner className="size-4 text-violet-ink" />
            콘솔을 불러오는 중…
          </p>
        )}
      </AppShell>
    );
  }
  if (!view.me.isHost) {
    return (
      <AppShell user={user} title="진행" context={`게임 ${code}`} fluid>
        <ErrorScreen status={403} message="이 게임의 진행자만 콘솔을 열 수 있습니다." />
      </AppShell>
    );
  }

  const team = view.teams.find((t) => t.id === selected) ?? view.teams[0] ?? null;
  const pos = roundPosition(game.rounds, game.round);
  const context = game.phase === 'finished'
    ? `종료 · 게임 ${game.code}`
    : `R${game.round} · ${pos.step}/${pos.total} · ${view.map.name} · 게임 ${game.code}`;
  const joinOpen = canAssignIn(game.phase);
  const noArchitect = joinOpen ? view.teams.filter((t) => t.people.length > 0 && t.missingRoles.includes('architect')).length : 0;
  const people = view.teams.reduce((s, t) => s + t.people.length, 0);

  return (
    <AppShell
      user={user}
      title="진행"
      context={context}
      fluid
      right={<>{headerTimer}{connection}</>}
    >
      <div className="mx-auto grid w-full max-w-[1760px] items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)] min-[1600px]:grid-cols-[272px_minmax(0,1fr)_360px] min-[1800px]:grid-cols-[304px_minmax(0,1fr)_440px]">
        <div className="min-w-0 lg:row-span-2 min-[1600px]:row-span-1">
          <PhasePanel view={view} now={now} busy={busy} act={act} origin={origin}>
            {joinOpen ? <ConsoleLobby view={view} busy={busy} act={act} selectedTeamId={team?.id ?? null} /> : null}
          </PhasePanel>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {phase === 'running' ? (
            <RunControls
              view={view}
              busy={busy}
              nextTeamId={nextTeam}
              autoplay={autoplay}
              autoplayAt={autoplayAt}
              now={now == null ? null : now - serverOffsetMs}
              onAutoplay={setAutoplayPref}
              onRun={(teamId) => void act(API.gameRunning(code), { teamId })}
            />
          ) : null}

          <Panel
            title="팀"
            icon={<IconUsers />}
            noPadding
            aria-label="팀"
            right={
              <>
                {noArchitect > 0 ? (
                  <Chip tone="warn" dot size="sm" title="아키텍트가 없는 팀은 제출할 사람이 없습니다">
                    <IconAlert size={12} aria-hidden="true" />
                    아키텍트 없음 {noArchitect}
                  </Chip>
                ) : null}
                <PanelStat label="팀" value={view.teams.length} className="hidden sm:inline-flex" />
                <PanelStat label="인원" value={people} className="hidden md:inline-flex" />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={showSolutions ? <IconEyeOff /> : <IconEye />}
                  aria-expanded={showSolutions}
                  aria-controls="solutions"
                  className="relative max-md:after:absolute max-md:after:-inset-y-1.5 max-md:after:-inset-x-0"
                  onClick={() => setShowSolutions((v) => !v)}
                >
                  {showSolutions ? '정답 숨기기' : '정답 보기'}
                </Button>
              </>
            }
          >
            <TeamTable view={view} selectedId={team?.id ?? null} onSelect={setSelected} />
            <p className="px-4 py-2.5 text-[11px] text-text-faint">
              {PHASE_LABEL[game.phase]} · 행을 누르면 오른쪽에 그 팀 코드와 팀원이 열립니다
            </p>
          </Panel>

          {showSolutions ? (
            <Panel id="solutions" title={`R${game.round} 정답`} icon={<IconEye />} right={<span className="ui-caption">진행자만 보입니다</span>} aria-label="정답">
              {view.solutions && view.solutions.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {view.solutions.map((s, i) => (
                    <div key={i} className="flex min-w-0 flex-col gap-1.5">
                      <span className="ui-caption">정답 {i + 1}</span>
                      <CodeLines lines={s.split('\n')} label={`정답 ${i + 1}`} maxHeight={320} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-text-faint">정답이 없습니다.</p>
              )}
            </Panel>
          ) : null}
        </div>

        {team ? (
          <div className="min-w-0 lg:col-start-2 min-[1600px]:col-start-3 min-[1600px]:row-start-1">
            <TeamDetail
              key={`${team.id}|${game.round}`}
              view={view}
              team={team}
              busy={busy}
              act={act}
              highlightPath={inRunning && team.id === runningTeamId ? runPath : null}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function ErrorScreen({ status, message }: { status: number; message: string }) {
  const title = status === 403 ? '진행자만 열 수 있는 콘솔입니다' : status === 404 ? '게임을 찾을 수 없습니다' : '콘솔을 불러오지 못했습니다';
  return (
    <Panel className="mx-auto mt-8 w-full max-w-md">
      <EmptyState
        icon={<IconAlert />}
        title={title}
        body={message}
        action={<Link href="/host" className={buttonClass('secondary')}>내 게임 목록</Link>}
      />
    </Panel>
  );
}
