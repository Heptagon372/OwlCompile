'use client';
// 비밀번호 초기화 결과: 임시 비밀번호를 한 번만 보여 준다.
import { Button } from '@/components/ui/Button';
import { IconCopy } from '@/components/ui/icons';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { copyText } from './util';

export function TempPasswordSheet({
  open, name, password, onClose,
}: { open: boolean; name: string; password: string; onClose: () => void }) {
  const toast = useToast();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="임시 비밀번호"
      footer={
        <>
          <Button
            variant="secondary"
            icon={<IconCopy />}
            className="max-md:h-11"
            onClick={async () => {
              const ok = await copyText(password);
              toast(ok ? '임시 비밀번호를 복사했습니다' : '복사하지 못했습니다. 직접 적어 주세요', ok ? 'success' : 'error');
            }}
          >
            복사
          </Button>
          <Button variant="secondary" onClick={onClose} className="max-md:h-11">다 적었어요</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-text-dim">
        {name}님에게 전해 주세요. 이 창을 닫으면 다시 볼 수 없습니다. 다음 로그인 때 새 비밀번호를 정하게 됩니다.
      </p>
      <p
        className="surface-inset mt-4 select-all rounded-card px-4 py-4 text-center font-mono text-2xl font-bold tracking-wider text-text"
        aria-label="임시 비밀번호"
      >
        {password}
      </p>
    </Sheet>
  );
}
