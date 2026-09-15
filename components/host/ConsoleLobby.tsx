'use client';
// 진행자 콘솔 왼쪽 "대기실" 카드 (FEATURE_V4 §3 진행자 도구): lobby·coding 중에만.
// 대기 인원 + 명단(useLobby watch: 진행자는 구경만) + "대기실에서 더 데려오기"(POST /pull, 자동 배정 규칙, 이 게임에서 나간 사람 제외)
// + 사람마다 "넣기"(POST /assign: 고른 팀·역할로. 내보냈던 사람도 넣을 수 있다).
import { useState } from 'react';
import { API, LIMITS, type GameView, type PullResponse } from '@/lib/contracts';
import { useLobby } from '@/lib/client/useLobby';
import { useNow } from '@/lib/client/time';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { Chip } from '@/components/ui/Chip';
import { IconLobby, IconPlus, IconUsers } from '@/components/ui/icons';
import { LobbyRoster } from './LobbyRoster';
import { AssignSheet, type AssignTarget } from './MemberTools';
import { fewestTeam, newcomerRoles, pullMessage, type HostAction } from './logic';

export function ConsoleLobby({
  view, busy, act, selectedTeamId,
}: {
  view: GameView;
  busy: boolean;
  act: HostAction;
  /** 넣기 기본 팀 (지금 오른쪽에 열린 팀) */
  selectedTeamId: string | null;
}) {
  const code = view.game.code;
  const { lobby, status, waitingCount, serverNow } = useLobby({ watch: true });
  const tick = useNow(0, 15_000);
  const nowMs = tick == null ? null : serverNow();
  const [target, setTarget] = useState<AssignTarget | null>(null);
  const [seq, setSeq] = useState(0);

  const waiting = lobby?.waiting ?? [];
  const selected = view.teams.find((t) => t.id === selectedTeamId) ?? null;
  // 선택한 팀이 가득 찼으면 사람이 가장 적은 팀
  const initialTeam = selected && selected.people.length < LIMITS.maxMembersPerTeam ? selected : fewestTeam(view.teams);

  const pull = () => void act(API.gamePull(code), {}, (res: PullResponse) => pullMessage(res));

  return (
    <Panel
      title="대기실"
      icon={<IconLobby />}
      aria-label="대기실"
      right={
        status === 'live'
          ? <Chip tone="ok" dot size="sm">실시간</Chip>
          : <Chip tone="warn" dot pulse size="sm">{status === 'connecting' ? '연결 중' : '다시 연결하는 중'}</Chip>
      }
    >
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums text-text">{waitingCount}</span>
        <span className="text-[13px] text-text-dim">명 대기 중</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-text-faint">
        데려오면 사람이 적은 팀부터 넣고, 팀마다 비어 있는 역할을 먼저 맡깁니다.
      </p>

      <Button
        variant="secondary"
        fullWidth
        className="mt-3"
        icon={<IconUsers />}
        disabled={busy || waitingCount === 0}
        onClick={pull}
      >
        대기실에서 더 데려오기
      </Button>

      <LobbyRoster
        waiting={waiting}
        nowMs={nowMs}
        label="대기 명단"
        className="-mx-2 mt-3 max-h-60"
        emptyText="기다리는 사람이 없습니다. 참가자가 대기실을 열면 여기에 나타납니다."
        action={(u) => (
          <Button
            variant="ghost"
            size="sm"
            icon={<IconPlus />}
            disabled={busy || view.teams.length === 0}
            aria-label={`${u.displayName} 님을 팀에 넣기`}
            className="max-md:min-h-11"
            onClick={() => {
              setSeq((n) => n + 1);
              setTarget({ userId: u.userId, displayName: u.displayName, teamId: null, roles: [] });
            }}
          >
            넣기
          </Button>
        )}
      />

      {target ? (
        <AssignSheet
          key={`${target.userId}|${seq}`}
          target={target}
          teams={view.teams}
          initialTeamId={initialTeam?.id ?? null}
          rolesFor={newcomerRoles}
          busy={busy}
          onClose={() => setTarget(null)}
          onSubmit={async (teamId, roles) => {
            const team = view.teams.find((t) => t.id === teamId);
            const ok = await act(
              API.gameAssign(code),
              { userId: target.userId, teamId, roles },
              `${target.displayName} 님을 ${team?.name ?? ''} 팀에 넣었습니다`,
            );
            if (ok) setTarget(null);
          }}
        />
      ) : null}
    </Panel>
  );
}
