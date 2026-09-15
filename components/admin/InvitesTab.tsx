'use client';
// 초대 탭: 만들기 + 목록(상태 대기/사용됨/만료/취소), 링크 복사, "메모<TAB>링크" 전체 복사, 취소.
import { useMemo, useState } from 'react';
import { ACCOUNT_ROLE_LABEL, API, type InviteListResponse, type InviteRow, type InviteStatus, type OkResponse } from '@/lib/contracts';
import { api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Field';
import { IconAlert, IconCopy, IconInfo, IconLink } from '@/components/ui/icons';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { TBody, Td, TEmpty, Th, THead, Table, Tr } from '@/components/ui/Table';
import { Notice } from '@/components/ui/Text';
import { useToast } from '@/components/ui/Toast';
import { InviteCreateForm } from './InviteCreateForm';
import { ListPanel } from './ListPanel';
import { ROW_BTN, ROW_BTN_DANGER, copyText, errorMessage, formatDate, formatDateTime, useLoad } from './util';

export const INVITE_STATUS_LABEL: Record<InviteStatus, string> = {
  pending: '대기', used: '사용됨', expired: '만료', revoked: '취소',
};
/** 상태 알약 (DESIGN_V4 §3): 대기 호박색 · 사용됨(완료) 초록 · 만료 회색 · 취소 장밋빛 */
const STATUS_TONE: Record<InviteStatus, ChipTone> = {
  pending: 'warn', used: 'ok', expired: 'neutral', revoked: 'danger',
};
const STATUS_ORDER: InviteStatus[] = ['pending', 'used', 'expired', 'revoked'];

type Filter = 'all' | InviteStatus;

function linesOf(rows: InviteRow[]): string {
  return rows.map((r) => `${r.note || '(메모 없음)'}\t${r.url}`).join('\n');
}

export function InvitesTab() {
  const toast = useToast();
  const { data, setData, error, loading, reload } = useLoad<InviteListResponse>(API.adminInvites);
  const [filter, setFilter] = useState<Filter>('all');
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [revoking, setRevoking] = useState<InviteRow | null>(null);
  const [busy, setBusy] = useState(false);

  const invites = useMemo(() => data?.invites ?? [], [data]);
  const shown = filter === 'all' ? invites : invites.filter((i) => i.status === filter);
  const pendingShown = shown.filter((i) => i.status === 'pending');
  const freshRows = invites.filter((i) => fresh.has(i.code) && i.status === 'pending');

  function onCreated(rows: InviteRow[]) {
    setData({ ...(data ?? { invites: [] }), invites: [...rows, ...invites.filter((i) => !rows.some((r) => r.code === i.code))] });
    setFresh(new Set(rows.map((r) => r.code)));
    setFilter('all');
  }

  async function copy(text: string, what: string) {
    const ok = await copyText(text);
    toast(ok ? `${what} 복사했습니다` : '복사하지 못했습니다. 직접 선택해 복사해 주세요', ok ? 'success' : 'error');
  }

  async function doRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await api<OkResponse>(API.adminInviteRevoke(revoking.code), { method: 'POST' });
      toast('초대를 취소했습니다', 'success');
      setRevoking(null);
      await reload();
    } catch (err) {
      toast(errorMessage(err, '취소하지 못했습니다.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const counts = invites.reduce<Record<InviteStatus, number>>(
    (acc, i) => ({ ...acc, [i.status]: acc[i.status] + 1 }),
    { pending: 0, used: 0, expired: 0, revoked: 0 },
  );

  return (
    <div className="flex flex-col gap-3">
      <InviteCreateForm onCreated={onCreated} />
      <LinkOriginNote origin={data?.linkOrigin} kind={data?.linkKind} />

      {freshRows.length > 0 ? (
        <Notice tone="info" role="status" className="flex flex-wrap items-center gap-3">
          <span className="flex-1 text-[13px]">
            방금 만든 초대 <b className="font-mono font-semibold tabular-nums">{freshRows.length}</b>장. 메신저에 붙여 넣을 수 있게 “메모 (탭) 링크” 줄로 복사합니다.
          </span>
          <Button variant="secondary" size="sm" icon={<IconCopy />} className={ROW_BTN} onClick={() => copy(linesOf(freshRows), `초대 ${freshRows.length}장을`)}>
            방금 만든 것 복사
          </Button>
        </Notice>
      ) : null}

      <ListPanel
        title="초대 목록"
        icon={<IconLink />}
        aria-label="초대 목록"
        right={
          <>
            <label htmlFor="invite-filter" className="sr-only">상태로 거르기</label>
            <Select id="invite-filter" size="sm" wrapClassName="w-24 sm:w-28" className="max-md:h-11" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">전체</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{INVITE_STATUS_LABEL[s]}</option>)}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              icon={<IconCopy />}
              className={ROW_BTN}
              aria-label={`대기 중 초대 전체 복사 (${pendingShown.length}장)`}
              disabled={pendingShown.length === 0}
              onClick={() => copy(linesOf(pendingShown), `대기 중 초대 ${pendingShown.length}장을`)}
            >
              <span className="hidden sm:inline">전체 복사</span>
              <span className="font-mono tabular-nums">({pendingShown.length})</span>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3">
          {STATUS_ORDER.map((s) => (
            <Chip key={s} tone={STATUS_TONE[s]} dot size="sm">
              {INVITE_STATUS_LABEL[s]} <span className="font-mono tabular-nums">{counts[s]}</span>
            </Chip>
          ))}
        </div>

        {error ? (
          <Notice tone="danger" role="alert" className="m-3.5 flex items-center gap-3">
            <span className="flex-1">{error}</span>
            <Button variant="secondary" size="sm" onClick={() => void reload()}>다시 시도</Button>
          </Notice>
        ) : (
          <Table className="min-w-[46rem]">
            <THead>
              <Tr hover={false}>
                <Th>메모</Th>
                <Th>역할</Th>
                <Th>상태</Th>
                <Th>코드</Th>
                <Th>만료</Th>
                <Th>가입한 사람</Th>
                <Th align="right">동작</Th>
              </Tr>
            </THead>
            <TBody>
              {loading && !data ? (
                <TEmpty colSpan={7}>불러오는 중…</TEmpty>
              ) : shown.length === 0 ? (
                <TEmpty colSpan={7}>{filter === 'all' ? '아직 만든 초대가 없습니다.' : '이 상태의 초대가 없습니다.'}</TEmpty>
              ) : (
                shown.map((i) => (
                  <Tr key={i.code} className={fresh.has(i.code) ? 'bg-violet-soft/40' : ''}>
                    <Td className="max-w-[14rem] truncate font-semibold" title={i.note}>
                      {i.note || <span className="font-normal text-text-faint">메모 없음</span>}
                    </Td>
                    <Td dim>{ACCOUNT_ROLE_LABEL[i.role]}</Td>
                    <Td>
                      <Chip tone={STATUS_TONE[i.status]} dot size="sm">{INVITE_STATUS_LABEL[i.status]}</Chip>
                    </Td>
                    <Td mono dim className="whitespace-nowrap">{i.code}</Td>
                    <Td dim className="whitespace-nowrap">{i.expiresAt ? formatDate(i.expiresAt) : '없음'}</Td>
                    <Td className="whitespace-nowrap">
                      {i.usedBy ? (
                        <span title={formatDateTime(i.usedAt)}>
                          {i.usedBy.displayName} <span className="font-mono text-xs text-text-faint">@{i.usedBy.username}</span>
                        </span>
                      ) : (
                        <span className="text-text-faint">-</span>
                      )}
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      {i.status === 'pending' ? (
                        <div className="inline-flex gap-0.5">
                          <Button variant="ghost" size="sm" icon={<IconCopy />} className={ROW_BTN} onClick={() => copy(i.url, '링크를')}>링크 복사</Button>
                          <Button variant="ghost" size="sm" className={ROW_BTN_DANGER} onClick={() => setRevoking(i)}>취소</Button>
                        </div>
                      ) : null}
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        )}
      </ListPanel>

      <ConfirmSheet
        open={revoking !== null}
        title="초대를 취소할까요?"
        message={
          revoking ? (
            <>
              <b className="font-semibold text-text">{revoking.note || revoking.code}</b> 초대 링크로는 더 이상 가입할 수 없습니다.
            </>
          ) : null
        }
        confirmLabel="초대 취소"
        confirmVariant="secondary"
        danger
        busy={busy}
        onConfirm={() => void doRevoke()}
        onClose={() => setRevoking(null)}
      />
    </div>
  );
}

/** 초대 링크가 어디서 열리는 주소인지 알려 준다 (localhost 링크를 보내는 실수 방지). 공개 주소면 파랑 안내, 아니면 경고 띠. */
function LinkOriginNote({ origin, kind }: { origin?: string; kind?: InviteListResponse['linkKind'] }) {
  if (!origin || !kind) return null;
  const detail =
    kind === 'public' ? '인터넷에서 열리는 주소입니다.'
      : kind === 'lan' ? '이 PC와 같은 와이파이에 연결된 기기에서만 열립니다. 행사 전에 미리 가입하게 하려면 인터넷에 공개된 서버에 올리고 OWL_PUBLIC_URL을 설정하세요.'
        : kind === 'vpn' ? 'VPN 주소라서 같은 VPN에 연결된 기기에서만 열립니다. 폰에는 보통 와이파이 주소가 필요합니다.'
          : '이 PC에서만 열리는 주소라 다른 기기로 보내면 열리지 않습니다. PC가 와이파이에 연결돼 있는지 확인하세요.';
  const isPublic = kind === 'public';
  return (
    <Notice tone={isPublic ? 'info' : 'warn'} className="flex items-start gap-2.5 py-2.5">
      <span aria-hidden="true" className={`mt-0.5 shrink-0 ${isPublic ? 'text-blue-hover' : 'text-warn'}`}>
        {isPublic ? <IconInfo size={16} /> : <IconAlert size={16} />}
      </span>
      <span className="min-w-0 text-[13px] leading-relaxed">
        <span className="font-semibold text-text">초대 링크 주소</span>{' '}
        <b className="inline-block break-all rounded-ctl bg-glass-inset px-1.5 font-mono text-[12px] font-semibold text-text">{origin}</b>
        <span className="text-text-dim">. {detail}</span>
      </span>
    </Notice>
  );
}
