// 제목 + 강조 구 (DESIGN_V3 §2 타이포, §1 "Innovating Tomorrow. Building Today."처럼 뒷부분만 보라).
// 훅 없음. <Headline title="팀으로 조립하고," accent="부엉이를 둥지로." sub="…" size="hero" align="center" />
// 글꼴: font-display(Manrope → 한글은 Pretendard) 700, 자간 -0.02em, 행간 1.2.
import type { ReactNode } from 'react';

export type HeadlineSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero' | 'board';

const TITLE: Record<HeadlineSize, string> = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-[26px] md:text-[32px]',
  hero: 'text-[32px] md:text-[44px]',
  /* 프로젝터 1920×1080 무대 */
  board: 'text-[88px]',
};

const SUB: Record<HeadlineSize, string> = {
  sm: 'mt-1 text-[13px]',
  md: 'mt-1.5 text-sm',
  lg: 'mt-2 text-sm',
  xl: 'mt-3 text-[15px]',
  hero: 'mt-4 text-[15px] md:text-base',
  board: 'mt-6 text-[30px]',
};

export interface HeadlineProps {
  title: ReactNode;
  /** 뒤에 붙는 강조 구 (검정 위 violet-ink, 보라 면 위 violet-mist) */
  accent?: ReactNode;
  /** 제목 아래 회백색 부제 */
  sub?: ReactNode;
  /** 강조 구를 다음 줄로 */
  breakAccent?: boolean;
  as?: 'h1' | 'h2' | 'h3' | 'p';
  size?: HeadlineSize;
  align?: 'left' | 'center';
  /** bg-band·bg-highlight 위 (강조 구 violet-mist, 부제 white/75) */
  onViolet?: boolean;
  /** 바깥 div 클래스 */
  className?: string;
  /** 제목 요소 클래스 */
  titleClassName?: string;
  id?: string;
}

export function Headline({
  title, accent, sub, breakAccent = false, as: Tag = 'h1', size = 'lg', align = 'left', onViolet = false,
  className = '', titleClassName = '', id,
}: HeadlineProps) {
  return (
    <div className={`${align === 'center' ? 'text-center' : ''} ${className}`}>
      <Tag id={id} className={`font-display font-bold leading-[1.2] tracking-[-0.02em] text-balance ${onViolet ? 'text-white' : 'text-text'} ${TITLE[size]} ${titleClassName}`}>
        {title}
        {accent ? (
          <>
            {breakAccent ? <br /> : ' '}
            <span className={onViolet ? 'text-violet-mist' : 'text-violet-ink'}>{accent}</span>
          </>
        ) : null}
      </Tag>
      {sub ? (
        <p className={`leading-relaxed ${onViolet ? 'text-white/75' : 'text-text-dim'} ${align === 'center' ? 'mx-auto max-w-prose' : ''} ${SUB[size]}`}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
