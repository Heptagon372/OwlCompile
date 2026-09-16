'use client';
// 진행자 콘솔 왼쪽 "진행" (DESIGN_V4 §3·§6): 라운드 표기 "R4 · 3/5 · 난이도 4" + 맵, 고른 라운드 단계 줄,
// 코딩 타이머 = 네온 RingProgress(+ 시작/일시정지/+30초), 큰 다음 단계 버튼 1개, 보드 열기, 이전 페이즈로,
// 참가 안내(가장 좋은 주소 크게 + 게임 코드 + 다른 주소 + 방화벽 안내).
// 강한 빛은 한 화면 2개까지: 지금 누를 다음 단계 버튼(primary) + 타이머 링. running 중 아직 보드에 안 보여 준 팀이 남아 있으면
// 지금 할 일은 RunControls 의 "다음 팀"이라 그쪽이 primary 이고 여기 "점수 확정"은 secondary (spec §8). 마지막 팀이면 다시 이 버튼.
import { useState, type ReactNode } from 'react';
import { API, PHASE_LABEL, roundPosition, type GameView, type Phase } from '@/lib/contracts';
import { formatClock, remainingSeconds } from '@/lib/client/time';
import { Button, buttonClass } from '@/components/ui/Button';
import { Panel, PanelStat } from '@/components/ui/Panel';
import { Chip, phaseTone, type ChipTone } from '@/components/ui/Chip';
import { RingProgress } from '@/components/ui/RingProgress';
import { Notice } from '@/components/ui/Text';
import { ConfirmSheet } from '@/components/ui/Sheet';
import {
  IconCheck, IconChevronRight, IconCode, IconExternal, IconFlag, IconLock, IconPause, IconPlay, IconPlus, IconUndo, IconWifi,
} from '@/components/ui/icons';
import {
  joinDisplay, nextPhase, nextRunningTeam, pickJoinUrls, prevPhase, prevPhaseWarning, rerunState, timerRing, type HostAction,
} from './logic';

export const JOIN_TROUBLE_HINT =
  '폰이 접속하지 못하면 PC와 같은 와이파이인지, Windows 방화벽에서 Node.js의 개인 네트워크 접속이 허용됐는지 확인하세요.';
/** 인터넷에 공개된 서버(도메인·공인 IP)로 열었을 때: 폰의 네트워크는 상관없다 */
export const JOIN_PUBLIC_HINT =
  '인터넷 주소라서 와이파이·모바일 데이터 어디에 연결돼 있든 들어올 수 있습니다. 안 열리면 주소를 다시 확인하세요.';

/** 페이즈 → 상태 칩 톤 (진행 중 보라 · 대기 호박색 · 완료 초록, DESIGN_V4 §3). 모든 화면 공통 값(contracts PHASE_STATUS) */
export const PHASE_TONE: Record<Phase, ChipTone> = {
  lobby: phaseTone('lobby'),
  coding: phaseTone('coding'),
  sealed: phaseTone('sealed'),
  running: phaseTone('running'),
  scored: phaseTone('scored'),
  finished: phaseTone('finished'),
};

/** 다음 단계 버튼 아이콘 (목적지 페이즈별) */
const NEXT_ICON: Record<Phase, ReactNode> = {
  lobby: null,
  coding: <IconCode />,
  sealed: <IconLock />,
  running: <IconPlay />,
  scored: <IconCheck />,
  finished: <IconFlag />,
};

export function PhasePanel({
  view, now, busy, act, origin, children,
}: {
  view: GameView;
  now: number | null;
  busy: boolean;
  act: HostAction;
  origin: string;
  /** 진행 패널과 참가 안내 사이 (콘솔 대기실 카드) */
  children?: ReactNode;
}) {
  const { game, map } = view;
  const code = game.code;
  const next = nextPhase(game.phase, game.round, game.rounds);
  const prev = prevPhase(game.phase, game.round, game.rounds);
  const pos = roundPosition(game.rounds, game.round);
  const [confirmPrev, setConfirmPrev] = useState(false);
  const [confirmNext, setConfirmNext] = useState(false);

  const coding = game.phase === 'coding';
  const sealed = game.phase === 'sealed';
  const finished = game.phase === 'finished';
  const sec = coding ? remainingSeconds(game.timerEndsAt, game.timerRemaining, now) : null;
  const paused = coding && !game.timerEndsAt && game.timerRemaining != null;
  const urgent = coding && sec != null && sec <= 30;
  const ring = timerRing(sec, map.seconds);
  const unsubmitted = view.teams.filter((t) => !t.program.submittedAt).length;
  // 패치를 허용했지만 아직 재실행하지 않은 팀: 이대로 점수 확정하면 패치권만 사라진다 (서버도 409 patch_pending)
  const patchPending = view.teams.filter((t) =>
    rerunState(game.phase, view.results.find((r) => r.teamId === t.id) ?? null, t) !== 'hidden').length;
  const blockedScore = next?.to === 'scored' && patchPending > 0;
  // running 에서 보드에 보여 줄 팀이 남았나 (HostConsole 이 RunControls 에 넘기는 다음 팀과 같은 계산). 강조만 바꾼다
  const teamsLeft = game.phase === 'running' && nextRunningTeam(view.results, game.runningTeamId) != null;

  const goNext = async () => {
    if (!next) return;
    setConfirmNext(false);
    await act(API.gamePhase(code), { to: next.to, expect: game.phase });
  };
  const onNext = () => {
    // 봉인은 아직 제출 안 한 팀이 있으면 한 번 더 묻는다
    if (next?.to === 'sealed' && unsubmitted > 0) setConfirmNext(true);
    else void goNext();
  };
  const goPrev = async () => {
    if (!prev) return;
    const ok = await act(API.gamePhase(code), { to: prev, expect: game.phase }, `${PHASE_LABEL[prev]}(으)로 돌아갔습니다`);
    if (ok) setConfirmPrev(false);
  };

  // 다음 단계 아이콘: scored→coding(다음 라운드)만 화살표
  const nextIcon = next ? (next.to === 'coding' && game.phase === 'scored' ? <IconChevronRight /> : NEXT_ICON[next.to]) : null;

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-label="라운드와 페이즈">
      <Panel
        title="진행"
        icon={<IconFlag />}
        right={
          <Chip tone={PHASE_TONE[game.phase]} dot pulse={coding || game.phase === 'running'} aria-label={`페이즈 ${PHASE_LABEL[game.phase]}`}>
            {PHASE_LABEL[game.phase]}
          </Chip>
        }
      >
        {/* 라운드 표기 · 맵 · 상한 */}
        {finished ? (
          <p className="text-xl font-bold leading-tight tracking-[-0.02em] text-text">게임 종료</p>
        ) : (
          <>
            <p className="font-mono text-xs font-semibold tracking-wide text-violet-ink" aria-label={`라운드 ${game.round}, ${pos.total}개 중 ${pos.step}번째, 난이도 ${pos.level}`}>
              {pos.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xl font-bold leading-tight tracking-[-0.02em] text-text">{map.name}</p>
              <PanelStat label="상한" value={`${map.cap}블록`} />
            </div>
          </>
        )}
        <RoundSteps view={view} />

        {/* 타이머 (코딩 중) / 봉인 표시 */}
        {coding || sealed ? (
          <div className="surface-inset mt-4 flex items-center gap-4 rounded-inset p-3.5">
            <RingProgress
              value={coding ? ring.value : 0}
              max={ring.max}
              size={112}
              mono
              tone={urgent && !paused ? 'danger' : paused ? 'warn' : 'violet'}
              label={coding ? formatClock(sec) : '봉인'}
              sub={sealed ? '제출 마감' : paused ? '일시정지' : '남은 시간'}
              aria-label={coding ? `남은 시간 ${formatClock(sec)}${paused ? ', 일시정지' : ''}` : '봉인됨'}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {paused ? <Chip tone="warn" dot size="sm" className="self-start">일시정지</Chip> : null}
              {urgent && !paused ? <Chip tone="danger" dot pulse size="sm" className="self-start">임박</Chip> : null}
              {coding ? (
                <>
                  {game.timerEndsAt ? (
                    <Button variant="secondary" size="sm" fullWidth className="max-md:min-h-11" icon={<IconPause />} disabled={busy} onClick={() => void act(API.gameTimer(code), { action: 'pause' })}>
                      일시정지
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" fullWidth className="max-md:min-h-11" icon={<IconPlay />} disabled={busy} onClick={() => void act(API.gameTimer(code), { action: 'resume' })}>
                      타이머 시작
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" fullWidth className="font-mono max-md:min-h-11" icon={<IconPlus />} disabled={busy} onClick={() => void act(API.gameTimer(code), { action: 'add', seconds: 30 })}>
                    30초
                  </Button>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-text-dim">모든 팀의 코드가 잠겼습니다. 실행을 누르면 보드에서 차례로 재생합니다.</p>
              )}
            </div>
          </div>
        ) : null}

        {/* 다음 단계: 지금 누를 버튼 하나만 primary (비활성이면 kit 이 빛을 끈다).
            running 중 남은 팀이 있으면 "다음 팀"(RunControls)이 그 역할이라 이 버튼("점수 확정")은 secondary */}
        {next ? (
          <Button
            variant={teamsLeft ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            className="mt-4 h-14! text-base!"
            icon={nextIcon}
            disabled={busy || blockedScore}
            onClick={onNext}
          >
            {next.label}
            {next.to === 'coding' && game.phase === 'scored' ? (
              <span className="font-medium opacity-80">· R{game.rounds[game.roundIndex + 1] ?? ''}</span>
            ) : null}
          </Button>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-text-dim">
            고른 {game.rounds.length}라운드가 모두 끝났습니다. 보드에 최종 순위가 떠 있습니다.
          </p>
        )}
        {blockedScore ? (
          <Notice tone="warn" role="status" className="mt-2 text-[13px]">
            패치를 허용한 팀 {patchPending}개가 아직 재실행되지 않았습니다. 재실행하거나 이전 페이즈로 되돌린 뒤 점수를 확정하세요.
          </Notice>
        ) : null}
        {coding && unsubmitted > 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            아직 제출 안 한 팀 <span className="font-mono font-semibold text-text">{unsubmitted}</span>개 · 봉인하면 지금 코드 그대로 자동 봉인됩니다
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <a href={`/board/${code}`} target="_blank" rel="noopener" className={buttonClass('secondary', '', 'md', true)}>
            <IconExternal />
            보드 열기
          </a>
          {prev ? (
            <Button variant="ghost" fullWidth icon={<IconUndo />} disabled={busy} onClick={() => setConfirmPrev(true)}>
              이전 페이즈로
            </Button>
          ) : null}
        </div>
      </Panel>

      {children}

      <JoinCard joinUrls={view.joinUrls} origin={origin} code={code} />

      <ConfirmSheet
        open={confirmPrev}
        title={prev ? `${PHASE_LABEL[prev]}(으)로 돌아갈까요?` : '이전 페이즈로'}
        message={prevPhaseWarning(game.phase)}
        confirmLabel="되돌리기"
        danger
        busy={busy}
        onConfirm={() => void goPrev()}
        onClose={() => setConfirmPrev(false)}
      />
      <ConfirmSheet
        open={confirmNext}
        title="지금 봉인할까요?"
        message={`아직 제출하지 않은 팀 ${unsubmitted}개는 지금 코드 그대로 자동 봉인되고, 제출 순서는 맨 뒤로 갑니다.`}
        confirmLabel="봉인"
        busy={busy}
        onConfirm={() => void goNext()}
        onClose={() => setConfirmNext(false)}
      />
    </div>
  );
}

/** 고른 라운드 단계 줄: 끝난 라운드 = 초록 체크, 지금 = 보라, 남은 = 흐림 */
function RoundSteps({ view }: { view: GameView }) {
  const { game } = view;
  const finished = game.phase === 'finished';
  return (
    <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="고른 라운드">
      {game.rounds.map((r, i) => {
        const done = finished || i < game.roundIndex || (i === game.roundIndex && game.phase === 'scored');
        const current = !finished && i === game.roundIndex;
        return (
          <li
            key={r}
            aria-current={current ? 'step' : undefined}
            className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 font-mono text-[11px] font-semibold tabular-nums ${
              current
                ? 'border-violet/50 bg-violet/15 text-violet-ink'
                : done
                  ? 'border-ok/30 bg-ok/10 text-ok'
                  : 'border-stroke text-text-faint'
            }`}
          >
            {done && !current ? <IconCheck size={11} strokeWidth={2.4} aria-hidden="true" /> : null}
            R{r}
            <span className="sr-only">{current ? ' 진행 중' : done ? ' 끝남' : ' 남음'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 참가 안내: 폰이 열 주소(가장 좋은 후보를 크게) + 게임 코드 + 다른 후보 + 접속 문제 안내 */
function JoinCard({ joinUrls, origin, code }: { joinUrls: GameView['joinUrls']; origin: string; code: string }) {
  const { best, others } = pickJoinUrls(joinUrls, origin);
  return (
    <Panel title="참가 안내" icon={<IconWifi />} aria-label="참가 안내">
      <p className="ui-caption">폰에서 이 주소로 접속</p>
      <p className="mt-1.5 break-all rounded-ctl border border-blue/35 bg-blue-soft px-3 py-2 font-mono text-[16px] font-semibold leading-snug text-blue-hover">
        {best ? joinDisplay(best.url) : '/join'}
        {best?.kind === 'vpn' ? <VpnTag /> : null}
      </p>
      {best?.kind === 'local' ? (
        <p className="mt-1.5 text-xs leading-relaxed text-warn">이 주소는 이 PC에서만 열립니다. 와이파이 주소를 찾지 못했어요.</p>
      ) : null}

      <div className="surface-inset mt-3 rounded-inset px-4 py-3">
        <p className="ui-caption">게임 코드</p>
        <p className="mt-1.5 font-mono text-[38px] font-bold leading-none tracking-[0.14em] tabular-nums text-text">{code}</p>
      </div>

      {others.length > 0 ? (
        <div className="mt-3">
          <p className="ui-caption">안 되면 다른 주소</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {others.map((o) => (
              <li key={o.url} className="break-all font-mono text-xs text-text-dim">
                {joinDisplay(o.url)}
                {o.kind === 'vpn' ? <VpnTag /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-text-faint">{best?.kind === 'public' ? JOIN_PUBLIC_HINT : JOIN_TROUBLE_HINT}</p>
    </Panel>
  );
}

function VpnTag() {
  return (
    <Chip size="sm" className="ml-1.5 align-middle font-sans" title="VPN 주소 (같은 VPN에 연결된 기기만 열 수 있습니다)">
      VPN
    </Chip>
  );
}
