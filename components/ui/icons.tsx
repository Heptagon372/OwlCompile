// 선 아이콘 모음 (DESIGN_V2·V3 §2: 1.75px 선, viewBox 24, 기본 20px). 훅 없음: 서버·클라이언트 어디서나.
// 사용: <IconPlay size={18} />  또는 이름으로 <Icon name="play" /> (클라이언트 경계를 넘길 때는 이름을 넘긴다).
import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number | string;
  className?: string;
  strokeWidth?: number;
  /** 접근성 이름. 없으면 aria-hidden(장식) */
  title?: string;
}

function make(name: string, body: ReactNode, opts: { fill?: boolean } = {}) {
  function IconComponent({ size = 20, className, strokeWidth = 1.75, title, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden={title ? undefined : true}
        role={title ? 'img' : undefined}
        focusable="false"
        data-icon={name}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {body}
      </svg>
    );
  }
  IconComponent.displayName = `Icon(${name})`;
  return IconComponent;
}

/* ---------- 앱 셸 / 내비 ---------- */
export const IconHome = make('home', <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h5v-6h4v6h5V10" /></>);
export const IconJoin = make('join', <><path d="M14 4h5v16h-5" /><path d="M3 12h11" /><path d="M10 8l4 4-4 4" /></>);
export const IconHost = make('host', <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8 20h8" /><path d="M10.5 7.5v5l4-2.5z" /></>);
export const IconAdmin = make('admin', <><path d="M12 3l8 3v6c0 4.4-3.4 7.5-8 9-4.6-1.5-8-4.6-8-9V6z" /><path d="M9 12l2 2 4-4" /></>);
export const IconAccount = make('account', <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>);
export const IconLogout = make('logout', <><path d="M10 4H5v16h5" /><path d="M21 12H9" /><path d="M17 8l4 4-4 4" /></>);
export const IconMenu = make('menu', <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>);
export const IconClose = make('close', <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>);

/* ---------- 재생 컨트롤 ---------- */
export const IconPlay = make('play', <path d="M7 5v14l12-7z" fill="currentColor" />);
export const IconPause = make('pause', <><path d="M7 5h3v14H7z" fill="currentColor" /><path d="M14 5h3v14h-3z" fill="currentColor" /></>);
export const IconStepBack = make('stepBack', <><path d="M7 6v12" /><path d="M18 6l-9 6 9 6z" fill="currentColor" /></>);
export const IconStepForward = make('stepForward', <><path d="M17 6v12" /><path d="M6 6l9 6-9 6z" fill="currentColor" /></>);
export const IconSkipStart = make('skipStart', <><path d="M5 6v12" /><path d="M20 6l-11 6 11 6z" fill="currentColor" /></>);
export const IconSkipEnd = make('skipEnd', <><path d="M19 6v12" /><path d="M4 6l11 6-11 6z" fill="currentColor" /></>);
export const IconFullscreen = make('fullscreen', <><path d="M4 9V4h5" /><path d="M15 4h5v5" /><path d="M20 15v5h-5" /><path d="M9 20H4v-5" /></>);
export const IconRefresh = make('refresh', <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v5h-5" /></>);

/* ---------- 동작 · 상태 ---------- */
export const IconCheck = make('check', <path d="M5 12l5 5L20 7" />);
export const IconSubmit = make('submit', <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>);
export const IconTimer = make('timer', <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2" /><path d="M9 3h6" /></>);
export const IconWifi = make('wifi', <><path d="M2 9c6-5 14-5 20 0" /><path d="M5.5 12.5c4-3.3 9-3.3 13 0" /><path d="M9 16c1.8-1.5 4.2-1.5 6 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></>);
export const IconCopy = make('copy', <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></>);
export const IconTrash = make('trash', <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>);
export const IconPlus = make('plus', <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const IconChevronDown = make('chevronDown', <path d="M6 9l6 6 6-6" />);
export const IconChevronUp = make('chevronUp', <path d="M6 15l6-6 6 6" />);
export const IconChevronLeft = make('chevronLeft', <path d="M15 6l-6 6 6 6" />);
export const IconChevronRight = make('chevronRight', <path d="M9 6l6 6-6 6" />);
export const IconAlert = make('alert', <><path d="M12 3.5L21.5 20h-19z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.5" r="0.6" fill="currentColor" /></>);
export const IconInfo = make('info', <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><circle cx="12" cy="8.2" r="0.6" fill="currentColor" /></>);
export const IconLink = make('link', <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5" /></>);
export const IconUsers = make('users', <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.7c2.2.7 3.5 2.4 3.5 5.3" /></>);
export const IconCode = make('code', <><path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" /><path d="M14 5l-4 14" /></>);
export const IconMap = make('map', <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>);
export const IconFlag = make('flag', <><path d="M5 21V4" /><path d="M5 4h13l-2.5 4 2.5 4H5" /></>);
export const IconUndo = make('undo', <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>);
export const IconLock = make('lock', <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const IconUnlock = make('unlock', <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.6-1.7" /></>);
export const IconEye = make('eye', <><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = make('eyeOff', <><path d="M3 3l18 18" /><path d="M10.6 5.8A11 11 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a17 17 0 0 1-3.2 3.9" /><path d="M6.4 6.4A17 17 0 0 0 2 12s3.5 6.5 10 6.5c1.6 0 3-.4 4.2-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);

/* ---------- 맵 요소 ---------- */
export const IconKey = make('key', <><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3" /><path d="M17 6l3 3" /><path d="M14 9l2 2" /></>);
export const IconDoor = make('door', <><path d="M6 21V3h12v18" /><path d="M4 21h16" /><circle cx="14.5" cy="12.5" r="0.8" fill="currentColor" /></>);
export const IconMouse = make('mouse', <><path d="M4.5 15c0-3.8 3.2-6.5 7.5-6.5 3.6 0 6.5 2.3 6.5 5 0 2-1.4 3.5-3.5 3.5H8c-2 0-3.5-.8-3.5-2z" /><circle cx="15.5" cy="7.5" r="1.8" /><circle cx="15.5" cy="12.5" r="0.6" fill="currentColor" /><path d="M4.5 15c-1.8.2-2.8 1.5-2 3.3" /></>);
export const IconCat = make('cat', <><path d="M5 20V9l4 3h6l4-3v11z" /><circle cx="9.5" cy="15" r="0.7" fill="currentColor" /><circle cx="14.5" cy="15" r="0.7" fill="currentColor" /><path d="M2 14h3M19 14h3" /><path d="M11 18h2" /></>);
export const IconOwl = make('owl', <><path d="M6 20V10a6 6 0 0 1 12 0v10z" /><path d="M6 10L5 4l4 2" /><path d="M18 10l1-6-4 2" /><circle cx="9.5" cy="11" r="1.6" /><circle cx="14.5" cy="11" r="1.6" /><path d="M12 13.5l-1.3 2.2h2.6z" fill="currentColor" /></>);
export const IconTarget = make('target', <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>);

/* ---------- 블록 (카드 아이콘과 같은 모양) ---------- */
export const IconRepeat = make('repeat', <><path d="M4 12a8 8 0 0 1 14-5.3" /><path d="M20 12a8 8 0 0 1-14 5.3" /><path d="M18 3v4h-4" /><path d="M6 21v-4h4" /></>);
export const IconIfBranch = make('ifBranch', <><path d="M12 21V11" /><path d="M12 11L6 5" /><path d="M12 11l6-6" /><path d="M6 5H3v3" /><path d="M18 5h3v3" /></>);
export const IconFunc = make('func', <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 16V8h5" /><path d="M9 12h4" /></>);
export const IconCall = make('call', <><path d="M7 16V8h5" /><path d="M7 12h4" /><path d="M14 12h7" /><path d="M18 9l3 3-3 3" /></>);
export const IconSleep = make('sleep', <><path d="M4 10h5l-5 6h5" /><path d="M13 4h6l-6 7h6" /></>);
export const IconForward = make('forward', <><path d="M12 20V4" /><path d="M5 11l7-7 7 7" /></>);
export const IconJump = make('jump', <><path d="M3 18c3-10 15-10 18 0" /><path d="M21 18v-4h-4" /><circle cx="3" cy="18" r="1.2" fill="currentColor" /></>);
export const IconTurnLeft = make('turnLeft', <><path d="M20 18a8 8 0 0 0-8-8H4" /><path d="M8 6L4 10l4 4" /></>);
export const IconTurnRight = make('turnRight', <><path d="M4 18a8 8 0 0 1 8-8h8" /><path d="M16 6l4 4-4 4" /></>);

/* ---------- v4 (대기실·홈·프로젝터) ---------- */
/** 대기실 (소파) */
export const IconLobby = make('lobby', <><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" /><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M6 18v2M18 18v2" /></>);
export const IconSparkle = make('sparkle', <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>);
export const IconSearch = make('search', <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>);
export const IconBell = make('bell', <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>);
export const IconTrophy = make('trophy', <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4" /><path d="M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4" /><path d="M8 20h8" /></>);
export const IconLayers = make('layers', <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>);
export const IconGrid = make('grid', <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>);
export const IconBolt = make('bolt', <path d="M13 3L5 14h6l-1 7 8-11h-6z" />);
export const IconHourglass = make('hourglass', <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9" /><path d="M16 3c0 5-8 5-8 9s8 4 8 9" /></>);

/* ---------- 기타 ---------- */
/** 새 탭으로 열기 (보드 열기 등) */
export const IconExternal = make('external', <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v6H4V5h6" /></>);
/** 카드 오른쪽 위 화살표 (ArrowCircle 안) */
export const IconArrowUpRight = make('arrowUpRight', <><path d="M7 17L17 7" /><path d="M8 7h9v9" /></>);
export const IconArrowRight = make('arrowRight', <><path d="M4 12h16" /><path d="M14 6l6 6-6 6" /></>);

/** 이름 → 컴포넌트 (클라이언트 경계를 넘길 때 이름 문자열을 쓴다) */
export const ICONS = {
  home: IconHome, join: IconJoin, host: IconHost, admin: IconAdmin, account: IconAccount, logout: IconLogout,
  menu: IconMenu, close: IconClose,
  play: IconPlay, pause: IconPause, stepBack: IconStepBack, stepForward: IconStepForward,
  skipStart: IconSkipStart, skipEnd: IconSkipEnd, fullscreen: IconFullscreen, refresh: IconRefresh,
  check: IconCheck, submit: IconSubmit, timer: IconTimer, wifi: IconWifi, copy: IconCopy, trash: IconTrash, plus: IconPlus,
  chevronDown: IconChevronDown, chevronUp: IconChevronUp, chevronLeft: IconChevronLeft, chevronRight: IconChevronRight,
  alert: IconAlert, info: IconInfo, link: IconLink, users: IconUsers, code: IconCode, map: IconMap, flag: IconFlag,
  undo: IconUndo, lock: IconLock, unlock: IconUnlock, eye: IconEye, eyeOff: IconEyeOff,
  key: IconKey, door: IconDoor, mouse: IconMouse, cat: IconCat, owl: IconOwl, target: IconTarget,
  repeat: IconRepeat, ifBranch: IconIfBranch, func: IconFunc, call: IconCall, sleep: IconSleep,
  forward: IconForward, jump: IconJump, turnLeft: IconTurnLeft, turnRight: IconTurnRight,
  external: IconExternal, arrowUpRight: IconArrowUpRight, arrowRight: IconArrowRight,
  lobby: IconLobby, sparkle: IconSparkle, search: IconSearch, bell: IconBell, trophy: IconTrophy,
  layers: IconLayers, grid: IconGrid, bolt: IconBolt, hourglass: IconHourglass,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const C = ICONS[name];
  return <C {...props} />;
}
