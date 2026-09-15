'use client';
// 폰 미니맵 (누르면 크게). R5는 고양이 출발 칸과 순찰로가 보인다(MapGrid 기본).
import { useState } from 'react';
import type { GameMap } from '@/lib/contracts';
import { formatClock } from '@/lib/client/time';
import { MapGrid } from '@/components/map/MapGrid';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { IconFullscreen } from '@/components/ui/icons';
import { IntroTokens, MapLegend } from './mapInfo';

export function MiniMap({ map, className = '' }: { map: GameMap; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`R${map.round} ${map.name} 맵 크게 보기`}
        className="relative block shrink-0 self-start rounded-ctl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink"
      >
        <MapGrid map={map} className={className} />
        <span
          aria-hidden="true"
          // 나이트 = 검정 70% 위 밝은 글자, 라이트 = 흰 면 85% 위 짙은 글자 (text-text 가 모드 따라 바뀌니 면도 같이)
          className="absolute bottom-1 right-1 grid size-6 place-items-center rounded-ctl border border-line-strong bg-black/70 text-text [:root[data-theme=light]_&]:bg-solid/85"
        >
          <IconFullscreen size={14} />
        </span>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`R${map.round} ${map.name}`}
        description={`${map.difficulty} · 블록 상한 ${map.cap}개 · 코딩 ${formatClock(map.seconds)}`}
        footer={<Button variant="secondary" onClick={() => setOpen(false)}>닫기</Button>}
      >
        <MapGrid map={map} className="w-full" />
        <p className="mt-3 text-sm leading-relaxed text-text-dim">
          새 요소 <IntroTokens intro={map.intro} />
        </p>
        <p className="mt-1 text-xs text-text-faint">부엉이는 화살표 방향을 보고 출발해요</p>
        <MapLegend map={map} className="mt-3" />
      </Sheet>
    </>
  );
}
