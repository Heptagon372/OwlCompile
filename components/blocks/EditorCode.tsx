'use client';
// 팀 편집기의 네온 코드 패널 (FEATURE_V4 §4, DESIGN_V4 §5·§6 /play). 코드만 보여 준다: 아무것도 실행하지 않는다(시뮬레이터 금지).
// - EditorCodePanel: 데스크톱 "블록 | 코드" 오른쪽 유리 패널. 머리 = 제목 · 줄 수 · "파이썬 | 한국어", 본문 = CodeView(inset)
// - EditorCodeDock: 폰 블록 아래 접이식 코드 칸. 접으면 마지막으로 바뀐 줄 한 줄(NeonTicker), 펴면 CodeView(최대 34dvh)
// 블록 → 코드 차이 연출(새 줄 타이핑·글로우, 바뀐 줄 글로우, 지운 줄 흐려짐)은 CodeView 가 문서 변화마다 스스로 한다.
import { useId, useMemo, useState } from 'react';
import type { Block } from '@/lib/engine/types';
import { toListing } from '@/lib/codegen';
import type { CodeLang } from '@/lib/codegen/types';
import { CodeView, LANG_TABS, NeonTicker } from '@/components/code';
import { PanelHeader, PanelTitle } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { IconChevronDown, IconChevronUp, IconCode } from '@/components/ui/icons';

export const CODE_LANG_KEY = 'owl.codeLang';

interface CodeCommon {
  doc: Block[];
  lang: CodeLang;
  onLangChange: (lang: CodeLang) => void;
  /** 방금 놓은 블록 경로 (flashKey 가 바뀔 때 그 줄이 한 번 더 빛난다) */
  flashPaths: readonly (readonly number[])[] | null;
  flashKey: number | null;
}

function useLineCount(doc: Block[], lang: CodeLang): number {
  return useMemo(() => toListing(doc, lang).lines.length, [doc, lang]);
}

function emptyText(lang: CodeLang): string {
  return lang === 'python' ? '# 블록을 연결하면 여기에 파이썬 코드가 적혀요' : '블록을 연결하면 여기에 코드가 적혀요';
}

/** 데스크톱 코드 패널 */
export function EditorCodePanel({
  doc, lang, onLangChange, flashPaths, flashKey, hoverPath, onHoverPath, className = '',
}: CodeCommon & {
  /** 블록에 마우스를 올렸을 때 그 블록 경로 → 해당 줄 강조 */
  hoverPath: readonly number[] | null;
  /** 줄에 마우스를 올리면 그 줄이 속한 블록 경로 */
  onHoverPath: (path: number[] | null) => void;
  className?: string;
}) {
  const lines = useLineCount(doc, lang);
  return (
    <section
      aria-label="코드"
      className={`glass relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-stroke shadow-glass ${className}`}
    >
      <PanelHeader className="gap-2.5">
        <PanelTitle icon={<IconCode />}>코드</PanelTitle>
        <span className="font-mono text-xs tabular-nums text-text-faint">{lines}줄</span>
        <div className="ml-auto flex shrink-0 items-center">
          <Tabs size="xs" tabs={LANG_TABS} value={lang} onChange={onLangChange} aria-label="코드 언어" />
        </div>
      </PanelHeader>
      <CodeView
        program={doc}
        lang={lang}
        header={false}
        hoverPath={hoverPath}
        onHoverPath={onHoverPath}
        flashPaths={flashPaths}
        flashKey={flashKey}
        emptyText={emptyText(lang)}
        // cv-fit: 2xl 아래(1024~1535px)에서는 패널이 ~300px 이라 폰 글자·거터로 (globals.css), 깊은 줄이 잘리지 않게
        className="cv-fit mx-2.5 mb-2.5 flex-1"
        aria-label={lang === 'python' ? '파이썬 코드 (읽기 전용)' : '한국어 코드 (읽기 전용)'}
      />
    </section>
  );
}

/** 폰 접이식 코드 칸 (블록 아래). 접힘 = 한 줄 네온 티커 */
export function EditorCodeDock({ doc, lang, onLangChange, flashPaths, flashKey, className = '' }: CodeCommon & { className?: string }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const lines = useLineCount(doc, lang);
  return (
    <section aria-label="코드" className={`glass relative shrink-0 border-t border-stroke px-3 ${className}`}>
      {open ? (
        <div className="flex flex-col pb-2">
          <div className="flex min-h-11 items-center gap-2">
            <button
              type="button"
              aria-expanded
              aria-controls={bodyId}
              onClick={() => setOpen(false)}
              className="ui-label -ml-1.5 flex h-11 items-center gap-2 rounded-full px-2 transition-colors duration-150 hover:bg-tint/[0.05] focus-visible:outline-2 focus-visible:outline-violet-ink"
            >
              <IconCode size={16} className="text-violet-ink" />
              코드
              <IconChevronDown size={18} className="text-text-faint" />
              <span className="sr-only">접기</span>
            </button>
            <span className="font-mono text-xs tabular-nums text-text-faint">{lines}줄</span>
            <Tabs
              size="sm"
              tabs={LANG_TABS}
              value={lang}
              onChange={onLangChange}
              aria-label="코드 언어"
              className="ml-auto !p-0.5 [&>button]:h-11"
            />
          </div>
          <div id={bodyId}>
            <CodeView
              program={doc}
              lang={lang}
              header={false}
              compact
              flashPaths={flashPaths}
              flashKey={flashKey}
              emptyText={emptyText(lang)}
              bodyClassName="max-h-[34dvh]"
              aria-label={lang === 'python' ? '파이썬 코드 (읽기 전용)' : '한국어 코드 (읽기 전용)'}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-1">
          <NeonTicker program={doc} lang={lang} className="min-w-0 flex-1" />
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-text-dim transition-colors duration-150 hover:bg-tint/[0.05] hover:text-text focus-visible:outline-2 focus-visible:outline-violet-ink"
          >
            코드 {lines}줄
            <IconChevronUp size={18} className="text-text-faint" />
          </button>
        </div>
      )}
    </section>
  );
}
