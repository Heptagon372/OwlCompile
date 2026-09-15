// 진행자 홈 (DESIGN_V4 §6): 대기실 · 새 게임 · 내 게임. 로그인·계정 역할만 여기서 확인하고 목록은 API가 준다.
// 서버 컴포넌트: 라운드 칩에 쓸 맵 이름·난이도·상한·시간만 MAP_LIST 에서 골라 넘긴다. 정답(SOLUTIONS·ROUND_EXTRAS)은 가져오지 않는다.
import type { Metadata } from 'next';
import { requirePageUser } from '@/lib/server/session';
import { MAP_LIST } from '@/lib/engine/maps';
import { AppShell } from '@/components/ui/AppShell';
import { HostHome } from '@/components/host/HostHome';
import type { RoundMeta } from '@/components/host/logic';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '진행자 · OWL COMPILE' };

export default async function HostPage() {
  const user = await requirePageUser(['host', 'admin'], { next: '/host' });
  const maps: RoundMeta[] = MAP_LIST.map((m) => ({
    round: m.round,
    name: m.name,
    difficulty: m.difficulty,
    cap: m.cap,
    seconds: m.seconds,
  }));
  return (
    <AppShell user={{ displayName: user.displayName, role: user.role }} title="진행자" context="대기실 · 새 게임 · 내 게임" fluid>
      <HostHome maps={maps} />
    </AppShell>
  );
}
