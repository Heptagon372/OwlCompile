// 입력 (훅 없음): 12px 모서리(rounded-ctl), stroke-input 테두리, glass-inset 바탕, 포커스 violet 테두리 + violet-soft 링 (DESIGN_V4 §3).
// <Field id="name" label="이름" hint="…" error={err}><Input id="name" … /></Field>
// Input/Select/Textarea 는 forwardRef. mono 를 주면 코드·게임 코드용 고정폭.
// onViolet: bg-highlight·bg-band 같은 보라 면 위의 입력 (반투명 검정 + line-on-violet).
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { IconChevronDown } from './icons';

export type InputSize = 'sm' | 'md' | 'lg';

const INPUT_SHAPE =
  'w-full rounded-ctl border transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const INPUT_TONE = {
  // 테두리가 입력칸의 유일한 윤곽이라 3:1 이상 (WCAG 1.4.11): 검정 위 white/35, 포커스 violet-ink.
  // 포커스는 outline 대신 테두리 + 1px violet-ink 링(= 2px 윤곽, 6.6:1) + 바깥 violet-soft 번짐
  // v4: 12px 둥근 유리 입력 (glass-inset 바탕, 윤곽 white .40 = 3.2:1). v5 라이트: 윤곽 stroke-input = 남보라 .55 (3.5:1)
  default:
    'border-stroke-input bg-glass-inset text-text shadow-[inset_0_1px_2px_var(--inset-shade)] placeholder:text-text-faint read-only:text-text-dim hover:border-tint/55 ' +
    'focus:border-violet-ink focus:shadow-[0_0_0_1px_var(--color-violet-ink),0_0_0_4px_var(--color-violet-soft)] ' +
    'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_1px_var(--color-danger),0_0_0_4px_color-mix(in_srgb,var(--color-danger)_18%,transparent)]',
  onViolet:
    'border-white/60 bg-black/35 text-white placeholder:text-white/55 hover:border-white/80 ' +
    'focus:border-white focus:shadow-[0_0_0_2px_rgb(255_255_255/0.6)] ' +
    'aria-[invalid=true]:border-danger',
} as const;

/* 폰에서 16px 미만이면 iOS가 확대하므로 폰은 base, 데스크톱은 14px. 높이는 폰 44 / 데스크톱 40 */
const INPUT_SIZES: Record<InputSize, string> = {
  sm: 'h-9 px-2.5 text-[15px] md:h-8 md:text-[13px]',
  md: 'h-11 px-3 text-base md:h-10 md:text-sm',
  lg: 'h-12 px-3.5 text-base md:text-[15px]',
};

export function inputClass({ size = 'md', mono = false, onViolet = false, extra = '' }: { size?: InputSize; mono?: boolean; onViolet?: boolean; extra?: string } = {}): string {
  return `${INPUT_SHAPE} ${INPUT_TONE[onViolet ? 'onViolet' : 'default']} ${INPUT_SIZES[size]} ${mono ? 'font-mono tracking-wide tabular-nums' : ''} ${extra}`.replace(/\s+/g, ' ').trim();
}

/** 옛 이름 호환 (components/auth/AuthShell 의 INPUT_CLASS 와 같은 용도) */
export const INPUT_CLASS = inputClass();

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  mono?: boolean;
  invalid?: boolean;
  /** 보라 면 위 (bg-highlight·bg-band) */
  onViolet?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', mono = false, invalid, onViolet = false, className = '', ...rest }, ref,
) {
  return <input ref={ref} className={inputClass({ size, mono, onViolet, extra: className })} aria-invalid={invalid || rest['aria-invalid'] || undefined} {...rest} />;
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  invalid?: boolean;
  onViolet?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { mono = false, invalid, onViolet = false, className = '', rows = 3, ...rest }, ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`${INPUT_SHAPE} ${INPUT_TONE[onViolet ? 'onViolet' : 'default']} min-h-11 px-3 py-2 text-base leading-relaxed md:min-h-10 md:text-sm ${mono ? 'font-mono' : ''} ${className}`}
      aria-invalid={invalid || rest['aria-invalid'] || undefined}
      {...rest}
    />
  );
});

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: InputSize;
  mono?: boolean;
  invalid?: boolean;
  onViolet?: boolean;
  /** 감싸는 요소 클래스 (너비 등) */
  wrapClassName?: string;
}

/** 어두운 셀렉트. 옵션은 children 으로. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', mono = false, invalid, onViolet = false, className = '', wrapClassName = '', children, ...rest }, ref,
) {
  return (
    <span className={`relative inline-block w-full ${wrapClassName}`}>
      <select
        ref={ref}
        className={inputClass({ size, mono, onViolet, extra: `appearance-none pr-8 ${className}` })}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dim" />
    </span>
  );
});

export interface FieldProps {
  /** 입력의 id (label htmlFor) */
  id?: string;
  label?: ReactNode;
  /** 라벨 오른쪽 작은 보조 (예: "선택") */
  labelRight?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/** 라벨 + 입력 + 도움말/오류. 오류가 있으면 id-error, 아니면 id-hint 로 연결할 수 있게 id 를 만들어 준다. */
export function Field({ id, label, labelRight, hint, error, required, className = '', children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-[13px] font-semibold text-text">
            {label}
            {required ? <span className="ml-0.5 text-danger" aria-hidden="true">*</span> : null}
          </label>
          {labelRight ? <span className="text-xs text-text-faint">{labelRight}</span> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={id ? `${id}-error` : undefined} role="alert" className="flex items-start gap-1 text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={id ? `${id}-hint` : undefined} className="text-[13px] text-text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** aria-describedby 값 계산 (Field 의 hint/error id 규칙과 짝) */
export function describedBy(id: string, error?: string | null, hint?: ReactNode): string | undefined {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/** 라벨 + 입력을 한 번에 (옛 TextField 대체). */
export function TextField({
  label, hint, error, id, labelRight, required, className, ...rest
}: InputProps & { label: ReactNode; hint?: ReactNode; error?: string | null; id: string; labelRight?: ReactNode; required?: boolean }) {
  return (
    <Field id={id} label={label} labelRight={labelRight} hint={hint} error={error} required={required} className={className}>
      <Input id={id} invalid={!!error} aria-describedby={describedBy(id, error, hint)} required={required} {...rest} />
    </Field>
  );
}

/** 폼 전체 오류 띠 */
export function FormError({ message, className = '' }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`rounded-ctl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger ${className}`}>
      {message}
    </p>
  );
}

/** 체크박스 + 라벨 */
export function Checkbox({ label, className = '', id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label htmlFor={id} className={`inline-flex cursor-pointer items-center gap-2 text-sm text-text ${className}`}>
      <input id={id} type="checkbox" className="size-4 rounded-[6px] border-stroke-input bg-glass-inset accent-violet" {...rest} />
      {label}
    </label>
  );
}
