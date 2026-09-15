'use client';
// 이미 로그인된 사람이 /login·/signup을 열었을 때: 누구 세션인지 보여 주고 "이 계정으로 계속" 또는
// "로그아웃하고 다른 계정으로" 중에서 고르게 한다. 로그아웃하면 같은 자리에 children(로그인·가입 폼)을 보여 준다.
// 로그아웃은 fetch POST(브라우저가 Origin을 붙인다 → 서버 Origin 검사 통과) + Accept: application/json.
import { useState, type ReactNode } from 'react';
import { API } from '@/lib/contracts';
import { Avatar } from '@/components/ui/Avatar';
import { Button, buttonClass } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Field';

export function SignedInSwitch({
  displayName, username, continueHref, logoutLabel, note, children,
}: {
  displayName: string;
  username: string;
  /** "이 계정으로 계속"이 갈 곳 (서버가 safeNextPath로 거른 값) */
  continueHref: string;
  logoutLabel: string;
  /** 패널에 덧붙일 설명 (예: 초대 메모) */
  note?: ReactNode;
  /** 로그아웃한 뒤 보여 줄 폼 */
  children: ReactNode;
}) {
  const [state, setState] = useState<'signedIn' | 'busy' | 'signedOut'>('signedIn');
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (state === 'busy') return;
    setState('busy');
    setError(null);
    try {
      const res = await fetch(API.logout, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('signedOut');
    } catch {
      setError('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setState('signedIn');
    }
  }

  if (state === 'signedOut') return <>{children}</>;

  return (
    <section aria-label="지금 로그인한 계정" className="flex flex-col gap-3">
      <div className="surface-inset flex gap-3 rounded-inset p-4">
        <Avatar name={displayName} size="md" />
        <div className="min-w-0">
          <p className="leading-relaxed text-text">
            지금 <b className="font-semibold">{displayName}</b> (<span className="font-mono text-[13px]">{username}</span>) 계정으로 로그인되어 있습니다.
          </p>
          {note ? <div className="mt-1.5 text-[13px] leading-relaxed text-text-dim">{note}</div> : null}
        </div>
      </div>
      <FormError message={error} />
      <a href={continueHref} className={buttonClass('primary', 'mt-1', 'lg', true)}>이 계정으로 계속</a>
      <Button variant="secondary" size="lg" fullWidth loading={state === 'busy'} onClick={() => void logout()}>
        {state === 'busy' ? '로그아웃하는 중…' : logoutLabel}
      </Button>
    </section>
  );
}
