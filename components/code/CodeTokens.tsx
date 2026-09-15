// 코드 토큰 줄 (문법 색 span). 훅 없음. 색은 globals.css 의 .tk-* (DESIGN_V4 §5).
import type { CSSProperties } from 'react';
import type { CodeToken } from '@/lib/codegen/types';

export function CodeTokens({ tokens, className = '', style }: { tokens: readonly CodeToken[]; className?: string; style?: CSSProperties }) {
  return (
    <span className={`cv-code ${className}`} style={style}>
      {tokens.map((t, i) => (
        <span key={i} className={`tk-${t.kind}`}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

/** 새 줄 타이핑 시간(ms): 글자 수에 비례, 160~400ms */
export function typeMs(chars: number): number {
  return Math.max(160, Math.min(400, chars * 22));
}
