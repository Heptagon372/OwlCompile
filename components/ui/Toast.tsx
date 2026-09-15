'use client';
// 화면 위쪽 토스트 (DESIGN_V4: 짙은 유리 카드 + 둥근 아이콘 배지). layout.tsx가 ToastProvider로 감싼다.
// 사용: const toast = useToast(); toast('저장했습니다', 'success')
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { IconAlert, IconCheck, IconInfo } from './icons';

export type ToastKind = 'info' | 'success' | 'error';
type Push = (message: string, kind?: ToastKind) => void;

const ToastContext = createContext<Push>(() => {});

interface Item { id: number; message: string; kind: ToastKind }

const KIND: Record<ToastKind, { badge: string; icon: ReactNode }> = {
  info: { badge: 'bg-violet-grad-deco text-white shadow-[0_0_14px_var(--glow-accent)]', icon: <IconInfo size={15} /> },
  success: { badge: 'bg-ok/18 text-ok ring-1 ring-ok/40', icon: <IconCheck size={15} /> },
  error: { badge: 'bg-danger/18 text-danger ring-1 ring-danger/40', icon: <IconAlert size={15} /> },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  const push = useCallback<Push>((message, kind = 'info') => {
    const id = ++seq.current;
    setItems((v) => [...v.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 2800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* 상단 바(h-14) 아래에 띄운다: 헤더의 제목·라운드·팀·게임 코드를 가리지 않게 (예: 대기실 → /play 자동 배정 토스트) */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => {
          const k = KIND[t.kind];
          return (
            <div
              key={t.id}
              role="status"
              className="glass glass-sheet rise relative flex max-w-sm items-center gap-3 overflow-hidden rounded-full border border-stroke-strong py-2 pl-2 pr-4 text-sm font-medium text-text shadow-float"
            >
              <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full ${k.badge}`}>{k.icon}</span>
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  return useContext(ToastContext);
}
