'use client';
// 폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 대화상자 (DESIGN_V4 §3: 24px 모서리, 짙은 유리, 떠 있는 그림자).
// document.body 로 포털한다: 유리 패널·헤더 안에서 열어도 z-index·fixed 가 갇히지 않는다.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './Button';
import { IconClose } from './icons';

export type SheetSize = 'sm' | 'md' | 'lg';
const SIZES: Record<SheetSize, string> = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' };

export function Sheet({
  open, onClose, title, description, children, footer, size = 'md', hideClose = false, className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 제목 아래 한 줄 설명 */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: SheetSize;
  hideClose?: boolean;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const node = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="닫기" className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={`glass glass-sheet rise relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet border border-stroke-strong shadow-float sm:rounded-sheet ${SIZES[size]} ${className}`}
      >
        {title || !hideClose ? (
          <div className="flex min-h-14 shrink-0 items-start gap-3 px-6 pb-1 pt-4">
            <div className="min-w-0 flex-1 self-center">
              {title ? <h2 className="text-[17px] font-bold tracking-[-0.01em] text-text">{title}</h2> : null}
              {description ? <p className="mt-0.5 text-[13px] text-text-dim">{description}</p> : null}
            </div>
            {!hideClose ? (
              <IconButton size="md" variant="secondary" aria-label="닫기" onClick={onClose} className="-mr-2 self-center">
                <IconClose />
              </IconButton>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-5">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-stroke px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
  return mounted ? createPortal(node, document.body) : node;
}

/** 확인 시트: 위험한 동작 전에 한 번 더 묻는다 */
export function ConfirmSheet({
  open, title, message, confirmLabel, danger = false, confirmVariant = 'primary', busy = false, onConfirm, onClose,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** 위험하지 않은 확인 버튼 모양 (기본 primary). 주 버튼을 한 곳에만 둘 화면은 secondary */
  confirmVariant?: 'primary' | 'secondary';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>취소</Button>
          <Button variant={danger ? 'danger' : confirmVariant} onClick={onConfirm} loading={busy}>
            {busy ? '처리 중…' : confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <div className="text-sm leading-relaxed text-text-dim">{message}</div> : null}
    </Sheet>
  );
}
