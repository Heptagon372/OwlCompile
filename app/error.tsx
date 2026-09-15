'use client';
// 페이지 렌더 오류: Next 기본 오류 화면(흰 바탕) 대신 같은 검은 인증 화면 틀 + 다시 시도.
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, buttonClass } from '@/components/ui/Button';
import { IconRefresh } from '@/components/ui/icons';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AuthShell title="화면을 불러오지 못했어요" subtitle="잠시 뒤 다시 시도해 주세요. 계속되면 진행자에게 알려 주세요.">
      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth icon={<IconRefresh />} onClick={() => reset()}>
          다시 시도
        </Button>
        <Link href="/" className={buttonClass('secondary', '', 'lg', true)}>
          홈으로
        </Link>
      </div>
    </AuthShell>
  );
}
