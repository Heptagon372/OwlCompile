// /login — 아이디·비밀번호 로그인. ?next=는 같은 사이트 상대 경로만 따른다.
// 이미 로그인돼 있으면 조용히 넘기지 않고 "이 계정으로 계속 / 로그아웃하고 다른 계정으로" 패널을 보여 준다.
import { redirect } from 'next/navigation';
import { needsSetup, safeNextPath } from '@/lib/server/auth';
import { homePathFor } from '@/lib/server/game';
import { getCurrentUser } from '@/lib/server/session';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignedInSwitch } from '@/components/auth/SignedInSwitch';
import { IconKey } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: '로그인 · OWL COMPILE' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === 'string' ? sp.next : null);
  if (needsSetup()) redirect('/setup');
  const user = await getCurrentUser();
  const form = <LoginForm next={next} />;
  // "이 계정으로 계속": ?next=가 없으면 서버 규칙대로 (게임 팀원 → /play/<코드>, 참가자 → /lobby, 진행자 → /)
  const after = user && next === '/' ? homePathFor(user) : next;
  return (
    <AuthShell
      title="로그인"
      icon={<IconKey />}
      subtitle="가입할 때 정한 아이디와 비밀번호를 입력하세요."
      footer={<p>계정이 없나요? 관리자에게 받은 초대 링크를 열어 가입해 주세요.</p>}
    >
      {user ? (
        <SignedInSwitch
          displayName={user.displayName}
          username={user.username}
          continueHref={user.mustChangePassword ? `/account?next=${encodeURIComponent(after)}` : after}
          logoutLabel="로그아웃하고 다른 계정으로 로그인"
        >
          {form}
        </SignedInSwitch>
      ) : (
        form
      )}
    </AuthShell>
  );
}
