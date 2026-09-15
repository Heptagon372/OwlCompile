'use client';
// 진행자 콘솔 running 제어: 실행 순서(번호 칩 + 팀), "다음 팀" 버튼, 자동 진행 칩 토글, 자동 진행 카운트다운.
// DESIGN_V4 §3·§6: 유리 패널. 빛나는 primary 버튼은 한 화면에 하나:
// 보드에 보여 줄 팀이 남아 있으면 "다음 팀"(= 지금의 다음 단계)이 primary 이고 진행 패널의 "점수 확정"은 secondary,
// 마지막 팀이면 "다음 팀"은 비활성 secondary 가 되고 "점수 확정"이 primary. 순서 칩은 유리 알약, 재생 중인 칩만 옅은 보라 면.
import type { GameView } from '@/lib/contracts';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Chip, NumChip } from '@/components/ui/Chip';
import { IconPlay, IconStepForward } from '@/components/ui/icons';
import { OUTCOME_LABEL } from './logic';
import { OUTCOME_TONE, TeamSwatch } from './TeamTable';

export function RunControls({
  view, busy, nextTeamId, autoplay, autoplayAt, now, onAutoplay, onRun,
}: {
  view: GameView;
  busy: boolean;
  nextTeamId: string | null;
  autoplay: boolean;
  /** 로컬 시각(ms) 기준 자동으로 넘어가는 시각 */
  autoplayAt: number | null;
  /** 로컬 시각(ms) */
  now: number | null;
  onAutoplay: (on: boolean) => void;
  onRun: (teamId: string) => void;
}) {
  const byId = new Map(view.teams.map((t) => [t.id, t]));
  const order = [...view.results].sort((a, b) => a.runOrder - b.runOrder);
  const current = view.game.runningTeamId;
  const nextTeam = nextTeamId ? byId.get(nextTeamId) : undefined;
  const left = autoplayAt != null && now != null ? Math.max(0, Math.ceil((autoplayAt - now) / 1000)) : null;

  return (
    <Panel
      title="실행 순서"
      icon={<IconPlay />}
      aria-label="실행 제어"
      right={
        <button
          type="button"
          role="switch"
          aria-checked={autoplay}
          onClick={() => onAutoplay(!autoplay)}
          className={`relative inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 max-md:after:absolute max-md:after:-inset-2 text-xs font-semibold leading-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink ${
            autoplay ? 'border-violet/45 bg-violet/15 text-violet-ink' : 'border-stroke-strong bg-glass-2 text-text-dim hover:border-tint/30 hover:text-text'
          }`}
        >
          <i aria-hidden="true" className={`size-1.5 rounded-full ${autoplay ? 'bg-violet' : 'bg-text-faint'}`} />
          자동 진행 {autoplay ? '켬' : '끔'}
        </button>
      }
    >
      <ol className="flex flex-wrap gap-1.5" aria-label="실행 순서">
        {order.map((r) => {
          const t = byId.get(r.teamId);
          if (!t) return null;
          const active = r.teamId === current;
          return (
            <li key={r.teamId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRun(r.teamId)}
                aria-current={active ? 'true' : undefined}
                title={active ? '지금 보드에서 재생 중' : `${t.name} 팀을 보드에서 재생`}
                className={`flex h-9 items-center gap-2 rounded-full border pl-1.5 pr-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 ${
                  active
                    ? 'border-violet/60 bg-violet/15 text-violet-ink'
                    : 'border-stroke-strong bg-glass-2 text-text hover:border-tint/30 hover:bg-tint/[0.06]'
                }`}
              >
                <NumChip n={r.runOrder} active={active} />
                <TeamSwatch color={t.color} size={8} />
                {t.name}
                <Chip tone={OUTCOME_TONE[r.outcome]} size="sm" className="ml-0.5">{OUTCOME_LABEL[r.outcome]}</Chip>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant={nextTeamId ? 'primary' : 'secondary'}
          className="max-md:min-h-11"
          icon={<IconStepForward />}
          disabled={busy || !nextTeamId}
          onClick={() => nextTeamId && onRun(nextTeamId)}
        >
          {current ? '다음 팀' : '첫 팀 재생'}
          {nextTeam ? <span className="font-medium opacity-80">· {nextTeam.name}</span> : null}
        </Button>
        <p className="text-[13px] text-text-dim" aria-live="polite">
          {!nextTeamId
            ? '마지막 팀입니다. 다 보고 나면 점수 확정을 누르세요.'
            : autoplay && left != null
              ? <><span className="font-mono font-semibold tabular-nums text-text">{left}</span>초 뒤 자동으로 다음 팀</>
              : autoplay
                ? '재생이 끝나면 자동으로 다음 팀으로 넘어갑니다'
                : '자동 진행이 꺼져 있습니다'}
        </p>
      </div>
    </Panel>
  );
}
