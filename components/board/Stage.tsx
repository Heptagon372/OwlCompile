'use client';
// 1920×1080 고정 무대를 창 크기에 맞춰 CSS transform으로 축소·확대한다 (가운데 정렬, 레터박스).
// 보드는 앱 셸 없이 전체 화면 (DESIGN_V2 §3).
import { useEffect, useState, type ReactNode } from 'react';

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg-deep">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden bg-bg font-sans text-text"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale ?? 0.5})`,
          visibility: scale == null ? 'hidden' : 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}
