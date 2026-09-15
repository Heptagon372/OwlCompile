// /signup?code= — 초대 코드로 가입. 초대 상태는 서버에서 먼저 확인해 넘긴다.
// 이미 로그인된 사람이 초대 링크를 열면 먼저 로그아웃해야 가입 폼이 보인다 (누구 세션인지와 초대 메모를 보여 준다).
import Link from 'next/link';
import { checkInvite, normalizeInviteCode } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { getCurrentUser } from '@/lib/server/session';
import { AUTH_LINK_CLASS, AuthShell } from '@/components/auth/AuthShell';
import { SignupForm } from '@/components/auth/SignupForm';
import { SignedInSwitch } from '@/components/auth/SignedInSwitch';
import { IconSparkle } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: '가입 · OWL COMPILE' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.code === 'string' ? sp.code.slice(0, 20) : '';
  const code = raw ? normalizeInviteCode(raw) : '';
  const check = code ? checkInvite(code) : null;
  const user = await getCurrentUser();
  const form = <SignupForm initialCode={code} initialCheck={check} />;
  const inviteNote = check?.valid
    ? check.note
      ? <>이 초대는 <b className="font-semibold text-text">{check.note}</b> 님을 위한 것입니다. 새 계정으로 가입하려면 먼저 로그아웃해 주세요.</>
      : '새 계정으로 가입하려면 먼저 로그아웃해 주세요.'
    : code
      ? '이 초대 링크는 지금 쓸 수 없는 상태입니다. 로그아웃하면 자세한 이유를 볼 수 있습니다.'
      : '새 계정으로 가입하려면 먼저 로그아웃해 주세요.';
  return (
    <AuthShell
      title="초대로 가입"
      icon={<IconSparkle />}
      subtitle="관리자가 보낸 초대 링크로만 가입할 수 있습니다. 가입하면 바로 대기실로 들어갑니다."
      footer={
        <p>
          이미 계정이 있나요?{' '}
          <Link href="/login" className={AUTH_LINK_CLASS}>로그인</Link>
        </p>
      }
    >
      {user ? (
        <SignedInSwitch
          displayName={user.displayName}
          username={user.username}
          continueHref={user.mustChangePassword ? '/account' : homePathFor(user)}
          logoutLabel="로그아웃하고 새 계정으로 가입"
          note={inviteNote}
        >
          {form}
        </SignedInSwitch>
      ) : (
        form
      )}
    </AuthShell>
  );
}
