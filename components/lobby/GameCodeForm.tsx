'use client';
// "게임 코드로 참가" 보조 입력 (FEATURE_V4 §3 5번): 숫자 4자리 → /join?code=<코드>.
// 대기실·홈에서 쓴다. 유리 입력(12px) + 보조 알약 버튼 (주 버튼 빛은 화면의 다른 곳에 남겨 둔다).
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { IconArrowRight } from '@/components/ui/icons';
import { cleanGameCode, isGameCode } from './lobbyUtil';

export function GameCodeForm({
  id = 'game-code', className = '', disabled = false, label = '게임 코드 4자리',
}: {
  id?: string;
  className?: string;
  disabled?: boolean;
  /** 화면 읽기용 라벨 */
  label?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isGameCode(code)) {
      setError('진행자가 알려 준 숫자 4자리를 입력해 주세요.');
      return;
    }
    router.push(`/join?code=${code}`);
  }

  const errId = `${id}-error`;
  return (
    <div className={className}>
      <form onSubmit={onSubmit} className="flex gap-2" noValidate>
        <label htmlFor={id} className="sr-only">{label}</label>
        <Input
          id={id}
          size="lg"
          mono
          inputMode="numeric"
          autoComplete="off"
          pattern="[0-9]*"
          maxLength={4}
          placeholder="0000"
          value={code}
          disabled={disabled}
          onChange={(e) => {
            setCode(cleanGameCode(e.target.value));
            setError(null);
          }}
          invalid={!!error}
          aria-describedby={error ? errId : undefined}
          className="min-w-0 flex-1 text-center font-semibold text-[20px]! tracking-[0.35em]!"
        />
        <Button type="submit" variant="secondary" size="lg" className="px-5" disabled={disabled || code.length !== 4} iconRight={<IconArrowRight />}>
          참가
        </Button>
      </form>
      {error ? (
        <p id={errId} role="alert" className="mt-2 text-[13px] font-medium text-danger">{error}</p>
      ) : null}
    </div>
  );
}
