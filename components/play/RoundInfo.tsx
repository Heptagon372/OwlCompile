'use client';
// 라운드 정보 (DESIGN_V4 §6 /play: v2 구조를 유리 패널로, 블록 이름은 violet-ink Token 칩)
// - 데스크톱 왼쪽 열: "맵" 유리 패널(머리 = 라운드명·난이도, 본문 = 맵 + 상한·코딩 시간·범례) + "목표·규칙" 유리 패널
// - 폰: 접이식 맵 카드 (머리 줄 = 팀 · "R4 · 3/5 · 난이도 4", 펼치면 미니맵 + 새 요소 + 내 역할, 미니맵을 누르면 크게)
import { useState, type ReactNode } from 'react';
import { GAME_ROLES, ROLE_HINT, ROLE_LABEL, type GameMap, type GameRole } from '@/lib/contracts';
import { formatClock } from '@/lib/client/time';
import { MapGrid } from '@/components/map/MapGrid';
import { Chip, Token } from '@/components/ui/Chip';
import { PanelHeader, PanelStat, PanelTitle } from '@/components/ui/Panel';
import { SectionTitle } from '@/components/ui/Text';
import { IconChevronDown, IconFlag, IconMap, IconTarget, IconUsers } from '@/components/ui/icons';
import { DIFFICULTY_TONE, IntroTokens, MapLegend } from './mapInfo';
import { MiniMap } from './MiniMap';
import { RolePill, RoleSwatch, roleBlockLabels } from './roleStyle';
import { TeamDot } from './TeamDot';

const GLASS = 'glass relative flex flex-col overflow-hidden rounded-card border border-stroke shadow-glass';

/** 데스크톱 "맵" 유리 패널 */
export function MapPanel({ map }: { map: GameMap }) {
  return (
    <section className={`${GLASS} shrink-0`}>
      <PanelHeader>
        <PanelTitle icon={<IconMap />}>맵</PanelTitle>
        <span className="min-w-0 truncate text-[13px] font-semibold text-text-dim">
          R{map.round} {map.name}
        </span>
        <Chip size="sm" tone={DIFFICULTY_TONE[map.difficulty]} className="ml-auto">{map.difficulty}</Chip>
      </PanelHeader>
      <div className="surface-inset mx-2.5 mb-2.5 flex flex-col items-center gap-3 rounded-inset p-3.5">
        <MapGrid map={map} className="w-[min(100%,42dvh)]" />
        <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <PanelStat label="상한" value={`${map.cap}개`} />
          <PanelStat label="코딩" value={formatClock(map.seconds)} />
        </div>
        <MapLegend map={map} className="justify-center" />
      </div>
    </section>
  );
}

/** 데스크톱 "목표·규칙" 유리 패널 */
export function RulesPanel({ map, roles }: { map: GameMap; roles: readonly GameRole[] }) {
  return (
    <section className={`${GLASS} min-h-0 flex-1`}>
      <PanelHeader>
        <PanelTitle icon={<IconFlag />}>목표·규칙</PanelTitle>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <SectionTitle icon={<IconTarget />}>이번 라운드</SectionTitle>
        {/* 촘촘한 줄: 왼쪽 작은 라벨 · 오른쪽 내용 (블록 이름은 violet-ink Token) */}
        <dl className="surface-inset divide-y divide-stroke overflow-hidden rounded-ctl text-[13px] leading-relaxed">
          <IntroRow label="새 요소">
            <IntroTokens intro={map.intro} />
          </IntroRow>
          <IntroRow label="목표">부엉이를 둥지까지 보내세요. 부엉이는 맵의 화살표 방향을 보고 출발해요.</IntroRow>
          <IntroRow label="블록">
            <b className="font-display font-bold tabular-nums text-text">{map.cap}</b>개까지 쓸 수 있어요. <Token>반복</Token> 같은
            C-블록도 1개로 세고, 안의 카드는 따로 세요.
          </IntroRow>
          <IntroRow label="제출">
            팀원 모두가 한 프로그램을 같이 고쳐요. 아키텍트 역할을 가진 사람이면 누구나 제출할 수 있고, 봉인하면 더 못 고쳐요.
          </IntroRow>
        </dl>
        <SectionTitle icon={<IconUsers />} className="mt-5">역할과 카드</SectionTitle>
        <RoleLegend mine={roles} />
      </div>
    </section>
  );
}

function IntroRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2">
      <dt className="w-12 shrink-0 pt-px text-xs font-semibold text-text-faint">{label}</dt>
      <dd className="min-w-0 flex-1 text-text-dim">{children}</dd>
    </div>
  );
}

/** 4역할 범례: 카드 색 점 + 카드 이름(보라 칩). 내 역할은 보라 면 (여러 개 가능 = 팔레트는 합집합) */
export function RoleLegend({ mine }: { mine: readonly GameRole[] }) {
  return (
    <ul className="grid gap-1.5" aria-label="역할별 카드">
      {GAME_ROLES.map((r) => {
        const me = mine.includes(r);
        return (
          <li
            key={r}
            className={
              'flex min-h-9 items-center gap-2.5 rounded-ctl border px-2.5 py-1.5 text-[13px] ' +
              (me ? 'border-violet/40 bg-violet-soft' : 'border-stroke bg-glass-inset')
            }
          >
            <RoleSwatch role={r} large />
            <span className="w-[4.5rem] shrink-0 font-semibold text-text">{ROLE_LABEL[r]}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {roleBlockLabels(r).map((l) => (
                <Token key={l}>{l}</Token>
              ))}
              {r === 'architect' ? <span className="text-xs text-text-faint">+ 제출</span> : null}
            </span>
            {me ? <Chip size="sm" tone="violet">내 역할</Chip> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** 폰: 접이식 맵 카드 */
export function PhoneRoundCard({
  map, roles, team, roundLabel, extra, defaultOpen = true, className = '',
}: {
  map: GameMap;
  roles: readonly GameRole[];
  team: { name: string; color: string };
  /** "R4 · 3/5 · 난이도 4" */
  roundLabel: string;
  /** 펼친 칸 아래에 붙일 것 (누적 점수, 역할 바꾸기) */
  extra?: ReactNode;
  /** 처음에 펼칠지 (결과·패치 중에는 접어서 블록 칸에 자리를 준다) */
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-label="라운드 정보" className={`glass relative shrink-0 border-b border-stroke ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="play-round-body"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2 px-3 text-left transition-colors duration-150 hover:bg-tint/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink"
      >
        <TeamDot color={team.color} glow={8} />
        <span className="max-w-[6.5rem] shrink-0 truncate text-[13px] font-semibold text-text">{team.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold tabular-nums text-violet-ink">{roundLabel}</span>
        <span className="ui-caption shrink-0">{open ? '맵 접기' : '맵 보기'}</span>
        <IconChevronDown
          size={18}
          className={`shrink-0 text-text-dim transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id="play-round-body" hidden={!open} className="flex gap-3 px-3 pb-3">
        <MiniMap map={map} className="w-[120px]" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[13px] leading-relaxed text-text-dim">
            <span className="font-semibold text-text">{map.name}</span> · {map.difficulty} · 상한{' '}
            <span className="font-display font-semibold tabular-nums text-text">{map.cap}</span>
          </p>
          <p className="text-[13px] leading-relaxed text-text-dim">
            새 요소 <IntroTokens intro={map.intro} />
          </p>
          <ul className="flex flex-wrap gap-1" aria-label="내 역할">
            {roles.map((r) => (
              <li key={r} title={ROLE_HINT[r]}>
                <RolePill role={r} />
              </li>
            ))}
          </ul>
          {extra}
        </div>
      </div>
    </section>
  );
}
