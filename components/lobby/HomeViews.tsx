// 홈(/) 화면 조각 (DESIGN_V4 §6). 훅 없음 — app/page.tsx 가 서버에서 데이터를 모아 넘긴다.
//  - 진행자·관리자(StaffHome): 인사말 + 주 버튼 "새 게임 만들기" + 지표 카드 4장(대기 인원·진행 중 게임·가입 회원·열린 초대)
//    + 진행 중 게임 목록 + 빠른 실행 타일(게임 만들기·초대 만들기·프로젝터 열기·대기실)
//  - 참가자(PlayerHome): 인사말 + 큰 "대기실로" 카드(참가 중이면 "게임으로 돌아가기") + 대기 인원·열린 게임 + 게임 코드 입력
//  - RoundsPanel: 라운드 목록 (이름·난이도·상한·새 요소만. 정답은 없다)
// 빛: 한 화면에 강한 빛은 주 버튼(또는 강조 카드) 하나 + 아이콘 배지의 은은한 빛.
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ACCOUNT_ROLE_LABEL, ASSIGN_MODE_LABEL, PHASE_LABEL, roundPosition, suggestedTeamCount,
  type AccountRole, type GameSummary, type Phase,
} from '@/lib/contracts';
import { JoinCodeCard } from '@/components/auth/JoinCodeCard';
import { AvatarStack } from '@/components/ui/Avatar';
import { buttonClass } from '@/components/ui/Button';
import { ArrowCircle, NumberCard } from '@/components/ui/Cards';
import { Chip, NumChip, StatusPill } from '@/components/ui/Chip';
import { IconBadge } from '@/components/ui/IconBadge';
import { Panel } from '@/components/ui/Panel';
import { QuickTile, StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/Text';
import {
  IconAccount, IconArrowRight, IconBolt, IconFullscreen, IconGrid, IconHost, IconJoin, IconLayers, IconLink, IconLobby,
  IconPlus, IconSparkle, IconUsers,
} from '@/components/ui/icons';
import { phaseStatus } from './lobbyUtil';

const ROLE_TONE = { admin: 'violet', host: 'blue', player: 'neutral' } as const;

/** 인사말 줄: 역할 칩 · 오늘 날짜 / "안녕하세요, <이름>님" / 부제 · 오른쪽 동작 */
export function HomeGreeting({
  name, role, today, sub, action,
}: { name: string; role: AccountRole; today?: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <section aria-labelledby="home-title" className="flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between md:pt-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-text-faint">
          <Chip tone={ROLE_TONE[role]} size="sm">{ACCOUNT_ROLE_LABEL[role]}</Chip>
          {today ? <span>{today}</span> : null}
        </p>
        <h2
          id="home-title"
          className="mt-2.5 break-keep font-display text-[28px] font-bold leading-[1.15] tracking-[-0.02em] text-text md:text-[34px]"
        >
          안녕하세요, {name}님
        </h2>
        {sub ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-dim md:text-[15px]">{sub}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </section>
  );
}

// ------------------------------------------------------------------ 진행자·관리자

export interface StaffHomeProps {
  name: string;
  role: AccountRole;
  today: string;
  /** 대기 중인 사람 표시 이름 (들어온 순서) */
  waitingNames: string[];
  /** 끝나지 않은 게임 (최신 먼저). 관리자 = 전체, 진행자 = 내 게임 */
  activeGames: GameSummary[];
  /** 참가할 수 있는 게임 수 (lobby·coding) */
  openGameCount: number;
  /** 최근 7일 날짜별 만든 게임 수 */
  gameSpark: number[];
  memberCount: number;
  /** 최근 7일 누적 회원 수 */
  memberSpark: number[];
  /** 최근 7일 새 회원 */
  membersNew: number;
  pendingInvites: number;
  /** 최근 7일 날짜별 만든 초대 수 */
  inviteSpark: number[];
}

const hasData = (xs: number[]) => xs.some((x) => x > 0);

export function StaffHome(p: StaffHomeProps) {
  const isAdmin = p.role === 'admin';
  const waiting = p.waitingNames.length;
  const board = p.activeGames[0] ?? null;
  const gamesHref = isAdmin ? '/admin#games' : '/host';
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <HomeGreeting
        name={p.name}
        role={p.role}
        today={p.today}
        sub={
          waiting > 0
            ? `지금 대기실에 ${waiting}명이 기다리고 있어요. 게임을 만들면 바로 팀에 들어갑니다.`
            : '대기실이 비어 있어요. 참가자가 대기실을 열면 여기와 진행자 화면에 바로 보입니다.'
        }
        action={
          <Link href="/host" className={buttonClass('primary', 'max-md:w-full', 'lg')}>
            <IconPlus />
            새 게임 만들기
          </Link>
        }
      />

      <section aria-label="지표" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<IconLobby />}
          label="대기 인원"
          value={waiting}
          unit="명"
          href="/host"
          aria-label={`대기 인원 ${waiting}명, 진행자 화면에서 게임 만들기`}
          sub={waiting > 0 ? `추천 팀 수 ${suggestedTeamCount(waiting)}개` : '실시간 · 대기실 기준'}
          subTone={waiting > 0 ? 'violet' : 'dim'}
        >
          {waiting > 0 ? <AvatarStack names={p.waitingNames} max={6} size="sm" /> : null}
        </StatCard>
        <StatCard
          icon={<IconBolt />}
          label="진행 중 게임"
          value={p.activeGames.length}
          unit="개"
          href={gamesHref}
          aria-label={`진행 중 게임 ${p.activeGames.length}개`}
          sub={`참가할 수 있는 게임 ${p.openGameCount}개`}
          spark={hasData(p.gameSpark) ? p.gameSpark : undefined}
        />
        <StatCard
          icon={<IconUsers />}
          label="가입 회원"
          value={p.memberCount}
          unit="명"
          href={isAdmin ? '/admin#users' : undefined}
          aria-label={`가입 회원 ${p.memberCount}명`}
          sub={p.membersNew > 0 ? `최근 7일 +${p.membersNew}명` : '최근 7일 새 회원 없음'}
          subTone={p.membersNew > 0 ? 'ok' : 'dim'}
          spark={p.memberSpark}
        />
        <StatCard
          icon={<IconLink />}
          label="열린 초대"
          value={p.pendingInvites}
          unit="장"
          href={isAdmin ? '/admin#invites' : undefined}
          aria-label={`열린 초대 ${p.pendingInvites}장`}
          sub={isAdmin ? '아직 쓰지 않은 초대 링크' : '초대는 관리자가 만듭니다'}
          spark={hasData(p.inviteSpark) ? p.inviteSpark : undefined}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-5">
        <Panel
          title="진행 중 게임"
          icon={<IconBolt />}
          noPadding
          right={
            <Link href={gamesHref} className={buttonClass('ghost', 'max-md:h-11', 'sm')}>
              모두 보기
              <IconArrowRight />
            </Link>
          }
        >
          {p.activeGames.length === 0 ? (
            <EmptyState
              compact
              icon={<IconHost />}
              title="진행 중인 게임이 없어요"
              body="새 게임을 만들면 대기실에 있는 사람들이 바로 팀에 들어갑니다."
            />
          ) : (
            <ul className="flex flex-col px-2 pb-2">
              {p.activeGames.slice(0, 5).map((g) => (
                <li key={g.code}>
                  <Link
                    href={`/host/${g.code}`}
                    className="flex min-h-14 items-center gap-3 rounded-inset px-3 py-2.5 transition-colors duration-150 hover:bg-tint/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-violet-ink"
                  >
                    <IconBadge tone="glass" size="md" glow={false}>
                      <IconGrid />
                    </IconBadge>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[15px] font-bold tracking-[0.1em] tabular-nums text-text">{g.code}</span>
                        <span className="truncate text-[13px] text-text-dim">{g.hostName}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-text-faint">
                        {roundPosition(g.rounds, g.round).label} · 팀 {g.teams} · {g.members}명 · {ASSIGN_MODE_LABEL[g.mode]}
                      </span>
                    </span>
                    <StatusPill status={phaseStatus(g.phase)} size="sm">{PHASE_LABEL[g.phase]}</StatusPill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="빠른 실행" icon={<IconSparkle />}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <QuickTile href="/host" icon={<IconPlus />} label="게임 만들기" sub="팀 수 · 라운드 · 배정 방식" />
            {isAdmin ? (
              <QuickTile href="/admin#invites" icon={<IconLink />} label="초대 만들기" sub="이름 목록으로 여러 장" />
            ) : (
              <QuickTile href="/account" icon={<IconAccount />} label="내 계정" sub="비밀번호 바꾸기" />
            )}
            <QuickTile
              href={board ? `/board/${board.code}` : '/host'}
              icon={<IconFullscreen />}
              label="프로젝터 열기"
              sub={board ? `게임 ${board.code} 보드` : '게임을 먼저 만드세요'}
            />
            <QuickTile href="/lobby" icon={<IconLobby />} label="대기실" sub={`${waiting}명 대기 중`} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 참가자

export interface PlayerHomeProps {
  name: string;
  role: AccountRole;
  today: string;
  waitingNames: string[];
  openGameCount: number;
  /** 끝나지 않은 게임의 팀원이면 그 게임 */
  myGame: { code: string; phase: Phase } | null;
}

const STEPS: { title: string; body: string }[] = [
  { title: '대기실 열기', body: '대기실 화면을 열어 두면 대기 명단에 들어갑니다.' },
  { title: '자동 배정', body: '진행자가 게임을 만드는 순간 팀과 역할이 정해지고 편집기로 이동합니다.' },
  { title: '함께 조립', body: '팀원이 나눠 든 블록을 이어 부엉이를 둥지로 보내세요.' },
];

export function PlayerHome(p: PlayerHomeProps) {
  const waiting = p.waitingNames.length;
  const my = p.myGame;
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <HomeGreeting
        name={p.name}
        role={p.role}
        today={p.today}
        sub={my ? '참가 중인 게임이 있어요. 팀 편집기로 돌아가세요.' : '대기실에 들어가 있으면 진행자가 게임을 만들 때 자동으로 팀에 들어갑니다.'}
      />

      {/* 큰 강조 카드 (한 화면에 하나): 대기실로 / 게임으로 돌아가기.
          면은 두 모드 모두 같은 보라(bg-highlight)라 안의 흰 글자는 그대로. 포커스 링은 카드 바깥(offset 2px) 바탕 위에 그려지므로
          tint(나이트 = 흰색 그대로, 라이트 = 짙은 남보라: 밝은 바탕 위 흰 링은 보이지 않는다) */}
      <Link
        href={my ? `/play/${my.code}` : '/lobby'}
        className={
          'group relative isolate flex min-h-52 flex-col justify-between gap-6 overflow-hidden rounded-card bg-highlight p-6 text-white shadow-glow ' +
          'transition-[translate,box-shadow] duration-150 hover:shadow-glow-strong motion-safe:hover:-translate-y-0.5 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint md:min-h-60 md:p-8'
        }
      >
        <span className="flex items-start justify-between gap-4">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-white/15 ring-1 ring-inset ring-white/30 [&_svg]:size-7">
            {my ? <IconJoin /> : <IconLobby />}
          </span>
          <ArrowCircle tone="onViolet" size="lg" />
        </span>
        <span className="block">
          <span className="block text-[13px] font-semibold text-white/90">
            {my ? `게임 ${my.code} · ${PHASE_LABEL[my.phase]}` : '지금 할 일'}
          </span>
          <span className="mt-2 block break-keep font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] md:text-[44px]">
            {my ? '게임으로 돌아가기' : '대기실로'}
          </span>
          <span className="mt-3 block max-w-lg text-sm leading-relaxed text-white/80 md:text-[15px]">
            {my
              ? '팀원들이 기다리고 있어요. 팀 편집기에서 블록을 이어 가세요.'
              : '대기실을 열어 두면 게임이 만들어지는 순간 팀과 역할이 정해지고 편집기로 바로 이동합니다.'}
          </span>
        </span>
        {!my ? (
          <span className="flex flex-wrap items-center gap-3 text-[13px] font-semibold text-white/85">
            {waiting > 0 ? <AvatarStack names={p.waitingNames} max={5} size="sm" /> : null}
            <span>{waiting > 0 ? `지금 ${waiting}명이 기다리는 중` : '아직 기다리는 사람이 없어요'}</span>
          </span>
        ) : null}
      </Link>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          icon={<IconUsers />}
          label="대기 인원"
          value={waiting}
          unit="명"
          href="/lobby"
          badgeTone="glass"
          aria-label={`대기 인원 ${waiting}명, 대기실로 가기`}
          sub="대기실을 열어 둔 사람"
        />
        <StatCard
          icon={<IconGrid />}
          label="열린 게임"
          value={p.openGameCount}
          unit="개"
          href="/lobby"
          badgeTone="glass"
          aria-label={`열린 게임 ${p.openGameCount}개, 대기실로 가기`}
          sub={p.openGameCount > 0 ? '대기실에서 바로 참가할 수 있어요' : '진행자가 곧 만들어요'}
        />
        <JoinCodeCard />
      </div>

      <Panel title="이렇게 진행돼요" icon={<IconSparkle />}>
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="surface-inset flex gap-3 rounded-inset p-4">
              <NumChip n={i + 1} active={i === 0} className="mt-px" />
              <span className="min-w-0">
                <b className="block text-sm font-semibold text-text">{s.title}</b>
                <span className="mt-1 block text-[13px] leading-relaxed text-text-dim">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ 라운드 목록

export interface RoundCardInfo {
  round: number;
  name: string;
  difficulty: string;
  cap: number;
  intro: string;
}

export function RoundsPanel({ rounds }: { rounds: RoundCardInfo[] }) {
  return (
    <Panel
      title={`라운드 ${rounds.length}개 · 갈수록 한 걸음씩`}
      icon={<IconLayers />}
      right={<span className="hidden text-xs text-text-faint sm:inline">진행자가 이번 게임에서 할 라운드를 고릅니다</span>}
    >
      {/* 격자 2 / md 3 / lg 4 / 2xl 5열: 10개면 2xl에서 두 줄이 꼭 맞고, 7개처럼 홀수면 2열에서 마지막 카드가 남는 칸을 채운다 */}
      <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {rounds.map((m) => (
          <li key={m.round} className={`flex ${rounds.length % 2 === 1 ? 'last:col-span-2 md:last:col-span-1' : ''}`}>
            <NumberCard
              tone="dark"
              n={m.round}
              title={m.name}
              subtitle={
                <>
                  <span className="block text-[11px] font-semibold tracking-[0.04em] text-violet-ink">새 요소</span>
                  {m.intro}
                </>
              }
              className="w-full"
            >
              <p className="text-[11px] font-semibold tracking-[0.04em] text-text-faint">
                {m.difficulty} · 상한 <span className="font-mono tabular-nums">{m.cap}</span>
              </p>
            </NumberCard>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
