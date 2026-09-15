'use client';
// 홈의 "게임 코드로 참가" 카드 (DESIGN_V4 §6): 유리 카드 + 4자리 게임 코드 입력 → /join?code=.
// 기본 길은 대기실(자동 배정)이고, 이 카드는 보조 수단이다 (FEATURE_V4 §3 5번).
import { GameCodeForm } from '@/components/lobby/GameCodeForm';
import { FeatureCard } from '@/components/ui/Cards';
import { IconJoin } from '@/components/ui/icons';

export function JoinCodeCard({ className = '' }: { className?: string }) {
  return (
    <FeatureCard
      id="join-card"
      icon={<IconJoin />}
      title="게임 코드로 참가"
      titleAs="h3"
      description="진행자가 알려 준 게임 코드 4자리로 바로 들어갈 수도 있어요."
      className={className}
    >
      <GameCodeForm id="join-code" className="mt-auto" />
    </FeatureCard>
  );
}
