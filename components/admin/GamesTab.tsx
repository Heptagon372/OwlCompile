'use client';
// 게임 탭: 모든 게임 목록 + 삭제(접속 중인 화면에는 삭제 알림이 간다).
import Link from 'next/link';
import { useState } from 'react';
import {
  API, ASSIGN_MODE_LABEL, PHASE_LABEL, roundPosition, type GameListResponse, type GameSummary, type OkResponse,
} from '@/lib/contracts';
import { api } from '@/lib/client/api';
import { phaseStatus } from '@/components/lobby/lobbyUtil';
import { Button, buttonClass } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/Chip';
import { IconHost, IconMap, IconRefresh } from '@/components/ui/icons';
import { PanelStat } from '@/components/ui/Panel';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { TBody, Td, TEmpty, Th, THead, Table, Tr } from '@/components/ui/Table';
import { Notice } from '@/components/ui/Text';
import { useToast } from '@/components/ui/Toast';
import { ListPanel } from './ListPanel';
import { ROW_BTN, ROW_BTN_DANGER, errorMessage, formatDateTime, useLoad } from './util';

export function GamesTab() {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<GameListResponse>(API.adminGames);
  const [target, setTarget] = useState<GameSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const games = data?.games ?? [];

  async function doDelete() {
    if (!target) return;
    setBusy(true);
    try {
      await api<OkResponse>(API.adminGame(target.code), { method: 'DELETE' });
      toast(`게임 ${target.code}을 삭제했습니다`, 'success');
      setTarget(null);
      await reload();
    } catch (err) {
      toast(errorMessage(err, '삭제하지 못했습니다.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ListPanel
        title="게임"
        icon={<IconMap />}
        aria-label="게임"
        right={
          <>
            <PanelStat label="전체" value={`${games.length}개`} />
            <Button variant="ghost" size="sm" icon={<IconRefresh />} className={ROW_BTN} aria-label="게임 목록 새로고침" onClick={() => void reload()} disabled={loading}>
              <span className="hidden sm:inline">새로고침</span>
            </Button>
          </>
        }
      >
        {error ? (
          <Notice tone="danger" role="alert" className="m-3.5 flex items-center gap-3">
            <span className="flex-1">{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>다시 시도</Button>
          </Notice>
        ) : (
          <Table className="min-w-[52rem]">
            <THead>
              <Tr hover={false}>
                <Th>코드</Th>
                <Th>진행자</Th>
                <Th>라운드</Th>
                <Th>배정</Th>
                <Th>단계</Th>
                <Th>팀</Th>
                <Th>참가자</Th>
                <Th>만든 시각</Th>
                <Th align="right">동작</Th>
              </Tr>
            </THead>
            <TBody>
              {loading && !data ? (
                <TEmpty colSpan={9}>불러오는 중…</TEmpty>
              ) : games.length === 0 ? (
                <TEmpty colSpan={9}>아직 만든 게임이 없습니다. 진행자 화면에서 새 게임을 만들 수 있습니다.</TEmpty>
              ) : (
                games.map((g) => {
                  const pos = roundPosition(g.rounds, g.round);
                  return (
                  <Tr key={g.code}>
                    <Td mono className="text-[15px] font-semibold tracking-wide text-text">{g.code}</Td>
                    <Td className="whitespace-nowrap">{g.hostName}</Td>
                    <Td mono className="whitespace-nowrap" title={pos.label}>
                      R{g.round}
                      <span className="text-text-faint"> · {pos.step}/{pos.total}</span>
                    </Td>
                    <Td dim className="whitespace-nowrap">{ASSIGN_MODE_LABEL[g.mode]}</Td>
                    <Td className="whitespace-nowrap">
                      <StatusPill status={phaseStatus(g.phase)} size="sm">{PHASE_LABEL[g.phase]}</StatusPill>
                    </Td>
                    <Td mono>{g.teams}</Td>
                    <Td mono>{g.members}명</Td>
                    <Td dim className="whitespace-nowrap">{formatDateTime(g.createdAt)}</Td>
                    <Td align="right" className="whitespace-nowrap">
                      <div className="inline-flex gap-0.5">
                        <Link href={`/host/${g.code}`} className={buttonClass('ghost', ROW_BTN, 'sm')}>
                          <IconHost />
                          콘솔
                        </Link>
                        <Button variant="ghost" size="sm" className={ROW_BTN_DANGER} onClick={() => setTarget(g)}>삭제</Button>
                      </div>
                    </Td>
                  </Tr>
                  );
                })
              )}
            </TBody>
          </Table>
        )}
      </ListPanel>
      <ConfirmSheet
        open={target !== null}
        title={target ? `게임 ${target.code}을 삭제할까요?` : ''}
        message={
          target ? (
            <>
              {target.hostName}의 게임(R{target.round} · {PHASE_LABEL[target.phase]})과 팀·코드·점수가 모두 지워집니다.
              지금 보고 있는 팀 화면과 보드에는 삭제됐다고 표시됩니다. 되돌릴 수 없습니다.
            </>
          ) : null
        }
        confirmLabel="게임 삭제"
        danger
        busy={busy}
        onConfirm={() => void doDelete()}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
