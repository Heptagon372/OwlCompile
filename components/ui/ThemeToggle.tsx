'use client';
// 해·달 토글 (docs/THEME_V5.md §2). 72×36 알약 트랙 (버튼은 44px 높이라 폰에서도 터치 영역 44px 이상).
//  트랙: 나이트 = 짙은 남보라 밤하늘 + 반짝이는 별 5개 / 라이트 = 하늘색→라벤더 + 구름 2개.
//  손잡이 28px: 라이트 = 왼쪽의 해(금색 원 + 짧은 햇살), 나이트 = 오른쪽의 은빛 초승달(표면 점 3개).
//  전환 0.6s cubic-bezier(.65,0,.35,1): 손잡이가 옆으로 미끄러지며 해가 굴러가 트랙 아래로 지고 달이 왼쪽 위에서 떠오른다
//  (나이트→라이트는 거울: 달이 왼쪽으로 굴러 지고 해가 오른쪽 위에서 떠오른다). 트랙 하늘은 옆으로 흐르고, 구름은 오른쪽으로 빠지고
//  별은 하나씩 켜진다. 모든 연출은 transform·opacity 만 (globals.css 의 .owl-tt*).
// 모양은 <html data-theme> 를 CSS 가 읽어 정한다 → 첫 그림부터 맞고 깜빡이지 않는다. 방향 연출은 <html data-theme-anim>.
// 움직임 줄이기면 손잡이·아이콘만 즉시 바뀌고 화면 전환도 없다.
// 접근성: role="switch" aria-checked={나이트}, 이름은 늘 "나이트 모드" (스위치 이름은 '켜짐'의 뜻이라 바뀌지 않는다 →
// "나이트 모드, 스위치, 켜짐/꺼짐"), Space·Enter(버튼 기본), 보이는 포커스 링, 툴팁(바뀔 모드 이름: "라이트 모드" / "나이트 모드").
// size="compact": 좁은 머리 줄(/play 폰)에서 트랙을 0.8배로 (터치 영역 44px 은 그대로).
import { useId } from 'react';
import { toggleTheme } from '@/lib/client/theme';
import { useTheme } from './ThemeProvider';

export interface ThemeToggleProps {
  className?: string;
  /** 툴팁 위치: below(기본, 머리 줄) · above · none */
  tooltip?: 'below' | 'above' | 'none';
  /** 툴팁 가로 정렬: end(기본, 오른쪽 끝 맞춤 — 화면 오른쪽에 둘 때) · center · start */
  tooltipAlign?: 'end' | 'center' | 'start';
  /** 크기: md(기본 72×36 트랙) · compact(폰 <640px 에서 58×29 트랙, 버튼 높이 44px 유지) */
  size?: 'md' | 'compact';
}

/* 별: [x, y, 크기, 모양] — 반짝이 4갈래(s) 또는 점(d). 나이트 손잡이(오른쪽 x 40~68)를 피해 왼쪽·가운데에 */
const STARS: readonly [number, number, number, 's' | 'd'][] = [
  [11, 11, 3.4, 's'],
  [29, 9.5, 2.4, 's'],
  [21.5, 23.5, 1.05, 'd'],
  [14, 27.5, 0.8, 'd'],
  [34, 21.5, 0.9, 'd'],
];

function sparkle(x: number, y: number, s: number): string {
  return `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;
}

/* 햇살 8개: 반지름 9.6 → 12.3 */
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const r0 = 9.6;
  const r1 = 12.3;
  const f = (n: number) => Math.round(n * 100) / 100;
  return { x1: f(14 + r0 * Math.cos(a)), y1: f(14 + r0 * Math.sin(a)), x2: f(14 + r1 * Math.cos(a)), y2: f(14 + r1 * Math.sin(a)) };
});

export function ThemeToggle({ className = '', tooltip = 'below', tooltipAlign = 'end', size = 'md' }: ThemeToggleProps) {
  const theme = useTheme();
  const night = theme === 'night';
  const target = night ? '라이트 모드' : '나이트 모드';
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sunG = `owl-tt-sun-${uid}`;
  const moonG = `owl-tt-moon-${uid}`;
  const moonM = `owl-tt-cut-${uid}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={night}
      aria-label="나이트 모드"
      data-tip={tooltip}
      data-tip-align={tooltipAlign}
      data-size={size === 'compact' ? 'compact' : undefined}
      className={`owl-tt ${className}`}
      onClick={(e) => {
        void toggleTheme({ source: e.currentTarget });
      }}
    >
      <span className="owl-tt-track" aria-hidden="true">
        <span className="owl-tt-band" />
        <svg className="owl-tt-stars" viewBox="0 0 72 36" focusable="false">
          {STARS.map(([x, y, s, k], i) => (
            <g key={i} className="owl-tt-star" style={{ ['--i' as string]: i }}>
              {k === 's' ? <path className="owl-tt-twinkle" d={sparkle(x, y, s)} /> : <circle className="owl-tt-twinkle" cx={x} cy={y} r={s} />}
            </g>
          ))}
        </svg>
        <svg className="owl-tt-clouds" viewBox="0 0 72 36" focusable="false">
          <g className="owl-tt-cloud">
            <circle cx="42" cy="22.5" r="4" />
            <circle cx="47.5" cy="20.5" r="5.2" />
            <circle cx="52.5" cy="23" r="3.4" />
            <rect x="38.5" y="22" width="17" height="5" rx="2.5" />
          </g>
          <g className="owl-tt-cloud owl-tt-cloud-2">
            <circle cx="57.5" cy="11.5" r="2.4" />
            <circle cx="61" cy="10.5" r="3" />
            <rect x="55.3" y="11" width="9" height="3.2" rx="1.6" />
          </g>
        </svg>
        <span className="owl-tt-knob">
          <svg className="owl-tt-sun" viewBox="0 0 28 28" focusable="false">
            <defs>
              <radialGradient id={sunG} cx="0.4" cy="0.38" r="0.7">
                <stop offset="0" stopColor="#FFF6C4" />
                <stop offset="0.5" stopColor="#FFD257" />
                <stop offset="1" stopColor="#F5A012" />
              </radialGradient>
            </defs>
            <g className="owl-tt-rays">
              {RAYS.map((r, i) => (
                <line key={i} {...r} />
              ))}
            </g>
            <circle cx="14" cy="14" r="7.2" fill={`url(#${sunG})`} />
            <circle cx="11.6" cy="11.4" r="1.9" fill="#FFFFFF" fillOpacity="0.55" />
          </svg>
          <svg className="owl-tt-moon" viewBox="0 0 28 28" focusable="false">
            <defs>
              <radialGradient id={moonG} cx="0.35" cy="0.35" r="0.75">
                <stop offset="0" stopColor="#FBFAFF" />
                <stop offset="0.6" stopColor="#E2DEF4" />
                <stop offset="1" stopColor="#B9B2D8" />
              </radialGradient>
              <mask id={moonM} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
                <rect width="28" height="28" fill="#FFFFFF" />
                <circle cx="19.5" cy="8.5" r="8.6" fill="#000000" />
              </mask>
            </defs>
            <g mask={`url(#${moonM})`}>
              <circle cx="14" cy="14" r="10.5" fill={`url(#${moonG})`} />
              <circle cx="9.4" cy="16.2" r="1.8" fill="#A69FC9" fillOpacity="0.75" />
              <circle cx="13.6" cy="20.6" r="1.2" fill="#A69FC9" fillOpacity="0.7" />
              <circle cx="8.3" cy="10.6" r="1.05" fill="#A69FC9" fillOpacity="0.65" />
            </g>
          </svg>
        </span>
      </span>
      {tooltip !== 'none' ? (
        <span className="owl-tt-tip" aria-hidden="true">
          {target}
        </span>
      ) : null}
    </button>
  );
}
