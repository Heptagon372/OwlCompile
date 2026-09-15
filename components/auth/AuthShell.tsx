// 로그인·가입·처음 설정 화면 (DESIGN_V4 §6): 셸 없이 가운데 유리 카드.
// 위쪽 은은한 보라 아치 조명 + 로고·워드마크 + 한 줄 소개(강조 구 violet-ink), 그 아래 유리 카드
// (20px, stroke-strong, 왼쪽 위 보라 아이콘 배지 + 제목). 입력은 12px 유리 입력, 버튼은 알약 (components/ui).
// 빛: 강한 빛은 카드 안의 주 버튼 하나. 배지는 빛 없이 그라데이션만. 훅 없음 — 서버 페이지에서 그대로 쓴다.
import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@/components/ui/Brand';
import { GlowArc } from '@/components/ui/GlowArc';
import { IconBadge } from '@/components/ui/IconBadge';
import { Panel } from '@/components/ui/Panel';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** 옛 이름 호환: 폼들은 '@/components/ui/Field' 에서 직접 가져온다. */
export { FormError, INPUT_CLASS, TextField } from '@/components/ui/Field';

/** 기본 한 줄 소개: 뒤 강조 구만 violet-ink */
const DEFAULT_INTRO = (
  <>
    S.OWL 오리엔테이션 <span className="text-violet-ink">팀 코딩 게임</span>
  </>
);

export function AuthShell({
  title, subtitle, children, footer, intro = DEFAULT_INTRO, icon,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 워드마크 아래 한 줄 소개 (강조 구는 text-violet-ink 로 감싼다) */
  intro?: ReactNode;
  /** 카드 왼쪽 위 아이콘 배지 (icons.tsx) */
  icon?: ReactNode;
}) {
  return (
    <main className="relative isolate flex min-h-dvh w-full flex-col items-center overflow-hidden px-4 pb-10 pt-20 sm:pt-24 md:pt-28">
      <GlowArc intensity="soft" />
      {/* 해·달 모드 토글: 오른쪽 위 (THEME_V5 §1) */}
      <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[440px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <p className="flex items-center gap-2.5">
            {/* 빛 색 = --glow-badge (나이트 rgba(124,77,255,.5) 그대로, 라이트는 옅은 보라 그림자) */}
            <BrandMark size={48} className="drop-shadow-[0_0_12px_var(--glow-badge)]" />
            <Wordmark className="text-[28px] md:text-[32px]" />
          </p>
          <p className="mt-3 text-[15px] font-medium leading-snug text-text-dim">{intro}</p>
        </div>
        <Panel tone="strong" bodyClassName="p-6 sm:p-8">
          <div className="flex items-start gap-3.5">
            {icon ? <IconBadge size="lg" glow={false}>{icon}</IconBadge> : null}
            <div className="min-w-0 pt-0.5">
              <h1 className="font-display text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-text">{title}</h1>
              {subtitle ? <div className="mt-1.5 text-[13px] leading-relaxed text-text-dim">{subtitle}</div> : null}
            </div>
          </div>
          <div className="mt-6">{children}</div>
        </Panel>
        {footer ? <div className="mt-5 px-1 text-center text-[13px] leading-relaxed text-text-dim">{footer}</div> : null}
      </div>
    </main>
  );
}

/** 카드 아래 발문 속 링크 (검정 위 링크형 라벨 = violet-ink, 폰 44px 터치 목표) */
export const AUTH_LINK_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 align-middle font-semibold text-violet-ink underline-offset-4 ' +
  'hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink';
