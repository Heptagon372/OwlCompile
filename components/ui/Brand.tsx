// 로고 (DESIGN_V3 §3): 부엉이 아이콘 + "OWL COMPILE" 워드마크, "OWL"만 violet-ink (레퍼런스의 "Fin"처럼). 훅 없음.
import { OwlLogo } from '@/components/map/OwlSprite';

/** 워드마크 글자만. Manrope 800. 크기는 size(px) 또는 className 의 text-* */
export function Wordmark({ size, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.01em] text-text ${className}`}
      style={size ? { fontSize: size } : undefined}
    >
      <span className="text-violet-ink">OWL</span> COMPILE
    </span>
  );
}

/** 부엉이 아이콘 + 워드마크 */
export function BrandLogo({ size = 24, wordmark = true, textSize, className = '' }: {
  /** 아이콘 크기(px) */
  size?: number;
  wordmark?: boolean;
  /** 워드마크 글자 크기(px). 기본 아이콘의 0.66배 */
  textSize?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <OwlLogo size={size} />
      {wordmark ? <Wordmark size={textSize ?? Math.round(size * 0.66)} /> : null}
    </span>
  );
}
