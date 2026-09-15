// /play/[code] 팀 편집기. 로그인만 여기서 확인하고, 게임 소속은 API(/state)가 판단한다.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/server/session';
import { PlayScreen } from '@/components/play/PlayScreen';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: '팀 편집기 · OWL COMPILE' };

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{4}$/.test(code)) notFound();
  const user = await requirePageUser(undefined, { next: `/play/${code}` });
  return <PlayScreen code={code} user={{ displayName: user.displayName, role: user.role }} />;
}
