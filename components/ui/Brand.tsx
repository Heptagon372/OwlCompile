// 로고: 부엉이 마크(public/brand/owlcompile-mark.png) + "OWL COMPILE" 워드마크, "OWL"만 violet-ink. 훅 없음.
// 마크 원본 = public/brand/owlcompile-logo.png (마크 + OwlCompile 글자 합본). 파비콘은 app/icon.png · app/apple-icon.png.
// 게임 맵의 부엉이 캐릭터(OwlSprite)는 따로 둔다.

/** 부엉이 마크 이미지. 정사각형, 투명 배경. 옆에 워드마크가 있거나 링크에 aria-label 이 있으므로 장식용(alt="") */
export function BrandMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 작은 정적 PNG. next/image 최적화가 필요 없다
    <img
      src="/brand/owlcompile-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

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

/** 부엉이 마크 + 워드마크 */
export function BrandLogo({ size = 24, wordmark = true, textSize, className = '' }: {
  /** 마크 크기(px) */
  size?: number;
  wordmark?: boolean;
  /** 워드마크 글자 크기(px). 기본 마크의 0.55배 (마크 안에 둘레 곡선 여백이 있어 옛 아이콘보다 크게 쓴다) */
  textSize?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark size={size} />
      {wordmark ? <Wordmark size={textSize ?? Math.round(size * 0.55)} /> : null}
    </span>
  );
}
