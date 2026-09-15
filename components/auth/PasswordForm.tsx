'use client';
// 비밀번호 변경. forced면 관리자가 초기화한 뒤라 바꾸기 전에는 다른 화면으로 갈 수 없다.
import { useState, type FormEvent } from 'react';
import { API, LIMITS, type AuthResponse } from '@/lib/contracts';
import { ApiClientError, api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FormError, TextField } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { passwordError } from './validate';

export function PasswordForm({ forced, next }: { forced: boolean; next: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errs, setErrs] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const fe: typeof errs = {};
    if (!current) fe.current = forced ? '받은 임시 비밀번호를 입력해 주세요.' : '지금 비밀번호를 입력해 주세요.';
    const pe = passwordError(pw);
    if (pe) fe.next = pe;
    else if (pw === current) fe.next = '지금과 다른 비밀번호를 입력해 주세요.';
    if (!fe.next && pw !== confirm) fe.confirm = '비밀번호가 서로 다릅니다.';
    setErrs(fe);
    if (Object.keys(fe).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<AuthResponse>(API.password, { body: { current, next: pw } });
      toast('비밀번호를 바꿨습니다', 'success');
      if (forced) {
        window.location.assign(next);
        return;
      }
      setCurrent('');
      setPw('');
      setConfirm('');
      setBusy(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'bad_current_password') setErrs({ current: err.message });
      else setError(err instanceof ApiClientError ? err.message : '비밀번호를 바꾸지 못했습니다.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        id="pw-current" label={forced ? '임시 비밀번호' : '지금 비밀번호'} type="password" size="lg"
        autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)}
        error={errs.current} autoFocus={forced}
      />
      <TextField
        id="pw-next" label="새 비밀번호" type="password" hint={`${LIMITS.passwordMin}자 이상`} size="lg"
        autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={errs.next}
      />
      <TextField
        id="pw-confirm" label="새 비밀번호 확인" type="password" autoComplete="new-password" size="lg"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errs.confirm}
      />
      <FormError message={error} />
      <Button type="submit" size="lg" fullWidth loading={busy} className="mt-1">
        {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
      </Button>
    </form>
  );
}
