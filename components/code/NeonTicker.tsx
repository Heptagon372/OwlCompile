'use client';
// 한 줄 네온 티커 (폰, FEATURE_V4 §4): 마지막으로 바뀐 코드 줄 하나를 네온 연출과 함께 보여 준다.
// 새 줄 = 타이핑 + 글로우 + 빛줄기, 바뀐 줄 = 짧은 글로우, 지운 줄 = 취소선("지움"). 아무 변화 전에는 마지막 줄.
// 코드만 보여 준다(실행 미리보기 아님). 움직임 줄이기면 색만 잠깐 바뀐다(CSS).
import { useMemo, useRef, type CSSProperties } from 'react';
import type { Program } from '@/lib/engine/types';
import { toListing } from '@/lib/codegen';
import type { CodeLang } from '@/lib/codegen/types';
import { CodeTokens, typeMs } from './CodeTokens';
import { useCodeFx, type CodeFx } from './useCodeFx';

export function NeonTicker({
  program, lang = 'python', label = '코드', idleText, className = '',
}: {
  program: Program;
  lang?: CodeLang;
  /** 왼쪽 작은 라벨 (기본 "코드") */
  label?: string;
  /** 빈 프로그램 문구 */
  idleText?: string;
  className?: string;
}) {
  const listing = useMemo(() => toListing(program ?? [], lang), [program, lang]);
  const fx = useCodeFx(listing, lang);
  // 마지막 변화 기억 (다음 렌더에 변화가 없어도 계속 보인다). 같은 세대면 같은 값이라 두 번 그려도 안전
  const last = useRef<{ focus: NonNullable<CodeFx['focus']>; gen: number; lang: CodeLang } | null>(null);
  if (fx.focus && last.current?.gen !== fx.gen) last.current = { focus: fx.focus, gen: fx.gen, lang };
  const ev = last.current && last.current.lang === lang ? last.current : null;
  const line = ev?.focus.line ?? listing.lines[listing.lines.length - 1] ?? null;
  const kind = ev?.focus.kind ?? 'idle';
  const n = line ? Math.max(1, line.code.length) : 1;
  return (
    <div className={`ntk ${className}`} role="status" aria-live="polite">
      <i key={`s${ev?.gen ?? 0}`} aria-hidden="true" className={`ntk-sweep ${kind === 'new' ? 'on' : ''}`} />
      {/* 지운 줄: 흐리게 하지 않는다(글자 대비 유지). "지움" 뜻은 장밋빛 라벨·점 + 선명한 취소선이 전한다 */}
      <span className={`ntk-label ${kind === 'removed' ? 'is-removed' : ''}`}>{kind === 'removed' ? '지움' : label}</span>
      <span
        key={`l${ev?.gen ?? 0}`}
        className={`ntk-line is-${kind}`}
        style={kind === 'new' ? ({ ['--cv-chars' as string]: n, ['--cv-type' as string]: `${typeMs(n)}ms` } as CSSProperties) : undefined}
      >
        {line ? (
          <CodeTokens tokens={line.tokens} />
        ) : (
          <span className="font-sans text-[13px] text-text-faint">{idleText ?? '블록을 놓으면 코드가 여기에 나타나요'}</span>
        )}
      </span>
    </div>
  );
}
