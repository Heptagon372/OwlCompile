'use client';
// 연결 편집기 (docs/WEBSITE_SPEC.md §9): 카드를 끌어 연결 지점에 끼운다.
// - 팔레트 카드 → 가장 가까운 연결 지점에 스냅(연결선 + 고스트) → 놓으면 끼워짐
// - 놓인 카드를 끌면 안의 카드까지 함께 옮겨짐. 휴지통·팔레트에 놓으면 삭제
// - 보조: 팔레트 카드 탭 = 맨 끝에 연결, 놓인 카드 탭 = 메뉴(삭제, 반복 횟수, 위·아래로)
// - 되돌리기: 이 화면에서 내가 한 동작만 거꾸로 적용한다 (보통 EditOp 라서 규칙은 tree.ts 그대로)
// 편집 결과는 uid 기준 동작(EditOp)으로 부모에 넘긴다. 부모가 문서·저장·동기화를 맡는다.
//
// 모양 (DESIGN_V4 §6 /play): 위 줄 = "블록" 유리 패널 | "코드" 유리 패널 (데스크톱 나란히), 아래 줄 = "내 카드" 팔레트 + aside(팀).
// 폰: 블록 → 접이식 코드 칸(한 줄 네온 티커) → 팔레트(맨 아래) → aside(제출 바).
// 네온 코드 뷰 (FEATURE_V4 §4): 문서가 바뀔 때마다(내 동작·팀원 동작 모두) CodeView 가 차이를 연출한다.
// 놓는 순간 그 카드에 0.6s 네온 링 + 같은 경로의 코드 줄 글로우. 블록 ↔ 코드 줄 호버 연동. 실행 미리보기는 없다.
import {
  DndContext, DragOverlay, MeasuringStrategy,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ROLE_LABEL, type GameRole } from '@/lib/contracts';
import type { Block, BlockId } from '@/lib/engine/types';
import { pathKey } from '@/lib/engine/text';
import type { CodeLang } from '@/lib/codegen/types';
import {
  TOP, appendOp, applyOp, canDrop, dropBlockReason, findPathByUid, getBlock, listDropPoints, newBlock, pointKey,
  toUidTarget, type DragSource, type EditOp,
} from '@/lib/editor/tree';
import { IconButton } from '@/components/ui/Button';
import { PanelHeader, PanelTitle } from '@/components/ui/Panel';
import { IconLayers, IconUndo } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { BlockView, PaletteShape } from './BlockView';
import {
  autoScrollVelocity, isSlowTap, makeCollision, setDraggingBody, useEditorSensors, type DragData, type DropData,
} from './dnd';
import { EditorContext, type DragState, type EditorContextValue, type FlashState } from './EditorContext';
import { BlockMenu } from './BlockMenu';
import { CODE_LANG_KEY, EditorCodeDock, EditorCodePanel } from './EditorCode';
import { Palette } from './Palette';
import { StackView } from './StackView';
import { Trash } from './Trash';
import { inverseOp } from './undo';

export interface ProgramEditorProps {
  doc: Block[];
  editable: boolean;
  roles: readonly GameRole[];
  onOp: (op: EditOp) => void;
  /** 드래그 시작·끝 (부모는 드래그 중 들어온 원격 변경을 놓은 뒤에 반영한다) */
  onDragActive?: (active: boolean) => void;
  /** 프로그램 영역 위에 겹칠 것 (봉인 오버레이 등) */
  overlay?: ReactNode;
  /** 프로그램 영역 맨 위에 붙일 것 (안내 줄 등) */
  header?: ReactNode;
  /** "블록" 패널 머리 줄 오른쪽 (저장 상태·상한 초과 등, 표시만) */
  toolbar?: ReactNode;
  /** 팔레트 옆(데스크톱)·아래(폰)에 놓을 패널 (팀·제출). DndContext 안에 그려진다 */
  aside?: ReactNode;
  /** 블록 옆 네온 코드 패널 (기본 true) */
  showCode?: boolean;
}

/** 편집기 본문 줄 번호 거터 폭 (--notch-bg 는 v4 에서 쓰지 않지만 넘겨도 무해) */
const SURFACE: CSSProperties = { ['--notch-bg' as string]: 'var(--color-inset)', ['--gutter-w' as string]: '32px' };
const OVERLAY_SURFACE: CSSProperties = { ['--notch-bg' as string]: 'var(--color-inset)' };
/** 되돌리기 기록 최대 개수 */
const UNDO_MAX = 30;
/** 네온 링이 끝난 뒤 번쩍임 표시를 지운다 (다시 그려질 때 또 번쩍이지 않게) */
const FLASH_MS = 700;

/** 편집 가능할 때 "블록" 패널: 보라 테두리 + 은은한 보라 번짐 (Panel tone="active" 와 같은 모드 토큰, 나이트 값 = v4 그대로) */
const ACTIVE_FRAME = 'lg:border-violet/45 lg:shadow-[var(--shadow-panel-active)]';

/** 동작이 가리키는 블록 (놓은·옮긴·횟수 바꾼 카드). 삭제는 없음 */
function opUid(op: EditOp): string | null {
  if (op.type === 'insert') return op.block.uid ?? null;
  if (op.type === 'remove') return null;
  return op.uid;
}

export function ProgramEditor({
  doc, editable, roles, onOp, onDragActive, overlay, header, toolbar, aside, showCode = true,
}: ProgramEditorProps) {
  const toast = useToast();
  const sensors = useEditorSensors();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  /** 내가 한 동작의 반대 동작 (마지막이 맨 뒤) */
  const [undoStack, setUndoStack] = useState<EditOp[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  /** 드래그를 시작한 손가락 좌표 (느린 탭 판정용) */
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEndRef = useRef(0);
  const lastHitRef = useRef<{ id: string | number; data: DropData } | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const onOpRef = useRef(onOp);
  onOpRef.current = onOp;

  // ---------------------------------------------------------------- 코드 패널 상태
  const [lang, setLang] = useState<CodeLang>('python');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CODE_LANG_KEY);
      if (v === 'python' || v === 'korean') setLang(v);
    } catch {
      /* 저장소를 못 쓰면 기본(파이썬) */
    }
  }, []);
  const changeLang = useCallback((l: CodeLang) => {
    setLang(l);
    try {
      window.localStorage.setItem(CODE_LANG_KEY, l);
    } catch {
      /* 무시 */
    }
  }, []);

  /** 블록 위 마우스 → 코드 줄 강조 */
  const [blockHover, setBlockHover] = useState<number[] | null>(null);
  const blockHoverKey = useRef<string | null>(null);
  /** 코드 줄 위 마우스 → 블록 강조 */
  const [codeHover, setCodeHover] = useState<number[] | null>(null);
  const onBlockHover = useCallback((p: number[] | null) => {
    const next = p && !dragRef.current ? p : null;
    const k = next ? pathKey(next) : null;
    if (blockHoverKey.current === k) return;
    blockHoverKey.current = k;
    setBlockHover(next);
  }, []);
  const onCodeHover = useCallback((p: number[] | null) => {
    setCodeHover((cur) => {
      if (dragRef.current) return null;
      if (cur === p || (cur && p && pathKey(cur) === pathKey(p))) return cur;
      return p;
    });
  }, []);

  /** 놓는 순간 번쩍임 (카드 링 + 코드 줄 글로우) */
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashSeq = useRef(0);
  const fireFlash = useCallback((uid: string) => {
    flashSeq.current += 1;
    setFlash({ uid, n: flashSeq.current });
  }, []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash((f) => (f && f.n === flash.n ? null : f)), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  const collision = useMemo(() => {
    const base = makeCollision(() => scrollRef.current?.getBoundingClientRect() ?? null);
    return ((args) => {
      // 자동 스크롤용 손가락 위치: dnd-kit의 pointerCoordinates는 시작 좌표 + 이동량(스크롤 보정 없음).
      // onDragMove의 delta는 스크롤 보정이 섞여 있어 쓰지 않는다.
      if (args.pointerCoordinates && dragRef.current) {
        pointerRef.current = { x: args.pointerCoordinates.x, y: args.pointerCoordinates.y };
      }
      const hits = base(args);
      const hit = hits[0];
      if (hit) {
        const c = args.droppableContainers.find((d) => d.id === hit.id);
        lastHitRef.current = c ? { id: hit.id, data: c.data.current as DropData } : null;
      } else {
        lastHitRef.current = null;
      }
      return hits;
    }) as typeof base;
  }, []);

  // 끄는 카드의 경로는 매 렌더 uid로 다시 찾는다 (드래그 중 문서가 바뀌어도 하이라이트·오버레이가 어긋나지 않게)
  const liveSource = useMemo<DragSource | null>(() => {
    if (!drag) return null;
    if (drag.data.kind === 'palette') return drag.data.blockId;
    return findPathByUid(doc, drag.data.uid);
  }, [doc, drag]);

  const validKeys = useMemo<ReadonlySet<string>>(() => {
    if (!drag || liveSource === null) return new Set();
    return new Set(listDropPoints(doc).filter((p) => canDrop(doc, liveSource, p)).map(pointKey));
  }, [doc, drag, liveSource]);

  // 편집이 잠기면 열려 있던 메뉴를 닫고 되돌리기 기록을 비운다 (나중에 패치로 다시 열릴 때 저절로 뜨지 않게)
  useEffect(() => {
    if (!editable) {
      setMenuUid(null);
      setUndoStack([]);
    }
  }, [editable]);

  const justDragged = useCallback(() => Date.now() - lastEndRef.current < 350, []);

  const openMenu = useCallback(
    (uid: string) => {
      if (!editable || justDragged()) return;
      setMenuUid(uid);
    },
    [editable, justDragged],
  );

  /** 편집 동작을 부모에 넘기고, 되돌릴 수 있으면 반대 동작을 기록한다. 놓은 카드는 번쩍인다 */
  const emit = useCallback((op: EditOp) => {
    const inv = inverseOp(docRef.current, op);
    if (inv) setUndoStack((s) => [...s.slice(1 - UNDO_MAX), inv]);
    onOpRef.current(op);
    const uid = opUid(op);
    if (uid) fireFlash(uid);
  }, [fireFlash]);

  const undo = () => {
    if (!editable) return;
    const inv = undoStack[undoStack.length - 1];
    if (!inv) return;
    setUndoStack(undoStack.slice(0, -1));
    setMenuUid(null);
    if (!applyOp(docRef.current, inv)) {
      toast('되돌릴 수 없어요. 다른 팀원이 먼저 바꿨어요', 'info');
      return;
    }
    onOp(inv);
    const uid = opUid(inv);
    if (uid) fireFlash(uid);
  };
  const canUndo = editable && undoStack.length > 0;

  // ---------------------------------------------------------------- 자동 스크롤
  const stopAutoScroll = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };
  const startAutoScroll = () => {
    stopAutoScroll();
    const tick = () => {
      const el = scrollRef.current;
      const p = pointerRef.current;
      if (el && p) {
        const r = el.getBoundingClientRect();
        const v = autoScrollVelocity(p.y, r.top, r.bottom);
        if (v !== 0) el.scrollTop += v;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    stopAutoScroll();
    setDraggingBody(false);
  }, []);

  // ---------------------------------------------------------------- 드래그 수명
  const finishDrag = () => {
    stopAutoScroll();
    setDraggingBody(false);
    pointerRef.current = null;
    dragRef.current = null;
    setDrag(null);
    lastEndRef.current = Date.now();
    onDragActive?.(false);
  };

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragData | undefined;
    if (!data || !editable) return;
    let source: DragSource;
    let ghost: DragState['ghost'];
    if (data.kind === 'palette') {
      source = data.blockId;
      ghost = { id: data.blockId };
    } else {
      const path = findPathByUid(docRef.current, data.uid);
      if (!path) return;
      const b = getBlock(docRef.current, path);
      source = path;
      ghost = { id: data.blockId, n: b?.id === 'repeat' ? b.n : undefined };
    }
    const st: DragState = { data, source, ghost };
    dragRef.current = st;
    setDrag(st);
    setMenuUid(null);
    onBlockHover(null);
    setCodeHover(null);
    setDraggingBody(true);
    onDragActive?.(true);
    const start = getEventCoordinates(e.activatorEvent);
    pointerRef.current = start ? { ...start } : null;
    startRef.current = start ? { ...start } : null;
    startAutoScroll();
    if (e.activatorEvent.type.startsWith('touch')) navigator.vibrate?.(8);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const st = dragRef.current;
    const hit = e.over ? { id: e.over.id, data: e.over.data.current as DropData } : lastHitRef.current;
    const current = docRef.current;
    const tap = !!st && isSlowTap(e.activatorEvent.type, startRef.current, pointerRef.current, e.delta);
    startRef.current = null;
    finishDrag();
    if (!st) return;
    if (tap) {
      // 느린 탭(150ms 넘게 가만히 누른 터치): 드롭이 아니라 탭으로 처리한다.
      // 뒤따르는 click은 dnd-kit와 justDragged가 막으므로 두 번 처리되지 않는다.
      if (st.data.kind === 'palette') handleAppend(st.data.blockId);
      else if (editable) setMenuUid(st.data.uid);
      return;
    }
    if (!hit?.data) return;
    if (hit.data.kind === 'delete') {
      if (st.data.kind === 'placed') emit({ type: 'remove', uid: st.data.uid });
      return;
    }
    const point = hit.data.point;
    const source: DragSource =
      st.data.kind === 'palette' ? st.data.blockId : findPathByUid(current, st.data.uid) ?? [];
    if (typeof source !== 'string' && source.length === 0) return;
    if (!canDrop(current, source, point)) return;
    const target = toUidTarget(current, point);
    if (!target) return;
    if (st.data.kind === 'palette') emit({ type: 'insert', block: newBlock(st.data.blockId), target });
    else emit({ type: 'move', uid: st.data.uid, target });
  };

  const handleAppend = (id: BlockId) => {
    if (!editable) return;
    const op = appendOp(docRef.current, id);
    if (!op) {
      toast(dropBlockReason(docRef.current, id) ?? '여기에는 연결할 수 없어요', 'error');
      return;
    }
    emit(op);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    });
  };

  const hlKey = codeHover ? pathKey(codeHover) : null;
  const ctx: EditorContextValue = { doc, editable, drag, validKeys, openMenu, hlKey, flash, onHover: onBlockHover };
  const placedDrag = drag?.data.kind === 'placed';

  // 코드 줄 글로우: 번쩍인 카드의 지금 경로 (새 줄이면 CodeView 가 타이핑 연출을 우선한다)
  const flashPath = flash ? findPathByUid(doc, flash.uid) : null;
  const flashPaths = useMemo(() => (flashPath ? [flashPath] : null), [flashPath?.join('.')]); // eslint-disable-line react-hooks/exhaustive-deps
  const flashKey = flash?.n ?? null;

  let overlayContent: ReactNode = null;
  if (drag?.data.kind === 'palette') {
    overlayContent = <PaletteShape id={drag.data.blockId} />;
  } else if (drag && liveSource !== null && typeof liveSource !== 'string') {
    const b = getBlock(doc, liveSource);
    overlayContent = b ? <BlockView block={b} /> : null;
  }

  const clearHover = () => onBlockHover(null);

  return (
    <EditorContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        autoScroll={false}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={finishDrag}
        accessibility={{
          screenReaderInstructions: { draggable: '카드를 끌어서 원하는 자리에 연결하세요. 누르면 메뉴가 열려요.' },
          announcements: {
            onDragStart: () => '카드를 들었어요.',
            onDragOver: ({ over }) => (over ? '연결할 수 있는 자리예요.' : undefined),
            onDragEnd: ({ over }) => (over ? '카드를 놓았어요.' : '카드를 제자리에 두었어요.'),
            onDragCancel: () => '끌기를 취소했어요.',
          },
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:gap-3">
          {/* 위 줄: 블록 | 코드 (데스크톱 나란히, 폰은 블록 아래 접이식 코드 칸) */}
          {/* 폰: 자리가 모자라면 코드 칸이 팔레트 위로 넘치지 않게 이 줄에서 자르고, 블록 칸은 최소 높이를 지킨다 */}
          <div className="flex min-h-0 flex-1 flex-col max-lg:overflow-hidden lg:flex-row lg:gap-3">
            {/* "블록" 유리 패널: 머리 줄(데스크톱) + inset 뷰포트. 편집 가능할 때만 보라 테두리 */}
            <section
              aria-label="블록"
              className={
                'glass relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[border-color,box-shadow] duration-150 max-lg:min-h-24 lg:rounded-card lg:border ' +
                (editable ? ACTIVE_FRAME : 'lg:border-stroke lg:shadow-glass')
              }
            >
              <PanelHeader className="hidden lg:flex">
                <PanelTitle icon={<IconLayers />}>블록</PanelTitle>
                <div className="ml-auto flex shrink-0 items-center gap-2.5">
                  {toolbar}
                  {editable ? (
                    <IconButton size="sm" aria-label="되돌리기" title="되돌리기" disabled={!canUndo} onClick={undo}>
                      <IconUndo />
                    </IconButton>
                  ) : null}
                </div>
              </PanelHeader>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:mx-2.5 lg:mb-2.5 lg:rounded-inset">
                <div
                  ref={scrollRef}
                  role="region"
                  aria-label="프로그램"
                  className="blk-compact surface-inset relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-16 lg:rounded-inset lg:pb-10"
                  style={SURFACE}
                  onMouseOver={clearHover}
                  onMouseLeave={clearHover}
                >
                  <div className="relative min-h-full">
                    {/* 거터 경계선 (내용과 함께 스크롤) */}
                    <i aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[var(--gutter-w)] w-px bg-stroke" />
                    {header ? <div className="px-3 pt-3">{header}</div> : null}
                    <div className="w-full max-w-[calc(360px+var(--gutter-w))] py-3 pr-3">
                      <StackView list={doc} slotRef={TOP} top />
                    </div>
                  </div>
                </div>
                {/* 폰: 떠 있는 되돌리기 (데스크톱은 머리 줄) */}
                {canUndo && !drag ? (
                  <IconButton
                    size="lg"
                    variant="secondary"
                    aria-label="되돌리기"
                    onClick={undo}
                    className="absolute bottom-3 right-3 z-[5] shadow-float lg:hidden"
                  >
                    <IconUndo />
                  </IconButton>
                ) : null}
                {overlay}
              </div>
            </section>

            {showCode ? (
              <>
                <EditorCodePanel
                  // 2xl 아래는 코드 칸을 조금 넓혀(46%, 최소 300px) R4~R7의 들여쓴 줄(28~31자)이 잘리지 않게 (글자는 cv-fit 이 줄인다)
                  className="hidden lg:flex lg:w-[clamp(300px,46%,560px)] lg:shrink-0 2xl:w-[clamp(260px,42%,560px)]"
                  doc={doc}
                  lang={lang}
                  onLangChange={changeLang}
                  flashPaths={flashPaths}
                  flashKey={flashKey}
                  hoverPath={blockHover}
                  onHoverPath={onCodeHover}
                />
                <EditorCodeDock
                  className="lg:hidden"
                  doc={doc}
                  lang={lang}
                  onLangChange={changeLang}
                  flashPaths={flashPaths}
                  flashKey={flashKey}
                />
              </>
            ) : null}
          </div>

          {/* 아래 줄: 내 카드(팔레트) + aside(팀·제출). 폰은 세로, 데스크톱은 나란히 */}
          {editable || aside ? (
            <div className="flex shrink-0 flex-col lg:flex-row lg:items-stretch lg:gap-3">
              {editable ? (
                <Palette
                  roles={roles}
                  roleNames={roles.map((r) => ROLE_LABEL[r])}
                  doc={doc}
                  onAppend={handleAppend}
                  deleting={placedDrag}
                  justDragged={justDragged}
                />
              ) : null}
              {aside ? (
                <div className={'flex min-w-0 flex-col ' + (editable ? 'lg:w-[clamp(300px,38%,420px)] lg:shrink-0' : 'lg:flex-1')}>
                  {aside}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <Trash visible={placedDrag} />
        <DragOverlay dropAnimation={null} zIndex={70}>
          {overlayContent ? (
            <div
              className="blk-compact blk-overlay pointer-events-none -rotate-1"
              style={OVERLAY_SURFACE}
            >
              {overlayContent}
            </div>
          ) : null}
        </DragOverlay>
        <BlockMenu uid={editable ? menuUid : null} doc={doc} onClose={() => setMenuUid(null)} onOp={emit} />
      </DndContext>
    </EditorContext.Provider>
  );
}
