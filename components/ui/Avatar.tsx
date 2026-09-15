// 둥근 이니셜 아바타 (훅 없음) — DESIGN_V4 §3·§6 (대기 명단, 헤더). 이름으로 색을 고른다(같은 이름 = 같은 색).
// 모든 색에서 흰 이니셜 4.5:1 이상.
import type { CSSProperties } from 'react';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const PX: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64 };

const GRADS: [string, string][] = [
  ['#7042F5', '#5325D6'], // 보라
  ['#3F66E8', '#2A45B8'], // 파랑
  ['#127F9C', '#0B5A70'], // 청록
  ['#9A45C6', '#6E2893'], // 자주
  ['#5B5FE0', '#3A3DB5'], // 남보라
  ['#6B3FEA', '#3D17B0'], // 짙은 보라
];

/** 이니셜: 한글 이름은 첫 글자(성), 라틴은 두 낱말 머리글자 */
export function initialsOf(name: string | null | undefined): string {
  const s = (name ?? '').trim();
  if (!s) return '?';
  const first = Array.from(s)[0];
  if (/[ㄱ-힝]/.test(first)) return first;
  const words = s.split(/\s+/).filter(Boolean);
  const out = words.length > 1 ? words[0][0] + words[1][0] : Array.from(words[0]).slice(0, 2).join('');
  return out.toUpperCase();
}

function hashOf(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

export function Avatar({
  name, size = 'md', className = '', title, ring = false, tone = 'auto',
}: {
  name: string;
  /** 크기 이름 또는 px */
  size?: AvatarSize | number;
  className?: string;
  /** 접근성 이름 (기본: 장식, 옆에 이름 글자가 있다고 본다) */
  title?: string;
  /** 바탕색 테두리 (겹쳐 놓을 때) */
  ring?: boolean;
  /** auto: 이름 해시 색 · violet: 보라 그라데이션 · glass: 유리 */
  tone?: 'auto' | 'violet' | 'glass';
}) {
  const px = typeof size === 'number' ? size : PX[size];
  const [a, b] = GRADS[hashOf(name) % GRADS.length];
  const style: CSSProperties = {
    width: px,
    height: px,
    fontSize: Math.max(10, Math.round(px * 0.4)),
    ...(tone === 'auto' ? { backgroundImage: `linear-gradient(135deg, ${a}, ${b})` } : {}),
  };
  const toneCls = tone === 'violet'
    ? 'bg-violet-grad'
    : tone === 'glass'
      // 유리 톤 글자: tint (나이트 = 흰색으로 v4 와 같고, 라이트 = 짙은 남보라 — 흰 유리 위에서 흰 글자가 묻히지 않게)
      ? 'bg-glass-2 text-tint shadow-[inset_0_0_0_1px_var(--color-stroke-strong)]'
      : '';
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      className={
        `inline-grid shrink-0 select-none place-items-center rounded-full font-bold leading-none ${tone === 'glass' ? '' : 'text-white'} ` +
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_4px_12px_var(--shadow-soft)] ' +
        `${ring ? 'ring-2 ring-bg' : ''} ${toneCls} ${className}`
      }
      style={style}
    >
      {initialsOf(name)}
    </span>
  );
}

/** 겹친 아바타 줄 (대기 명단). max 를 넘으면 +N 알약 */
export function AvatarStack({
  names, max = 8, size = 'sm', className = '', label,
}: {
  names: readonly string[];
  max?: number;
  size?: AvatarSize | number;
  className?: string;
  /** 접근성 이름 (예: "대기 중 12명") */
  label?: string;
}) {
  const px = typeof size === 'number' ? size : PX[size];
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <div role={label ? 'img' : undefined} aria-label={label} className={`flex items-center ${className}`}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={px} ring className={i ? '-ml-2' : ''} />
      ))}
      {more > 0 ? (
        <span
          aria-hidden="true"
          className="-ml-2 inline-grid shrink-0 place-items-center rounded-full bg-glass-2 px-2 font-mono text-[11px] font-semibold text-text-dim ring-2 ring-bg"
          style={{ height: px, minWidth: px }}
        >
          +{more}
        </span>
      ) : null}
    </div>
  );
}
