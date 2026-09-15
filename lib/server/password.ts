// 비밀번호 해시와 토큰 (docs/WEBSITE_SPEC.md §4). 서버 전용.
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** 형식: scrypt$N$r$p$salt(base64)$hash(base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | null = null;
/** 없는 아이디로 로그인할 때도 같은 시간이 걸리게 하는 더미 해시 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('owl-compile-dummy-password');
  return dummy;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 혼동 글자(0 O 1 I L) 없는 대문자·숫자 */
export const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number, alphabet = SAFE_ALPHABET): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** 관리자 비밀번호 초기화용 임시 비밀번호 (10자) */
export function tempPassword(): string {
  return randomCode(10, 'abcdefghjkmnpqrstuvwxyz23456789');
}
