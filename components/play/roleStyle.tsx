// 역할 = 카드 색 (DESIGN_V4 §4 블록 색). 훅 없음.
// lib/engine/blocks 의 ROLES.color 는 옛 팔레트라서 화면에서는 카드 토큰(bg-move 등)으로 스와치를 그린다.
import { ROLE_HINT, ROLE_LABEL, type GameRole } from '@/lib/contracts';
import { BLOCKS, ROLES } from '@/lib/engine/blocks';

/** 역할 스와치 클래스: 아키텍트(함수 카드)는 유리형 카드라 스와치도 외곽선.
 *  라이트: 카드 색 점(특히 회전 #3FD6F2 는 흰 유리 위 1.7:1)이 흐려서 같은 색조의 라이트 토큰(파랑·청록·보라, 3:1 이상)으로 */
const SWATCH: Record<GameRole, string> = {
  runner: 'bg-move [html[data-theme=light]_&]:bg-blue',
  turner: 'bg-turn [html[data-theme=light]_&]:bg-cyan',
  controller: 'bg-control [html[data-theme=light]_&]:bg-violet',
  architect: 'border-[1.5px] border-function-line bg-function-bg',
};

/** 역할 색 작은 둥근 점 (카드 색 범례) */
export function RoleSwatch({ role, large = false }: { role: GameRole; large?: boolean }) {
  return (
    <i
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${large ? 'size-3' : 'size-2.5'} ${SWATCH[role]}`}
    />
  );
}

/** 역할 알약 (팀원 줄: 한 사람이 여러 개) */
export function RolePill({ role, className = '' }: { role: GameRole; className?: string }) {
  return (
    <span
      title={ROLE_HINT[role]}
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-stroke-strong bg-tint/[0.05] px-2 text-[11px] font-semibold leading-none text-text ${className}`}
    >
      <RoleSwatch role={role} />
      {ROLE_LABEL[role]}
    </span>
  );
}

/** 역할이 놓을 수 있는 카드 이름 (팔레트 순서) */
export function roleBlockLabels(role: GameRole): string[] {
  return ROLES[role].blocks.map((id) => BLOCKS[id].label);
}
