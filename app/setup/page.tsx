// /setup — 사용자가 0명일 때만 첫 관리자 계정을 만든다. 1명 이상이면 404.
import { notFound } from 'next/navigation';
import { needsSetup } from '@/lib/server/auth';
import { AuthShell } from '@/components/auth/AuthShell';
import { SetupForm } from '@/components/auth/SetupForm';
import { IconAdmin } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: '처음 설정 · OWL COMPILE' };

export default function SetupPage() {
  if (!needsSetup()) notFound();
  return (
    <AuthShell
      title="처음 설정"
      icon={<IconAdmin />}
      subtitle="관리자 계정을 하나 만듭니다. 이 화면은 계정이 하나도 없을 때만 열리고, 다른 사람은 관리자가 보낸 초대 링크로 가입합니다."
    >
      <SetupForm />
    </AuthShell>
  );
}
