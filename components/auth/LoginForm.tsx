'use client';
// 로그인 폼. 성공하면 next(같은 사이트 경로)로, 비밀번호 변경이 필요하면 /account로 간다.
import { useState, type FormEvent } from 'react';
import { API, type AuthResponse } from '@/lib/contracts';
import { ApiClientError, api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FormError, TextField } from '@/components/ui/Field';

export function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResponse>(API.login, { body: { username: username.trim(), password } });
      // ?next=가 없으면(기본 '/') 서버가 알려 준 갈 곳: 게임 팀원 → /play/<코드>, 참가자 → /lobby (FEATURE_V4 §3)
      const target = next && next !== '/' ? next : res.redirect || '/';
      const dest = res.user.mustChangePassword ? `/account?next=${encodeURIComponent(target)}` : target;
      window.location.assign(dest);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '로그인하지 못했습니다.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <TextField
        id="login-username"
        label="아이디"
        size="lg"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoFocus
      />
      <TextField
        id="login-password"
        label="비밀번호"
        size="lg"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <FormError message={error} />
      <Button type="submit" size="lg" fullWidth loading={busy} className="mt-1">
        {busy ? '확인 중…' : '로그인'}
      </Button>
    </form>
  );
}
