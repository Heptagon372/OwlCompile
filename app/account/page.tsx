// /account — 내 계정 정보와 비밀번호 변경 (DESIGN_V4 §6: 유리 카드, 둥근 입력, 알약 버튼).
// 관리자가 초기화했으면 여기서 바꾸기 전엔 다른 화면으로 못 간다.
import Link from 'next/link';
import { ACCOUNT_ROLE_LABEL } from '@/lib/contracts';
import { safeNextPath } from '@/lib/server/auth';
import { requirePageUser } from '@/lib/server/session';
import { PasswordForm } from '@/components/auth/PasswordForm';
import { AppShell } from '@/components/ui/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { buttonClass } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconAccount, IconChevronLeft, IconKey, IconLobby } from '@/components/ui/icons';
import { Panel } from '@/components/ui/Panel';
import { Notice } from '@/components/ui/Text';

export const dynamic = 'force-dynamic';
export const metadata = { title: '내 계정 · OWL COMPILE' };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePageUser(undefined, { next: '/account', allowMustChange: true });
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === 'string' ? sp.next : null);
  const forced = user.mustChangePassword;
  return (
    <AppShell user={user} title={forced ? '새 비밀번호 정하기' : '내 계정'}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pt-1 md:pt-3">
        {forced ? (
          <Notice tone="info" role="status">
            관리자가 비밀번호를 초기화했습니다. 받은 임시 비밀번호를 넣고 새 비밀번호를 정해야 계속할 수 있습니다.
          </Notice>
        ) : null}
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Panel title="계정 정보" icon={<IconAccount />}>
            <div className="flex items-center gap-4">
              <Avatar name={user.displayName} size="xl" />
              <dl className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-y-2.5 text-sm">
                <dt className="text-text-dim">아이디</dt>
                <dd className="truncate font-mono text-[13px] text-text">{user.username}</dd>
                <dt className="text-text-dim">표시 이름</dt>
                <dd className="truncate font-semibold text-text">{user.displayName}</dd>
                <dt className="text-text-dim">역할</dt>
                <dd>
                  <Chip tone={user.role === 'admin' ? 'violet' : user.role === 'host' ? 'blue' : 'neutral'} size="sm">
                    {ACCOUNT_ROLE_LABEL[user.role]}
                  </Chip>
                </dd>
              </dl>
            </div>
            {!forced && user.role === 'player' ? (
              <Link href="/lobby" className={buttonClass('secondary', 'mt-5', 'md', true)}>
                <IconLobby />
                대기실로
              </Link>
            ) : null}
          </Panel>
          <Panel title="비밀번호 바꾸기" icon={<IconKey />} tone={forced ? 'active' : 'default'}>
            <PasswordForm forced={forced} next={next} />
            <p className="mt-3 text-[13px] text-text-faint">바꾸면 다른 기기에서는 로그아웃됩니다.</p>
          </Panel>
        </div>
        {!forced ? (
          <Link
            href="/"
            className="inline-flex h-11 w-fit items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-text-dim transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink"
          >
            <IconChevronLeft size={16} />
            홈으로
          </Link>
        ) : null}
      </div>
    </AppShell>
  );
}
