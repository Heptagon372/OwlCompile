// 보드 점수판: scored(라운드 점수 + 누적 순위), finished(최종 순위). 훅 없음.
// DESIGN_V4 §6 "/board": 어두운 무대 위 유리 순위 카드. 6팀부터 2열(세로 먼저: 왼쪽 1~5위, 오른쪽 6~10위), 5팀까지 1열.
// 1위 카드만 bg-highlight + shadow-glow (동점 1위는 모두 같은 모습, 전원 동점이면 강조 없음: layout.rankHighlightIds).
// 금색·이모지 없음. 큰 숫자는 Manrope.
//
// 순위 이동 (2라운드부터): 모든 카드가 지난 순위 칸에서 나타나 잠시 머문 뒤 새 칸으로 미끄러진다.
// 칸 크기가 모두 같고(카드 사이 간격은 칸 안 여백) 세로 먼저 채우므로 이동량 = translate(열 차 × 100%, 행 차 × 100%) (layout.rankShift).
// CSS @starting-style(첫 렌더 값) + transition 이라 훅이 없다: 0.3s 나타남 → 0.9s 머묾 → 1.1s 이동 (옛 .rank-move 2s 와 같은 박자).
// 움직임 줄이기면 바로 새 자리. 순위 숫자·1위 면은 도착 즈음(.rank-swap-in, 1.7s) 바뀐다.
import type { CSSProperties, ReactNode } from 'react';
import { DEFAULT_ROUNDS, nextRoundOf, type ResultView, type RoundNo, type StandingRow, type TeamView } from '@/lib/contracts';
import { IconBadge } from '@/components/ui/IconBadge';
import { IconChevronDown, IconChevronUp, IconTrophy } from '@/components/ui/icons';
import { BoardCaption, BoardChip, TeamMark } from './ui';
import { pad2, rankHighlightIds, rankLayout, rankShift, roundCaption, signed, type RankLayout } from './layout';

const RANK_LABEL = (rank: number) => `${rank}위`;

/** 큰 숫자: Manrope 800 */
const NUM = 'font-display font-extrabold leading-none tabular-nums tracking-[-0.02em]';

/** 순위 변동 표시가 나타나는 시각 (카드가 새 자리에 닿을 즈음) */
const RANK_DELTA_DELAY_MS = 1700;

/** 순위 칸 최대 높이 (px, 1920 무대). 5칸이면 본문 높이에 맞춰 줄어든다 */
const ROW_MAX = 156;

/** 지난 순위 칸에서 새 칸으로: 나타남 0.3s, 머묾 0.9s, 이동 1.1s. --dx/--dy 는 칸 단위 */
const MOVE_CLS =
  'starting:opacity-0 starting:[translate:calc(var(--dx)*100%)_calc(var(--dy)*100%)] ' +
  '[transition:opacity_300ms_ease-out,translate_1100ms_var(--ease-ui)_900ms] motion-reduce:[transition:none]';

/** 새 1위가 다른 칸에서 올라올 때 도착 즈음 나타나는 강조 면 (카드 안 z -1: 유리 면 위, 글자 아래) */
const HIGHLIGHT_LAYER = 'pointer-events-none absolute -inset-px z-[-1] rounded-card bg-highlight shadow-glow';
/** 강조 면 왼쪽 위 광택 */
const GLOSS =
  'pointer-events-none absolute inset-0 z-[-1] rounded-card ' +
  'bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--color-white)_16%,transparent),transparent_55%)]';

/**
 * 이번 라운드 점수를 빼고 계산한 "지난 라운드까지" 순위 (서버 computeStandings 와 같은 기준:
 * 누적 → 도착 수 → 틱 적은 팀 → 자리). 표시 전용: 카드가 이전 자리에서 새 자리로 움직이는 연출과 변동 표시.
 * 고른 라운드의 첫 라운드면 null (이전 순위 없음).
 */
export function previousRanks(
  teams: TeamView[], standings: StandingRow[], results: ResultView[], round: number,
  rounds: readonly number[] = DEFAULT_ROUNDS,
): Map<string, { index: number; rank: number }> | null {
  // 순위 열 = 고른 라운드. 고른 라운드의 첫 라운드면 이전 순위 없음
  const col = rounds.indexOf(round);
  if (col <= 0) return null;
  const seat = new Map(teams.map((t) => [t.id, t.seat]));
  const res = new Map(results.map((r) => [r.teamId, r]));
  const prev = standings.map((s) => {
    const r = res.get(s.teamId);
    return {
      teamId: s.teamId,
      total: s.total - (s.rounds[col] ?? 0),
      goals: s.goals - (r?.outcome === 'goal' ? 1 : 0),
      ticks: s.ticks - (r?.ticks ?? 0),
    };
  });
  prev.sort((a, b) => b.total - a.total || b.goals - a.goals || a.ticks - b.ticks
    || (seat.get(a.teamId) ?? 0) - (seat.get(b.teamId) ?? 0));
  const out = new Map<string, { index: number; rank: number }>();
  prev.forEach((p, i) => {
    const before = i > 0 ? prev[i - 1] : null;
    const tied = before && before.total === p.total && before.goals === p.goals && before.ticks === p.ticks;
    out.set(p.teamId, { index: i, rank: tied ? out.get(before.teamId)!.rank : i + 1 });
  });
  return out;
}

/** 1위 카드(bg-highlight) 위의 상태 글자: 채도 높은 보라 위라 밝은 틴트 */
const ON_HIGHLIGHT = { up: 'text-ok-on-violet', down: 'text-danger-on-violet', flat: 'text-white/85' } as const;

function RankDelta({ from, to, onHighlight = false }: { from: number; to: number; onHighlight?: boolean }) {
  const d = from - to;
  if (d === 0) {
    return <span className={`w-16 text-center font-display text-[26px] font-semibold ${onHighlight ? ON_HIGHLIGHT.flat : 'text-text-faint'}`} aria-label="변동 없음">–</span>;
  }
  const up = d > 0;
  const tone = onHighlight ? (up ? ON_HIGHLIGHT.up : ON_HIGHLIGHT.down) : up ? 'text-ok' : 'text-danger';
  return (
    <span
      className={`pop flex w-16 items-center gap-0.5 font-display text-[28px] font-bold tabular-nums ${tone}`}
      style={{ animationDelay: `${RANK_DELTA_DELAY_MS}ms` }}
      aria-label={`${Math.abs(d)}계단 ${up ? '상승' : '하락'}`}
    >
      {up ? <IconChevronUp size={28} strokeWidth={2.5} /> : <IconChevronDown size={28} strokeWidth={2.5} />}
      {Math.abs(d)}
    </span>
  );
}

/**
 * 순위 카드 면: 1위 = bg-highlight + shadow-glow + 광택, 나머지 = 짙은 유리(glass-sheet, 움직이며 겹쳐도 글자가 섞이지 않게).
 * reveal: 새 1위가 다른 칸에서 올라오는 중 — 미끄러지는 동안은 유리, 새 칸에 닿을 즈음(.rank-swap-in) 강조 면이 나타난다.
 * 라이트: 유리(glass-sheet)가 흰색 90% 라 흰 글자가 사라진다 → 미끄러지는 동안만 짙은 보라 유리(violet-deep, 두 모드 같은 값)로. 나이트는 그대로.
 */
const REVEAL_LIGHT_FILL = '[html[data-theme=light]_&]:[--glass-fill:var(--color-violet-deep)]';
function RowCard({ highlight, reveal = false, children }: { highlight: boolean; reveal?: boolean; children: ReactNode }) {
  if (highlight) {
    return (
      <div className={`relative isolate flex h-full flex-col justify-center rounded-card px-5 text-white ${reveal ? `glass glass-sheet border border-stroke-strong ${REVEAL_LIGHT_FILL}` : 'bg-highlight shadow-glow'}`}>
        {reveal ? <span aria-hidden="true" className={`rank-swap-in ${HIGHLIGHT_LAYER}`} /> : null}
        <span aria-hidden="true" className={reveal ? `rank-swap-in ${GLOSS}` : GLOSS} />
        {children}
      </div>
    );
  }
  return (
    <div className="glass glass-sheet relative flex h-full flex-col justify-center rounded-card border border-stroke px-5 shadow-glass">
      {children}
    </div>
  );
}

/** 제목 줄: 트로피 배지(빛 없음) + 제목 + 라운드 알약 + 오른쪽 알약 */
function ScoreTitle({ title, chip, right }: { title: ReactNode; chip?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-[72px] shrink-0 items-center gap-5 px-2">
      <IconBadge size="xl" glow={false}><IconTrophy /></IconBadge>
      <h1 className="font-display text-[52px] font-bold leading-none tracking-[-0.02em] text-text">{title}</h1>
      {chip}
      {right ? <div className="ml-auto flex items-center gap-3">{right}</div> : null}
    </div>
  );
}

/** 열 머리 캡션 (열마다 한 줄, 카드 안 여백과 맞춘다). 장식이라 aria-hidden: 카드 글자가 스스로 읽힌다 */
function RankHead({ layout, template, cells }: { layout: RankLayout; template: string; cells: { label: string; right?: boolean }[] }) {
  return (
    <div aria-hidden="true" className="grid shrink-0" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: layout.cols }, (_, c) => (
        <div key={c} className="grid h-9 items-center gap-5 px-7" style={{ gridTemplateColumns: template }}>
          {cells.map((h, i) => (
            <BoardCaption key={i} className={`block truncate ${h.right ? 'text-right' : ''}`}>{h.label}</BoardCaption>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 순위 칸 격자: 세로 먼저 채운다 (grid-auto-flow: column). 칸 = li(여백 포함) */
function RankList({ layout, label, children }: { layout: RankLayout; label: string; children: ReactNode }) {
  return (
    <ol
      aria-label={label}
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.perCol}, minmax(0, ${ROW_MAX}px))`,
        gridAutoFlow: 'column',
        alignContent: 'start',
      }}
    >
      {children}
    </ol>
  );
}

/** 표 영역: 1열이면 가운데 1480px, 2열이면 무대 폭 전체 */
function RankArea({ layout, children }: { layout: RankLayout; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-2 ${layout.cols === 1 ? 'mx-auto w-full max-w-[1480px]' : ''}`}>
      {children}
    </div>
  );
}

const ROUND_COLS = '160px minmax(0,1fr) 150px 150px';

export function RoundScoreboard({
  teams, standings, results, round, rounds = DEFAULT_ROUNDS,
}: { teams: TeamView[]; standings: StandingRow[]; results: ResultView[]; round: RoundNo; rounds?: readonly RoundNo[] }) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const res = new Map(results.map((r) => [r.teamId, r]));
  const rows = [...standings].sort((a, b) => a.rank - b.rank);
  const before = previousRanks(teams, standings, results, round, rounds);
  const col = rounds.indexOf(round);
  const hi = rankHighlightIds(rows);
  const layout = rankLayout(rows.length);
  const next = nextRoundOf([...rounds], round);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ScoreTitle
        title={<>R{round} 점수 <span className="text-text-dim">· 누적 순위</span></>}
        chip={<BoardChip tone="violet" mono>{roundCaption(rounds, round).label}</BoardChip>}
        right={next ? <BoardChip tone="neutral">다음 R{next}</BoardChip> : <BoardChip tone="ok" dot>마지막 라운드</BoardChip>}
      />
      <RankArea layout={layout}>
        <RankHead
          layout={layout}
          template={ROUND_COLS}
          cells={[{ label: '순위' }, { label: '팀 · 결과' }, { label: `R${round} 점수`, right: true }, { label: '누적', right: true }]}
        />
        <RankList layout={layout} label={`R${round} 점수와 누적 순위`}>
          {rows.map((s, i) => {
            const team = byId.get(s.teamId);
            if (!team) return null;
            const r = res.get(s.teamId);
            const roundPts = r ? r.score + r.bonus : col >= 0 ? (s.rounds[col] ?? null) : null;
            const first = hi.has(s.teamId);
            const prev = before?.get(s.teamId);
            // 2라운드부터: 지난 순위 칸에서 나타나 새 칸으로. 1라운드: 위에서부터 차례로 나타난다.
            const shift = prev ? rankShift(prev.index, i, layout) : { dx: 0, dy: 0 };
            const moved = shift.dx !== 0 || shift.dy !== 0;
            const swapRank = !!prev && prev.rank !== s.rank;
            const rankTone = (rank: number) => (first ? 'text-white' : rank <= 3 ? 'text-text' : 'text-text-dim');
            const ptsTone = first
              ? roundPts == null || roundPts === 0 ? ON_HIGHLIGHT.flat : roundPts < 0 ? ON_HIGHLIGHT.down : ON_HIGHLIGHT.up
              : roundPts == null ? 'text-text-faint' : roundPts < 0 ? 'text-danger' : roundPts === 0 ? 'text-text-dim' : 'text-ok';
            const style: CSSProperties = prev
              // 위로 올라가는 카드가 내려가는 카드 위로 지나간다
              ? ({ ['--dx' as string]: shift.dx, ['--dy' as string]: shift.dy, zIndex: prev.index > i ? 2 : 1 } as CSSProperties)
              : { animationDelay: `${i * 80}ms` };
            return (
              <li key={s.teamId} className={`relative min-h-0 px-2 py-1.5 ${prev ? MOVE_CLS : 'pop'}`} style={style}>
                <RowCard highlight={first} reveal={first && moved}>
                  <div className="grid items-center gap-5" style={{ gridTemplateColumns: ROUND_COLS }}>
                    <span className="flex items-center gap-2">
                      <span className="sr-only">{RANK_LABEL(s.rank)}</span>
                      {swapRank && prev ? (
                        <span className="relative w-[84px] text-[52px]" aria-hidden="true">
                          <span className={`rank-swap-out absolute inset-0 ${NUM} ${rankTone(prev.rank)}`}>{pad2(prev.rank)}</span>
                          <span className={`rank-swap-in block ${NUM} ${rankTone(s.rank)}`}>{pad2(s.rank)}</span>
                        </span>
                      ) : (
                        <span className={`w-[84px] text-[52px] ${NUM} ${rankTone(s.rank)}`} aria-hidden="true">{pad2(s.rank)}</span>
                      )}
                      {prev ? <RankDelta from={prev.rank} to={s.rank} onHighlight={first} /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <TeamMark team={team} size={34} ring={first} />
                      <span className={`truncate text-[22px] ${first ? 'text-white/85' : 'text-text-dim'}`}>{r ? r.message : '결과 없음'}</span>
                    </span>
                    <span className={`text-right text-[48px] ${NUM} ${ptsTone}`}>
                      <span className="sr-only">{`R${round} `}</span>{roundPts == null ? '–' : signed(roundPts)}
                    </span>
                    <span className={`text-right text-[60px] ${NUM} ${first ? 'text-white' : 'text-text'}`}>
                      <span className="sr-only">누적 </span>{s.total}
                    </span>
                  </div>
                </RowCard>
              </li>
            );
          })}
        </RankList>
      </RankArea>
    </div>
  );
}

/** 라운드별 점수 칸 (R1 … R7, 고른 라운드만): 캡션 위 · 점수 아래 */
function RoundCells({ rounds, values, onHighlight }: { rounds: readonly RoundNo[]; values: (number | null)[]; onHighlight: boolean }) {
  return (
    <span className="flex min-w-0 gap-1.5">
      {rounds.map((rn, i) => {
        const v = values[i] ?? null;
        const tone = v == null
          ? onHighlight ? 'text-white/85' : 'text-text-faint'
          : v < 0 ? (onHighlight ? 'text-danger-on-violet' : 'text-danger') : onHighlight ? 'text-white' : 'text-text';
        return (
          <span
            key={rn}
            className={`flex w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-ctl py-1.5 ${onHighlight ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]' : 'bg-glass-inset shadow-[inset_0_0_0_1px_var(--color-stroke)]'}`}
          >
            <span className={`text-[16px] font-semibold leading-none tracking-[0.04em] ${onHighlight ? 'text-white' : 'text-text-faint'}`}>R{rn}</span>
            <span className={`font-display text-[19px] font-bold leading-none tabular-nums ${tone}`}>{v == null ? '–' : v}</span>
          </span>
        );
      })}
    </span>
  );
}

const FINAL_COLS = '110px minmax(0,1fr) 190px';

export function FinalScoreboard({
  teams, standings, rounds = DEFAULT_ROUNDS,
}: { teams: TeamView[]; standings: StandingRow[]; rounds?: readonly RoundNo[] }) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rows = [...standings].sort((a, b) => a.rank - b.rank);
  const hi = rankHighlightIds(rows);
  const layout = rankLayout(rows.length);
  const winners = rows.filter((s) => s.rank === 1).map((s) => byId.get(s.teamId)?.name).filter(Boolean);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ScoreTitle
        title="최종 순위"
        chip={<BoardChip tone="violet">{rounds.length}라운드 합계</BoardChip>}
        right={winners.length > 0 && hi.size > 0 ? <BoardChip tone="ok" icon={<IconTrophy />}>우승 {winners.join(' · ')}</BoardChip> : null}
      />
      <RankArea layout={layout}>
        <RankHead
          layout={layout}
          template={FINAL_COLS}
          cells={[{ label: '순위' }, { label: '팀 · 라운드별 점수' }, { label: '합계', right: true }]}
        />
        <RankList layout={layout} label="최종 순위">
          {rows.map((s, i) => {
            const team = byId.get(s.teamId);
            if (!team) return null;
            const first = hi.has(s.teamId);
            return (
              <li key={s.teamId} className="pop relative min-h-0 px-2 py-1.5" style={{ animationDelay: `${i * 90}ms` }}>
                <RowCard highlight={first}>
                  <div className="grid items-center gap-5" style={{ gridTemplateColumns: FINAL_COLS }}>
                    <span className={`text-[52px] ${NUM} ${first ? 'text-white' : s.rank <= 3 ? 'text-text' : 'text-text-dim'}`}>
                      <span className="sr-only">{RANK_LABEL(s.rank)}</span>
                      <span aria-hidden="true">{pad2(s.rank)}</span>
                    </span>
                    <span className="flex min-w-0 flex-col gap-2">
                      <TeamMark team={team} size={32} ring={first} />
                      <RoundCells rounds={rounds} values={s.rounds} onHighlight={first} />
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      <span className={`flex items-baseline gap-1.5 text-[60px] ${NUM} ${first ? 'text-white' : 'text-text'}`}>
                        {s.total}
                        <span className={`font-sans text-[24px] font-semibold tracking-normal ${first ? 'text-white/85' : 'text-text-faint'}`}>점</span>
                      </span>
                      <span className={`text-[18px] ${first ? 'text-white/85' : 'text-text-faint'}`}>도착 {s.goals}회 · {s.ticks}틱</span>
                    </span>
                  </div>
                </RowCard>
              </li>
            );
          })}
        </RankList>
      </RankArea>
    </div>
  );
}
