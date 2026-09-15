'use client';
// 팀 편집기 머리 오른쪽 (AppShell 상단 바의 right 슬롯) — DESIGN_V4 §6 /play "머리에 RingProgress 타이머":
// 연결 상태 · 저장 중(폰) · RingProgress 코딩 타이머 + 남은 시간(mono, 30초 이하 danger, 멈춤 warn) · 블록 n/상한(초과 danger)
// 제목(맵 이름)과 맥락("R4 · 3/5 · 난이도 4" · 팀 · 게임 코드)은 PlayScreen 이 헤더에 넘긴다.
// 페이즈 알약 색은 모든 화면 공통(contracts PHASE_STATUS).
import { PHASE_LABEL, PHASE_STATUS, type GameView } from '@/lib/contracts';
import type { ConnectionStatus } from '@/lib/client/useGame';
import { formatClock, remainingSeconds, useNow } from '@/lib/client/time';
import { Chip, StatusPill } from '@/components/ui/Chip';
import { RingProgress } from '@/components/ui/RingProgress';
import { IconTimer } from '@/components/ui/icons';

export function PlayStatus({
  view, blocks, serverOffsetMs, status, saving,
}: { view: GameView; blocks: number; serverOffsetMs: number; status: ConnectionStatus; saving: boolean }) {
  const now = useNow(serverOffsetMs);
  const { game, map } = view;
  const coding = game.phase === 'coding';
  const sec = coding ? remainingSeconds(game.timerEndsAt, game.timerRemaining, now) : null;
  const paused = coding && !game.timerEndsAt && game.timerRemaining != null;
  const hurry = sec != null && sec <= 30 && !paused;
  const tone = hurry ? 'danger' : paused ? 'warn' : 'violet';
  const ink = hurry ? 'text-danger' : paused ? 'text-warn' : 'text-text';

  return (
    <>
      {status !== 'live' ? (
        <Chip size="sm" tone="warn" dot pulse role="status">
          {status === 'connecting' ? '연결 중' : '다시 연결 중'}
        </Chip>
      ) : saving ? (
        <span className="ui-caption lg:hidden" role="status">저장 중</span>
      ) : null}
      {coding ? (
        <span
          role="timer"
          className="inline-flex items-center gap-2"
          aria-label={paused ? `타이머 일시정지, ${formatClock(sec)} 남음` : `남은 코딩 시간 ${formatClock(sec)}`}
        >
          <RingProgress
            size={32}
            thickness={3}
            value={sec ?? 0}
            max={Math.max(map.seconds, sec ?? 0)}
            tone={tone}
            dot={false}
            decorative
          >
            <IconTimer size={13} className={hurry ? 'text-danger' : paused ? 'text-warn' : 'text-violet-ink'} />
          </RingProgress>
          <span aria-hidden="true" className={`font-mono text-[15px] font-semibold tabular-nums lg:text-base ${ink}`}>
            {formatClock(sec)}
          </span>
          {paused ? <span aria-hidden="true" className="text-[11px] font-semibold text-warn">멈춤</span> : null}
        </span>
      ) : (
        <StatusPill size="sm" status={PHASE_STATUS[game.phase]}>{PHASE_LABEL[game.phase]}</StatusPill>
      )}
      <BlockCounter blocks={blocks} cap={map.cap} />
    </>
  );
}

/** 블록 n/상한 알약: 옅은 진행 막대 + 고정폭 숫자. 상한을 넘으면 danger */
export function BlockCounter({ blocks, cap }: { blocks: number; cap: number }) {
  const over = blocks > cap;
  const pct = cap > 0 ? Math.min(100, (blocks / cap) * 100) : 0;
  return (
    <span
      className={
        'inline-flex h-8 items-center gap-2 rounded-full border px-3 font-mono text-[13px] font-semibold tabular-nums ' +
        (over ? 'border-danger/40 bg-danger/12 text-danger' : 'border-stroke-strong bg-tint/[0.05] text-text')
      }
      aria-label={`블록 ${blocks}개, 상한 ${cap}개${over ? ', 상한 초과' : ''}`}
    >
      <span aria-hidden="true" className="relative hidden h-1 w-10 overflow-hidden rounded-full bg-tint/10 sm:block">
        <span
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ${over ? 'bg-danger' : 'bg-violet-ink'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span aria-hidden="true">
        {blocks}/{cap}
      </span>
    </span>
  );
}
