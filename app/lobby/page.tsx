// /lobby 대기실 (FEATURE_V4 §3, DESIGN_V4 §6): 로그인한 참가자가 기다리는 곳.
// 이미 끝나지 않은 게임의 팀원이면 바로 그 게임(/play/<코드>)으로 보낸다. 나머지는 LobbyScreen 이 실시간으로 처리한다.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { activeGameOf } from '@/lib/server/game';
import { requirePageUser } from '@/lib/server/session';
import { AppShell } from '@/components/ui/AppShell';
import { LobbyScreen } from '@/components/lobby/LobbyScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '대기실 · OWL COMPILE' };

export default async function LobbyPage() {
  const user = await requirePageUser(undefined, { next: '/lobby' });
  const my = activeGameOf(user.id);
  if (my) redirect(`/play/${my.code}`);
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role }} title="대기실" context="진행자가 게임을 만들면 자동으로 입장합니다">
      <LobbyScreen displayName={user.displayName} accountRole={user.role} />
    </AppShell>
  );
}
