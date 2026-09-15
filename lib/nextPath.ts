// 로그인·계정 전환 뒤 돌아갈 경로 검사 (서버·클라이언트 공용, 의존성 없음).
// 같은 사이트의 상대 경로만 허용한다: 한 개의 "/"로 시작, "//" 금지, 스킴 금지, 역슬래시·제어 문자 금지.

const BASE = 'http://owl.local';

function looksRelative(p: string): boolean {
  return p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\');
}

/** 안전하지 않으면 '/' */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') return '/';
  if (next.length > 300) return '/';
  if (!looksRelative(next)) return '/';
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c < 32 || c === 127 || c === 92) return '/'; // 제어 문자·역슬래시
  }
  try {
    const u = new URL(next, BASE);
    if (u.origin !== BASE) return '/';
    // 점 세그먼트 정리 뒤 결과를 다시 검사한다: '/.//evil.com' → '//evil.com' (프로토콜 상대 URL) 차단
    const out = `${u.pathname}${u.search}${u.hash}`;
    if (!looksRelative(out)) return '/';
    // URL 정규화가 퍼센트 인코딩으로 길이를 늘릴 수 있어 결과도 300자 이하인지 본다
    if (out.length > 300) return '/';
    return out;
  } catch {
    return '/';
  }
}
