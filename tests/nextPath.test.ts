// ?next= 검사 (lib/nextPath.ts): 한 개의 "/"로 시작하는 같은 사이트 상대 경로만. 로그인·계정 전환 패널이 쓴다.
import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/nextPath';
import { safeNextPath as fromAuth } from '@/lib/server/auth';

describe('safeNextPath', () => {
  it('같은 사이트 상대 경로는 그대로 (쿼리·해시 포함)', () => {
    for (const p of ['/', '/host', '/play/1234', '/join?code=1234', '/board/1234#top', '/login?next=%2Fhost']) {
      expect(safeNextPath(p)).toBe(p);
    }
  });

  it('"//"·스킴·역슬래시·제어 문자·공백 시작은 "/"', () => {
    const bad = [
      '//evil.test', '///evil.test', 'https://evil.test/', 'http:/evil.test', 'javascript:alert(1)', 'evil.test',
      '/\\evil.test', '\\\\evil.test', '/a\\b', '/a\nb', '/a\tb', ' /host', '', 'data:text/html,x',
      '/.//evil.test', '/%2e//evil.test', '/a/..//evil.test',
    ];
    for (const p of bad) expect(safeNextPath(p), JSON.stringify(p)).toBe('/');
  });

  it('null·undefined·너무 긴 값은 "/"', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath('/' + 'a'.repeat(400))).toBe('/');
  });

  it('300자 제한은 정규화(퍼센트 인코딩) 뒤 결과에도 적용된다', () => {
    const ok = '/' + 'a'.repeat(299);
    expect(safeNextPath(ok)).toBe(ok);
    // 151자 입력이 "%C3%A4"로 늘어나 900자가 넘는다
    expect(safeNextPath('/' + 'ä'.repeat(150))).toBe('/');
    expect(safeNextPath('/join?q=' + '한'.repeat(100))).toBe('/');
    // 짧으면 인코딩돼도 그대로 쓴다
    expect(safeNextPath('/join?q=한')).toBe('/join?q=%ED%95%9C');
  });

  it('점 세그먼트는 정리한 뒤 다시 검사한다', () => {
    expect(safeNextPath('/a/../play/1234')).toBe('/play/1234');
  });

  it('서버 auth 모듈도 같은 함수를 내보낸다', () => {
    expect(fromAuth).toBe(safeNextPath);
  });
});
