// 프로젝터(1920×1080 무대) 전용 표시 컴포넌트 (훅 없음). DESIGN_V4 §2·§3·§6 "/board":
// 어두운 보라검정 무대 위에 떠 있는 유리 패널(glass + 1px stroke + 윗변 반사 + 그림자, 모서리 20px),
// 알약 칩, 둥근 팀 점을 10 m 거리에서 읽히는 크기로 그린다. 색은 토큰만 쓴다(팀 색은 서버 데이터라 인라인 style).
//
// 유리 면(glass 유틸)은 요소 뒤 ::before(z -1)에 깔린다: 무대 바탕(StageBackdrop, -z-10)은 BoardFrame(isolate) 안에서
// 그보다 아래라 유리가 조명을 흐리게 비친다. 유리 패널 조상에 배경색을 칠하지 않는다.
//
// 라이트 모드 (THEME_V5 §1·§3): 보드에는 토글이 없고 이 브라우저의 저장값(<html data-theme>)을 따른다.
// 모드별 차이는 모두 CSS 로만 준다 (토큰 + `[html[data-theme=light]_&]:` 변형) — JS 로 모드를 읽지 않으므로
// 다른 탭에서 모드를 바꿔도(storage 이벤트 → lib/client/theme applyTheme) 다시 그리지 않고, 재생도 이어진다.
// 나이트 값은 v4 그대로다 (변형은 라이트에서만 걸린다).
import type { CSSProperties, ReactNode } from 'react';
import { GAME_ROLES, ROLE_LABEL, type TeamView } from '@/lib/contracts';
import { teamColor } from './layout';

export { onlineCount, teamColor } from './layout';

const mix = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

/** 무대 바탕: 좌상·우하 큰 보라 라디얼 조명 + 옅은 파랑 한 점 + 비네트 */
const BACKDROP = [
  `radial-gradient(1200px 900px at 4% -8%, ${mix('--color-violet', 30)}, ${mix('--color-violet', 8)} 45%, transparent 70%)`,
  `radial-gradient(1100px 860px at 102% 108%, ${mix('--color-violet-press', 26)}, ${mix('--color-violet-press', 6)} 50%, transparent 72%)`,
  `radial-gradient(700px 520px at 80% 6%, ${mix('--color-blue', 10)}, transparent 70%)`,
  'radial-gradient(130% 100% at 50% 40%, transparent 55%, var(--color-bg-deep) 100%)',
].join(', ');

/**
 * 라이트 무대 바탕 (THEME_V5 §3 "흰 라벤더 바탕 + 아주 옅은 보라·하늘색 라디얼 빛 2개"): 같은 자리의 옅은 보라·파랑 빛.
 * 나이트 세기(보라 30%)면 밝은 유리 위 text-faint 가 4.5:1 경계까지 떨어진다 → 14% (4.9:1)
 */
const BACKDROP_LIGHT = [
  `radial-gradient(1200px 900px at 4% -8%, ${mix('--color-violet', 14)}, ${mix('--color-violet', 4)} 45%, transparent 70%)`,
  `radial-gradient(1100px 860px at 102% 108%, ${mix('--color-blue', 13)}, ${mix('--color-blue', 3)} 50%, transparent 72%)`,
  `radial-gradient(700px 520px at 80% 6%, ${mix('--color-violet-hover', 6)}, transparent 70%)`,
  'radial-gradient(130% 100% at 50% 40%, transparent 55%, var(--color-bg-deep) 100%)',
].join(', ');

/** 바탕 층 모드별 그림: 나이트 = BACKDROP(v4 그대로), 라이트 = BACKDROP_LIGHT. 값은 변수로 넘기고 CSS 가 고른다 */
const BACKDROP_VARS = { '--board-bd': BACKDROP, '--board-bd-light': BACKDROP_LIGHT } as CSSProperties;

/** 아래쪽 원근 격자 바닥 (아주 옅게) */
const FLOOR_MASK = 'linear-gradient(to top, #000 0%, rgba(0, 0, 0, 0.5) 40%, transparent 85%)';
const FLOOR: CSSProperties = {
  backgroundImage: `linear-gradient(${mix('--color-violet-ink', 9)} 1px, transparent 1px), linear-gradient(90deg, ${mix('--color-violet-ink', 9)} 1px, transparent 1px)`,
  backgroundSize: '80px 80px',
  backgroundPosition: 'center bottom',
  transform: 'perspective(560px) rotateX(64deg)',
  transformOrigin: '50% 100%',
  maskImage: FLOOR_MASK,
  WebkitMaskImage: FLOOR_MASK,
};

/** 대기 화면 "거대한 보라 조명": 무대 위쪽 가운데 큰 라디얼 빛 */
const SPOTLIGHT = `radial-gradient(1500px 980px at 50% 24%, ${mix('--color-violet', 36)}, ${mix('--color-violet', 12)} 42%, transparent 72%)`;

/**
 * 무대 바탕 층 (부모는 relative isolate). spotlight = 대기 화면의 거대한 보라 조명.
 * 라이트: 옅은 조명(BACKDROP_LIGHT), 격자 투명도 낮게, 거대한 조명은 은은하게 (강한 발광 대신).
 */
export function StageBackdrop({ spotlight = false }: { spotlight?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-bg">
      <div className="absolute inset-0 [background:var(--board-bd)] [html[data-theme=light]_&]:[background:var(--board-bd-light)]" style={BACKDROP_VARS} />
      <div className="absolute inset-x-[-40%] bottom-[-2%] h-[46%] opacity-70 [html[data-theme=light]_&]:opacity-45" style={FLOOR} />
      {spotlight ? <div className="absolute inset-0 [html[data-theme=light]_&]:opacity-40" style={{ background: SPOTLIGHT }} /> : null}
    </div>
  );
}

export type BoardPanelTone = 'default' | 'strong';

/**
 * 유리 패널: 머리 줄 64px(구분선 없이 여백, 보라 원 배지 아이콘 + 제목 24px 600) + 본문.
 * inset 이면 본문이 파인 면(glass-inset).
 */
export function BoardPanel({
  title, icon, right, inset = false, noPadding = false, tone = 'default', raised = false, className = '', bodyClassName = '',
  style, bodyStyle, 'aria-label': ariaLabel, children,
}: {
  title?: ReactNode; icon?: ReactNode; right?: ReactNode; inset?: boolean; noPadding?: boolean;
  /** strong = stroke-strong 테두리 (맵 뷰포트) */
  tone?: BoardPanelTone;
  /** 올라온 유리 (glass-2) */
  raised?: boolean;
  className?: string; bodyClassName?: string; style?: CSSProperties; bodyStyle?: CSSProperties;
  'aria-label'?: string;
  children?: ReactNode;
}) {
  const head = !!(title || right);
  return (
    <section
      aria-label={ariaLabel}
      className={`glass relative flex min-h-0 flex-col overflow-hidden rounded-card border shadow-glass ${raised ? 'glass-raised' : ''} ${tone === 'strong' ? 'border-stroke-strong' : 'border-stroke'} ${className}`}
      style={style}
    >
      {head ? (
        <header className="flex h-16 shrink-0 items-center gap-3 px-6">
          {title ? (
            <h2 className="flex min-w-0 items-center gap-3 text-[24px] font-semibold leading-none text-text">
              {icon ? (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet/15 text-violet-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-violet)_40%,transparent)] [&_svg]:size-[22px]">
                  {icon}
                </span>
              ) : null}
              <span className="truncate">{title}</span>
            </h2>
          ) : null}
          {right ? <div className="ml-auto flex shrink-0 items-center gap-3">{right}</div> : null}
        </header>
      ) : null}
      <div
        className={`min-h-0 flex-1 ${noPadding ? '' : head ? 'px-6 pb-6' : 'p-6'} ${inset ? 'bg-glass-inset' : ''} ${bodyClassName}`}
        style={bodyStyle}
      >
        {children}
      </div>
    </section>
  );
}

/** 캡션 (18px 600 자간 .04em text-faint). onViolet: 1위 카드(bg-highlight) 위 white/85 */
export function BoardCaption({ onViolet = false, className = '', children }: {
  onViolet?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <span className={`text-[18px] font-semibold tracking-[0.04em] ${onViolet ? 'text-white/85' : 'text-text-faint'} ${className}`}>
      {children}
    </span>
  );
}

/** "OWL COMPILE" 워드마크 (Manrope 800, "OWL"만 violet-ink) */
export function BoardWordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="whitespace-nowrap font-display font-extrabold leading-none tracking-[-0.01em] text-text" style={{ fontSize: size }}>
      <span className="text-violet-ink">OWL</span> COMPILE
    </span>
  );
}

export type BoardChipTone = 'neutral' | 'blue' | 'violet' | 'ok' | 'warn' | 'danger' | 'cyan' | 'onViolet';

// 라이트: 상태색 글자는 같은 색 12% 틴트 위에서 4.0~4.4:1 로 떨어진다 → 상태색 78% + text 22% 로 짙게 (5.2:1 이상,
// 제출 알약의 ok 7% 틴트 위에 겹쳐도). 점의 빛은 네온 대신 은은한 모드 토큰(--glow-*). 나이트 값은 그대로.
const CHIP: Record<BoardChipTone, { box: string; dot: string }> = {
  neutral: { box: 'border-stroke-strong bg-tint/[0.05] text-text-dim', dot: 'bg-text-faint' },
  blue: {
    box: 'border-blue/35 bg-blue/12 text-blue-hover',
    dot: 'bg-blue shadow-[0_0_8px_var(--color-blue)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-accent)]',
  },
  violet: {
    box: 'border-violet/45 bg-violet/15 text-violet-ink',
    dot: 'bg-violet-ink shadow-[0_0_8px_var(--color-violet)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-accent)]',
  },
  ok: {
    box: 'border-ok/30 bg-ok/12 text-ok [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-ok)_78%,var(--color-text))]',
    dot: 'bg-ok shadow-[0_0_8px_var(--color-ok)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-ok)]',
  },
  warn: {
    box: 'border-warn/30 bg-warn/12 text-warn [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-warn)_78%,var(--color-text))]',
    dot: 'bg-warn shadow-[0_0_8px_var(--color-warn)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-warn)]',
  },
  danger: {
    box: 'border-danger/35 bg-danger/12 text-danger [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-danger)_78%,var(--color-text))]',
    dot: 'bg-danger shadow-[0_0_8px_var(--color-danger)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-danger)]',
  },
  cyan: {
    box: 'border-cyan/30 bg-cyan/12 text-cyan [html[data-theme=light]_&]:text-[color-mix(in_srgb,var(--color-cyan)_78%,var(--color-text))]',
    dot: 'bg-cyan shadow-[0_0_8px_var(--color-cyan)] [html[data-theme=light]_&]:shadow-[0_0_6px_var(--glow-cyan)]',
  },
  /** 1위 카드(bg-highlight) 위 */
  onViolet: { box: 'border-white/40 bg-white/12 text-white', dot: 'bg-white' },
};

/** 상태 알약 (보드 크기: md 44px·22px, sm 36px·18px). 반투명 배경 + 같은 색 글자 (DESIGN_V4 §3). */
export function BoardChip({
  tone = 'neutral', size = 'md', dot = false, pulse = false, mono = false, icon, className = '', children,
}: {
  tone?: BoardChipTone; size?: 'sm' | 'md'; dot?: boolean; pulse?: boolean; mono?: boolean; icon?: ReactNode;
  className?: string; children: ReactNode;
}) {
  const t = CHIP[tone];
  const sz = size === 'sm'
    ? 'h-9 gap-2 px-3.5 text-[18px] [&_svg]:size-[18px]'
    : 'h-11 gap-2.5 px-[18px] text-[22px] [&_svg]:size-[22px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border font-semibold leading-none ${sz} ${t.box} ${mono ? 'font-mono tabular-nums' : ''} ${className}`}
    >
      {dot ? <i aria-hidden="true" className={`${size === 'sm' ? 'size-2' : 'size-2.5'} shrink-0 rounded-full ${t.dot} ${pulse ? 'motion-safe:animate-pulse' : ''}`} /> : null}
      {icon ? <span aria-hidden="true" className="flex shrink-0">{icon}</span> : null}
      {children}
    </span>
  );
}

/**
 * 팀 색 둥근 점 (색은 모드 토큰: teamColor). ring: 보라 면(bg-highlight, 두 모드 같은 짙은 보라) 위 —
 * 보라 계열 팀 색이 묻히지 않게 흰 테두리
 */
export function TeamDot({ color, size = 18, ring = false }: { color: string; size?: number; ring?: boolean }) {
  const c = teamColor(color);
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: c,
        boxShadow: ring ? '0 0 0 2px rgba(255, 255, 255, 0.75)' : `0 0 0 ${Math.max(2, Math.round(size * 0.2))}px color-mix(in srgb, ${c} 22%, transparent)`,
      }}
    />
  );
}

/** 팀 표시: 팀 색 둥근 점 + 이름 (700). size = 글자 px */
export function TeamMark({ team, size = 28, ring = false, className = '' }: { team: Pick<TeamView, 'name' | 'color'>; size?: number; ring?: boolean; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-[0.5em] ${className}`} style={{ fontSize: size }}>
      <TeamDot color={team.color} size={Math.round(size * 0.56)} ring={ring} />
      <span className="truncate font-bold leading-tight">{team.name}</span>
    </span>
  );
}

/** 역할 칸 4개 (러너·터너·컨트롤러·아키텍트): 누가 맡았으면 팀 색, 한 명이라도 접속 중이면 밝게 */
export function RoleDots({ team, size = 12, gap = 5 }: { team: TeamView; size?: number; gap?: number }) {
  const c = teamColor(team.color);
  return (
    <span className="flex items-center" style={{ gap }} aria-hidden="true">
      {GAME_ROLES.map((role) => {
        const holders = team.people.filter((p) => p.roles.includes(role));
        const has = holders.length > 0;
        const on = holders.some((p) => p.online);
        return (
          <span
            key={role}
            title={ROLE_LABEL[role]}
            className="rounded-full"
            style={{
              width: size * 2,
              height: size,
              background: has ? (on ? c : `color-mix(in srgb, ${c} 35%, transparent)`) : 'transparent',
              boxShadow: `inset 0 0 0 1.5px ${has ? c : 'var(--color-stroke-strong)'}`,
            }}
          />
        );
      })}
    </span>
  );
}

/** 안내 화면 (불러오는 중·권한 없음·오류): 무대 가운데 유리 카드 */
export function BoardNotice({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="relative isolate flex h-full items-center justify-center">
      <StageBackdrop />
      <div className="glass relative flex w-[1100px] max-w-full flex-col items-center gap-6 rounded-sheet border border-stroke px-16 py-14 text-center shadow-glass">
        {icon}
        <h1 className="font-display text-[56px] font-bold leading-[1.2] tracking-[-0.02em]">{title}</h1>
        {children ? <p className="text-[30px] text-text-dim">{children}</p> : null}
      </div>
    </div>
  );
}
