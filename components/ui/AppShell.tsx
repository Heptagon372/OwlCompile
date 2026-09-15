// 앱 셸 (DESIGN_V4 §3): 떠 있는 유리 사이드바 + 유리 상단 바. 훅 없음: 서버 페이지에서 그대로 쓰고, 클라이언트 컴포넌트에서 감싸도 된다.
//   <AppShell user={user} title="진행자" context="R3 · 나선 · 게임 2176" right={<Chip …/>}>…</AppShell>
// 데스크톱 xl(≥1280px): 232px 사이드바(아이콘 + 라벨, 활성 = 보라 그라데이션 알약 + 빛, 아래 사용자 카드).
//        lg(1024~1279px): 72px 아이콘 사이드바 (편집기처럼 넓은 화면이 좁아지지 않게).
// 폰: 상단 바 + 메뉴 시트. 보드(/board)는 셸 없이 전체 화면 — AppShell 을 쓰지 않으면 된다.
// 셸 루트는 --shell-rail(본문 왼쪽 여백 = 사이드바 자리: 폰 0, lg 88px, xl 256px)을 내보낸다 (bleed-x·고정 하단 바가 쓴다).
// 바탕은 투명: layout 의 .owl-stage(보라 조명 무대)가 비친다.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ACCOUNT_ROLE_LABEL, type AccountRole } from '@/lib/contracts';
import { OwlLogo } from '@/components/map/OwlSprite';
import { Avatar } from './Avatar';
import { ThemeToggle } from './ThemeToggle';
import { Wordmark } from './Brand';
import { IconLogout } from './icons';
import { MobileNav, RailNav, type NavItem } from './ShellNav';

export type { NavItem } from './ShellNav';

/** 셸이 필요한 최소 사용자 정보 (PublicUser / SessionUser 둘 다 맞는다) */
export interface ShellUser {
  displayName: string;
  role: AccountRole;
}

/** 역할별 기본 메뉴: 홈, 대기실, 참가, 진행(host·admin), 관리(admin), 계정 */
export function navFor(user?: Pick<ShellUser, 'role'> | null): NavItem[] {
  const role = user?.role;
  const items: NavItem[] = [
    { href: '/', label: '홈', icon: 'home' },
    { href: '/lobby', label: '대기실', icon: 'lobby' },
    { href: '/join', label: '참가', icon: 'join' },
  ];
  if (role === 'host' || role === 'admin') items.push({ href: '/host', label: '진행', icon: 'host' });
  if (role === 'admin') items.push({ href: '/admin', label: '관리', icon: 'admin' });
  items.push({ href: '/account', label: '계정', icon: 'account' });
  return items;
}

export interface AppShellProps {
  user?: ShellUser | null;
  /** 메뉴 항목. 기본 navFor(user) */
  nav?: NavItem[];
  /** 상단 바 페이지 제목 */
  title?: ReactNode;
  /** 제목 옆 맥락 (예: "R3 · 나선 · 게임 2176") */
  context?: ReactNode;
  /** 상단 바 오른쪽 (연결 점·타이머·주 동작 버튼 하나 등). 아바타·표시 이름은 자동으로 붙는다 */
  right?: ReactNode;
  /** 상단 바에 아바타·표시 이름을 숨긴다 */
  hideName?: boolean;
  /** 본문을 가운데 폭 제한 없이 꽉 채운다 (IDE형 화면). 기본은 max-w-6xl 가운데 정렬 */
  fluid?: boolean;
  /** 본문 여백 없음 (직접 배치할 때) */
  noPadding?: boolean;
  /** 본문(main) 추가 클래스 */
  contentClassName?: string;
  /** 상단 바를 폰에서 최소화 (/play): 메뉴 숨기고 로고·제목만 */
  compactHeader?: boolean;
  /** 상단 바를 아예 그리지 않는다 (페이지가 자체 머리를 가질 때) */
  noHeader?: boolean;
  /** 상단 바 오른쪽 해·달 모드 토글 (THEME_V5 §1, 기본 true). compactHeader 면 폰(<640px)에서 작은 토글(58px, 터치 44px)로 */
  themeToggle?: boolean;
  children: ReactNode;
}

export function AppShell({
  user, nav, title, context, right, hideName = false, fluid = false, noPadding = false,
  contentClassName = '', compactHeader = false, noHeader = false, themeToggle = true, children,
}: AppShellProps) {
  const items = nav ?? navFor(user);
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip [--shell-rail:0px] lg:pl-[var(--shell-rail)] lg:[--shell-rail:88px] xl:[--shell-rail:256px]">
      <ShellRail items={items} user={user} />
      {noHeader ? null : (
        <ShellHeader user={user} items={items} title={title} context={context} right={right} hideName={hideName} compact={compactHeader} themeToggle={themeToggle} />
      )}
      <main
        className={
          `flex min-h-0 w-full flex-1 flex-col ` +
          (noPadding ? '' : 'p-3 lg:p-5 ') +
          (fluid ? '' : 'mx-auto max-w-6xl ') +
          contentClassName
        }
      >
        {children}
      </main>
    </div>
  );
}

/** 데스크톱 떠 있는 유리 사이드바 (lg 72px 아이콘 / xl 232px 라벨). lg 미만에서는 숨김 */
export function ShellRail({ items, user }: { items: NavItem[]; user?: ShellUser | null }) {
  return (
    <aside className="glass fixed bottom-3 left-3 top-3 z-40 hidden w-[72px] flex-col overflow-hidden rounded-card border border-stroke shadow-glass lg:flex xl:w-[232px]">
      <Link
        href="/"
        aria-label="OWL COMPILE 홈"
        className="flex h-16 shrink-0 items-center justify-center gap-2.5 rounded-t-card text-text transition-colors duration-150 hover:bg-tint/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink xl:justify-start xl:px-5"
      >
        <OwlLogo size={30} className="drop-shadow-[0_0_10px_var(--glow-accent)]" />
        <Wordmark className="hidden text-[16px] xl:inline" />
      </Link>
      <div className="flex-1 overflow-y-auto px-2 py-2 xl:px-3">
        <RailNav items={items} />
      </div>
      {user ? (
        <div className="shrink-0 border-t border-stroke p-2 xl:p-3">
          <div className="flex flex-col items-center gap-2 xl:flex-row xl:gap-2.5 xl:rounded-inset xl:bg-tint/[0.03] xl:py-2 xl:pl-2.5 xl:pr-1">
            <Avatar name={user.displayName} size="sm" title={user.displayName} />
            <span className="hidden min-w-0 flex-1 xl:block">
              <span className="block truncate text-[13px] font-semibold text-text">{user.displayName}</span>
              <span className="block truncate text-[11px] text-text-faint">{ACCOUNT_ROLE_LABEL[user.role]}</span>
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                aria-label="로그아웃"
                title="로그아웃"
                className="grid size-10 place-items-center rounded-full text-text-faint transition-colors duration-150 hover:bg-tint/[0.06] hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-ink"
              >
                <IconLogout size={19} />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

/** 상단 유리 바 56px: (폰: 메뉴 버튼) 로고·워드마크 | 제목 + 맥락 … 오른쪽 슬롯 + 아바타·표시 이름 */
export function ShellHeader({
  user, items, title, context, right, hideName = false, compact = false, themeToggle = true, className = '',
}: {
  user?: ShellUser | null; items?: NavItem[]; title?: ReactNode; context?: ReactNode; right?: ReactNode;
  hideName?: boolean; compact?: boolean;
  /** 해·달 모드 토글 (기본 true): 오른쪽 슬롯 뒤, 표시 이름 앞 */
  themeToggle?: boolean;
  className?: string;
}) {
  const nav = items ?? navFor(user);
  const wordVis = compact ? 'hidden' : 'hidden sm:inline lg:hidden';
  const dividerVis = compact ? 'hidden' : 'hidden sm:block lg:hidden';
  return (
    <header
      className={
        `glass sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-stroke px-3 [--glass-fill:var(--header-fill)] lg:gap-3 lg:px-5 ${className}`
      }
    >
      {compact ? null : (
        <MobileNav items={nav} displayName={user?.displayName} roleLabel={user ? ACCOUNT_ROLE_LABEL[user.role] : null} showLogout={!!user} />
      )}
      {/* 폰·태블릿: 로고(홈으로). 데스크톱은 사이드바 맨 위에 로고가 있다 */}
      <Link
        href="/"
        aria-label="홈으로"
        className={
          'flex shrink-0 items-center gap-2 rounded-full text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink lg:hidden ' +
          (compact
            ? 'relative -ml-1 size-9 justify-center after:absolute after:-inset-1 hover:bg-tint/[0.05]'
            : 'min-h-11 min-w-11 justify-center sm:min-w-0 sm:justify-start')
        }
      >
        <OwlLogo size={24} />
        <Wordmark className={`text-[15px] ${wordVis}`} />
      </Link>
      {title ? <span aria-hidden="true" className={`h-5 w-px shrink-0 bg-stroke-strong ${dividerVis}`} /> : null}
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        {title ? (
          <h1 className="truncate text-lg font-bold leading-[1.2] tracking-[-0.02em] text-text lg:text-[20px]">{title}</h1>
        ) : (
          <h1 className="sr-only">OWL COMPILE</h1>
        )}
        {context ? <span className="hidden truncate text-[13px] text-text-dim sm:inline">{context}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 lg:gap-3">
        {right}
        {/* 모든 셸 화면(폰의 /play 포함)에 토글이 있다 (THEME_V5 §1·§5-1). 좁은 머리 줄은 작은 토글 */}
        {themeToggle ? <ThemeToggle size={compact ? 'compact' : 'md'} /> : null}
        {user && !hideName ? (
          <span className="hidden items-center gap-2 sm:flex">
            <span className="max-w-[10rem] truncate text-[13px] text-text-dim">{user.displayName}</span>
            <Avatar name={user.displayName} size="sm" />
          </span>
        ) : null}
      </div>
    </header>
  );
}
