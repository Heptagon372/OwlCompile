'use client';
// 프로젝터 보드: 페이즈별 화면 (spec §9 /board). DESIGN_V4 §6 "/board": 어두운 보라검정 무대 위 떠 있는 유리 패널, 10팀까지.
// 셸 없이 1920×1080 무대(Stage) 전체. 머리 줄 = 유리 알약(로고 · R4 · 3/5 · 난이도 4 · 맵 · 실행 중 팀 · 상태 · 게임 코드) + 본문.
// 강한 빛은 화면마다 한 곳(DESIGN_V4 §3): 대기 = 거대한 보라 조명(+ 아치), 코딩 = RingProgress 네온 링,
// 실행 = 코드 뷰의 현재 줄 네온(Playback), 점수·최종 = 1위 카드 bg-highlight(Scoreboard).
// 이 화면은 코드를 실행하지 않는다: 재생은 서버가 준 trace 만 그린다 (frame.ts 순수 함수).
// 나이트·라이트 (THEME_V5 §1): 토글 없음. 루트 레이아웃이 쿠키로 <html data-theme> 을 그리고, 다른 탭에서 바꾸면
// ThemeProvider(startThemeSync)가 storage 이벤트로 즉시 반영한다. 여기는 색을 토큰·CSS 로만 쓰므로 모드가 바뀌어도
// 이 컴포넌트는 다시 그려지지 않는다 → 재생(Playback)이 처음부터 다시 시작하지 않는다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LIMITS, PHASE_LABEL, type GameView, type ResultView, type TeamView } from '@/lib/contracts';
import type { Block } from '@/lib/engine/types';
import { useGame } from '@/lib/client/useGame';
import { formatClock, remainingSeconds, useNow } from '@/lib/client/time';
import { MapGrid } from '@/components/map/MapGrid';
import { BrandMark } from '@/components/ui/Brand';
import { GlowArc } from '@/components/ui/GlowArc';
import { RingProgress } from '@/components/ui/RingProgress';
import { AvatarStack } from '@/components/ui/Avatar';
import { IconBadge } from '@/components/ui/IconBadge';
import { IconCheck, IconLink, IconLock, IconMap, IconPlay, IconUsers } from '@/components/ui/icons';
import { joinDisplay, pickJoinUrls } from '@/components/host/logic';
import { Stage } from './Stage';
import { Playback } from './Playback';
import { playKey } from './frame';
import { FinalScoreboard, RoundScoreboard } from './Scoreboard';
import { phaseTone } from '@/components/ui/Chip';
import { lobbyGridCols, onlineCount, pad2, pillGridCols, ringMax, roundCaption, teamColor, timerTone } from './layout';
import {
  BoardCaption, BoardChip, BoardNotice, BoardPanel, BoardWordmark, RoleDots, StageBackdrop, TeamDot, TeamMark,
  type BoardChipTone,
} from './ui';

type TracedResult = ResultView & { trace: NonNullable<ResultView['trace']> };

/** 페이즈 알약 색: 모든 화면 공통 (contracts PHASE_STATUS → phaseTone) */
const PHASE_TONE: Record<GameView['game']['phase'], BoardChipTone> = {
  lobby: phaseTone('lobby'),
  coding: phaseTone('coding'),
  sealed: phaseTone('sealed'),
  running: phaseTone('running'),
  scored: phaseTone('scored'),
  finished: phaseTone('finished'),
};

/** 큰 숫자 (점수·블록 수·접속 수): Manrope */
const NUM = 'font-display tabular-nums tracking-[-0.02em]';

export function BoardClient({ code }: { code: string }) {
  const { view, error, status, serverOffsetMs } = useGame(code);
  const now = useNow(serverOffsetMs, 250);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  // 재생 시작 관리: 처음 받은 뷰에 이미 재생 중인 팀이 있으면(새로고침) 마지막 프레임을 바로 보여 준다.
  const initialized = useRef(false);
  // doc: 재생을 시작할 때의 코드 사본. 패치 중 팀이 고치는 코드가 재생 중인 화면에 섞이지 않게 한다.
  const [play, setPlay] = useState<{ key: string; startedAt: number | null; doc: Block[] } | null>(null);
  const running = runningResult(view);
  const runKey = running ? playKey(running) : null;
  useEffect(() => {
    if (!view) return;
    const instant = !initialized.current;
    initialized.current = true;
    if (view.game.phase !== 'running') {
      // running을 벗어나면 잊는다: 되돌린 뒤 다시 running에 들어오면 처음부터 재생
      setPlay(null);
      return;
    }
    if (!runKey || !running) return;
    const startedAt = instant ? null : performance.now();
    // 서버가 준 "실제로 실행한 코드"가 우선, 없으면(예전 결과) 이 시점의 팀 코드 사본
    const doc = running.doc ?? view.programs?.[running.teamId]?.doc ?? [];
    setPlay((prev) => (prev?.key === runKey ? prev : { key: runKey, startedAt, doc }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, runKey]);

  if (error && !view) {
    return (
      <Stage>
        <BoardNotice icon={<BrandMark size={160} />} title={error.status === 403 ? '진행자만 볼 수 있는 화면입니다' : error.status === 404 ? '게임을 찾을 수 없습니다' : '보드를 불러오지 못했습니다'}>
          {error.message}
        </BoardNotice>
      </Stage>
    );
  }
  if (!view) {
    return (
      <Stage>
        <BoardNotice icon={<BrandMark size={160} />} title="불러오는 중…">
          게임 <span className="font-mono font-semibold tabular-nums text-text">{code}</span>
        </BoardNotice>
      </Stage>
    );
  }
  if (!view.me.isHost) {
    return (
      <Stage>
        <BoardNotice icon={<BrandMark size={160} />} title="진행자만 볼 수 있는 화면입니다">이 게임의 진행자 계정으로 열어 주세요.</BoardNotice>
      </Stage>
    );
  }

  const { game, map } = view;
  const runningTeam = game.phase === 'running' ? view.teams.find((t) => t.id === game.runningTeamId) : undefined;
  let body: ReactNode = null;
  switch (game.phase) {
    case 'lobby':
      body = <Lobby view={view} origin={origin} />;
      break;
    case 'coding':
    case 'sealed':
      body = <Coding view={view} sec={game.phase === 'coding' ? remainingSeconds(game.timerEndsAt, game.timerRemaining, now) : null} paused={!game.timerEndsAt && game.timerRemaining != null} />;
      break;
    case 'running':
      body = running && play?.key === runKey ? (
        <Playback
          key={play.key}
          map={map}
          result={running}
          doc={running.doc ?? play.doc}
          startedAt={play.startedAt}
          team={runningTeam ? { name: runningTeam.name, color: runningTeam.color } : undefined}
        />
      ) : (
        <Waiting view={view} />
      );
      break;
    case 'scored':
      body = <RoundScoreboard teams={view.teams} standings={view.standings} results={view.results} round={game.round} rounds={game.rounds} />;
      break;
    case 'finished':
      body = <FinalScoreboard teams={view.teams} standings={view.standings} rounds={game.rounds} />;
      break;
  }

  return (
    <Stage>
      <BoardFrame view={view} live={status === 'live'}>{body}</BoardFrame>
    </Stage>
  );
}

/**
 * 무대 안 레이아웃 (훅 없음): 무대 바탕(보라 조명) + 머리 줄 유리 알약 76px + 본문.
 * 대기 화면은 바탕 위쪽에 거대한 보라 조명과 아치 빛을 더 깐다.
 */
export function BoardFrame({ view, live, children }: { view: GameView; live: boolean; children: ReactNode }) {
  const { game, map } = view;
  const lobby = game.phase === 'lobby';
  const runningTeam = game.phase === 'running' ? view.teams.find((t) => t.id === game.runningTeamId) : undefined;
  const rc = roundCaption(game.rounds, game.round);
  return (
    <div className="relative isolate flex h-full flex-col gap-4 px-10 pb-8 pt-6">
      <StageBackdrop spotlight={lobby} />
      {/* 1920 무대라 반지름을 px 로 준다 (기본값은 창 폭 vw 기준이라 축소된 무대와 맞지 않는다). 숨쉬기는 움직임 줄이기면 멈춤 */}
      {lobby ? <GlowArc intensity="strong" radius="1150px" offset={170} animated /> : null}
      <header className="glass relative flex h-[76px] shrink-0 items-center gap-5 rounded-full border border-stroke pl-5 pr-3 shadow-glass">
        <BrandMark size={56} />
        <BoardWordmark />
        <span className="h-9 w-px shrink-0 bg-stroke-strong" aria-hidden="true" />
        {game.phase === 'finished' ? (
          <span className="flex min-w-0 items-center gap-4">
            <span className="text-[28px] font-semibold text-text">최종 순위</span>
            <BoardChip tone="neutral">{game.rounds.length}라운드 합계</BoardChip>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-4">
            <span className={`text-[34px] font-extrabold leading-none text-text ${NUM}`}>{rc.short}</span>
            <BoardChip tone="violet" mono>{rc.step}</BoardChip>
            <span className="min-w-0 truncate text-[28px] font-semibold text-text-dim">{map.name}</span>
          </span>
        )}
        {runningTeam ? (
          <span className="flex h-12 min-w-0 items-center gap-3 rounded-full border border-stroke-strong bg-tint/[0.05] pl-4 pr-5">
            <IconPlay size={20} className="shrink-0 text-violet-ink" />
            <TeamMark team={runningTeam} size={26} />
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-3">
          {!live ? <BoardChip tone="warn" dot pulse>다시 연결하는 중</BoardChip> : null}
          <BoardChip tone={PHASE_TONE[game.phase]} dot>{PHASE_LABEL[game.phase]}</BoardChip>
          <span className="flex h-[52px] items-center gap-3 rounded-full bg-glass-inset pl-5 pr-6 shadow-[inset_0_0_0_1px_var(--color-stroke)]">
            <BoardCaption>게임</BoardCaption>
            <span className="font-mono text-[30px] font-bold leading-none tabular-nums text-text">{game.code}</span>
          </span>
        </span>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

function runningResult(view: GameView | null): TracedResult | null {
  if (!view || view.game.phase !== 'running' || !view.game.runningTeamId) return null;
  const r = view.results.find((x) => x.teamId === view.game.runningTeamId);
  return r && r.trace && r.trace.length > 0 ? (r as TracedResult) : null;
}

/* ------------------------------------------------------------------ lobby */

/** 팀별 접속 카드: 팀 색 윗줄 + 이름 · 접속 n/사람 수 · 이니셜 아바타 줄 · 역할 칸 (아키텍트 없으면 경고) */
function TeamOnlineCard({ team }: { team: TeamView }) {
  const n = onlineCount(team);
  const total = team.people.length;
  const noArchitect = total > 0 && team.missingRoles.includes('architect');
  return (
    <article
      aria-label={`${team.name} 접속 ${n}명, 참가 ${total}명${noArchitect ? ', 아키텍트 없음' : ''}`}
      className="glass relative flex min-h-[140px] min-w-0 flex-col justify-between gap-3 overflow-hidden rounded-card border border-stroke px-5 py-4 shadow-glass"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${teamColor(team.color)}, transparent 85%)` }} />
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3 text-[26px] font-bold">
          <TeamDot color={team.color} size={16} />
          <span className="truncate">{team.name}</span>
        </span>
        <span className={`flex shrink-0 items-baseline font-bold leading-none ${NUM}`} aria-hidden="true">
          <span className={`text-[48px] ${n > 0 && n === total ? 'text-ok' : n > 0 ? 'text-text' : 'text-text-faint'}`}>{n}</span>
          <span className="text-[24px] text-text-faint">/{total}</span>
        </span>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3" aria-hidden="true">
        {total > 0
          ? <AvatarStack names={team.people.map((p) => p.displayName)} max={noArchitect ? 3 : 5} size={36} />
          : <span className="text-[20px] text-text-faint">기다리는 중</span>}
        {noArchitect ? <BoardChip tone="warn" size="sm">아키텍트 없음</BoardChip> : <RoleDots team={team} />}
      </div>
    </article>
  );
}

export function Lobby({ view, origin }: { view: GameView; origin: string }) {
  // 진행자가 localhost로 보드를 열어도 폰이 들어올 와이파이 주소를 보여 준다 (서버가 준 후보 중 가장 좋은 것)
  const { best, others } = pickJoinUrls(view.joinUrls, origin);
  const teams = view.teams;
  const online = teams.reduce((n, t) => n + onlineCount(t), 0);
  const people = teams.reduce((n, t) => n + t.people.length, 0);
  const cols = lobbyGridCols(teams.length);
  return (
    <div className="flex h-full min-h-0 flex-col items-center">
      <section aria-label="참가 안내" className="flex flex-col items-center pt-2 text-center">
        <h1 className="text-[28px] font-semibold tracking-[0.02em] text-violet-ink">참가 코드</h1>
        {/* 뒤의 GlowArc 밝은 띠가 숫자를 가로지르므로 바탕색 후광으로 대비를 지킨다 (나이트 = 짙은 후광, 라이트 = 밝은 후광) */}
        <p
          className="mt-1 font-mono font-bold leading-none tracking-[0.1em] tabular-nums text-text"
          style={{ fontSize: 208, textShadow: '0 0 18px var(--color-bg), 0 0 36px var(--color-bg), 0 0 64px color-mix(in srgb, var(--color-bg) 85%, transparent)' }}
        >
          {view.game.code}
        </p>
        <div className="glass relative mt-7 flex h-20 max-w-full items-center gap-5 rounded-full border border-stroke-strong pl-3 pr-9 shadow-glass">
          <IconBadge size="xl" glow={false}><IconLink /></IconBadge>
          <span className="truncate font-mono text-[42px] font-bold leading-none text-text">{best ? joinDisplay(best.url) : '/join'}</span>
          {best?.kind === 'vpn' ? <BoardChip tone="neutral" size="sm">VPN</BoardChip> : null}
        </div>
        <p className="mt-4 text-[26px] text-text-dim">폰으로 이 주소에 들어가서 참가 코드를 입력하세요</p>
        {others.length > 0 ? (
          <p className="mt-1 max-w-[1600px] truncate font-mono text-[22px] text-text-faint">
            <span className="font-sans">다른 주소 ·</span> {others.slice(0, 3).map((o) => `${joinDisplay(o.url)}${o.kind === 'vpn' ? ' (VPN)' : ''}`).join('  ·  ')}
          </p>
        ) : null}
      </section>

      <section aria-label="팀별 접속" className="mt-auto flex w-full min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between px-2">
          <h2 className="flex items-center gap-3 text-[26px] font-semibold text-text">
            <IconUsers size={26} className="text-violet-ink" />
            팀 <span className={`font-bold ${NUM}`}>{teams.length}</span>개
          </h2>
          <p className="text-[24px] text-text-dim">
            접속 <span className={`font-bold text-text ${NUM}`}>{online}</span>
            <span className="text-text-faint">/{people}명</span>
            {' · '}팀당 최대 {LIMITS.maxMembersPerTeam}명 · 역할은 러너 · 터너 · 컨트롤러 · 아키텍트
          </p>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {teams.map((t) => <TeamOnlineCard key={t.id} team={t} />)}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ coding · sealed */

/** 맵 유리 패널 (코딩·봉인·재생 전 대기): 머리 = R4 · 맵 이름 + 난이도·상한 */
function MapPanel({ view }: { view: GameView }) {
  const { map } = view;
  return (
    <BoardPanel
      title={<><span className={`font-extrabold ${NUM}`}>R{map.round}</span> · {map.name}</>}
      icon={<IconMap />}
      tone="strong"
      className="min-h-0"
      bodyClassName="grid place-items-center"
      right={
        <>
          <BoardChip tone="neutral" size="sm">{map.difficulty}</BoardChip>
          <span className="flex items-baseline gap-2">
            <BoardCaption>상한</BoardCaption>
            <span className={`text-[26px] font-bold text-text ${NUM}`}>{map.cap}</span>
          </span>
        </>
      }
    >
      <div className="w-full max-w-[812px]">
        <MapGrid map={map} className="w-full" />
      </div>
    </BoardPanel>
  );
}

/** 코딩 화면 정보 칸 (파인 유리 면 + 캡션 + 큰 숫자) */
function Fact({ label, mono = false, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-ctl bg-glass-inset px-5 py-4 shadow-[inset_0_0_0_1px_var(--color-stroke)]">
      <BoardCaption>{label}</BoardCaption>
      {/* mono(시각 "12:00")는 40px 이면 ~120px 로 칸(안쪽 ~113px)을 넘친다 → 36px */}
      <span className={`font-bold leading-none text-text ${mono ? 'font-mono text-[36px] tabular-nums' : `text-[40px] ${NUM}`}`}>{children}</span>
    </div>
  );
}

/** 팀 제출 알약: 팀 점 · 이름 · 블록 수/상한 · 상태 (제출 순서 / 자동 봉인 / 코딩 중) */
function TeamPill({ team, cap, compact = false }: { team: TeamView; cap: number; compact?: boolean }) {
  const p = team.program;
  const over = p.blocks > cap;
  const done = !!p.submittedAt;
  // 2열(6팀 이상)이면 알약 폭이 ~450px: 여백을 줄이고 칩 아이콘을 빼서 긴 팀 이름(긴점박이올빼미)이 잘리지 않게
  return (
    <li
      className={`flex min-h-0 min-w-0 items-center rounded-full border pr-2.5 ${compact ? 'gap-2 pl-4' : 'gap-3 pl-5'} ${done ? 'border-ok/35 bg-ok/[0.07]' : 'border-stroke bg-tint/[0.04]'}`}
    >
      <TeamDot color={team.color} size={18} />
      <span className="min-w-0 flex-1 truncate text-[24px] font-bold">{team.name}</span>
      <span className={`shrink-0 font-mono text-[24px] font-semibold tabular-nums ${over ? 'text-danger' : 'text-text-dim'}`}>
        <span className="sr-only">블록 </span>{p.blocks}<span className="text-text-faint">/{cap}</span>
      </span>
      {done ? (
        p.sealedBy === 'auto'
          ? <BoardChip tone="warn" size="sm" icon={compact ? undefined : <IconLock />}>{compact ? '자동' : '자동 봉인'}</BoardChip>
          : <BoardChip tone="ok" size="sm" icon={compact ? undefined : <IconCheck />}>제출 {p.submitOrder ?? ''}</BoardChip>
      ) : (
        <BoardChip tone="violet" size="sm" dot pulse>코딩 중</BoardChip>
      )}
    </li>
  );
}

export function Coding({ view, sec, paused }: { view: GameView; sec: number | null; paused: boolean }) {
  const { map, game } = view;
  const sealed = game.phase === 'sealed';
  const submitted = view.teams.filter((t) => t.program.submittedAt).length;
  const max = ringMax(sec, map.seconds);
  const tone = timerTone(sec, paused);
  const cols = pillGridCols(view.teams.length);
  const rows = Math.max(1, Math.ceil(view.teams.length / cols));
  return (
    <div className="grid h-full min-h-0 grid-cols-[860px_minmax(0,1fr)] gap-4">
      <MapPanel view={view} />
      <div className="flex min-h-0 flex-col gap-4">
        <BoardPanel noPadding className="shrink-0" aria-label={sealed ? '코딩 봉인' : '남은 코딩 시간'}>
          <div className="flex items-center gap-10 px-10 py-8">
            {sealed ? (
              <RingProgress size={360} value={0} max={1} dot={false} aria-label="코딩 봉인">
                <span className="flex flex-col items-center gap-3 text-text-dim">
                  <IconLock size={64} />
                  <span className={`text-[56px] font-bold leading-none text-text ${NUM}`}>봉인</span>
                </span>
              </RingProgress>
            ) : (
              <RingProgress
                size={360}
                value={sec ?? max}
                max={max}
                tone={tone}
                mono
                label={formatClock(sec)}
                sub={paused ? '일시정지' : '남은 시간'}
                aria-label="남은 코딩 시간(초)"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                {sealed
                  ? <BoardChip tone="blue" dot>봉인 · 실행 준비</BoardChip>
                  : paused
                    ? <BoardChip tone="warn" dot>일시정지</BoardChip>
                    : <BoardChip tone={tone === 'danger' ? 'danger' : 'violet'} dot pulse>코딩 중</BoardChip>}
              </div>
              <p className="line-clamp-3 text-[30px] leading-snug text-text">{map.intro}</p>
              <div className="grid grid-cols-3 gap-3">
                <Fact label="제출">{submitted}<span className="text-[26px] text-text-faint">/{view.teams.length}</span></Fact>
                <Fact label="블록 상한">{map.cap}</Fact>
                <Fact label="코딩 시간" mono>{formatClock(map.seconds)}</Fact>
              </div>
            </div>
          </div>
        </BoardPanel>

        <BoardPanel
          title="팀 제출"
          icon={<IconUsers />}
          className="min-h-0 flex-1"
          right={
            <>
              <BoardCaption>블록 수/상한</BoardCaption>
              <span className="h-6 w-px bg-stroke-strong" aria-hidden="true" />
              <span className={`text-[26px] font-bold text-text ${NUM}`}>
                {submitted}<span className="text-text-faint">/{view.teams.length}</span>
              </span>
              <BoardCaption>제출</BoardCaption>
            </>
          }
        >
          <ul
            aria-label="팀별 제출 상태"
            className="grid h-full min-h-0 gap-x-3 gap-y-2.5"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 84px))`,
              alignContent: 'start',
            }}
          >
            {view.teams.map((t) => <TeamPill key={t.id} team={t} cap={map.cap} compact={cols >= 2} />)}
          </ul>
        </BoardPanel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ running (재생 전 대기) */

export function Waiting({ view }: { view: GameView }) {
  const order = [...view.results].sort((a, b) => a.runOrder - b.runOrder);
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  return (
    <div className="grid h-full min-h-0 grid-cols-[860px_minmax(0,1fr)] gap-4">
      <MapPanel view={view} />
      <BoardPanel title="실행 순서" icon={<IconPlay />} className="min-h-0" bodyClassName="flex min-h-0 flex-col gap-6">
        <div>
          <p className="font-display text-[48px] font-bold leading-[1.15] tracking-[-0.02em]">곧 실행합니다</p>
          <p className="mt-2 text-[26px] text-text-dim">제출 순서대로 한 팀씩 보여 드려요</p>
        </div>
        {order.length === 0 ? (
          <p className="text-[26px] text-text-faint">실행 결과를 기다리는 중</p>
        ) : (
          <ol
            aria-label="실행 순서"
            className="grid min-h-0 flex-1 gap-2.5"
            style={{ gridTemplateRows: `repeat(${order.length}, minmax(0, 76px))`, alignContent: 'start' }}
          >
            {order.map((r) => {
              const t = byId.get(r.teamId);
              return t ? (
                <li key={r.teamId} className="flex min-h-0 items-center gap-5 rounded-full border border-stroke bg-tint/[0.04] pl-2 pr-6">
                  <span className={`grid h-12 min-w-16 shrink-0 place-items-center rounded-full bg-glass-inset px-3 text-[26px] font-bold text-text-dim shadow-[inset_0_0_0_1px_var(--color-stroke)] ${NUM}`}>
                    {pad2(r.runOrder)}
                  </span>
                  <TeamMark team={t} size={30} />
                </li>
              ) : null;
            })}
          </ol>
        )}
      </BoardPanel>
    </div>
  );
}
