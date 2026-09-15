'use client';
// 앱 셸의 내비 (클라이언트: 현재 경로로 활성 표시, 폰 메뉴 시트 열고 닫기).
// 아이콘은 이름(IconName)으로 받는다 — 서버 컴포넌트에서 함수 대신 문자열을 넘기기 위해.
// DESIGN_V4 §3: 활성 = 보라 그라데이션 알약 + 빛 (흰 글자·아이콘).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from './Avatar';
import { IconButton } from './Button';
import { Icon, IconLogout, IconMenu, type IconName } from './icons';
import { Sheet } from './Sheet';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** 정확히 같은 경로만 활성 (기본: 홈은 정확히, 나머지는 접두 일치) */
  exact?: boolean;
}

export function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.exact || item.href === '/') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

// 활성 메뉴 = violet-grad 알약 + 은은한 빛. 강한 빛(shadow-glow)은 쓰지 않는다: 셸의 모든 화면에 늘 있어서
// "한 화면에 강한 빛 2개(주 버튼 + 한 가지)" 예산을 혼자 먹는다 (DESIGN_V4 §3)
const ACTIVE = 'bg-violet-grad text-white shadow-[var(--shadow-nav-active)]';
const IDLE = 'text-text-dim hover:bg-tint/[0.06] hover:text-text';

/** 사이드바 항목들: lg = 56px 둥근 타일(아이콘 + 10.5px 라벨), xl = 44px 알약(아이콘 + 14px 라벨) */
export function RailNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴" className="flex flex-col gap-1">
      {items.map((it) => {
        const active = isActive(pathname, it);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? 'page' : undefined}
            title={it.label}
            className={
              'relative flex h-14 flex-col items-center justify-center gap-1 rounded-inset text-[10.5px] font-semibold tracking-[0.01em] ' +
              'transition-[background-color,color,box-shadow] duration-150 ' +
              'xl:h-11 xl:flex-row xl:justify-start xl:gap-3 xl:rounded-full xl:px-4 xl:text-[14px] xl:tracking-normal ' +
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-ink ' +
              (active ? ACTIVE : IDLE)
            }
          >
            <Icon name={it.icon} size={20} className={active ? 'text-white' : undefined} />
            <span className="max-w-full truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** 폰 상단 바의 메뉴 버튼 + 같은 메뉴가 담긴 시트 */
export function MobileNav({ items, displayName, roleLabel, showLogout }: {
  items: NavItem[]; displayName?: string | null; roleLabel?: string | null; showLogout: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <IconButton aria-label="메뉴 열기" size="md" onClick={() => setOpen(true)} className="-ml-2 lg:hidden" aria-expanded={open}>
        <IconMenu />
      </IconButton>
      <Sheet open={open} onClose={() => setOpen(false)} title="메뉴" size="sm">
        {displayName ? (
          <div className="mb-3 flex items-center gap-3 rounded-inset border border-stroke bg-tint/[0.03] px-3 py-2.5">
            <Avatar name={displayName} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-text">{displayName}</span>
              {roleLabel ? <span className="block text-xs text-text-faint">{roleLabel}</span> : null}
            </span>
          </div>
        ) : null}
        <nav aria-label="주 메뉴" className="flex flex-col gap-1">
          {items.map((it) => {
            const active = isActive(pathname, it);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={
                  'relative flex h-12 items-center gap-3 rounded-full px-4 text-[15px] font-semibold transition-[background-color,color,box-shadow] duration-150 ' +
                  (active ? ACTIVE : IDLE)
                }
              >
                <Icon name={it.icon} size={20} className={active ? 'text-white' : undefined} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        {showLogout ? (
          <form action="/api/auth/logout" method="post" className="mt-3 border-t border-stroke pt-3">
            <button
              type="submit"
              className="flex h-12 w-full items-center gap-3 rounded-full px-4 text-[15px] font-semibold text-text-dim transition-colors hover:bg-tint/[0.06] hover:text-text"
            >
              <IconLogout size={20} />
              로그아웃
            </button>
          </form>
        ) : null}
      </Sheet>
    </>
  );
}
