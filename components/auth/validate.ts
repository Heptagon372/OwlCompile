// 가입·설정 폼의 클라이언트 입력 검사 (서버가 다시 검사한다).
import { LIMITS } from '@/lib/contracts';

export interface AccountFieldErrors {
  username?: string;
  displayName?: string;
  password?: string;
  confirm?: string;
}

const USERNAME_RE = new RegExp(LIMITS.usernamePattern);

export function validateAccountFields(v: {
  username: string;
  displayName: string;
  password: string;
  confirm: string;
}): AccountFieldErrors {
  const errs: AccountFieldErrors = {};
  if (!USERNAME_RE.test(v.username.trim())) errs.username = '영문·숫자·밑줄(_) 3~20자로 입력해 주세요.';
  const name = v.displayName.trim();
  if (name.length < 1 || [...name].length > LIMITS.displayNameMax) {
    errs.displayName = `1~${LIMITS.displayNameMax}자로 입력해 주세요.`;
  }
  errs.password = passwordError(v.password) ?? undefined;
  if (!errs.password && v.password !== v.confirm) errs.confirm = '비밀번호가 서로 다릅니다.';
  for (const k of Object.keys(errs) as (keyof AccountFieldErrors)[]) if (!errs[k]) delete errs[k];
  return errs;
}

export function passwordError(pw: string): string | null {
  if (pw.length < LIMITS.passwordMin) return `${LIMITS.passwordMin}자 이상으로 입력해 주세요.`;
  if (pw.length > 200) return '너무 깁니다.';
  return null;
}
