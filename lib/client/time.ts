'use client';
// 타이머 표시용: 서버 시각 보정된 "지금"과 남은 초 계산.
import { useEffect, useState } from 'react';

/** 마운트 전에는 null (서버 렌더와 어긋나지 않게), 이후 intervalMs마다 보정된 현재 시각(ms) */
export function useNow(offsetMs = 0, intervalMs = 250): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    const t = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(t);
  }, [offsetMs, intervalMs]);
  return now;
}

/** 남은 초. 진행 중이면 timerEndsAt 기준, 일시정지면 timerRemaining, 타이머 없으면 null */
export function remainingSeconds(
  timerEndsAt: string | null,
  timerRemaining: number | null,
  nowMs: number | null,
): number | null {
  if (timerEndsAt) {
    if (nowMs == null) return null;
    return Math.max(0, Math.ceil((Date.parse(timerEndsAt) - nowMs) / 1000));
  }
  return timerRemaining ?? null;
}

/** 초 → "mm:ss" (null이면 "--:--") */
export function formatClock(sec: number | null): string {
  if (sec == null) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
