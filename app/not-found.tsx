// 404 (notFound(): 사용자가 있는데 /setup, 관리자가 아닌 /admin, 잘못된 게임 코드, 없는 주소).
// Next 기본 404 는 인라인 style 로 body 를 흰 바탕으로 칠해 라이트 테마가 된다 (DESIGN_V3 §6 금지) → 같은 검은 인증 화면 틀.
// 새 경로가 아니라 기존 404 응답의 모양만 바꾼다. 서버 데이터·사용자 조회 없음.
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { buttonClass } from '@/components/ui/Button';
import { IconChevronRight } from '@/components/ui/icons';

export const metadata = { title: '페이지를 찾을 수 없어요 · OWL COMPILE' };

export default function NotFound() {
  return (
    <AuthShell
      title="페이지를 찾을 수 없어요"
      subtitle="주소가 틀렸거나, 이 계정으로는 열 수 없는 화면이에요."
    >
      <Link href="/" className={buttonClass('secondary', '', 'lg', true)}>
        홈으로
        <IconChevronRight />
      </Link>
    </AuthShell>
  );
}
