'use client';
// 대기 명단 (진행자 홈 왼쪽 "대기실" · 콘솔 대기실 카드 공용, DESIGN_V4 §6):
// 들어온 순서 번호 + 둥근 이니셜 아바타 + 표시 이름·아이디 + 기다린 시간. 새로 들어온 줄은 한 번 떠오른다(움직임 줄이기면 없음).
// 대기 명단에는 표시 이름과 아이디만 온다 (FEATURE_V4 §3 권한).
import type { ReactNode } from 'react';
import type { LobbyUser } from '@/lib/contracts';
import { Avatar } from '@/components/ui/Avatar';
import { NumChip } from '@/components/ui/Chip';
import { waitLabel } from './logic';

export function LobbyRoster({
  waiting, nowMs, action, className = '', label = '대기 명단', emptyText,
}: {
  waiting: readonly LobbyUser[];
  /** 서버 보정 시각 (ms). null 이면 기다린 시간을 비운다 */
  nowMs: number | null;
  /** 줄 오른쪽 동작 (콘솔: "넣기") */
  action?: (u: LobbyUser) => ReactNode;
  className?: string;
  label?: string;
  emptyText?: ReactNode;
}) {
  if (waiting.length === 0) {
    return (
      <p className={`rounded-inset border border-dashed border-stroke-strong px-4 py-5 text-center text-[13px] leading-relaxed text-text-faint ${className}`}>
        {emptyText ?? '아직 기다리는 사람이 없습니다.'}
      </p>
    );
  }
  return (
    <ol aria-label={label} className={`flex flex-col gap-0.5 overflow-y-auto overscroll-contain ${className}`}>
      {waiting.map((u, i) => {
        const wait = waitLabel(u.since, nowMs);
        return (
          <li key={u.userId} className="rise flex min-h-11 items-center gap-2.5 rounded-ctl px-2 py-1 transition-colors duration-150 hover:bg-tint/[0.04]">
            <NumChip n={i + 1} />
            <Avatar name={u.displayName} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-text">{u.displayName}</span>
              <span className="block truncate font-mono text-[11px] leading-tight text-text-faint">@{u.username}</span>
            </span>
            {wait ? (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-faint">
                <span className="sr-only">기다린 시간 </span>
                {wait}
              </span>
            ) : null}
            {action ? action(u) : null}
          </li>
        );
      })}
    </ol>
  );
}
