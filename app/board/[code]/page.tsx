// 프로젝터 보드 (1920×1080). 로그인만 여기서 확인하고, 진행자 권한은 API(/state)가 판단한다.
import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/server/session';
import { BoardClient } from '@/components/board/BoardClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `보드 ${code} · OWL COMPILE` };
}

export default async function BoardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await requirePageUser(['host', 'admin'], { next: `/board/${code}` });
  return <BoardClient code={code} />;
}
