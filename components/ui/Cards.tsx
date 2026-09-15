// 카드 (DESIGN_V3 §1·§2): 훅 없음, 서버·클라이언트 어디서나.
//  - ArrowCircle   : 카드 오른쪽 위 "원 안의 화살표" (카드가 링크일 때)
//  - FeatureCard   : 평평한 검정 카드 (panel + 1px line + 12px), 왼쪽 위 violet-ink 선 아이콘, 흰 굵은 제목, 회색 설명
//  - HighlightCard : bg-highlight 로 가득 채운 강조 카드 (흰 글자 + shadow-glow). 한 화면에 한 곳만
//  - NumberCard    : bg-band 위 투명 카드 (line-on-violet 테두리, 큰 Manrope 숫자 "01", 제목, 부제)
// href 를 주면 next/link (external 이면 새 탭 <a>), 아니면 div. 링크 카드는 hover 시 살짝 뜬다.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IconArrowUpRight } from './icons';

/* ---------- ArrowCircle ---------- */

export function ArrowCircle({ tone = 'default', size = 'md', className = '' }: {
  /** default: 검정 카드 위 / onViolet: 보라 면 위 */
  tone?: 'default' | 'onViolet';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'sm' ? 'size-7 [&_svg]:size-3.5' : size === 'lg' ? 'size-12 [&_svg]:size-6' : 'size-9 [&_svg]:size-[18px]';
  const t = tone === 'onViolet'
    ? 'border-line-on-violet text-white group-hover:bg-white group-hover:text-violet-deep'
    : 'border-line-strong text-text-dim group-hover:border-violet-ink group-hover:text-violet-ink';
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full border transition-colors duration-150 ${box} ${t} ${className}`}>
      <IconArrowUpRight />
    </span>
  );
}

/* ---------- 공통 틀 ---------- */

export interface CardProps {
  /** 링크 카드 (없으면 div) */
  href?: string;
  /** href 가 바깥 주소면 새 탭 */
  external?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** 왼쪽 위 선 아이콘 (icons.tsx) */
  icon?: ReactNode;
  /** 제목 위 작은 분류 라벨 */
  eyebrow?: ReactNode;
  /** 오른쪽 위 화살표 원 (기본: href 가 있으면 보임) */
  arrow?: boolean;
  /** 제목 요소 (기본 h3) */
  titleAs?: 'h2' | 'h3' | 'p';
  className?: string;
  /** 설명 아래 내용 (폼·버튼 등) */
  children?: ReactNode;
  id?: string;
  'aria-label'?: string;
}

const LINK_FX_BASE =
  'group transition-[transform,box-shadow,border-color,background-color] duration-150 motion-safe:hover:-translate-y-0.5 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';
/** 포커스 링: 검정 위 violet-ink, 보라 면(bg-highlight·bg-band) 카드는 tint (나이트 = 흰색 그대로, 라이트 = 짙은 남보라).
 *  링은 outline-offset 2px 로 카드 바깥 바탕 위에 그려지므로 라이트의 밝은 바탕에서 흰 링은 보이지 않는다 (violet-ink 는 보라 위 3:1 아래) */
const LINK_FX = `${LINK_FX_BASE} focus-visible:outline-violet-ink`;
const LINK_FX_ON_VIOLET = `${LINK_FX_BASE} focus-visible:outline-tint`;

function CardFrame({ href, external, onViolet = false, className, id, ariaLabel, children }: {
  href?: string; external?: boolean; onViolet?: boolean; className: string; id?: string; ariaLabel?: string; children: ReactNode;
}) {
  const fx = onViolet ? LINK_FX_ON_VIOLET : LINK_FX;
  if (href && external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" id={id} aria-label={ariaLabel} className={`${fx} ${className}`}>{children}</a>;
  }
  if (href) {
    return <Link href={href} id={id} aria-label={ariaLabel} className={`${fx} ${className}`}>{children}</Link>;
  }
  return <div id={id} aria-label={ariaLabel} className={`group ${className}`}>{children}</div>;
}

function CardBody({ tone, title, description, icon, eyebrow, showArrow, titleAs: T = 'h3', children }: {
  tone: 'plain' | 'highlight' | 'number'; title?: ReactNode; description?: ReactNode; icon?: ReactNode; eyebrow?: ReactNode;
  showArrow: boolean; titleAs?: 'h2' | 'h3' | 'p'; children?: ReactNode;
}) {
  const onViolet = tone !== 'plain';
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {icon || showArrow ? (
        // 아이콘 줄 높이를 화살표 원(36px)에 맞춰 고정: 화살표가 있는 카드와 없는 카드의 제목이 같은 높이에서 시작한다
        <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
          {icon ? (
            <span className={`flex shrink-0 [&_svg]:size-6 ${onViolet ? 'text-white' : 'text-violet-ink'}`}>{icon}</span>
          ) : <span />}
          {showArrow ? <ArrowCircle tone={onViolet ? 'onViolet' : 'default'} /> : null}
        </div>
      ) : null}
      {eyebrow ? (
        <p className={`mb-1.5 text-xs font-semibold ${onViolet ? 'text-violet-mist' : 'text-violet-ink'}`}>{eyebrow}</p>
      ) : null}
      {title ? (
        <T className={`text-base font-bold leading-snug tracking-[-0.01em] ${onViolet ? 'text-white' : 'text-text'}`}>{title}</T>
      ) : null}
      {description ? (
        <p className={`mt-1.5 text-[13px] leading-relaxed ${onViolet ? 'text-white/80' : 'text-text-dim'}`}>{description}</p>
      ) : null}
      {children ? <div className={title || description ? 'mt-4 flex flex-1 flex-col' : 'flex flex-1 flex-col'}>{children}</div> : null}
    </div>
  );
}

/* ---------- FeatureCard ---------- */

/** 평평한 검정 카드 (panel + 1px line, 12px). 링크면 hover 테두리 line-strong + 화살표 violet-ink */
export function FeatureCard({ href, external, title, description, icon, eyebrow, arrow, titleAs, className = '', children, id, 'aria-label': ariaLabel }: CardProps) {
  return (
    <CardFrame
      href={href}
      external={external}
      id={id}
      ariaLabel={ariaLabel}
      className={`glass relative flex flex-col rounded-card border border-stroke p-5 shadow-glass ${href ? 'hover:border-stroke-strong hover:[--glass-fill:var(--color-glass-2)]' : ''} ${className}`}
    >
      <CardBody tone="plain" title={title} description={description} icon={icon} eyebrow={eyebrow} showArrow={arrow ?? !!href} titleAs={titleAs}>
        {children}
      </CardBody>
    </CardFrame>
  );
}

/* ---------- HighlightCard ---------- */

/** bg-highlight 강조 카드: 흰 글자, shadow-glow, 왼쪽 위 옅은 광택. 안의 버튼은 variant="inverse", 입력은 onViolet */
export function HighlightCard({ href, external, title, description, icon, eyebrow, arrow, titleAs, className = '', children, id, 'aria-label': ariaLabel }: CardProps) {
  return (
    <CardFrame
      href={href}
      external={external}
      onViolet
      id={id}
      ariaLabel={ariaLabel}
      className={
        'relative isolate flex flex-col overflow-hidden rounded-card bg-highlight p-5 text-white shadow-glow ' +
        'before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_srgb,var(--color-white)_16%,transparent),transparent_55%)] ' +
        `${href ? 'hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-violet-hover)_70%,transparent),0_12px_40px_color-mix(in_srgb,var(--color-violet)_50%,transparent)]' : ''} ${className}`
      }
    >
      <CardBody tone="highlight" title={title} description={description} icon={icon} eyebrow={eyebrow} showArrow={arrow ?? !!href} titleAs={titleAs}>
        {children}
      </CardBody>
    </CardFrame>
  );
}

/* ---------- NumberCard ---------- */

export interface NumberCardProps {
  /** 번호. 수면 두 자리("01")로 */
  n: number | string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** onViolet(기본): bg-band 위 투명 + line-on-violet / dark: 검정 위 투명 + line-strong */
  tone?: 'onViolet' | 'dark';
  href?: string;
  /** 오른쪽 위 화살표 원 (기본: href 가 있으면) */
  arrow?: boolean;
  titleAs?: 'h2' | 'h3' | 'p';
  className?: string;
  children?: ReactNode;
}

/** 큰 Manrope 숫자 카드 (홈 라운드 01~05 등) */
export function NumberCard({ n, title, subtitle, tone = 'onViolet', href, arrow, titleAs: T = 'h3', className = '', children }: NumberCardProps) {
  const nn = typeof n === 'number' ? String(n).padStart(2, '0') : n;
  const onViolet = tone === 'onViolet';
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`font-display text-[40px] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${onViolet ? 'text-white' : 'text-text'}`}>{nn}</span>
        {arrow ?? !!href ? <ArrowCircle tone={onViolet ? 'onViolet' : 'default'} /> : null}
      </div>
      <T className={`mt-6 text-base font-bold leading-snug tracking-[-0.01em] ${onViolet ? 'text-white' : 'text-text'}`}>{title}</T>
      {subtitle ? <p className={`mt-1 text-[13px] leading-relaxed ${onViolet ? 'text-white/75' : 'text-text-dim'}`}>{subtitle}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  );
  const cls =
    `relative flex flex-col rounded-card border bg-transparent p-5 ` +
    (onViolet ? 'border-line-on-violet hover:bg-white/[0.04] ' : 'border-line-strong hover:bg-tint/[0.02] ') +
    className;
  return href ? (
    <Link href={href} className={`${onViolet ? LINK_FX_ON_VIOLET : LINK_FX} ${cls}`}>{body}</Link>
  ) : (
    <div className={`group ${cls}`}>{body}</div>
  );
}
