// 게임 서버 공개 API (docs/WEBSITE_SPEC.md §3, §5, §8, FEATURE_V4). 서버 전용.
// 구현은 lib/server/game/*.ts 에 나눠 두고 여기서 모아 내보낸다.
export {
  CODE_PATTERN, gameByCode, gameById, isHostOf, requireHost, isPatchActive, mapOf, roundsOf, availableRounds,
  membershipOf, teamsOf, membersOf, programOf, programsOf, resultOf, resultsOf, teamHeadcount, activeGameOf,
  type GameRow, type TeamRow, type MemberRow, type ProgramRow, type ResultRow,
} from './game/rows';
export { createGame, checkRounds, listGamesFor, joinGame, leaveGame, kickMember, type CreateGameOptions } from './game/lobby';
export {
  createGameFromLobby, pullFromLobby, assignMember, lobbyArrive, joinFromLobby, lobbySnapshot, homePathFor, placeUsers,
} from './game/waiting';
export { waitingUsers, openGames, emitLobby, flushLobby } from './game/lobbyFeed';
export { saveProgram, submitProgram, roleViolations } from './game/program';
export { applyTransition, transitionPhase, tickAutoSeal, runTeamProgram, type TeamRun } from './game/phase';
export { controlTimer, selectRunningTeam, setAutoplay, allowPatch, rerunTeam, addBonus } from './game/ops';
export { computeStandings } from './game/standings';
export { ensureRuntime } from './game/runtime';
