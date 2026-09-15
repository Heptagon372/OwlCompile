// 프로세스당 한 번: 자동 봉인 틱커 + 온라인 변화 → teams / lobby 이벤트 (docs/WEBSITE_SPEC.md §7, FEATURE_V4 §3). 서버 전용.
import { LOBBY_CHANNEL, onPresenceChange, startTicker } from '../realtime';
import { emitTeams } from './events';
import { emitLobby } from './lobbyFeed';
import { tickAutoSeal } from './phase';

const store = globalThis as unknown as { __owlGameRuntime?: boolean };

/** 여러 번 불러도 한 번만 등록된다 (instrumentation + 각 게임·대기실 라우트) */
export function ensureRuntime(): void {
  if (store.__owlGameRuntime) return;
  store.__owlGameRuntime = true;
  onPresenceChange('owl-presence', (channel) => {
    if (channel === LOBBY_CHANNEL) emitLobby();
    else emitTeams(channel);
  });
  startTicker('owl-autoseal', () => {
    tickAutoSeal();
  }, 1000);
}
