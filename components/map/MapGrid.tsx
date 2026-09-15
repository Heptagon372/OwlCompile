// 8×8 맵 렌더 (DESIGN_V4: glass-inset 바닥 + 옅은 격자, 둥근 광택 블록 벽, 보라 테 구덩이, 네온 시안 둥지 링, 은은히 빛나는 SVG 글리프).
// 색은 app/globals.css 의 .map* 규칙. 훅 없음: 서버·클라이언트 어디서나. props 는 v3 그대로.
// 움직이는 부엉이·고양이는 children으로 <MapActor>를 넣는다 (보드 재생).
import type { ReactNode, SVGProps } from 'react';
import type { GameMap, Pos } from '@/lib/engine/types';
import { OwlSprite } from './OwlSprite';

const key = (p: Pos) => `${p.x},${p.y}`;

export interface MapGridProps {
  map: GameMap;
  /** 먹은 쥐 칸 (렌더에서 사라짐) */
  eaten?: Pos[];
  /** 주운 열쇠 칸 */
  taken?: Pos[];
  /** 열린 문 칸 (반투명·점선) */
  opened?: Pos[];
  /** 시작 칸에 부엉이를 그린다 (보드 재생 중에는 false로 두고 MapActor를 쓴다) */
  showStartOwl?: boolean;
  /** R5: 고양이 출발 칸에 고양이를 그린다 */
  showCatStart?: boolean;
  /** 둥지 글로우 (도착 연출) */
  glowGoal?: boolean;
  className?: string;
  label?: string;
  children?: ReactNode;
}

export function MapGrid({
  map,
  eaten = [],
  taken = [],
  opened = [],
  showStartOwl = true,
  showCatStart = true,
  glowGoal = false,
  className = '',
  label,
  children,
}: MapGridProps) {
  const gone = new Set([...eaten, ...taken].map(key));
  const open = new Set(opened.map(key));
  const cat = map.cat?.path[0];
  return (
    <div
      className={`map ${glowGoal ? 'goal-glow' : ''} ${className}`}
      role="img"
      aria-label={label ?? `R${map.round} ${map.name} 맵`}
    >
      <div className="map-grid">
        {map.tiles.flatMap((row, y) =>
          row.split('').map((t, x) => {
            const k = `${x},${y}`;
            return (
              <MapCell
                key={k}
                tile={t}
                gone={gone.has(k)}
                open={open.has(k)}
                owl={showStartOwl && t === 'S' ? map.startDir : null}
                cat={showCatStart && !!cat && cat.x === x && cat.y === y}
              />
            );
          }))}
      </div>
      {children}
    </div>
  );
}

function MapCell({
  tile, gone, open, owl, cat,
}: { tile: string; gone: boolean; open: boolean; owl: GameMap['startDir'] | null; cat: boolean }) {
  switch (tile) {
    case '#':
      return <span className="map-cell wall" />;
    case 'O':
      return <span className="map-cell"><i className="pit" /></span>;
    case 'M':
      return <span className={`map-cell ${gone ? 'gone' : ''}`}><MouseGlyph /></span>;
    case 'K':
      return <span className={`map-cell ${gone ? 'gone' : ''}`}><KeyGlyph /></span>;
    case 'D':
      return <span className={`map-cell door ${open ? 'opened' : ''}`}><DoorGlyph open={open} /></span>;
    case 'G':
      return <span className="map-cell goal"><i className="ring" /></span>;
    case 'S':
      return <span className="map-cell start">{owl ? <OwlSprite dir={owl} /> : null}</span>;
    case 'c':
      return <span className="map-cell patrol">{cat ? <CatSprite /> : null}</span>;
    default:
      return <span className="map-cell" />;
  }
}

/** 맵 위 x,y 칸에 올리는 움직이는 요소 (부엉이·고양이). 칸 사이 이동은 CSS transition */
export function MapActor({
  x, y, instant = false, durationMs = 450, zIndex, className = '', children,
}: {
  x: number; y: number; instant?: boolean; durationMs?: number;
  /** 겹칠 때 위에 그릴 요소 (기본은 .map-actor의 3, DOM 순서) */
  zIndex?: number;
  className?: string; children: ReactNode;
}) {
  return (
    <div
      className={`map-actor ${instant ? 'instant' : ''} ${className}`}
      style={{
        transform: `translate(${x * 100}%, ${y * 100}%)`,
        transitionDuration: instant ? '0ms' : `${durationMs}ms`,
        ...(zIndex !== undefined ? { zIndex } : {}),
      }}
    >
      {children}
    </div>
  );
}

/* ---------- 글리프 (선 1.75px, viewBox 24; 칸 크기에 따라 CSS .glyph 가 비율로 키운다) ---------- */

function Glyph({ children, className = '', ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`glyph ${className}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 쥐 (+20): 보라 계열 */
export function MouseGlyph() {
  return (
    <Glyph style={{ color: 'var(--color-violet-ink)' }}>
      <path d="M4.5 15c0-3.8 3.2-6.5 7.5-6.5 3.6 0 6.5 2.3 6.5 5 0 2-1.4 3.5-3.5 3.5H8c-2 0-3.5-.8-3.5-2z" fill="currentColor" fillOpacity={0.24} />
      <circle cx="15.5" cy="7.5" r="1.8" fill="currentColor" fillOpacity={0.24} />
      <circle cx="15.5" cy="12.5" r="0.7" fill="currentColor" stroke="none" />
      <path d="M4.5 15c-1.8.2-2.8 1.5-2 3.3" />
      <path d="M19.5 13.5h2M19.5 15.5h2" strokeWidth={1.25} />
    </Glyph>
  );
}

/** 열쇠: 네온 시안 */
export function KeyGlyph() {
  return (
    <Glyph style={{ color: 'var(--color-neon-cyan)' }}>
      <circle cx="8" cy="15" r="4.5" fill="currentColor" fillOpacity={0.18} />
      <path d="M11.2 11.8L20 3" />
      <path d="M17 6l3 3" />
      <path d="M14 9l2 2" />
    </Glyph>
  );
}

/** 문: 파랑. 열리면 점선·반투명 (.opened 는 CSS 가 투명도를 낮춘다) */
export function DoorGlyph({ open = false }: { open?: boolean }) {
  return (
    <Glyph style={{ color: 'var(--color-blue)' }} strokeDasharray={open ? '2.5 2.5' : undefined}>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" fill={open ? 'none' : 'currentColor'} fillOpacity={0.22} />
      <path d="M4 21h16" />
      <path d="M9 3v18" />
      <circle cx="14.5" cy="12.5" r="0.9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** 고양이: danger */
export function CatSprite() {
  return (
    <Glyph className="cat" style={{ color: 'var(--color-danger)' }}>
      <path d="M5 20V8.5l4 3h6l4-3V20z" fill="currentColor" fillOpacity={0.22} />
      <circle cx="9.5" cy="15" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="15" r="0.9" fill="currentColor" stroke="none" />
      <path d="M2 14h3M19 14h3" strokeWidth={1.25} />
      <path d="M11 18h2" />
    </Glyph>
  );
}
