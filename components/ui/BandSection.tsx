// 보라 띠 섹션 (DESIGN_V3 §1 "보라 띠", §4 홈 라운드 카드): 화면 폭 전체 bg-band + 가운데 흰 제목·부제 + 아래 내용.
// 훅 없음. <BandSection title="다섯 라운드," accent="점점 어려워진다." sub="…"><div className="grid …"><NumberCard …/></div></BandSection>
// bleed(기본): AppShell 본문(max-w-6xl) 안에서도 좌우를 화면 끝(레일 오른쪽)까지 넓힌다 (bleed-x 유틸, AppShell 이 가로 넘침을 자른다).
import type { ReactNode } from 'react';
import { Headline } from './Headline';

export interface BandSectionProps {
  title?: ReactNode;
  /** 제목 뒤 강조 구 (violet-mist) */
  accent?: ReactNode;
  sub?: ReactNode;
  /** 제목 위 작은 라벨 */
  eyebrow?: ReactNode;
  /** 화면 폭 전체 (기본 true). false 면 부모 폭 + 12px 모서리 */
  bleed?: boolean;
  align?: 'left' | 'center';
  as?: 'section' | 'div';
  className?: string;
  /** 안쪽 가운데 틀 클래스 (기본 max-w-6xl) */
  innerClassName?: string;
  id?: string;
  'aria-label'?: string;
  children?: ReactNode;
}

export function BandSection({
  title, accent, sub, eyebrow, bleed = true, align = 'center', as: Tag = 'section', className = '', innerClassName = '', id,
  'aria-label': ariaLabel, children,
}: BandSectionProps) {
  return (
    <Tag
      id={id}
      aria-label={ariaLabel}
      className={`bg-band relative overflow-hidden text-white ${bleed ? 'bleed-x' : 'rounded-card'} ${className}`}
    >
      <div className={`relative mx-auto w-full max-w-6xl ${bleed ? 'px-4 py-10 md:px-8 md:py-14' : 'px-5 py-8 md:px-8 md:py-10'} ${innerClassName}`}>
        {eyebrow ? (
          <p className={`mb-2 text-xs font-semibold tracking-[0.04em] text-violet-mist ${align === 'center' ? 'text-center' : ''}`}>{eyebrow}</p>
        ) : null}
        {title ? <Headline as="h2" size="xl" align={align} onViolet title={title} accent={accent} sub={sub} /> : null}
        {children ? <div className={title ? 'mt-8 md:mt-10' : ''}>{children}</div> : null}
      </div>
    </Tag>
  );
}
