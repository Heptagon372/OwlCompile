// 초대 상태 문구 (클라이언트용). 서버 문구는 lib/server/auth.ts의 inviteReasonMessage.
import type { InviteInvalidReason, InviteRole } from '@/lib/contracts';

export const INVITE_REASON_TEXT: Record<InviteInvalidReason, { title: string; body: string }> = {
  not_found: { title: '없는 초대 코드입니다', body: '받은 링크나 코드를 다시 확인해 주세요.' },
  used: { title: '이미 사용한 초대입니다', body: '초대는 한 번만 쓸 수 있어요. 이미 가입했다면 로그인해 주세요.' },
  expired: { title: '기간이 지난 초대입니다', body: '관리자에게 새 초대 링크를 받아 주세요.' },
  revoked: { title: '취소된 초대입니다', body: '관리자에게 문의해 주세요.' },
};

export const INVITE_ROLE_TEXT: Record<InviteRole, string> = {
  // FEATURE_V4 §3: 가입 → 대기실 → 진행자가 게임을 만들면 자동 배정. 게임 코드는 보조 수단
  player: '참가자로 초대받았어요. 가입하면 대기실에서 기다리다가 진행자가 게임을 만들면 자동으로 팀에 들어갑니다.',
  host: '진행자로 초대받았어요. 게임을 만들고 진행할 수 있습니다.',
};
