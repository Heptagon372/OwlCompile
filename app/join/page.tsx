// /join 게임 참가: 게임 코드 → 팀(n/6) → 역할(여러 개, 이미 누가 맡은 역할도 공유 가능) → /play/[code]. 7번째 사람은 409 team_full
import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/server/session';
import { AppShell } from '@/components/ui/AppShell';
import { JoinScreen } from '@/components/play/JoinScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '게임 참가 · OWL COMPILE' };

export default async function JoinPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  const code = raw && /^\d{4}$/.test(raw) ? raw : '';
  const user = await requirePageUser(undefined, { next: code ? `/join?code=${code}` : '/join' });
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role }} title="게임 참가">
      <JoinScreen initialCode={code} />
    </AppShell>
  );
}
