'use client';
// 네온 코드 뷰 — FEATURE_V4 §4, DESIGN_V4 §5. 블록 프로그램을 파이썬식(또는 한국어 = 엔진 toText) 코드로 보여 준다.
// 실행 미리보기가 아니다(시뮬레이터 금지): 코드만 보여 주고 아무것도 실행하지 않는다. 서버 모듈을 가져오지 않는다.
//
//  - 머리: "코드" + 줄 수 + "파이썬 | 한국어" 전환 (lang 을 주면 제어, 아니면 defaultLang 으로 스스로)
//  - 렌더 사이 자동 차이: 새 줄 = 타이핑(≤400ms) + 네온 글로우 1.2s + 빛줄기 / 바뀐 줄 = 0.6s 글로우 / 지운 줄 = 흐려짐
//    (줄 키는 블록 uid 기반이라 블록을 옮겨도 같은 줄로 본다). flashPaths + flashKey 로 특정 블록 줄을 한 번 더 빛낼 수 있다.
//  - highlightPath: 현재 실행 줄 (보드 재생의 Step.path). 줄 번호가 아니라 path 로 찾는다. 막대가 부드럽게 이동.
//  - hoverPath / onHoverPath: 블록 ↔ 줄 호버 연동 (줄의 owner = 그 줄이 속한 블록 경로)
//  - compact(폰), collapsible(접이식: 접으면 한 줄 네온 티커), fontSize(프로젝터), 움직임 줄이기 대응(CSS)
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Program } from '@/lib/engine/types';
import { pathKey } from '@/lib/engine/text';
import { toListing } from '@/lib/codegen';
import type { CodeLang, CodeLine } from '@/lib/codegen/types';
import { Tabs } from '@/components/ui/Tabs';
import type { TabItem } from '@/components/ui/PanelTabs';
import { IconChevronDown, IconCode } from '@/components/ui/icons';
import { CodeTokens, typeMs } from './CodeTokens';
import { NeonTicker } from './NeonTicker';
import { useCodeFx } from './useCodeFx';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const LANG_TABS: readonly TabItem<CodeLang>[] = [
  { key: 'python', label: '파이썬' },
  { key: 'korean', label: '한국어' },
];

export interface CodeViewProps {
  program: Program;
  /** 표시 언어 (주면 제어 컴포넌트). 없으면 defaultLang 으로 시작해 머리 전환으로 바뀐다 */
  lang?: CodeLang;
  defaultLang?: CodeLang;
  onLangChange?: (lang: CodeLang) => void;
  /** 머리의 "파이썬 | 한국어" 전환 (기본 true) */
  showLangToggle?: boolean;
  /** 머리 줄 (기본 true) */
  header?: boolean;
  /** 머리 제목 (기본 "코드") */
  title?: ReactNode;
  /** 머리 오른쪽 추가 요소 */
  headerRight?: ReactNode;
  /** 현재 실행 줄 (Step.path). null 이면 없음 */
  highlightPath?: readonly number[] | null;
  /** flashKey 가 바뀔 때 이 경로들의 줄을 0.6s 빛낸다 (블록을 놓은 순간 등) */
  flashPaths?: readonly (readonly number[])[] | null;
  flashKey?: number | string | null;
  /** 렌더 사이 자동 차이 연출 (기본 true). 보드 재생처럼 코드가 안 바뀌면 false 로 */
  animate?: boolean;
  /** 강조할 블록 경로 (블록에 마우스를 올렸을 때). 그 블록의 줄들이 은은하게 */
  hoverPath?: readonly number[] | null;
  /** 줄에 마우스를 올리면 그 줄이 속한 블록 경로, 벗어나면 null */
  onHoverPath?: (path: number[] | null) => void;
  /** 폰: 작은 글자·좁은 거터 */
  compact?: boolean;
  /** 글자 크기 px (프로젝터 등. 기본 14, compact 12.5) */
  fontSize?: number;
  /** 접이식 (머리 버튼). 접으면 한 줄 네온 티커 */
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** 실행 줄·새 줄이 보이게 패널 안에서만 스크롤 (기본 true) */
  autoScroll?: boolean;
  /** 빈 프로그램 문구 */
  emptyText?: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

function rowSelector(key: string): string {
  return `[data-key="${key.replace(/["\\]/g, '\\$&')}"]`;
}

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 패널 안에서만 스크롤 (페이지는 움직이지 않는다).
 * reveal: 새 줄·바뀐 줄의 끝까지 보이게 가로로도 맞춘다 (좁은 패널에서 깊이 들여쓴 줄의 타이핑·글로우가 오른쪽 밖에서 일어나지 않게).
 * 줄이 패널 안에 들어가면 왼쪽 끝(줄 번호)으로 돌아간다.
 */
function scrollRow(box: HTMLElement, rows: HTMLElement, key: string, center: boolean, reveal = false) {
  const el = rows.querySelector<HTMLElement>(rowSelector(key));
  if (!el) return;
  const top = el.offsetTop + rows.offsetTop;
  const h = el.offsetHeight;
  let target: number | null = null;
  if (center) target = top - box.clientHeight / 2 + h / 2;
  else if (top < box.scrollTop) target = top - 8;
  else if (top + h > box.scrollTop + box.clientHeight) target = top + h - box.clientHeight + 8;
  let left: number | null = null;
  const code = reveal ? el.querySelector<HTMLElement>('.cv-code') : null;
  if (code) {
    // .cv-code 의 offsetParent 는 줄(.cv-row, position: relative), 줄은 .cv-rows 왼쪽 끝에서 시작
    const end = el.offsetLeft + code.offsetLeft + code.offsetWidth + 16;
    const want = Math.max(0, end - box.clientWidth);
    if (Math.abs(want - box.scrollLeft) > 1) left = want;
  }
  if (target === null && left === null) return;
  box.scrollTo({
    ...(target !== null ? { top: Math.max(0, target) } : {}),
    ...(left !== null ? { left } : {}),
    behavior: prefersReduced() ? 'auto' : 'smooth',
  });
}

function Indent({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="cv-ind" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

export function CodeView({
  program, lang: langProp, defaultLang = 'python', onLangChange, showLangToggle = true, header = true, title = '코드', headerRight,
  highlightPath = null, flashPaths, flashKey, animate = true, hoverPath = null, onHoverPath, compact = false, fontSize,
  collapsible = false, collapsed: collapsedProp, defaultCollapsed = false, onCollapsedChange, autoScroll = true, emptyText,
  className = '', bodyClassName = '', style, 'aria-label': ariaLabel,
}: CodeViewProps) {
  const [langState, setLangState] = useState<CodeLang>(defaultLang);
  const lang = langProp ?? langState;
  const setLang = (l: CodeLang) => {
    if (langProp === undefined) setLangState(l);
    onLangChange?.(l);
  };
  const [colState, setColState] = useState(defaultCollapsed);
  const collapsed = collapsible && (collapsedProp ?? colState);
  const toggle = () => {
    const v = !collapsed;
    if (collapsedProp === undefined) setColState(v);
    onCollapsedChange?.(v);
  };

  const listing = useMemo(() => toListing(program ?? [], lang), [program, lang]);
  const fx = useCodeFx(listing, lang, { animate, flashPaths, flashKey });

  const curIndex = highlightPath ? listing.lineOf.get(pathKey(highlightPath as number[])) : undefined;
  const curKey = curIndex === undefined ? null : (listing.lines[curIndex]?.key ?? null);
  const hoverKey = hoverPath ? pathKey(hoverPath as number[]) : null;

  const bodyId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 현재 실행 줄 막대: 줄 요소 위치를 재서 옮긴다 (처음 켜질 때는 미끄러지지 않고 바로)
  useIsoLayoutEffect(() => {
    const bar = barRef.current;
    const rows = rowsRef.current;
    if (!bar || !rows) return;
    const el = curKey ? rows.querySelector<HTMLElement>(rowSelector(curKey)) : null;
    if (!el) {
      delete bar.dataset.on;
      return;
    }
    const wasOn = bar.dataset.on !== undefined;
    if (!wasOn) bar.style.transition = 'none';
    bar.style.transform = `translateY(${el.offsetTop}px)`;
    bar.style.height = `${el.offsetHeight}px`;
    if (!wasOn) {
      void bar.offsetHeight;
      bar.style.transition = '';
    }
    bar.dataset.on = '';
  }, [curKey, fx.rows, collapsed, compact, fontSize, lang]);

  // 실행 줄이 바뀌면 가운데로
  useEffect(() => {
    if (!autoScroll || !curKey || !bodyRef.current || !rowsRef.current) return;
    scrollRow(bodyRef.current, rowsRef.current, curKey, true);
  }, [curKey, autoScroll]);

  // 새 줄·바뀐 줄이 보이게 (실행 강조 중이 아닐 때)
  useEffect(() => {
    if (!autoScroll || curKey || !fx.focus || fx.focus.kind === 'removed' || !bodyRef.current || !rowsRef.current) return;
    scrollRow(bodyRef.current, rowsRef.current, fx.focus.line.key, false, true);
  }, [fx.focus, autoScroll, curKey]);

  const enter = onHoverPath ? (l: CodeLine) => onHoverPath(l.owner ? [...l.owner] : null) : undefined;
  const cvStyle = {
    ['--cv-tab' as string]: lang === 'python' ? '4ch' : '2ch',
    ...(fontSize ? { ['--cv-fs' as string]: `${fontSize}px` } : {}),
    ...style,
  } as CSSProperties;
  const empty = emptyText ?? (lang === 'python' ? '# 블록을 연결하면 여기에 파이썬 코드가 적혀요' : '블록을 연결하면 여기에 코드가 적혀요');

  return (
    <section
      className={`cv ${className}`}
      data-compact={compact ? '' : undefined}
      data-lang={lang}
      style={cvStyle}
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : '코드')}
    >
      {header ? (
        <div className="cv-head">
          {collapsible ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              className="ui-label -ml-1.5 flex min-h-9 items-center gap-2 rounded-full px-1.5 transition-colors hover:bg-tint/[0.05] focus-visible:outline-2 focus-visible:outline-violet-ink"
            >
              <IconCode size={16} className="text-violet-ink" />
              {title}
              <IconChevronDown size={16} className={`text-text-faint transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
            </button>
          ) : (
            <h2 className="ui-label flex items-center gap-2">
              <IconCode size={16} className="text-violet-ink" />
              {title}
            </h2>
          )}
          <span className="font-mono text-xs tabular-nums text-text-faint">{listing.lines.length}줄</span>
          <div className="ml-auto flex items-center gap-2">
            {headerRight}
            {showLangToggle ? <Tabs size="xs" tabs={LANG_TABS} value={lang} onChange={setLang} aria-label="코드 언어" /> : null}
          </div>
        </div>
      ) : null}
      {collapsed ? (
        <div className="p-2" id={bodyId}>
          <NeonTicker program={program} lang={lang} />
        </div>
      ) : (
        <div
          id={bodyId}
          ref={bodyRef}
          // 키보드로도 긴 코드를 스크롤할 수 있게 (Safari 등은 스크롤 영역에 자동 초점을 주지 않는다)
          tabIndex={0}
          role="region"
          aria-label={`${ariaLabel ?? (typeof title === 'string' ? title : '코드')} 줄 목록`}
          className={`cv-body ${bodyClassName}`}
          onMouseLeave={onHoverPath ? () => onHoverPath(null) : undefined}
        >
          <div ref={rowsRef} className="cv-rows">
            <div ref={barRef} className="cv-bar" aria-hidden="true" />
            {fx.rows.map((r) => {
              if (r.kind === 'ghost') {
                return (
                  <div key={r.id} className="cv-row cv-gone" aria-hidden="true">
                    <span className="cv-num" />
                    <Indent n={r.line.indent} />
                    <CodeTokens tokens={r.line.tokens} />
                  </div>
                );
              }
              const l = r.line;
              const f = fx.fxOf(l.key);
              const isCur = l.key === curKey;
              const isHover = hoverKey !== null && l.owner !== null && pathKey(l.owner) === hoverKey;
              const rowStyle = f === 'new'
                ? ({ ['--cv-chars' as string]: Math.max(1, l.code.length), ['--cv-type' as string]: `${typeMs(l.code.length)}ms` } as CSSProperties)
                : undefined;
              return (
                <div
                  key={l.key}
                  data-key={l.key}
                  data-path={l.path ? pathKey(l.path) : undefined}
                  className={`cv-row ${f ? `cv-${f}` : ''} ${isCur ? 'cv-cur' : ''} ${isHover ? 'cv-hover' : ''}`}
                  style={rowStyle}
                  aria-current={isCur ? 'step' : undefined}
                  onMouseEnter={enter ? () => enter(l) : undefined}
                >
                  <span className="cv-num" aria-hidden="true">{r.index + 1}</span>
                  <Indent n={l.indent} />
                  <CodeTokens tokens={l.tokens} />
                </div>
              );
            })}
            {listing.lines.length === 0 ? <p className="cv-empty">{empty}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
