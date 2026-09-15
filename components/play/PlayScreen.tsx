'use client';
// /play/[code] 팀 편집기 — DESIGN_V4 §6 (v2 구조를 유리 패널로), 동작은 docs/WEBSITE_SPEC.md §9 그대로.
// 데스크톱(≥1024px): 왼쪽 열 = "맵" + "목표·규칙", 오른쪽 열 = [블록 | 코드] + [내 카드 | 팀(제출)]
// 머리(AppShell 상단 바): 제목 = 맵 이름, 맥락 = "R4 · 3/5 · 난이도 4" · 팀 · 게임 코드, 오른쪽 = 연결 · RingProgress 타이머 · 블록 n/상한
// 폰(390px): 머리 → 접이식 맵(라운드 표기) → (패치·결과) → 블록 → 접이식 코드 칸(네온 티커) → 팔레트(맨 아래) → 제출 바
// 네온 코드 뷰(FEATURE_V4 §4)는 코드만 보여 준다: 실행 미리보기·시뮬레이터 없음.
// 제출은 이 팀에서 아키텍트 역할을 가진 누구나 (FEATURE_V4 §2). 아키텍트가 없으면 "아키텍트 없음" 경고.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { API, PHASE_LABEL, roundPosition, type GameView, type OkResponse, type SubmitResponse } from '@/lib/contracts';
import { countBlocks } from '@/lib/engine/blocks';
import { api, ApiClientError } from '@/lib/client/api';
import { useGame } from '@/lib/client/useGame';
import { ProgramEditor } from '@/components/blocks/ProgramEditor';
import { AppShell, type ShellUser } from '@/components/ui/AppShell';
import { Button, Spinner, buttonClass } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/Text';
import {
  IconAlert, IconCheck, IconInfo, IconLock, IconRefresh, IconSubmit, IconUnlock, IconWifi,
} from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { PlayStatus } from './PlayHeader';
import { ResultPanel } from './ResultPanel';
import { MapPanel, PhoneRoundCard, RulesPanel } from './RoundInfo';
import { SubmitSheet } from './SubmitSheet';
import { TeamBar, TeamPanel } from './TeamBar';
import { TeamDot } from './TeamDot';
import { useProgramSync } from './useProgramSync';

export function PlayScreen({ code, user }: { code: string; user: ShellUser }) {
  const router = useRouter();
  const toast = useToast();
  // 진행자가 나를 내보내면(게임 채널 'removed') 대기실로 돌아간다 (FEATURE_V4 §3.6)
  const meIdRef = useRef<string | null>(null);
  const kickedRef = useRef(false);
  const { view, error, status, serverOffsetMs, patchView, refresh } = useGame(code, {
    onEvent: (e) => {
      if (e.type !== 'removed' || !meIdRef.current || e.userId !== meIdRef.current || kickedRef.current) return;
      kickedRef.current = true;
      toast('진행자가 게임에서 내보냈어요. 대기실로 돌아가요', 'error');
      router.replace('/lobby');
    },
  });
  meIdRef.current = view?.me.userId ?? null;
  const sync = useProgramSync(code, view, patchView, refresh);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // 패치가 허용되는 순간 한 번 알린다
  const patchActive = !!view?.myProgram?.patchActive;
  const prevPatch = useRef(patchActive);
  useEffect(() => {
    if (patchActive && !prevPatch.current) toast('패치가 허용됐어요. 고쳐서 다시 제출하세요', 'success');
    prevPatch.current = patchActive;
  }, [patchActive, toast]);

  // 로그인이 풀렸으면 로그인으로. 팀원이 아니면: 자동 배정 게임은 대기실로(배정은 대기실에서), 직접 선택 게임은 참가 화면으로
  const notMember = !!view && !view.me.teamId && !view.me.isHost;
  const autoMode = view?.game.mode === 'auto';
  useEffect(() => {
    if (error?.status === 401) router.replace(`/login?next=${encodeURIComponent(`/play/${code}`)}`);
  }, [error, router, code]);
  useEffect(() => {
    if (!notMember || kickedRef.current) return;
    router.replace(autoMode ? '/lobby' : `/join?code=${code}`);
  }, [notMember, autoMode, router, code]);

  if (!view) {
    if (error && error.status !== 0) return <Blocked user={user} code={code} title={errorTitle(error)} message={error.message} />;
    return (
      <AppShell user={user} title="팀 편집기" compactHeader>
        <div className="grid flex-1 place-items-center text-sm text-text-dim" role="status">
          <span className="inline-flex items-center gap-2">
            <Spinner className="size-4 text-violet-ink" />
            {error ? '서버에 연결하는 중…' : '불러오는 중…'}
          </span>
        </div>
      </AppShell>
    );
  }
  if (error?.code === 'game_deleted') {
    return <Blocked user={user} code={code} title="게임이 삭제됐어요" message="진행자에게 새 게임 코드를 받아 주세요." />;
  }

  const me = view.me;
  const team = view.teams.find((t) => t.id === me.teamId) ?? null;
  if (!team) {
    return me.isHost ? (
      <Blocked
        user={user}
        code={code}
        title="진행자 계정이에요"
        message="팀 편집기는 참가자용이에요. 진행자 콘솔에서 게임을 진행하세요."
        action={<Link href={`/host/${code}`} className={buttonClass('primary')}>진행자 콘솔 열기</Link>}
      />
    ) : (
      <Blocked
        user={user}
        code={code}
        title="이 게임의 팀원이 아니에요"
        message={view.game.mode === 'auto' ? '대기실로 이동해요. 진행자가 팀에 넣어 주면 자동으로 들어가요.' : '참가 화면으로 이동해요.'}
      />
    );
  }

  const mp = view.myProgram;
  const phase = view.game.phase;
  const cap = view.map.cap;
  const editable = !!mp?.editable;
  const blocks = countBlocks(sync.doc);
  const over = blocks > cap;
  const sealed = !!mp?.submittedAt;
  const isArchitect = me.roles.includes('architect');
  const canSubmit = editable && !sealed && blocks > 0 && !over && (phase === 'coding' || !!mp?.patchActive);
  const standing = view.standings.find((s) => s.teamId === team.id) ?? null;
  const shownStanding = standing && (phase === 'scored' || phase === 'finished') ? standing : null;
  const pos = roundPosition(view.game.rounds, view.game.round);
  const roundLabel = pos.index >= 0 ? pos.label : `R${view.game.round} · 난이도 ${view.game.round}`;
  // 폰: 결과·패치가 오른쪽 열 위에 붙는 동안에는 맵 카드를 접어 블록 칸에 자리를 준다 (바뀌면 key로 다시 정한다)
  const phoneBusy = !!mp?.patchActive || phase === 'running' || phase === 'scored' || phase === 'finished';

  const onSubmitted = (res: SubmitResponse) => {
    setSubmitOpen(false);
    toast('봉인했어요. 실행을 기다려 주세요', 'success');
    patchView((v: GameView) => ({
      ...v,
      myProgram: v.myProgram ? { ...v.myProgram, submittedAt: res.submittedAt, editable: false, patchActive: false } : v.myProgram,
      teams: v.teams.map((t) =>
        t.id === team.id ? { ...t, program: { ...t.program, submittedAt: res.submittedAt, submitOrder: res.submitOrder } } : t),
    }));
    void refresh();
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await api<OkResponse>(API.gameLeave(code), { method: 'POST', body: {} });
      router.push(`/join?code=${code}`);
    } catch (err) {
      toast(err instanceof ApiClientError ? err.message : '역할을 반납하지 못했어요.', 'error');
      setLeaving(false);
    }
  };

  const hint = readOnlyHint(view, sealed);
  const submitLabel = sealed ? '봉인됨' : mp?.patchActive ? '다시 제출' : '제출';
  const submitAria = over ? `제출 불가: 블록 상한 초과 (${blocks}/${cap})` : undefined;
  const submitIcon = sealed ? <IconLock /> : <IconSubmit />;
  const architects = team.people.filter((p) => p.roles.includes('architect')).map((p) => p.displayName);
  const sealedText = sealed
    ? team.program.sealedBy === 'auto'
      ? '시간이 끝나 자동으로 봉인됐어요'
      : team.program.submitOrder
        ? `${team.program.submitOrder}번째로 제출했어요`
        : '제출했어요'
    : null;

  const leaveButton = phase === 'lobby' ? (
    <Button variant="secondary" size="sm" className="max-md:min-h-11" icon={<IconRefresh />} loading={leaving} onClick={() => void leave()}>
      역할 바꾸기
    </Button>
  ) : null;
  const standingLine = shownStanding ? (
    <p className="text-[13px] font-semibold text-violet-ink">
      누적 <span className="font-display tabular-nums">{shownStanding.total}</span>점 ·{' '}
      <span className="font-display tabular-nums">{shownStanding.rank}</span>위
    </p>
  ) : null;

  // 헤더 맥락 (sm 이상): "R4 · 3/5 · 난이도 4" · 팀 색·이름 · 게임 코드
  const context = (
    <span className="inline-flex items-center gap-2">
      <Chip size="sm" tone="violet" mono>{roundLabel}</Chip>
      <span className="inline-flex items-center gap-1.5">
        <TeamDot color={team.color} />
        {team.name}
      </span>
      <span className="text-text-faint">·</span>
      <span>
        게임 <span className="font-mono tabular-nums">{code}</span>
      </span>
    </span>
  );

  // "블록" 패널 머리 줄 (데스크톱): 저장 상태 · 상한 초과 (블록 n/상한은 상단 바, 되돌리기는 편집기가 붙인다)
  const toolbar = (
    <>
      <SaveState saving={sync.saving} editable={editable} sealed={sealed} />
      {over ? <Chip size="sm" tone="danger">상한 초과 {blocks - cap}</Chip> : null}
    </>
  );

  // 팀 패널 아래 액션 칸 (데스크톱)
  const note = submitNote({ isArchitect, architects, sealed, editable, over, blocks, cap });
  const teamActions = (
    <div className="space-y-2.5">
      {isArchitect ? (
        <Button
          size="lg"
          fullWidth
          disabled={!canSubmit}
          onClick={() => setSubmitOpen(true)}
          aria-label={submitAria}
          icon={submitIcon}
        >
          {submitLabel}
        </Button>
      ) : null}
      {sealedText ? (
        <Chip tone="ok" dot>{sealedText}</Chip>
      ) : null}
      {note ? (
        <p className={`text-xs leading-relaxed ${isArchitect && over && editable ? 'text-danger' : 'text-text-dim'}`}>{note}</p>
      ) : null}
      {leaveButton}
    </div>
  );

  const aside = (
    <>
      {/* 폰: 제출 바 */}
      <div className="glass relative flex shrink-0 items-center gap-2 border-t border-stroke px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        <TeamBar team={team} meId={me.userId} />
        {isArchitect ? (
          <Button
            size="lg"
            disabled={!canSubmit}
            onClick={() => setSubmitOpen(true)}
            aria-label={submitAria}
            icon={submitIcon}
          >
            {submitLabel}
          </Button>
        ) : null}
      </div>
      {/* 데스크톱: "팀" 유리 패널 */}
      <TeamPanel className="hidden lg:flex" team={team} meId={me.userId} standing={shownStanding}>
        {teamActions}
      </TeamPanel>
    </>
  );

  return (
    <AppShell
      user={user}
      fluid
      noPadding
      compactHeader
      title={view.map.name}
      context={context}
      right={<PlayStatus view={view} blocks={blocks} serverOffsetMs={serverOffsetMs} status={status} saving={sync.saving} />}
    >
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden">
        {error && error.status === 0 ? (
          <p
            className="flex shrink-0 items-center gap-2 border-b border-warn/30 bg-warn/10 px-3 py-1.5 text-xs font-semibold text-warn lg:px-4"
            role="status"
          >
            <IconWifi size={14} />
            서버와 연결이 끊겼어요. 다시 연결하는 중이에요.
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(280px,30fr)_minmax(0,70fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:p-3 2xl:grid-cols-[minmax(360px,32fr)_minmax(0,68fr)]">
          {/* 데스크톱 왼쪽 열: 맵 + 목표·규칙 */}
          <div className="hidden min-h-0 flex-col gap-3 lg:flex">
            <MapPanel map={view.map} />
            <RulesPanel map={view.map} roles={me.roles} />
          </div>

          {/* 폰: 접이식 맵 (라운드 표기 포함) */}
          <PhoneRoundCard
            key={phoneBusy ? 'round-closed' : 'round-open'}
            defaultOpen={!phoneBusy}
            className="lg:hidden"
            map={view.map}
            roles={me.roles}
            team={team}
            roundLabel={roundLabel}
            extra={standingLine || leaveButton ? (
              <div className="flex flex-wrap items-center gap-2">
                {standingLine}
                {leaveButton}
              </div>
            ) : null}
          />

          {/* 오른쪽 열: (패치 안내·결과) + [블록 | 코드] + [내 카드 | 팀] */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:gap-3">
            {mp?.patchActive ? (
              <p
                className="mx-3 mt-2 flex shrink-0 items-start gap-2 rounded-ctl border border-violet/40 bg-violet-soft px-3 py-1.5 text-[13px] font-medium leading-snug text-text lg:m-0 lg:py-2"
                role="status"
              >
                <IconUnlock size={16} className="mt-px shrink-0 text-violet-ink" />
                {/* 폰은 한 줄로 (블록 칸 자리 확보) */}
                <span className="min-w-0 truncate lg:hidden">패치 허용 · 카드 한 장 고쳐 다시 제출 (−10점)</span>
                <span className="hidden lg:inline">패치가 허용됐어요. 카드 한 장만 고친 뒤 아키텍트가 다시 제출하세요. (패치권 −10점)</span>
              </p>
            ) : null}

            <ResultPanel view={view} />

            <ProgramEditor
              doc={sync.doc}
              editable={editable}
              roles={me.roles}
              onOp={sync.apply}
              onDragActive={sync.setDragging}
              toolbar={toolbar}
              aside={aside}
              header={hint ? (
                <p className="flex max-w-[392px] items-start gap-2 rounded-ctl border border-stroke bg-glass-2 px-3 py-2 text-[13px] leading-snug text-text-dim">
                  <IconInfo size={16} className="mt-px shrink-0 text-text-faint" />
                  {hint}
                </p>
              ) : null}
              overlay={sealed && !mp?.patchActive && phase !== 'running' && phase !== 'scored' && phase !== 'finished' ? (
                <SealedBadge order={team.program.submitOrder} auto={team.program.sealedBy === 'auto'} />
              ) : null}
            />
          </div>
        </div>
      </div>

      {isArchitect && mp ? (
        <SubmitSheet
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          code={code}
          round={view.game.round}
          doc={sync.doc}
          map={view.map}
          patchActive={mp.patchActive}
          beforeSubmit={sync.flushNow}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </AppShell>
  );
}

/** 저장 상태 칩 ("블록" 머리 줄) */
function SaveState({ saving, editable, sealed }: { saving: boolean; editable: boolean; sealed: boolean }) {
  if (saving) return <Chip size="sm" tone="violet" dot pulse role="status">저장 중</Chip>;
  if (editable) {
    return (
      <Chip size="sm">
        <IconCheck size={12} />
        저장됨
      </Chip>
    );
  }
  return (
    <Chip size="sm" tone={sealed ? 'violet' : 'neutral'}>
      <IconLock size={12} />
      {sealed ? '봉인됨' : '읽기 전용'}
    </Chip>
  );
}

/** 팀 패널 제출 칸의 안내 한 줄 */
function submitNote({
  isArchitect, architects, sealed, editable, over, blocks, cap,
}: {
  isArchitect: boolean; architects: string[]; sealed: boolean; editable: boolean; over: boolean; blocks: number; cap: number;
}): string | null {
  if (!isArchitect) {
    return architects.length
      ? `제출은 아키텍트 ${architects.join(', ')} 님이 해요.`
      : '아키텍트가 없어요. 시간이 끝나면 자동으로 봉인돼요.';
  }
  if (sealed || !editable) return null;
  if (over) return `블록이 상한보다 ${blocks - cap}개 많아요. 줄여야 제출할 수 있어요.`;
  if (blocks === 0) return '카드를 연결하면 제출할 수 있어요.';
  return architects.length > 1
    ? '아키텍트 누구나 제출할 수 있어요. 봉인하면 더 못 고치니 팀원과 확인하세요.'
    : '봉인하면 더 못 고쳐요. 팀원과 확인하고 제출하세요.';
}

function readOnlyHint(view: GameView, sealed: boolean): string | null {
  const mp = view.myProgram;
  if (mp?.editable) return null;
  switch (view.game.phase) {
    case 'lobby':
      return '진행자가 라운드를 시작하면 카드를 연결할 수 있어요.';
    case 'coding':
      return sealed ? '봉인됐어요. 실행을 기다려 주세요.' : '지금은 고칠 수 없어요.';
    case 'sealed':
      return '코딩 시간이 끝났어요. 실행을 기다려 주세요.';
    case 'running':
      return '실행 중이에요. 프로젝터를 보세요.';
    case 'scored':
      return '점수 발표 중이에요. 다음 라운드를 기다려 주세요.';
    case 'finished':
      return '게임이 끝났어요. 수고했어요!';
    default:
      return PHASE_LABEL[view.game.phase];
  }
}

/** 봉인 오버레이: 블록 위 반투명 막(나이트 검정 60%, 라이트 옅은 라벤더 bg 70%) + 가운데 유리 카드(자물쇠·문구).
 *  카드는 glass-sheet(나이트 짙은 유리 · 라이트 흰 유리)라 뒤에 깔린 카드 색이 비쳐도 violet-ink 대비가 유지된다. 빛 없음 */
function SealedBadge({ order, auto }: { order: number | null; auto: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/60 px-6 [:root[data-theme=light]_&]:bg-bg/70"
      role="status"
    >
      <div className="glass glass-sheet relative flex flex-col items-center gap-2 rounded-card border border-violet/40 px-7 py-5 text-center shadow-glass">
        <span className="mb-1 grid size-12 place-items-center rounded-full border border-violet/40 bg-violet-soft text-violet-ink">
          <IconLock size={22} />
        </span>
        <p className="text-base font-bold tracking-[-0.02em] text-violet-ink">봉인됨</p>
        <p className="text-[13px] leading-snug text-text-dim">
          {auto ? '시간이 끝나 자동으로 봉인됐어요' : order ? `${order}번째로 제출했어요` : '제출했어요'}
        </p>
      </div>
    </div>
  );
}

function errorTitle(error: ApiClientError): string {
  if (error.status === 404) return '게임을 찾을 수 없어요';
  if (error.status === 403) return '이 게임에 들어갈 수 없어요';
  if (error.status === 401) return '로그인이 필요해요';
  return '게임을 불러오지 못했어요';
}

function Blocked({
  user, code, title, message, action,
}: { user: ShellUser; code: string; title: string; message: string; action?: ReactNode }) {
  return (
    <AppShell user={user} title="팀 편집기">
      <div className="flex flex-1 items-start justify-center pt-6 sm:pt-16">
        <section className="glass relative w-full max-w-md rounded-card border border-stroke px-5 shadow-glass">
          <EmptyState
            icon={<IconAlert />}
            title={title}
            body={message}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {action}
                <Link href={`/join?code=${code}`} className={buttonClass('secondary')}>참가 화면</Link>
                <Link href="/lobby" className={buttonClass('ghost')}>대기실로</Link>
              </div>
            }
          />
        </section>
      </div>
    </AppShell>
  );
}
