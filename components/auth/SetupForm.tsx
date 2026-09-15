'use client';
// 최초 설정: 첫 관리자 계정 만들기. 성공하면 바로 로그인되어 /admin으로 간다.
import { useState, type FormEvent } from 'react';
import { API, LIMITS, type AuthResponse } from '@/lib/contracts';
import { ApiClientError, api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FormError, TextField } from '@/components/ui/Field';
import { validateAccountFields, type AccountFieldErrors } from './validate';

export function SetupForm() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AccountFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs = validateAccountFields({ username, displayName, password, confirm });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<AuthResponse>(API.setup, { body: { username: username.trim(), displayName: displayName.trim(), password } });
      window.location.assign('/admin');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '계정을 만들지 못했습니다.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        id="setup-username" label="아이디" hint="영문·숫자·밑줄(_) 3~20자" size="lg"
        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={username} onChange={(e) => setUsername(e.target.value)} error={fieldErrors.username} autoFocus
      />
      <TextField
        id="setup-name" label="표시 이름" hint={`화면에 보이는 이름, ${LIMITS.displayNameMax}자까지`} size="lg"
        autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
        error={fieldErrors.displayName}
      />
      <TextField
        id="setup-password" label="비밀번호" type="password" hint={`${LIMITS.passwordMin}자 이상`} size="lg"
        autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      <TextField
        id="setup-confirm" label="비밀번호 확인" type="password" autoComplete="new-password" size="lg"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fieldErrors.confirm}
      />
      <FormError message={error} />
      <Button type="submit" size="lg" fullWidth loading={busy} className="mt-1">
        {busy ? '만드는 중…' : '관리자 계정 만들기'}
      </Button>
    </form>
  );
}
