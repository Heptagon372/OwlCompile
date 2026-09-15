// /admin — 관리자 전용: 초대·회원·게임 관리. 관리자가 아니면 404.
import { requirePageUser } from '@/lib/server/session';
import { AdminApp } from '@/components/admin/AdminApp';
import { AppShell } from '@/components/ui/AppShell';

export const dynamic = 'force-dynamic';
export const metadata = { title: '관리 · OWL COMPILE' };

export default async function AdminPage() {
  const user = await requirePageUser(['admin'], { next: '/admin' });
  return (
    <AppShell user={user} title="관리" context="초대 · 회원 · 게임">
      <AdminApp meId={user.id} />
    </AppShell>
  );
}
