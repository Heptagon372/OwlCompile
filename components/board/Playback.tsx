'use client';
// 보드 running 화면: trace 재생. 경과 시간만 재고, 무엇을 그릴지는 frameAt()(frame.ts, 순수 함수)이 정한다.
// startedAt = null 이면 재생 없이 마지막 프레임을 바로 보여 준다(새로고침 복원). 재생이 끝나면 마지막 프레임을 유지한다.
// 이 화면은 아무것도 실행하지 않는다: 서버가 준 trace 를 600 ms(TICK_MS)마다 한 스텝씩 그릴 뿐이다.
//
// 모양 (DESIGN_V4 §5·§6): 유리 뷰포트(맵 + 오른쪽 위 올라온 유리 HUD) → 유리 진행 띠 → 오른쪽 네온 코드 뷰(파이썬).
// 현재 실행 줄은 Step.path 로 찾는다: lib/codegen 의 줄 지도(listing.lineOf, lineOfPath). Step.line(한국어 toText 줄)은 쓰지 않는다.
// 결말 띠: 뷰포트를 가로지르는 유리 띠(glass-sheet) + 상태색 테두리·아이콘·옅은 틴트, 글자는 text-tint
// (나이트 = 흰색 그대로, 라이트 = 짙은 남보라: 라이트의 glass-sheet 는 흰 면이라 흰 글자는 보이지 않는다).
// 모드는 CSS(토큰)로만 바뀐다: 다른 탭에서 모드를 바꿔도 이 컴포넌트는 다시 마운트되지 않아 재생이 이어진다.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ResultView } from '@/lib/contracts';
import type { Block, GameMap, Step } from '@/lib/engine/types';
import { lineOfPath, toPython } from '@/lib/codegen';
import { CodeView } from '@/components/code/CodeView';
import { CatSprite, MapActor, MapGrid } from '@/components/map/MapGrid';
import { OwlSprite } from '@/components/map/OwlSprite';
import { IconAlert, IconCheck, IconCode, IconFlag, IconKey, IconMouse, IconPlay } from '@/components/ui/icons';
import { OUTCOME_LABEL } from '@/components/host/logic';
import { BoardCaption, BoardChip, BoardPanel, TeamDot, type BoardChipTone } from './ui';
import { MOVE_MS, catOnTop, frameAt, rotations, type PlaybackFrame } from './frame';
import { signed } from './layout';

export interface PlaybackProps {
  map: GameMap;
  result: ResultView & { trace: NonNullable<ResultView['trace']> };
  doc: Block[];
  /** performance.now() 기준 재생 시작 시각. null이면 마지막 프레임 */
  startedAt: number | null;
  /** 뷰포트 HUD 에 그릴 팀 (이름·색) */
  team?: { name: string; color: string };
}

/** 뷰포트 안 맵 한 변 (px, 1920 무대 기준) */
const MAP_PX = 780;

/** 코드 뷰 글자 크기 (프로젝터) */
const CODE_PX = 24;

/** HUD 큰 숫자: Manrope */
const NUM = 'font-display leading-none tabular-nums tracking-[-0.02em]';

function frameKey(f: PlaybackFrame): string {
  return `${f.index}|${f.stage}|${f.toast?.tick ?? ''}|${f.settled ? 1 : 0}`;
}

/** 진행 띠의 "마지막 이벤트": 부엉이가 도착한 스텝까지 중 가장 최근의 메시지 */
function lastEvent(trace: readonly Step[], frame: PlaybackFrame): string | null {
  const upTo = frame.settled ? frame.index : frame.index - 1;
  for (let i = upTo; i >= 0; i--) {
    const m = trace[i]?.message;
    if (m) return m;
  }
  return null;
}

type EndTone = 'cyan' | 'danger' | 'warn';
const OUTCOME_TONE: Record<string, EndTone> = { goal: 'cyan', dead: 'danger', error: 'danger', stuck: 'warn' };

/** 결말 띠·결과 글자 색 (상태색은 테두리·아이콘·틴트에, 띠 글자는 text-tint) */
const TONE_STYLE: Record<EndTone, { band: string; badge: string; ink: string; soft: string }> = {
  cyan: {
    band: 'border-cyan/70 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-cyan)_16%,transparent)_50%,transparent)]',
    badge: 'bg-cyan/15 text-neon-cyan shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-cyan)_55%,transparent)]',
    ink: 'text-cyan',
    soft: 'bg-cyan/12 text-cyan',
  },
  danger: {
    band: 'border-danger/70 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-danger)_18%,transparent)_50%,transparent)]',
    badge: 'bg-danger/15 text-danger shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-danger)_55%,transparent)]',
    ink: 'text-danger',
    soft: 'bg-danger/12 text-danger',
  },
  warn: {
    band: 'border-warn/70 bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-warn)_14%,transparent)_50%,transparent)]',
    badge: 'bg-warn/15 text-warn shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--color-warn)_55%,transparent)]',
    ink: 'text-warn',
    soft: 'bg-warn/12 text-warn',
  },
};

const CHIP_TONE: Record<EndTone, BoardChipTone> = { cyan: 'cyan', danger: 'danger', warn: 'warn' };

export function Playback({ map, result, doc, startedAt, team }: PlaybackProps) {
  const trace = result.trace;
  const [frame, setFrame] = useState<PlaybackFrame>(() =>
    frameAt(trace, startedAt == null ? Infinity : performance.now() - startedAt));
  const rots = useMemo(() => rotations(trace), [trace]);
  // 줄 지도: CodeView 와 같은 파이썬 줄 목록. 머리의 "n번째 줄" 표시에 쓴다 (강조 자체는 CodeView 가 같은 path 로 한다)
  const listing = useMemo(() => toPython(doc), [doc]);

  useEffect(() => {
    if (startedAt == null) {
      setFrame(frameAt(trace, Infinity));
      return;
    }
    let raf = 0;
    let lastKey = '';
    const loop = () => {
      const f = frameAt(trace, performance.now() - startedAt);
      const k = frameKey(f);
      if (k !== lastKey) {
        lastKey = k;
        setFrame(f);
      }
      if (f.stage !== 'done') raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [trace, startedAt]);

  const { step, stage, items } = frame;
  const outcome = result.outcome;
  const ended = stage !== 'playing';
  const bad = outcome === 'dead' || outcome === 'error';
  // 새 팀의 첫 프레임과 마지막 프레임 바로 보기에서는 순간 이동
  const instant = startedAt == null || frame.index === 0;
  const total = result.score + result.bonus;
  const last = trace.length - 1;
  const pct = last <= 0 ? 100 : Math.round((frame.index / last) * 100);
  const event = lastEvent(trace, frame);
  const tone: EndTone = OUTCOME_TONE[outcome] ?? 'warn';
  const ts = TONE_STYLE[tone];
  const showKeys = items.keys > 0 || items.taken.length > 0 || map.tiles.some((row) => row.includes('K'));
  const curLine = lineOfPath(listing, step.path);

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_620px] gap-4">
      {/* ---------------- 왼쪽: 게임 뷰포트 + 진행 띠 ---------------- */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className={`glass relative min-h-0 flex-1 overflow-hidden rounded-card border border-stroke-strong shadow-glass ${stage === 'ending' && bad ? 'shake-big' : ''}`}>
          <div className="absolute inset-0 flex gap-6 p-6">
            <div className="shrink-0 self-center" style={{ width: MAP_PX }}>
              <MapGrid
                map={map}
                eaten={items.eaten}
                taken={items.taken}
                opened={items.opened}
                showStartOwl={false}
                showCatStart={false}
                glowGoal={ended && outcome === 'goal'}
                className="w-full"
                label={`R${map.round} ${map.name} 맵, 부엉이 (${step.owl.x}, ${step.owl.y})`}
              >
                {step.cat ? (
                  <MapActor x={step.cat.x} y={step.cat.y} instant={instant} durationMs={MOVE_MS} zIndex={catOnTop(step) ? 4 : undefined}>
                    <CatSprite />
                  </MapActor>
                ) : null}
                <MapActor x={step.owl.x} y={step.owl.y} instant={instant} durationMs={MOVE_MS}>
                  <OwlSprite rotation={rots[frame.index]} transitionMs={instant ? 0 : 300} />
                </MapActor>
              </MapGrid>
            </div>

            {/* HUD: 오른쪽 위 올라온 유리 카드 — 팀 · 점수 · 틱 · 쥐 · 열쇠 (숫자는 Manrope) */}
            <aside className="glass glass-raised relative ml-auto flex w-[340px] flex-col gap-5 self-start rounded-card border border-stroke px-6 py-5 shadow-glass" aria-label="현황">
              {team ? (
                <div className="flex min-w-0 items-center gap-3">
                  <TeamDot color={team.color} size={20} />
                  <span className="truncate text-[30px] font-bold leading-tight">{team.name}</span>
                </div>
              ) : null}
              <Stat label="점수">
                <span className={`text-[64px] font-extrabold ${NUM} ${ended ? (total < 0 ? 'text-danger' : 'text-text') : 'text-text-faint'}`}>
                  {ended ? total : '–'}
                </span>
              </Stat>
              <Stat label="틱">
                <span className={`whitespace-nowrap text-[44px] font-bold text-text ${NUM}`}>
                  {step.tick}<span className="text-text-faint"> / {last}</span>
                </span>
              </Stat>
              <div className="grid grid-cols-2 gap-4">
                <Stat label="쥐">
                  <span className={`flex items-center gap-2 text-[36px] font-bold text-violet-ink ${NUM}`}>
                    <IconMouse size={28} />{items.mice}
                  </span>
                </Stat>
                {showKeys ? (
                  <Stat label="열쇠">
                    <span className={`flex items-center gap-2 text-[36px] font-bold text-cyan ${NUM}`}>
                      <IconKey size={28} />{items.keys}
                    </span>
                  </Stat>
                ) : null}
              </div>
            </aside>
          </div>

          {/* 결말 띠: 뷰포트를 가로지르는 유리 띠, 1.5초 */}
          {stage === 'ending' ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2" role="status">
              {/* pop(transform) 은 가운데 정렬(translate)과 다른 층에 둔다. 띠는 맵 위 부엉이·고양이(z 3~4)보다 위,
                  면은 짙은 유리(glass-sheet) + 상태색 틴트 → 아래 맵이 흐리게 비친다 */}
              <div className="pop">
                <div className={`glass glass-sheet relative flex items-center justify-center gap-7 border-y-2 px-12 py-8 font-display text-[72px] font-bold leading-tight tracking-[-0.02em] text-tint ${ts.band}`}>
                  <span className={`grid size-24 shrink-0 place-items-center rounded-full ${ts.badge}`}>
                    {outcome === 'goal' ? <IconCheck size={56} strokeWidth={2.25} /> : <IconAlert size={56} strokeWidth={2.25} />}
                  </span>
                  <span className="min-w-0">{result.message}</span>
                </div>
              </div>
            </div>
          ) : null}

          {/* 이벤트 토스트: 뷰포트 아래쪽 가운데 유리 알약 */}
          {frame.toast ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
              <div key={frame.toast.tick} className="rise glass glass-sheet relative flex h-16 items-center rounded-full border border-violet/40 px-8 text-[30px] font-semibold text-text shadow-float">
                {frame.toast.message}
              </div>
            </div>
          ) : null}
        </div>

        {/* 진행 띠: 유리 알약 — 상태 아이콘 · 틱 · 진행 막대 · 마지막 이벤트 · 쥐/열쇠 */}
        <div className="glass relative flex h-[68px] shrink-0 items-center gap-5 overflow-hidden rounded-full border border-stroke pl-3 pr-7 shadow-glass">
          <span className={`grid size-12 shrink-0 place-items-center rounded-full ${ended ? ts.soft : 'bg-violet/15 text-violet-ink'}`} aria-hidden="true">
            {!ended ? <IconPlay size={22} /> : outcome === 'goal' ? <IconCheck size={24} /> : <IconAlert size={24} />}
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <BoardCaption>틱</BoardCaption>
            <span className={`text-[30px] font-semibold ${NUM}`} aria-live="off">
              {step.tick}<span className="text-text-faint"> / {last}</span>
            </span>
          </span>
          <span
            className="relative h-2 w-[240px] shrink-0 overflow-hidden rounded-full bg-tint/[0.08]"
            role="progressbar"
            aria-label="재생 진행"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <span className="progress-line absolute inset-y-0 left-0" style={{ width: `${pct}%`, height: '100%' }} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[26px] text-text-dim">
            {event ?? (ended ? OUTCOME_LABEL[outcome] : '실행 중')}
          </span>
          <span className={`flex shrink-0 items-center gap-5 text-[28px] font-bold ${NUM}`}>
            <span className="flex items-center gap-2 text-violet-ink"><IconMouse size={24} />{items.mice}</span>
            {showKeys ? <span className="flex items-center gap-2 text-cyan"><IconKey size={24} />{items.keys}</span> : null}
          </span>
        </div>
      </div>

      {/* ---------------- 오른쪽: 네온 코드 뷰(파이썬) + 결과 ---------------- */}
      <div className="flex min-h-0 flex-col gap-4">
        <BoardPanel
          title={<>코드 <span className="font-medium text-text-faint">· 파이썬</span></>}
          icon={<IconCode />}
          noPadding
          className="min-h-0 flex-1"
          bodyClassName="flex min-h-0 flex-col px-3 pb-3"
          right={
            <>
              {curLine >= 0 ? <BoardChip tone="violet" size="sm" mono>{curLine + 1}번째 줄</BoardChip> : null}
              <span className="flex items-baseline gap-2">
                <BoardCaption>블록</BoardCaption>
                <span className={`text-[24px] font-bold text-text ${NUM}`}>{result.blocks}<span className="text-text-faint">/{map.cap}</span></span>
              </span>
            </>
          }
        >
          <CodeView
            program={doc}
            lang="python"
            header={false}
            showLangToggle={false}
            animate={false}
            highlightPath={step.path}
            fontSize={CODE_PX}
            emptyText="블록이 없습니다"
            className="min-h-0 flex-1"
            aria-label={team ? `${team.name} 코드 (파이썬)` : '코드 (파이썬)'}
          />
        </BoardPanel>

        {ended ? (
          <BoardPanel title="결과" icon={<IconFlag />} className="pop shrink-0" right={<BoardChip tone={CHIP_TONE[tone]}>{OUTCOME_LABEL[outcome]}</BoardChip>}>
            <div className="flex items-baseline justify-between gap-5">
              <span className={`min-w-0 truncate text-[30px] font-semibold ${ts.ink}`}>{result.message}</span>
              <span className={`shrink-0 text-[64px] font-extrabold ${NUM} ${total < 0 ? 'text-danger' : 'text-text'}`}>
                {total}<span className="ml-1 font-sans text-[26px] font-semibold tracking-normal text-text-faint">점</span>
              </span>
            </div>
            <ul className="mt-4 flex flex-col gap-1.5 rounded-ctl bg-glass-inset px-4 py-3 text-[24px] text-text-dim shadow-[inset_0_0_0_1px_var(--color-stroke)]">
              {result.scoreLines.map((l, i) => (
                <li key={i} className="pop flex items-baseline justify-between gap-4" style={{ animationDelay: `${120 * (i + 1)}ms` }}>
                  <span className="min-w-0 truncate">{l.label}</span>
                  <span className={`shrink-0 font-display font-bold tabular-nums ${l.points < 0 ? 'text-danger' : l.points === 0 ? 'text-text-faint' : 'text-ok'}`}>{l.points >= 0 ? '+' : ''}{l.points}</span>
                </li>
              ))}
              {result.bonus !== 0 ? (
                <li className="pop flex items-baseline justify-between gap-4" style={{ animationDelay: `${120 * (result.scoreLines.length + 1)}ms` }}>
                  <span className="min-w-0 truncate">{result.bonusNote || '보너스'}</span>
                  <span className={`shrink-0 font-display font-bold tabular-nums ${result.bonus < 0 ? 'text-danger' : 'text-ok'}`}>{signed(result.bonus)}</span>
                </li>
              ) : null}
            </ul>
          </BoardPanel>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <span className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <BoardCaption>{label}</BoardCaption>
      {children}
    </span>
  );
}
