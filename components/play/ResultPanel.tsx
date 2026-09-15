'use client';
// running·scored: 자기 팀 결과(메시지·점수 줄). 보드가 우리 팀을 재생하기 전에는 순서만 알려 준다.
// DESIGN_V4 §3: 유리 카드(20px) + stroke, 점수 숫자는 Manrope(font-display), 틱·블록 통계는 mono.
// 폰(lg 미만): 한 줄 요약(결과 · 틱 · 점수 + 펼치기). 블록 편집기(패치) 자리를 먹지 않게. 데스크톱은 전체 카드.
import { useId, useState, type ReactNode } from 'react';
import type { GameView, Outcome } from '@/lib/contracts';
import { BigNum } from '@/components/ui/Text';
import { IconAlert, IconChevronDown, IconFlag, IconTarget, IconTimer } from '@/components/ui/icons';
import { resultRevealed } from './reveal';

const OUTCOME: Record<Outcome, { label: string; text: string; box: string; icon: ReactNode }> = {
  goal: { label: '둥지 도착', text: 'text-cyan', box: 'bg-cyan/12 text-cyan', icon: <IconTarget size={18} /> },
  stuck: { label: '도착하지 못했어요', text: 'text-warn', box: 'bg-warn/12 text-warn', icon: <IconFlag size={18} /> },
  error: { label: '에러로 멈췄어요', text: 'text-danger', box: 'bg-danger/12 text-danger', icon: <IconAlert size={18} /> },
  dead: { label: '부엉이가 쓰러졌어요', text: 'text-danger', box: 'bg-danger/12 text-danger', icon: <IconAlert size={18} /> },
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function ResultPanel({ view }: { view: GameView }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const teamId = view.me.teamId;
  const mine = view.results.find((r) => r.teamId === teamId) ?? null;
  const phase = view.game.phase;
  if (phase !== 'running' && phase !== 'scored' && phase !== 'finished') return null;
  if (!mine) {
    return (
      <Box>
        <p className="text-[13px] text-text-dim">
          {phase === 'running' ? '진행자가 실행 결과를 준비하고 있어요.' : '이번 라운드 결과가 없어요.'}
        </p>
      </Box>
    );
  }
  if (phase === 'running' && !resultRevealed(view, mine)) {
    const ahead = view.results.filter((r) => r.runOrder < mine.runOrder).length;
    return (
      <Box>
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <IconTimer size={16} className="shrink-0 text-violet-ink" />
          <span>
            프로젝터를 보세요. 우리 팀은 <span className="font-display tabular-nums">{mine.runOrder}</span>번째로 실행돼요.
          </span>
        </p>
        <p className="mt-0.5 pl-6 text-xs text-text-dim">{ahead > 0 ? `앞에 ${ahead}팀이 있어요.` : '곧 우리 차례예요.'}</p>
      </Box>
    );
  }
  const o = OUTCOME[mine.outcome];
  const hasLines = mine.scoreLines.length > 0 || mine.bonus !== 0;
  // 폰에서 접혀 있으면 lg 미만에서만 숨긴다 (데스크톱은 늘 전체)
  const phoneHidden = open ? '' : 'max-lg:hidden';
  return (
    <Box>
      <div className="flex items-center gap-3 lg:items-start">
        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${o.box}`}>{o.icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-semibold lg:whitespace-normal ${o.text}`}>{o.label}</p>
          <p className={`mt-0.5 text-[13px] leading-snug text-text ${phoneHidden}`}>{mine.message}</p>
          {/* 폰 요약 줄 (접혔을 때만) */}
          <p className={`font-mono text-xs text-text-dim lg:hidden ${open ? 'hidden' : ''}`}>
            {mine.ticks}틱 · 블록 {mine.blocks}개{mine.usedPatch ? ' · 패치' : ''}
          </p>
        </div>
        <p className="shrink-0 text-right">
          <BigNum>{mine.score + mine.bonus}</BigNum>
          <span className="ml-1 text-xs font-semibold text-text-dim">점</span>
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-text-dim transition-colors duration-150 hover:bg-tint/[0.05] hover:text-text focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink lg:hidden"
        >
          <IconChevronDown size={18} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
          <span className="sr-only">{open ? '결과 접기' : '결과 자세히 보기'}</span>
        </button>
      </div>
      <div id={bodyId} className={phoneHidden}>
        <p className="mt-2 font-mono text-xs text-text-dim">
          {mine.ticks}틱 · 블록 {mine.blocks}개 · 쥐 {mine.mice}마리{mine.usedPatch ? ' · 패치 사용' : ''}
        </p>
        {hasLines ? (
          <ul className="surface-inset mt-2 divide-y divide-stroke overflow-hidden rounded-ctl text-[13px]">
            {mine.scoreLines.map((l, i) => (
              <li key={`${l.label}-${i}`} className="flex h-8 items-center justify-between gap-3 px-2.5">
                <span className="truncate text-text-dim">{l.label}</span>
                <span className="font-display font-bold tabular-nums text-text">{signed(l.points)}</span>
              </li>
            ))}
            {mine.bonus !== 0 ? (
              <li className="flex h-8 items-center justify-between gap-3 px-2.5">
                <span className="truncate text-text-dim">보너스{mine.bonusNote ? ` (${mine.bonusNote})` : ''}</span>
                <span className="font-display font-bold tabular-nums text-text">{signed(mine.bonus)}</span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </Box>
  );
}

function Box({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="우리 팀 결과"
      className="glass relative mx-3 mt-2 max-h-[40dvh] shrink-0 overflow-y-auto rounded-card border border-stroke px-3 py-2 shadow-glass lg:mx-0 lg:mt-0 lg:p-4"
    >
      {children}
    </section>
  );
}
