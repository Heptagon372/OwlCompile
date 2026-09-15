'use client';
// 초대 코드로 가입: 초대 확인 → 아이디·표시 이름·비밀번호 → 가입과 동시에 로그인.
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ACCOUNT_ROLE_LABEL, API, LIMITS, type AuthResponse, type InviteCheckResponse } from '@/lib/contracts';
import { ApiClientError, api } from '@/lib/client/api';
import { Button, buttonClass } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { FormError, TextField } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Text';
import { INVITE_REASON_TEXT, INVITE_ROLE_TEXT } from './inviteText';
import { validateAccountFields, type AccountFieldErrors } from './validate';

function normalizeCode(raw: string): string {
  const v = raw.trim().toUpperCase().replace(/[\s_]/g, '');
  return /^[A-Z0-9]{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : v;
}

export function SignupForm({ initialCode, initialCheck }: { initialCode: string; initialCheck: InviteCheckResponse | null }) {
  const [code, setCode] = useState(initialCode);
  const [check, setCheck] = useState<InviteCheckResponse | null>(initialCheck);
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  async function onCheck(e: FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)) {
      setCodeError('초대 코드는 XXXX-XXXX 모양입니다.');
      return;
    }
    setChecking(true);
    setCodeError(null);
    try {
      const res = await api<InviteCheckResponse>(API.invite(c));
      setCode(c);
      setCheck(res);
      window.history.replaceState(null, '', `/signup?code=${encodeURIComponent(c)}`);
    } catch (err) {
      setCodeError(err instanceof ApiClientError ? err.message : '초대를 확인하지 못했습니다.');
    } finally {
      setChecking(false);
    }
  }

  if (!check) {
    return (
      <form onSubmit={onCheck} className="flex flex-col gap-4" noValidate>
        <TextField
          id="signup-code" label="초대 코드" placeholder="ABCD-EFGH" autoCapitalize="characters" size="lg" mono
          autoCorrect="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)}
          error={codeError} hint="받은 링크를 열면 자동으로 채워집니다." autoFocus
        />
        <Button type="submit" size="lg" fullWidth loading={checking} className="mt-1">
          {checking ? '확인 중…' : '초대 확인'}
        </Button>
      </form>
    );
  }

  if (!check.valid) {
    const t = INVITE_REASON_TEXT[check.reason ?? 'not_found'];
    return (
      <div className="flex flex-col gap-3">
        <Notice tone="danger" role="alert">
          <p className="font-semibold text-danger">{t.title}</p>
          <p className="mt-1 text-[13px] text-text-dim">{t.body}</p>
          <p className="mt-2 font-mono text-[13px] tracking-wide text-text-faint">{code}</p>
        </Notice>
        <Button variant="secondary" size="lg" fullWidth className="mt-1" onClick={() => { setCheck(null); setCode(''); }}>
          다른 코드 입력
        </Button>
        <Link href="/login" className={buttonClass('ghost', '', 'lg', true)}>로그인 화면으로</Link>
      </div>
    );
  }

  return <SignupFields code={code} check={check} />;
}

function SignupFields({ code, check }: { code: string; check: InviteCheckResponse }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(check.note.slice(0, LIMITS.displayNameMax));
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
      const res = await api<AuthResponse>(API.signup, {
        body: { code, username: username.trim(), displayName: displayName.trim(), password },
      });
      // 서버가 알려 준 갈 곳 (참가자 → /lobby, 진행자 → /) (FEATURE_V4 §3)
      window.location.assign(res.redirect || '/');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'username_taken') {
        setFieldErrors({ username: err.message });
      } else {
        setError(err instanceof ApiClientError ? err.message : '가입하지 못했습니다.');
      }
      setBusy(false);
    }
  }

  const role = check.role ?? 'player';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="surface-inset rounded-inset p-4">
        <div className="flex items-center gap-2">
          <Chip tone="violet">{ACCOUNT_ROLE_LABEL[role]}</Chip>
          <span className="font-mono text-xs tracking-wide text-text-faint">{code}</span>
        </div>
        {check.note ? <p className="mt-2 font-semibold text-text">{check.note} 님을 위한 초대</p> : null}
        <p className="mt-1 text-[13px] leading-relaxed text-text-dim">{INVITE_ROLE_TEXT[role]}</p>
      </div>
      <TextField
        id="signup-username" label="아이디" hint="영문·숫자·밑줄(_) 3~20자. 로그인할 때 씁니다." size="lg"
        autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={username} onChange={(e) => setUsername(e.target.value)} error={fieldErrors.username} autoFocus
      />
      <TextField
        id="signup-name" label="표시 이름" hint={`팀원과 진행자에게 보이는 이름, ${LIMITS.displayNameMax}자까지`} size="lg"
        autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
        error={fieldErrors.displayName}
      />
      <TextField
        id="signup-password" label="비밀번호" type="password" hint={`${LIMITS.passwordMin}자 이상`} size="lg"
        autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
      />
      <TextField
        id="signup-confirm" label="비밀번호 확인" type="password" autoComplete="new-password" size="lg"
        value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fieldErrors.confirm}
      />
      <FormError message={error} />
      <Button type="submit" size="lg" fullWidth loading={busy} className="mt-1">
        {busy ? '가입하는 중…' : '가입하고 시작하기'}
      </Button>
    </form>
  );
}
