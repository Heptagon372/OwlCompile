// 유리 패널 (훅 없음) — DESIGN_V4 §3: glass + 1px stroke + 윗변 반사 + 그림자 0 20px 60px rgba(0,0,0,.45), 모서리 20px.
// 머리 줄은 구분선 없이 여백으로 (제목 15px 600 + 오른쪽 작은 동작).
// <GlassPanel title="맵" right={<Button size="sm">…</Button>}>…</GlassPanel>   (옛 이름 Panel 도 같은 컴포넌트)
// 머리 줄을 직접 짜려면 PanelHeader/PanelTitle/PanelBody 를 조합한다.
// 테두리 강조는 className 대신 tone 으로.
import type { HTMLAttributes, ReactNode } from 'react';

export type PanelTone = 'default' | 'strong' | 'active' | 'danger';

const TONE: Record<PanelTone, string> = {
  default: 'border-stroke shadow-glass',
  strong: 'border-stroke-strong shadow-glass',
  /** "지금 여기" 패널 (편집 가능 등): 보라 테두리 + 은은한 보라 번짐 */
  active:
    'border-violet/45 shadow-[var(--shadow-panel-active)]',
  danger: 'border-danger/40 shadow-glass',
};

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** 머리 줄 제목 (15px 600 text). 없으면 머리 줄 생략 */
  title?: ReactNode;
  /** 제목 왼쪽 아이콘 (16px, violet-ink) */
  icon?: ReactNode;
  /** 머리 줄 오른쪽 액션 */
  right?: ReactNode;
  /** 본문 여백 없음 (표·에디터·맵처럼 꽉 채울 때) */
  noPadding?: boolean;
  /** 본문이 glass-inset 면 (에디터·맵 뷰포트) */
  inset?: boolean;
  /** 테두리 톤 (기본 stroke) */
  tone?: PanelTone;
  bodyClassName?: string;
  /** 올라온 유리(glass-2) */
  raised?: boolean;
  /** 렌더할 태그 (기본 section) */
  as?: 'section' | 'div' | 'aside' | 'article';
  children?: ReactNode;
}
export type GlassPanelProps = PanelProps;

export function GlassPanel({
  title, icon, right, noPadding = false, inset = false, tone = 'default', raised = false, bodyClassName = '', as: Tag = 'section',
  className = '', children, ...rest
}: PanelProps) {
  const head = !!(title || right);
  return (
    <Tag
      className={`glass relative flex min-h-0 flex-col overflow-hidden rounded-card border transition-[border-color,box-shadow] duration-150 ${raised ? 'glass-raised' : ''} ${TONE[tone]} ${className}`}
      {...rest}
    >
      {head ? (
        <PanelHeader>
          <PanelTitle icon={icon}>{title}</PanelTitle>
          {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
        </PanelHeader>
      ) : null}
      <PanelBody noPadding={noPadding} inset={inset} className={`${head && !noPadding ? 'pt-0.5' : ''} ${bodyClassName}`}>
        {children}
      </PanelBody>
    </Tag>
  );
}

/** 옛 이름 (페이지 호환): Panel = GlassPanel */
export const Panel = GlassPanel;

/** 머리 줄 52px: 구분선·바탕 없이 여백으로 */
export function PanelHeader({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex h-13 shrink-0 items-center gap-2 px-5 ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** 패널 제목 (15px 600 text). 아이콘은 violet-ink 선 아이콘 */
export function PanelTitle({ icon, className = '', children }: { icon?: ReactNode; className?: string; children?: ReactNode }) {
  if (!children && !icon) return null;
  return (
    <h2 className={`ui-label flex min-w-0 items-center gap-2 truncate ${className}`}>
      {icon ? <span className="flex shrink-0 text-violet-ink [&_svg]:size-4">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </h2>
  );
}

export function PanelBody({
  noPadding = false, inset = false, className = '', children, ...rest
}: HTMLAttributes<HTMLDivElement> & { noPadding?: boolean; inset?: boolean }) {
  return (
    <div
      className={`min-h-0 flex-1 ${noPadding ? '' : 'p-4 md:p-5'} ${inset ? 'bg-glass-inset' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * 머리 줄에 놓는 작은 통계 "라벨 값" (예: 블록 3/12). 개수·시간은 고정폭, 점수(display)는 Manrope.
 */
export function PanelStat({ label, value, tone = 'normal', display = false, className = '' }: {
  label: ReactNode; value: ReactNode; tone?: 'normal' | 'danger' | 'warn' | 'ok' | 'violet';
  /** 점수 값: Manrope(font-display) */
  display?: boolean;
  className?: string;
}) {
  const v = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : tone === 'violet' ? 'text-violet-ink' : 'text-text';
  return (
    <span className={`inline-flex items-baseline gap-1.5 text-xs ${className}`}>
      <span className="text-text-faint">{label}</span>
      <span className={`${display ? 'font-display font-bold' : 'font-mono font-semibold'} text-[13px] tabular-nums ${v}`}>{value}</span>
    </span>
  );
}
