'use client';
// 진행자 콘솔 오른쪽 "선택한 팀" (DESIGN_V4 §5·§6, FEATURE_V4 §2·§4):
// 빠진 역할 경고("아키텍트 없음"), 네온 코드 뷰(파이썬 기본, 코드만 보여 주고 실행하지 않는다) + validate 결과,
// 결과·점수 줄 표, 패치 허용·재실행·보너스 폼, 팀원(사람마다 역할 여러 개) + 팀·역할 바꾸기(POST /assign)·내보내기(POST /kick).
import { useMemo, useState } from 'react';
import { API, LIMITS, type GameView, type TeamPersonView, type TeamView } from '@/lib/contracts';
import { validate } from '@/lib/engine/validate';
import { CodeView } from '@/components/code/CodeView';
import { Button } from '@/components/ui/Button';
import { Panel, PanelStat } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Field';
import { Notice, SectionTitle } from '@/components/ui/Text';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { IconAlert, IconArrowRight, IconCheck, IconLogout, IconPlus, IconRefresh, IconUnlock, IconUsers } from '@/components/ui/icons';
import { OUTCOME_LABEL, canAssignIn, canPatchOutcome, rerunState, rolesText, type HostAction } from './logic';
import { OUTCOME_TONE, TeamSwatch } from './TeamTable';
import { teamColor } from './teamColor';
import { AssignSheet, KickSheet, RoleChip, type AssignTarget } from './MemberTools';

/** 줄 번호 거터가 있는 코드 패널 (정답: 한국어 toText 문자열) */
export function CodeLines({ lines, label, className = '', maxHeight = 360 }: {
  lines: readonly string[]; label: string; className?: string; maxHeight?: number;
}) {
  const w = Math.max(2, String(lines.length).length);
  return (
    <pre
      className={`surface-inset overflow-auto rounded-inset py-2 font-mono text-[13px] leading-6 ${className}`}
      style={{ maxHeight }}
      tabIndex={0}
      aria-label={label}
    >
      {lines.map((l, i) => (
        <div key={i} className="flex gap-3 px-3 hover:bg-tint/[0.03]">
          <span className="gutter-num shrink-0 leading-6" style={{ width: `${w}ch` }}>{i + 1}</span>
          <span className="whitespace-pre text-text">{l}</span>
        </div>
      ))}
    </pre>
  );
}

export function TeamDetail({
  view, team, busy, act, highlightPath = null,
}: {
  view: GameView;
  team: TeamView;
  busy: boolean;
  act: HostAction;
  /** 이 팀이 보드에서 재생 중이면 현재 실행 줄 (Step.path). 아니면 null */
  highlightPath?: readonly number[] | null;
}) {
  const { game, map } = view;
  const code = game.code;
  const program = view.programs?.[team.id];
  const doc = useMemo(() => program?.doc ?? [], [program]);
  const check = useMemo(() => validate(doc, map), [doc, map]);
  const result = view.results.find((r) => r.teamId === team.id) ?? null;
  // 재생 중에는 trace의 path가 가리키는 코드(= 이 결과를 실제로 만든 doc)를 보여 주고 실행 줄을 강조한다
  const playing = highlightPath !== null && !!result?.doc;
  const running = game.phase === 'running';
  const assignOpen = canAssignIn(game.phase);

  const canPatch = running && !!result && canPatchOutcome(result.outcome) && team.patchLeft > 0 && !team.patchActive;
  // 패치 허용 순간 서버가 usedPatch=1로 바꾸므로 usedPatch && 패치권 0장이 "패치 중" 상태다
  const rerun = rerunState(game.phase, result, team);
  const showRerun = rerun !== 'hidden';

  const [kick, setKick] = useState<TeamPersonView | null>(null);
  const [move, setMove] = useState<AssignTarget | null>(null);
  const [sheetSeq, setSheetSeq] = useState(0);
  const [confirmPatch, setConfirmPatch] = useState(false);
  // 서버는 보너스를 "더한다". 입력칸은 더할 점수이므로 비워서 시작한다 (현재 합계는 라벨에 따로 보여 준다)
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const pointsNum = Number(points);
  const pointsOk =
    points.trim() !== '' && Number.isInteger(pointsNum) && pointsNum !== 0 && Math.abs(pointsNum) <= LIMITS.bonusMaxAbs;
  const pointsInvalid = points.trim() !== '' && !pointsOk;

  const patch = async () => {
    await act(API.gamePatch(code), { teamId: team.id }, `${team.name} 팀 편집기를 열었습니다`);
    setConfirmPatch(false);
  };

  const overCap = check.blocks > map.cap;
  const noArchitect = team.missingRoles.includes('architect');
  const otherMissing = team.missingRoles.filter((r) => r !== 'architect');
  const showRoleWarning = assignOpen && team.missingRoles.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-4" aria-label={`${team.name} 팀 상세`}>
      {/* ---- 팀 · 코드 ---- */}
      <Panel
        title={<span className="text-text">{team.name}</span>}
        icon={<TeamSwatch color={team.color} size={12} />}
        right={
          <>
            {team.patchActive ? <Chip tone="warn" dot size="sm">패치 중</Chip> : null}
            <PanelStat label="패치권" value={`${team.patchLeft}장`} tone={team.patchLeft === 0 ? 'warn' : 'normal'} />
          </>
        }
        // 윗변 팀 색 2px + 유리 패널 그림자 토큰 (나이트: v4 의 검정 .45 그림자 그대로, 토큰의 윗변 반사 1px 은 2px 팀 색 아래라 안 보인다)
        style={{ boxShadow: `inset 0 2px 0 ${teamColor(team.color)}, var(--shadow-glass)` }}
      >
        {showRoleWarning ? (
          <Notice tone={noArchitect ? 'danger' : 'warn'} role="status" className="mb-3 text-[13px]">
            {team.people.length === 0 ? (
              <p className="font-semibold">아직 아무도 없는 팀입니다. 대기실에서 데려오거나 다른 팀에서 옮기세요.</p>
            ) : (
              <>
                {noArchitect ? (
                  <p className="flex items-start gap-1.5 font-semibold">
                    <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                    아키텍트 없음 · 제출할 사람이 없어 타이머가 끝나면 지금 코드로 자동 봉인됩니다.
                  </p>
                ) : null}
                {otherMissing.length > 0 ? (
                  <p className={noArchitect ? 'mt-1 text-text-dim' : 'font-semibold'}>
                    비어 있는 역할: {rolesText(otherMissing)} · 그 역할의 블록을 놓을 사람이 없습니다.
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-text-dim">아래 팀원에서 역할을 더 맡기거나 다른 팀에서 옮기세요.</p>
              </>
            )}
          </Notice>
        ) : null}

        {program ? (
          <CodeView
            program={playing && result?.doc ? result.doc : doc}
            highlightPath={playing ? highlightPath : null}
            animate={!playing}
            defaultLang="python"
            title="코드"
            aria-label={`${team.name} 팀 코드`}
            className="max-h-[min(46vh,400px)]"
            emptyText="# 아직 블록이 없습니다"
            headerRight={<PanelStat label="블록" value={`${check.blocks}/${map.cap}`} tone={overCap ? 'danger' : 'normal'} className="hidden sm:inline-flex" />}
          />
        ) : (
          <p className="surface-inset rounded-inset p-4 text-[13px] text-text-faint">이 라운드 코드가 아직 없습니다.</p>
        )}
        {program ? (
          check.ok ? (
            <p className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium text-ok">
              <IconCheck size={16} />
              제출할 수 있는 코드입니다.
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-1 text-[13px] text-danger" aria-label="검사 결과">
              {check.errors.map((e) => (
                <li key={e} className="flex items-start gap-1.5">
                  <IconAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Panel>

      {/* ---- 결과 · 점수 · 패치 · 재실행 · 보너스 ---- */}
      {result ? (
        <Panel
          title={`R${result.round} 결과`}
          right={<PanelStat label="실행 순서" value={`${result.runOrder}번째`} />}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={OUTCOME_TONE[result.outcome]}>{OUTCOME_LABEL[result.outcome]}</Chip>
            <p className="min-w-0 flex-1 text-[15px] font-semibold text-text">{result.message}</p>
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-text-dim">
            <PanelStat label="틱" value={result.ticks} />
            <PanelStat label="쥐" value={`${result.mice}마리`} />
            <PanelStat label="블록" value={result.blocks} />
            {result.usedPatch ? <Chip tone="neutral" size="sm">패치 후 재실행</Chip> : null}
          </p>

          <table className="mt-3 w-full border-collapse text-[13px]" aria-label="점수 줄">
            <tbody>
              {result.scoreLines.map((l, i) => (
                <tr key={i} className="h-9 border-b border-stroke last:border-b-0">
                  <td className="py-1.5 pr-3 text-text-dim">{l.label}</td>
                  <td className={`py-1.5 text-right font-display font-semibold tabular-nums ${l.points < 0 ? 'text-danger' : 'text-text'}`}>
                    {l.points > 0 ? '+' : ''}{l.points}
                  </td>
                </tr>
              ))}
              {result.bonus !== 0 ? (
                <tr className="h-9 border-b border-stroke">
                  <td className="py-1.5 pr-3 text-text-dim">{result.bonusNote || '보너스'}</td>
                  <td className="py-1.5 text-right font-display font-semibold tabular-nums text-text">{result.bonus > 0 ? '+' : ''}{result.bonus}</td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t border-stroke-strong">
                <td className="pt-2.5 text-sm font-semibold text-text">합계</td>
                <td className="pt-2.5 text-right font-display text-2xl font-bold leading-none tracking-[-0.02em] tabular-nums text-text">{result.score + result.bonus}<span className="ml-1 font-sans text-xs font-normal tracking-normal text-text-dim">점</span></td>
              </tr>
            </tfoot>
          </table>

          {canPatch || showRerun ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-stroke pt-3">
              {canPatch ? (
                <Button variant="secondary" fullWidth className="max-md:min-h-11" icon={<IconUnlock />} disabled={busy} onClick={() => setConfirmPatch(true)}>
                  패치 허용
                </Button>
              ) : null}
              {showRerun ? (
                <>
                  <Button
                    variant="secondary"
                    fullWidth
                    className="max-md:min-h-11"
                    icon={<IconRefresh />}
                    disabled={busy || rerun !== 'ready'}
                    onClick={() => void act(API.gameRerun(code), { teamId: team.id }, `${team.name} 팀을 다시 실행했습니다`)}
                  >
                    재실행
                  </Button>
                  {rerun === 'waiting' ? <p className="text-xs text-text-dim">팀이 코드를 고쳐 다시 제출하면 누를 수 있습니다.</p> : null}
                </>
              ) : null}
            </div>
          ) : null}

          <form
            className="mt-3 flex flex-col gap-2 border-t border-stroke pt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pointsOk) return;
              const ok = await act(API.gameBonus(code), { teamId: team.id, points: pointsNum, note: note.trim() }, '보너스 점수를 더했습니다');
              if (ok) {
                setPoints('');
                setNote('');
              }
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <SectionTitle className="mb-0">보너스 점수 더하기</SectionTitle>
              <PanelStat label="현재" value={`${result.bonus > 0 ? '+' : ''}${result.bonus}점`} display />
            </div>
            <p className="-mt-1 text-xs text-text-faint">이벤트 카드 등. 더할 점수를 넣습니다 (빼려면 음수).</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`bonus-${team.id}`}>점수</label>
              <Input
                id={`bonus-${team.id}`}
                type="number"
                inputMode="numeric"
                step={1}
                min={-LIMITS.bonusMaxAbs}
                max={LIMITS.bonusMaxAbs}
                placeholder="+10 / -5"
                value={points}
                mono
                invalid={pointsInvalid}
                aria-describedby={pointsInvalid ? `bonus-${team.id}-error` : undefined}
                onChange={(e) => setPoints(e.target.value)}
                className="w-28! shrink-0"
              />
              <label className="sr-only" htmlFor={`bonus-note-${team.id}`}>메모</label>
              <Input
                id={`bonus-note-${team.id}`}
                type="text"
                maxLength={40}
                placeholder="예: 코드 리뷰 +10"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-w-0 flex-1"
              />
            </div>
            {pointsInvalid ? (
              <p id={`bonus-${team.id}-error`} role="alert" className="text-xs text-danger">
                −{LIMITS.bonusMaxAbs}~{LIMITS.bonusMaxAbs} 사이 정수(0 제외)로 넣어 주세요.
              </p>
            ) : null}
            <Button type="submit" variant="secondary" fullWidth className="max-md:min-h-11" icon={<IconPlus />} disabled={busy || !pointsOk}>
              보너스 더하기
            </Button>
          </form>
        </Panel>
      ) : null}

      {/* ---- 팀원 (사람마다 역할 여러 개) ---- */}
      <Panel
        title="팀원"
        icon={<IconUsers />}
        right={<PanelStat label="인원" value={`${team.people.length}/${LIMITS.maxMembersPerTeam}`} tone={team.people.length >= LIMITS.maxMembersPerTeam ? 'warn' : 'normal'} />}
        noPadding
      >
        {team.people.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-text-faint">아직 아무도 참가하지 않았습니다.</p>
        ) : (
          <ul className="flex flex-col px-2 pb-2">
            {team.people.map((p) => (
              <li key={p.userId} className="flex min-h-14 items-center gap-3 rounded-ctl px-3 py-2 transition-colors duration-150 hover:bg-tint/[0.03]">
                <span className="relative shrink-0">
                  <Avatar name={p.displayName} size={32} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-bg ${p.online ? 'bg-ok' : 'bg-text-faint'}`}
                    role="img"
                    aria-label={p.online ? '접속 중' : '접속 안 함'}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-text">{p.displayName}</span>
                  <span className="mt-1 flex flex-wrap gap-1" aria-label={`역할 ${rolesText(p.roles)}`}>
                    {p.roles.map((r) => <RoleChip key={r} role={r} />)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<IconArrowRight />}
                    disabled={busy || !assignOpen}
                    title={assignOpen ? '다른 팀으로 옮기거나 역할을 바꿉니다' : '대기실·코딩 중에만 옮길 수 있습니다'}
                    aria-label={`${p.displayName} 님 팀·역할 바꾸기`}
                    className="max-md:min-h-11"
                    onClick={() => {
                      setSheetSeq((n) => n + 1);
                      setMove({ userId: p.userId, displayName: p.displayName, teamId: team.id, roles: p.roles });
                    }}
                  >
                    <span className="hidden 2xl:inline">옮기기</span>
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<IconLogout />}
                    disabled={busy}
                    aria-label={`${p.displayName} 님 내보내기`}
                    className="max-md:min-h-11"
                    onClick={() => {
                      setSheetSeq((n) => n + 1);
                      setKick(p);
                    }}
                  >
                    <span className="hidden 2xl:inline">내보내기</span>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!assignOpen && team.people.length > 0 ? (
          <p className="px-5 pb-4 text-xs text-text-faint">팀·역할 바꾸기는 대기실·코딩 중에만 됩니다.</p>
        ) : null}
      </Panel>

      {kick ? (
        <KickSheet
          key={`kick|${kick.userId}|${sheetSeq}`}
          person={kick}
          teamName={team.name}
          busy={busy}
          onClose={() => setKick(null)}
          onKick={async (body) => {
            const ok = await act(API.gameKick(code), body, `${kick.displayName} 님을 내보냈습니다`);
            if (ok) setKick(null);
          }}
        />
      ) : null}
      {move ? (
        <AssignSheet
          key={`move|${move.userId}|${sheetSeq}`}
          target={move}
          teams={view.teams}
          initialTeamId={team.id}
          rolesFor={() => move.roles}
          busy={busy}
          onClose={() => setMove(null)}
          onSubmit={async (teamId, roles) => {
            const to = view.teams.find((t) => t.id === teamId);
            const msg = teamId === team.id
              ? `${move.displayName} 님의 역할을 ${rolesText(roles)}(으)로 바꿨습니다`
              : `${move.displayName} 님을 ${to?.name ?? ''} 팀으로 옮겼습니다`;
            const ok = await act(API.gameAssign(code), { userId: move.userId, teamId, roles }, msg);
            if (ok) setMove(null);
          }}
        />
      ) : null}
      <ConfirmSheet
        open={confirmPatch}
        title={`${team.name} 팀에 패치를 허용할까요?`}
        message="패치권 1장을 쓰고 이 팀 편집기만 다시 열립니다. 팀이 고쳐서 다시 제출하면 재실행하세요. 재실행 점수에서 10점이 빠집니다."
        confirmLabel="패치 허용"
        busy={busy}
        onConfirm={() => void patch()}
        onClose={() => setConfirmPatch(false)}
      />
    </div>
  );
}
