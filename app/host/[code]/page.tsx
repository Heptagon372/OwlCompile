// 진행자 콘솔 (데스크톱). 로그인·계정 역할만 여기서 확인하고, 이 게임의 진행자인지는 API가 판단한다.
// 셸(AppShell)은 HostConsole 안에서 그린다: 헤더 맥락(라운드·맵·코드)과 연결 상태가 게임 뷰에서 나오기 때문.
import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/server/session';
import { HostConsole } from '@/components/host/HostConsole';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `진행 ${code} · OWL COMPILE` };
}

export default async function HostConsolePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requirePageUser(['host', 'admin'], { next: `/host/${code}` });
  return <HostConsole code={code} user={{ displayName: user.displayName, role: user.role }} />;
}
