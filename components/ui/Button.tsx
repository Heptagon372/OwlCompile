// 버튼 (훅 없음). 링크를 버튼처럼 보이게 할 때는 buttonClass()를 쓴다.
// DESIGN_V4 §3: 버튼은 알약(9999px), 높이 40px(폰 44px).
//   primary   = 보라 그라데이션 알약 + 흰 글자 + violet-glow, 호버 밝기 +6%·빛 강화, 누르면 살짝 눌림(scale .98)
//   secondary = 유리 알약 + stroke-strong 테두리
//   ghost     = 투명, 글자만
//   danger    = danger 외곽선 알약
//   inverse   = 흰 채움 + violet-deep 글자 (bg-highlight·bg-band 같은 보라 면 위의 주 버튼)
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border font-semibold ' +
  'transition-[background-color,border-color,color,box-shadow,filter,scale] duration-150 ease-[var(--ease-ui)] active:scale-[.98] ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';

const FOCUS_DARK = 'focus-visible:outline-violet-ink';
const FOCUS_ON_VIOLET = 'focus-visible:outline-white';

/* 폰(<768px)은 한 단계 크게: md 44px, sm 36px */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-[13px] md:h-8 md:px-3 [&_svg]:size-4',
  md: 'h-11 px-5 text-[15px] md:h-10 md:px-4 md:text-sm [&_svg]:size-[18px]',
  lg: 'h-12 px-6 text-[15px] [&_svg]:size-5',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    `border-transparent bg-violet-grad text-white shadow-glow hover:brightness-[1.06] hover:shadow-glow-strong active:brightness-95 ${FOCUS_DARK}`,
  secondary:
    `border-stroke-strong bg-glass-2 text-text shadow-[inset_0_1px_0_var(--sheen-2)] hover:border-tint/30 hover:bg-tint/[0.08] active:bg-tint/[0.1] ${FOCUS_DARK}`,
  ghost: `border-transparent bg-transparent text-text-dim hover:bg-tint/[0.06] hover:text-text active:bg-tint/[0.09] ${FOCUS_DARK}`,
  danger: `border-danger/60 bg-transparent text-danger hover:border-danger hover:bg-danger/10 active:bg-danger/15 ${FOCUS_DARK}`,
  inverse: `border-transparent bg-white text-violet-deep hover:bg-violet-mist active:bg-violet-mist/80 ${FOCUS_ON_VIOLET}`,
};

/** 버튼 클래스 문자열 (Link 등에 붙인다). 옛 호출 buttonClass(variant, extra)도 그대로 된다. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  extra = '',
  size: ButtonSize = 'md',
  fullWidth = false,
): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${fullWidth ? 'w-full' : ''} ${extra}`.replace(/\s+/g, ' ').trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 왼쪽 아이콘 (icons.tsx 컴포넌트) */
  icon?: ReactNode;
  /** 오른쪽 아이콘 */
  iconRight?: ReactNode;
  /** 처리 중: 스피너 + 비활성 (aria-busy) */
  loading?: boolean;
  fullWidth?: boolean;
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
      className={`motion-safe:animate-spin ${className}`} aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className, size, fullWidth)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

/** 원형 아이콘 버튼 (툴바·헤더용). aria-label 필수. */
export function IconButton({
  size = 'md',
  variant = 'ghost',
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: ButtonSize; variant?: ButtonVariant; 'aria-label': string }) {
  const sq = size === 'sm'
    ? 'size-9 md:size-8 [&_svg]:size-4'
    : size === 'lg'
      ? 'size-12 [&_svg]:size-6'
      : 'size-11 md:size-10 [&_svg]:size-5';
  return (
    <button type={type} className={`${BASE} ${VARIANTS[variant]} ${sq} p-0 ${className}`} {...rest}>
      {children}
    </button>
  );
}
