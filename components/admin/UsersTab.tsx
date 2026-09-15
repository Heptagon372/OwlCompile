'use client';
// 회원 탭: 목록 + 역할 변경 · 사용 중지/재개 · 비밀번호 초기화 · 삭제. 모두 확인 시트를 거친다.
import { useState } from 'react';
import {
  ACCOUNT_ROLE_LABEL, API,
  type AccountRole, type AdminUserListResponse, type AdminUserRow, type OkResponse, type ResetPasswordResponse,
} from '@/lib/contracts';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Field';
import { IconRefresh, IconUsers } from '@/components/ui/icons';
import { PanelStat } from '@/components/ui/Panel';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { TBody, Td, TEmpty, Th, THead, Table, Tr } from '@/components/ui/Table';
import { Notice } from '@/components/ui/Text';
import { useToast } from '@/components/ui/Toast';
import { ListPanel } from './ListPanel';
import { TempPasswordSheet } from './TempPasswordSheet';
import { ROW_BTN, ROW_BTN_DANGER, errorMessage, formatDate, formatDateTime, useLoad } from './util';

type Action =
  | { kind: 'role'; user: AdminUserRow; role: AccountRole }
  | { kind: 'status'; user: AdminUserRow }
  | { kind: 'reset'; user: AdminUserRow }
  | { kind: 'delete'; user: AdminUserRow };

const ROLES: AccountRole[] = ['player', 'host', 'admin'];

function confirmText(a: Action): { title: string; message: string; label: string; danger: boolean } {
  const name = `${a.user.displayName}(@${a.user.username})`;
  switch (a.kind) {
    case 'role':
      return {
        title: `역할을 ${ACCOUNT_ROLE_LABEL[a.role]}(으)로 바꿀까요?`,
        message: a.role === 'admin'
          ? `${name}님이 초대·회원·게임을 모두 관리할 수 있게 됩니다.`
          : `${name}님의 역할이 ${ACCOUNT_ROLE_LABEL[a.user.role]}에서 ${ACCOUNT_ROLE_LABEL[a.role]}(으)로 바뀝니다.`,
        label: '역할 바꾸기',
        danger: false,
      };
    case 'status':
      return a.user.status === 'active'
        ? { title: '사용을 중지할까요?', message: `${name}님은 바로 로그아웃되고, 다시 로그인할 수 없습니다. 언제든 재개할 수 있습니다.`, label: '사용 중지', danger: true }
        : { title: '사용을 재개할까요?', message: `${name}님이 다시 로그인할 수 있게 됩니다.`, label: '재개', danger: false };
    case 'reset':
      return {
        title: '비밀번호를 초기화할까요?',
        message: `${name}님의 로그인이 모두 끊기고 임시 비밀번호가 한 번만 표시됩니다. 다음 로그인 때 새 비밀번호를 정해야 합니다.`,
        label: '초기화',
        danger: true,
      };
    case 'delete':
      return {
        title: '회원을 삭제할까요?',
        message: `${name}님의 계정과 게임 참가 기록이 지워집니다. 되돌릴 수 없습니다.`,
        label: '삭제',
        danger: true,
      };
  }
}

export function UsersTab({ meId }: { meId: string }) {
  const toast = useToast();
  const { data, error, loading, reload } = useLoad<AdminUserListResponse>(API.adminUsers);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ user: AdminUserRow; password: string } | null>(null);
  const users = data?.users ?? [];

  async function run() {
    if (!action) return;
    setBusy(true);
    const u = action.user;
    try {
      if (action.kind === 'role') {
        await api<OkResponse>(API.adminUser(u.id), { method: 'PATCH', body: { role: action.role } });
        toast('역할을 바꿨습니다', 'success');
      } else if (action.kind === 'status') {
        const status = u.status === 'active' ? 'disabled' : 'active';
        await api<OkResponse>(API.adminUser(u.id), { method: 'PATCH', body: { status } });
        toast(status === 'disabled' ? '사용을 중지했습니다' : '사용을 재개했습니다', 'success');
      } else if (action.kind === 'reset') {
        const res = await api<ResetPasswordResponse>(API.adminUserResetPassword(u.id), { method: 'POST' });
        setTemp({ user: u, password: res.tempPassword });
      } else {
        await api<OkResponse>(API.adminUser(u.id), { method: 'DELETE' });
        toast('회원을 삭제했습니다', 'success');
      }
      setAction(null);
      await reload();
    } catch (err) {
      toast(errorMessage(err, '처리하지 못했습니다.'), 'error');
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  const c = action ? confirmText(action) : null;
  return (
    <>
      <ListPanel
        title="회원"
        icon={<IconUsers />}
        aria-label="회원"
        right={
          <>
            <PanelStat label="전체" value={`${users.length}명`} />
            <Button variant="ghost" size="sm" icon={<IconRefresh />} className={ROW_BTN} aria-label="회원 목록 새로고침" onClick={() => void reload()} disabled={loading}>
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
          <Table className="min-w-[60rem]">
            <THead>
              <Tr hover={false}>
                <Th>이름</Th>
                <Th>역할</Th>
                <Th>상태</Th>
                <Th>가입일</Th>
                <Th>마지막 로그인</Th>
                <Th>초대 메모</Th>
                <Th align="right">동작</Th>
              </Tr>
            </THead>
            <TBody>
              {loading && !data ? (
                <TEmpty colSpan={7}>불러오는 중…</TEmpty>
              ) : users.length === 0 ? (
                <TEmpty colSpan={7}>회원이 없습니다.</TEmpty>
              ) : (
                users.map((u) => {
                  const self = u.id === meId;
                  return (
                    <Tr key={u.id} muted={u.status === 'disabled'}>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={u.displayName} size="xs" className={u.status === 'disabled' ? 'opacity-50' : ''} />
                          <span className={`font-semibold ${u.status === 'disabled' ? 'text-text-dim' : 'text-text'}`}>{u.displayName}</span>
                          <span className="font-mono text-xs text-text-faint">@{u.username}</span>
                          {self ? <Chip tone="violet" size="sm">나</Chip> : null}
                        </span>
                      </Td>
                      <Td>
                        <label htmlFor={`role-${u.id}`} className="sr-only">{u.displayName} 역할</label>
                        <Select
                          id={`role-${u.id}`}
                          size="sm"
                          wrapClassName="w-24"
                          className="max-md:h-11"
                          value={u.role}
                          disabled={self}
                          title={self ? '자기 역할은 바꿀 수 없습니다' : undefined}
                          onChange={(e) => setAction({ kind: 'role', user: u, role: e.target.value as AccountRole })}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ACCOUNT_ROLE_LABEL[r]}</option>)}
                        </Select>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {u.status === 'active' ? (
                            <Chip tone="ok" dot size="sm">사용 중</Chip>
                          ) : (
                            <Chip tone="danger" dot size="sm">중지됨</Chip>
                          )}
                          {u.mustChangePassword ? <Chip tone="warn" size="sm">비밀번호 변경 대기</Chip> : null}
                        </span>
                      </Td>
                      <Td dim className="whitespace-nowrap">{formatDate(u.createdAt)}</Td>
                      <Td dim className="whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '없음'}</Td>
                      <Td dim className="max-w-[10rem] truncate" title={u.inviteNote ?? ''}>{u.inviteNote || '-'}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        {self ? (
                          <span className="text-xs text-text-faint">내 계정</span>
                        ) : (
                          <div className="inline-flex gap-0.5">
                            <Button variant="ghost" size="sm" className={ROW_BTN} onClick={() => setAction({ kind: 'status', user: u })}>
                              {u.status === 'active' ? '사용 중지' : '재개'}
                            </Button>
                            <Button variant="ghost" size="sm" className={ROW_BTN} onClick={() => setAction({ kind: 'reset', user: u })}>비밀번호 초기화</Button>
                            <Button variant="ghost" size="sm" className={ROW_BTN_DANGER} onClick={() => setAction({ kind: 'delete', user: u })}>삭제</Button>
                          </div>
                        )}
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
        open={action !== null}
        title={c?.title ?? ''}
        message={c?.message}
        confirmLabel={c?.label ?? '확인'}
        danger={c?.danger}
        confirmVariant="secondary"
        busy={busy}
        onConfirm={() => void run()}
        onClose={() => setAction(null)}
      />
      <TempPasswordSheet
        open={temp !== null}
        name={temp ? `${temp.user.displayName}(@${temp.user.username})` : ''}
        password={temp?.password ?? ''}
        onClose={() => setTemp(null)}
      />
    </>
  );
}
