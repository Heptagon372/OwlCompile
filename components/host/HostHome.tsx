'use client';
// /host (DESIGN_V4 §6 · FEATURE_V4 §1–§3):
//   왼쪽 "대기실" = 실시간 대기 인원 링 + 들어온 순서 명단 (useLobby watch: 진행자는 구경만, 대기 명단에 들지 않는다)
//   가운데 "새 게임" = 팀 수 2~10(추천 = ceil(대기/4) 표시) · 라운드 칩 1~10(엔진에 없는 라운드는 '준비 중'으로 잠김) + 프리셋 · 배정 방식 · 팀별 예상 인원 · 만들기
//   오른쪽 "내 게임" = 내가 만든 게임(관리자는 전부) 카드 목록
// 강한 빛은 두 곳만: 만들기 버튼(primary) + 대기 인원 링. 고른 칸은 올라온 유리, 고른 라운드는 옅은 보라 면.
// 만들면 "N명 배정, M명 대기"를 알리고 바로 콘솔(/host/<코드>)로 간다.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_ROUNDS, API, ASSIGN_MODE_LABEL, DEFAULT_ROUNDS, LIMITS, PHASE_LABEL, ROUND_PRESETS, roundPosition, suggestedTeamCount,
  type AssignMode, type CreateGameRequest, type CreateGameResponse, type GameListResponse, type GameSummary, type RoundNo,
} from '@/lib/contracts';
import { api, ApiClientError } from '@/lib/client/api';
import { useLobby } from '@/lib/client/useLobby';
import { useNow } from '@/lib/client/time';
import { useToast } from '@/components/ui/Toast';
import { Button, buttonClass } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { RingProgress } from '@/components/ui/RingProgress';
import { Tabs } from '@/components/ui/Tabs';
import { FormError } from '@/components/ui/Field';
import { EmptyState, Notice } from '@/components/ui/Text';
import {
  IconCheck, IconExternal, IconGrid, IconLayers, IconLobby, IconPlay, IconPlus, IconRefresh,
} from '@/components/ui/icons';
import { PHASE_TONE } from './PhasePanel';
import { LobbyRoster } from './LobbyRoster';
import { TeamSwatch } from './TeamTable';
import { teamColor } from './teamColor';
import { assignSummary, createPreview, presetOf, roundsText, toggleRound, type RoundMeta } from './logic';
import { onRadioKeys } from './roving';

const TEAM_CHOICES = Array.from({ length: LIMITS.maxTeams - LIMITS.minTeams + 1 }, (_, i) => LIMITS.minTeams + i);

function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MODE_TABS = [
  { key: 'auto' as const, label: <>자동 배정<span className="text-[11px] font-semibold opacity-80">추천</span></> },
  { key: 'self' as const, label: '직접 선택' },
];

export function HostHome({ maps }: { maps: readonly RoundMeta[] }) {
  const router = useRouter();
  const toast = useToast();
  const { lobby, status, waitingCount, error: lobbyError, serverNow } = useLobby({ watch: true });
  const tick = useNow(0, 15_000);
  const nowMs = tick == null ? null : serverNow();

  const meta = useMemo(() => new Map(maps.map((m) => [m.round, m])), [maps]);
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** null = 추천값을 따른다 (대기 인원이 바뀌면 같이 바뀐다) */
  const [teamsPick, setTeamsPick] = useState<number | null>(null);
  const [rounds, setRounds] = useState<RoundNo[]>(() => {
    const ok = DEFAULT_ROUNDS.filter((r) => maps.some((m) => m.round === r));
    return ok.length > 0 ? ok : [...DEFAULT_ROUNDS];
  });
  const [mode, setMode] = useState<AssignMode>('auto');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const waiting = lobby?.waiting ?? [];
  const suggested = suggestedTeamCount(waitingCount);
  const teams = teamsPick ?? suggested;
  const preview = createPreview(waitingCount, teams, mode);
  const preset = presetOf(rounds);
  const codingMin = Math.round(rounds.reduce((s, r) => s + (meta.get(r)?.seconds ?? 0), 0) / 60);

  const load = useCallback(async () => {
    try {
      const res = await api<GameListResponse>(API.games);
      setGames(res.games);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiClientError ? err.message : '게임 목록을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 열린 게임(대기실 이벤트)의 페이즈·인원이 바뀌면 내 게임 목록도 다시 받는다
  const openKey = lobby?.openGames.map((g) => `${g.code}:${g.phase}:${g.round}:${g.members}`).join('|');
  useEffect(() => {
    if (openKey !== undefined) void load();
  }, [openKey, load]);

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const body: CreateGameRequest = { teams, rounds, mode };
      const res = await api<CreateGameResponse>(API.games, { method: 'POST', body });
      const summary = assignSummary(res);
      setCreated(
        mode === 'auto'
          ? `게임 ${res.code} · ${summary}`
          : `게임 ${res.code} · ${summary} · 대기 중인 사람은 팀 선택 화면으로 이동합니다`,
      );
      toast(`새 게임 ${res.code} · ${summary}`, 'success');
      router.push(`/host/${res.code}`);
    } catch (err) {
      setCreateError(err instanceof ApiClientError ? err.message : '게임을 만들지 못했습니다.');
      setCreating(false);
    }
  };

  const connection = status === 'live'
    ? <Chip tone="ok" dot size="sm">실시간</Chip>
    : <Chip tone="warn" dot pulse size="sm" role="status">{status === 'connecting' ? '연결 중' : '다시 연결하는 중'}</Chip>;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)_340px] 2xl:grid-cols-[320px_minmax(0,1fr)_400px]">
      {/* ================= 대기실 ================= */}
      <Panel title="대기실" icon={<IconLobby />} right={connection} aria-label="대기실" className="lg:sticky lg:top-[4.5rem]">
        <div className="flex items-center gap-4">
          <RingProgress
            value={Math.min(waitingCount, preview.capacity)}
            max={preview.capacity}
            size={116}
            label={waitingCount}
            sub="명 대기"
            aria-label={`대기 중 ${waitingCount}명, 새 게임 자리 ${preview.capacity}석`}
          />
          <dl className="min-w-0 flex-1 space-y-3">
            <div>
              <dt className="ui-caption">새 게임 자리</dt>
              <dd className="mt-0.5 font-display text-lg font-bold leading-tight tabular-nums text-text">
                {preview.capacity}
                <span className="ml-1 font-sans text-xs font-medium text-text-faint">석 · {teams}팀 × {LIMITS.maxMembersPerTeam}명</span>
              </dd>
            </div>
            <div>
              <dt className="ui-caption">추천 팀 수</dt>
              <dd className="mt-0.5 text-xs text-text-faint">
                <span className="font-display text-lg font-bold leading-tight tabular-nums text-violet-ink">{suggested}</span>
                <span className="ml-1 text-text-dim">팀</span> · 대기 ÷ 4
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="ui-caption">들어온 순서</h3>
          {waitingCount > 0 ? <span className="text-[11px] text-text-faint">기다린 시간</span> : null}
        </div>
        {lobby ? (
          <LobbyRoster
            waiting={waiting}
            nowMs={nowMs}
            className="-mx-2 mt-1.5 max-h-[min(48vh,440px)]"
            emptyText="아직 기다리는 사람이 없습니다. 참가자가 로그인해 대기실을 열면 여기에 바로 나타납니다."
          />
        ) : lobbyError ? (
          <FormError message={lobbyError.message} className="mt-2" />
        ) : (
          <p className="mt-2 text-[13px] text-text-faint" role="status">대기실을 불러오는 중…</p>
        )}
      </Panel>

      {/* ================= 새 게임 ================= */}
      <Panel
        title="새 게임"
        icon={<IconPlus />}
        aria-label="새 게임"
        right={<span className="hidden text-xs text-text-faint sm:inline">팀 이름·색은 순서대로 정해집니다</span>}
      >
        {/* ---- 팀 수 ---- */}
        {/* @container: 칸 수를 화면 폭이 아니라 패널 폭으로 (1280~1535px 에서 패널이 ~324px → 5칸, 넓으면 9칸) */}
        <section aria-labelledby="ng-teams" className="@container">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
            <h3 id="ng-teams" className="ui-label">팀 수</h3>
            <div className="flex items-center gap-2">
              {teamsPick != null && teamsPick !== suggested ? (
                <Button variant="ghost" size="sm" className="max-md:min-h-11" onClick={() => setTeamsPick(null)}>추천값 {suggested}팀으로</Button>
              ) : null}
              <Chip tone="violet" size="sm">추천 {suggested}팀</Chip>
            </div>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="ng-teams"
            onKeyDown={onRadioKeys}
            className="mt-2.5 grid grid-cols-5 gap-1.5 rounded-track border border-stroke bg-glass-inset p-1.5 shadow-[inset_0_1px_2px_var(--inset-shade-2)] @[30rem]:grid-cols-9"
          >
            {TEAM_CHOICES.map((n) => {
              const on = teams === n;
              const rec = n === suggested;
              // 빛·그림자는 모드 토큰 (나이트 값 = v4 그대로, Tabs 의 올라온 칸과 같은 값). 추천 칸 보라 링은
              // 라이트에서 밝은 홈 위 3:1 이 되게 짙은 violet 으로 바꾼다 (나이트 규칙은 그대로)
              const ring = rec
                ? 'shadow-[inset_0_0_0_1px_rgba(155,107,255,0.6),inset_0_1px_0_var(--sheen-3)] [:root[data-theme=light]_&]:shadow-[inset_0_0_0_1px_rgba(106,61,240,0.7),inset_0_1px_0_var(--sheen-3)]'
                : on ? 'shadow-[inset_0_0_0_1px_var(--color-stroke-strong),inset_0_1px_0_var(--sheen-3),0_4px_14px_var(--shadow-soft)]' : '';
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  aria-label={`${n}팀${rec ? ' (추천)' : ''}`}
                  onClick={() => setTeamsPick(n)}
                  className={`flex h-12 flex-col items-center justify-center rounded-ctl font-display text-[15px] font-bold leading-none tabular-nums transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-ink ${
                    on ? 'bg-glass-2 text-text' : 'text-text-dim hover:bg-tint/[0.05] hover:text-text'
                  } ${ring}`}
                >
                  {n}
                  <span aria-hidden="true" className={`mt-1 font-sans text-[11px] font-semibold ${rec ? 'text-violet-ink' : 'text-text-faint'}`}>
                    {rec ? '추천' : '팀'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ---- 라운드 ---- */}
        {/* @container: 칩 칸 수를 화면 폭이 아니라 이 패널 폭으로 정한다 (xl 1280에서 패널이 ~324px) */}
        <section aria-labelledby="ng-rounds" className="@container mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="ng-rounds" className="ui-label">라운드</h3>
            <span className="text-xs text-text-dim">
              <span className="font-mono font-semibold text-text">{rounds.length}</span>개 · 코딩 시간 합계 약{' '}
              <span className="font-mono font-semibold text-text">{codingMin}</span>분
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="라운드 프리셋">
            {ROUND_PRESETS.map((p) => {
              const ok = p.rounds.every((r) => meta.has(r));
              const on = preset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!ok}
                  onClick={() => setRounds([...p.rounds])}
                  className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink disabled:cursor-not-allowed disabled:opacity-40 md:h-9 ${
                    on ? 'border-violet/50 bg-violet/15 text-text' : 'border-stroke-strong bg-glass-2 text-text-dim hover:border-tint/30 hover:text-text'
                  }`}
                >
                  {p.label}
                  <span className={`font-mono text-[11px] ${on ? 'text-violet-ink' : 'text-text-faint'}`}>{roundsText(p.rounds)}</span>
                </button>
              );
            })}
            {preset == null ? <Chip tone="violet" size="sm" className="self-center">직접 조합</Chip> : null}
          </div>
          {/* 라운드 칩 10개: 폰 4열(3줄) → 컨테이너 27rem 이상 5열(2줄). 맵이 없는 라운드는 '준비 중'으로 잠긴다 (ROUNDS_8_10 §4) */}
          <div className="mt-2.5 grid grid-cols-4 gap-1.5 @[27rem]:grid-cols-5" role="group" aria-label="라운드 1~10 (라운드 번호 = 난이도)">
            {ALL_ROUNDS.map((r) => {
              const m = meta.get(r);
              const on = rounds.includes(r);
              const last = on && rounds.length === 1;
              const title = !m
                ? '아직 준비되지 않은 라운드입니다'
                : `R${r} ${m.name} · 난이도 ${r}(${m.difficulty}) · 상한 ${m.cap}블록 · ${Math.round(m.seconds / 60)}분${last ? ' · 라운드는 하나 이상 골라야 합니다' : ''}`;
              return (
                <button
                  key={r}
                  type="button"
                  aria-pressed={on}
                  disabled={!m}
                  aria-disabled={last || undefined}
                  title={title}
                  aria-label={m ? `R${r} ${m.name}, 난이도 ${r}` : `R${r} 준비 중`}
                  onClick={() => {
                    if (!last) setRounds((rs) => toggleRound(rs, r));
                  }}
                  className={`flex h-16 flex-col justify-between rounded-inset border px-2.5 py-2 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? 'border-violet/50 bg-violet/15' : 'border-stroke bg-tint/[0.02] hover:border-stroke-strong hover:bg-tint/[0.05]'
                  } ${last ? 'cursor-default' : ''}`}
                >
                  <span className="flex w-full items-center justify-between gap-1">
                    <span className={`font-display text-[15px] font-bold leading-none ${on ? 'text-text' : 'text-text-dim'}`}>R{r}</span>
                    <span
                      aria-hidden="true"
                      className={`grid size-4 shrink-0 place-items-center rounded-full ${on ? 'bg-violet-grad text-white' : 'border border-stroke-input'}`}
                    >
                      {on ? <IconCheck size={10} strokeWidth={2.6} /> : null}
                    </span>
                  </span>
                  <span className={`w-full truncate text-[11px] leading-tight ${on ? 'text-violet-ink' : 'text-text-faint'}`}>
                    {m?.name ?? '준비 중'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            라운드 번호가 곧 난이도입니다. 고른 라운드만 순서대로 진행합니다:{' '}
            <span className="font-mono text-text">{rounds.map((r) => `R${r}`).join(' → ')}</span>
          </p>
        </section>

        {/* ---- 배정 방식 ---- */}
        <section aria-labelledby="ng-mode" className="mt-6">
          <h3 id="ng-mode" className="ui-label">배정 방식</h3>
          <Tabs className="mt-2.5" fullWidth size="lg" tabs={MODE_TABS} value={mode} onChange={setMode} aria-label="배정 방식" />
          <p className="mt-2 text-xs leading-relaxed text-text-dim">
            {mode === 'auto'
              ? '대기 중인 사람을 들어온 순서대로 팀에 돌아가며 넣고, 팀마다 네 역할이 모두 채워지게 나눕니다. 폰은 바로 팀 편집기로 이동합니다.'
              : '대기 중인 사람은 게임이 만들어지는 순간 팀·역할 선택 화면으로 이동해 직접 고릅니다.'}
          </p>
        </section>

        {/* ---- 미리보기 ---- */}
        <section aria-labelledby="ng-preview" className="@container mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="ng-preview" className="ui-label">팀별 예상 인원</h3>
            <span className="text-xs text-text-dim" aria-live="polite">
              {mode === 'auto' ? (
                <>
                  <span className="font-mono font-semibold text-text">{preview.placed}</span>명 배정 ·{' '}
                  <span className={`font-mono font-semibold ${preview.leftWaiting > 0 ? 'text-warn' : 'text-text'}`}>{preview.leftWaiting}</span>명 대기
                </>
              ) : (
                <>참가자가 직접 고릅니다 · 대기 <span className="font-mono font-semibold text-text">{waitingCount}</span>명</>
              )}
            </span>
          </div>
          <ol className="mt-2.5 grid gap-1.5 @[27rem]:grid-cols-2" aria-label="만들어질 팀">
            {preview.teams.map((t) => (
              <li key={t.name} className="flex h-11 items-center gap-2.5 rounded-ctl border border-stroke bg-tint/[0.02] px-3">
                <TeamSwatch color={t.color} size={10} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{t.name}</span>
                {mode === 'auto' ? (
                  <>
                    <Seats n={t.size} color={t.color} />
                    <span className="w-9 text-right font-mono text-xs tabular-nums text-text-dim">{t.size}명</span>
                  </>
                ) : (
                  <span className="text-xs text-text-faint">최대 {LIMITS.maxMembersPerTeam}명</span>
                )}
              </li>
            ))}
          </ol>
          {mode === 'auto' && preview.leftWaiting > 0 ? (
            <Notice tone="warn" role="status" className="mt-2.5 text-[13px]">
              자리가 부족합니다. 팀당 최대 {LIMITS.maxMembersPerTeam}명이라 {preview.leftWaiting}명은 대기실에 남습니다.
              팀 수를 늘리거나 나중에 콘솔에서 더 데려오세요.
            </Notice>
          ) : null}
          {mode === 'auto' && preview.emptyTeams > 0 ? (
            <Notice className="mt-2.5 text-[13px]">
              빈 팀 {preview.emptyTeams}개가 생깁니다. 나중에 대기실에 들어오는 사람이 사람이 적은 팀부터 채웁니다.
            </Notice>
          ) : null}
          {mode === 'auto' && waitingCount === 0 ? (
            <Notice className="mt-2.5 text-[13px]">
              지금 대기 중인 사람이 없습니다. 게임을 만든 뒤 대기실에 들어오는 사람은 사람이 가장 적은 팀에 자동으로 들어갑니다.
            </Notice>
          ) : null}
        </section>

        <FormError message={createError} className="mt-5" />
        {created ? (
          <Notice tone="ok" role="status" className="mt-5 text-[13px]">
            {created} · 콘솔로 이동합니다…
          </Notice>
        ) : null}
        <Button
          size="lg"
          fullWidth
          className="mt-5 h-14! text-base!"
          icon={<IconPlus />}
          loading={creating}
          onClick={create}
        >
          {creating ? '만드는 중…' : `${teams}팀 · ${rounds.length}라운드 게임 만들기`}
        </Button>
        <p className="mt-2 text-center text-xs text-text-faint">
          {mode === 'auto'
            ? `만드는 순간 대기 중인 ${preview.placed}명의 폰이 각자 팀 편집기로 이동합니다.`
            : '만드는 순간 대기 중인 사람들의 폰이 팀 선택 화면으로 이동합니다.'}
        </p>
      </Panel>

      {/* ================= 내 게임 ================= */}
      <Panel
        title="내 게임"
        icon={<IconLayers />}
        aria-label="내 게임"
        className="lg:col-span-2 xl:col-span-1"
        noPadding
        right={
          <Button variant="ghost" size="sm" icon={<IconRefresh />} className="max-md:min-h-11" onClick={() => void load()}>
            새로고침
          </Button>
        }
      >
        {loadError ? <FormError message={loadError} className="mx-5 mb-3" /> : null}
        {games == null && !loadError ? <p className="px-5 pb-5 text-[13px] text-text-faint" role="status">불러오는 중…</p> : null}
        {games && games.length === 0 ? (
          <EmptyState compact icon={<IconGrid />} title="아직 만든 게임이 없습니다" body="새 게임을 만들면 여기에서 다시 열 수 있습니다." className="px-5" />
        ) : null}
        {games && games.length > 0 ? (
          <ul className="flex flex-col gap-2 px-3 pb-3 lg:grid lg:grid-cols-2 xl:flex xl:flex-col" aria-label="내 게임 목록">
            {games.map((g) => <GameCard key={g.code} g={g} />)}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}

/** 팀 자리 6칸: 들어갈 사람만큼 팀 색으로 채운다 */
function Seats({ n, color }: { n: number; color: string }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: LIMITS.maxMembersPerTeam }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-1.5 rounded-full ${i < n ? '' : 'bg-tint/[0.08] [:root[data-theme=light]_&]:bg-tint/[0.14]'}`}
          style={i < n ? { background: teamColor(color) } : undefined}
        />
      ))}
    </span>
  );
}

function GameCard({ g }: { g: GameSummary }) {
  const finished = g.phase === 'finished';
  const pos = roundPosition(g.rounds, g.round);
  return (
    <li className={`rounded-inset border border-stroke bg-tint/[0.025] p-3.5 transition-colors duration-150 hover:border-stroke-strong ${finished ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[18px] font-bold leading-none tracking-[0.1em] tabular-nums text-text">{g.code}</span>
        <Chip tone={PHASE_TONE[g.phase]} dot size="sm">{finished ? '종료' : PHASE_LABEL[g.phase]}</Chip>
        <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-text-faint">{dateTime(g.createdAt)}</span>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim">
        <span className="font-mono">{finished ? roundsText(g.rounds) : `R${g.round} · ${pos.step}/${pos.total}`}</span>
        <span aria-hidden="true" className="text-text-faint">·</span>
        <span>{ASSIGN_MODE_LABEL[g.mode]}</span>
        <span aria-hidden="true" className="text-text-faint">·</span>
        <span>{g.teams}팀 {g.members}명</span>
        {g.hostName ? (
          <>
            <span aria-hidden="true" className="text-text-faint">·</span>
            <span className="max-w-[9rem] truncate">{g.hostName}</span>
          </>
        ) : null}
      </p>
      <div className="mt-3 flex gap-2">
        <Link href={`/host/${g.code}`} className={buttonClass('secondary', 'flex-1 max-md:min-h-11', 'sm')}>
          <IconPlay />
          진행하기
        </Link>
        <a
          href={`/board/${g.code}`}
          target="_blank"
          rel="noopener"
          className={buttonClass('ghost', 'max-md:min-h-11', 'sm')}
          aria-label={`게임 ${g.code} 보드 열기 (새 탭)`}
        >
          <IconExternal />
          보드
        </a>
      </div>
    </li>
  );
}
