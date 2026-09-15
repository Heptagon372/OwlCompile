// 뷰모델 (docs/WEBSITE_SPEC.md §6, §12 "참가 전 조회", FEATURE_V4 §1–§2). 서버 전용.
// 참가자는 다른 팀 코드·다른 팀 결과 trace·정답을 받지 않는다. 비참가자는 로비 수준 정보만.
import {
  GAME_ROLES, sortRoles,
  type GameRole, type GameView, type JoinUrl, type MemberView, type Outcome, type ProgramText, type ResultView,
  type RoundNo, type TeamPersonView, type TeamView,
} from '@/lib/contracts';
import { SOLUTIONS, toText } from '@/lib/engine';
import type { Program } from '@/lib/engine';
import { all, bool, one } from './db';
import { onlineUserIds } from './realtime';
import { readStoredDoc } from './docSchema';
import type { SessionUser } from './session';
import { computeStandings } from './game/standings';
import {
  docOf, isHostOf, isPatchActive, mapOf, membersOf, membershipOf, parseLines, parseTrace,
  programsOf, resultsOf, roundsOf, teamsOf, type GameRow, type MemberRow, type ProgramRow, type ResultRow,
} from './game/rows';

function resultView(r: ResultRow, withTrace: boolean, withDoc: boolean): ResultView {
  const view: ResultView = {
    teamId: r.team_id,
    round: r.round as RoundNo,
    outcome: r.outcome as Outcome,
    message: r.message,
    ticks: r.ticks,
    blocks: r.blocks,
    mice: r.mice,
    // score = 엔진 점수만 (scoreLines 합). 이벤트 점수는 bonus/bonusNote로 따로. 라운드 점수 = score + bonus
    score: r.score,
    scoreLines: parseLines(r.score_lines),
    bonus: r.bonus,
    bonusNote: r.bonus_note,
    usedPatch: bool(r.used_patch),
    runOrder: r.run_order,
    runSeq: r.run_seq ?? 0,
    trace: withTrace ? parseTrace(r.trace) : null,
  };
  // 실행한 코드: 진행자·보드에만 (다른 팀 코드는 참가자에게 주지 않는다)
  if (withDoc && r.doc !== null && r.doc !== undefined) view.doc = readStoredDoc(r.doc);
  return view;
}

/** 팀의 사람 목록: 들어온 순서, 사람마다 역할 여러 개 */
function peopleOf(rows: readonly MemberRow[], names: Map<string, string>, online: Set<string>): TeamPersonView[] {
  const byUser = new Map<string, TeamPersonView>();
  for (const m of rows) {
    let p = byUser.get(m.user_id);
    if (!p) {
      p = { userId: m.user_id, displayName: names.get(m.user_id) ?? '', roles: [], online: online.has(m.user_id), memberIds: {} };
      byUser.set(m.user_id, p);
    }
    p.roles.push(m.role);
    p.memberIds[m.role] = m.id;
  }
  return [...byUser.values()].map((p) => ({ ...p, roles: sortRoles(p.roles) }));
}

/** 현재 라운드 정답 (엔진에 없는 라운드면 빈 목록) */
function solutionsFor(round: RoundNo): Program[] {
  return (SOLUTIONS as Partial<Record<string, Program[]>>)[`r${round}`] ?? [];
}

/**
 * opts.joinUrls: 폰 참가 주소 후보를 만드는 함수 (라우트가 요청으로 만든다). 진행자·보드에게만 부른다.
 * 없으면 진행자 뷰의 joinUrls는 빈 배열.
 */
export function buildView(game: GameRow, viewer: SessionUser, opts: { joinUrls?: () => JoinUrl[] } = {}): GameView {
  const isHost = isHostOf(game, viewer);
  const mine = membershipOf(game.id, viewer.id);
  const isMember = mine.teamId !== null;
  const online = onlineUserIds(game.id);
  const hostName = one<{ display_name: string }>('select display_name from users where id = ?', game.host_id)
    ?.display_name ?? '';
  const rounds = roundsOf(game);

  const names = new Map(
    all<{ id: string; display_name: string }>(
      'select distinct u.id, u.display_name from members m join users u on u.id = m.user_id where m.game_id = ?',
      game.id,
    ).map((u) => [u.id, u.display_name]),
  );
  const members = membersOf(game.id);
  const programs = new Map<string, ProgramRow>(programsOf(game.id, game.round).map((p) => [p.team_id, p]));
  const teamRows = teamsOf(game.id);

  const teams: TeamView[] = teamRows.map((t) => {
    const p = programs.get(t.id);
    const rows = members.filter((m) => m.team_id === t.id);
    const covered = new Set<GameRole>(rows.map((m) => m.role));
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      seat: t.seat,
      patchLeft: t.patch_left,
      patchActive: isPatchActive(game, t, p),
      members: [...rows]
        .sort((x, y) => GAME_ROLES.indexOf(x.role) - GAME_ROLES.indexOf(y.role))
        .map((m): MemberView => ({
          id: m.id, userId: m.user_id, displayName: names.get(m.user_id) ?? '', role: m.role, online: online.has(m.user_id),
        })),
      people: peopleOf(rows, names, online),
      missingRoles: GAME_ROLES.filter((r) => !covered.has(r)),
      program: {
        blocks: p?.blocks ?? 0,
        submittedAt: p?.submitted_at ?? null,
        submitOrder: p?.submit_order ?? null,
        sealedBy: p?.sealed_by ?? null,
      },
    };
  });

  let myProgram: GameView['myProgram'] = null;
  if (isMember) {
    const team = teamRows.find((t) => t.id === mine.teamId);
    const p = programs.get(mine.teamId!);
    if (team && p) {
      const patchActive = isPatchActive(game, team, p);
      myProgram = {
        teamId: team.id,
        doc: docOf(p),
        version: p.version,
        blocks: p.blocks,
        submittedAt: p.submitted_at,
        editable: (game.phase === 'coding' && p.submitted_at === null) || patchActive,
        patchActive,
      };
    }
  }

  // 결과: 진행자·보드는 모두 trace 포함, 참가자는 자기 팀 것만, 비참가자는 trace 없음
  const results = resultsOf(game.id, game.round).map((r) =>
    resultView(r, isHost || (isMember && r.team_id === mine.teamId), isHost));

  const view: GameView = {
    me: {
      userId: viewer.id,
      displayName: viewer.displayName,
      accountRole: viewer.role,
      isHost,
      ownsGame: game.host_id === viewer.id,
      teamId: mine.teamId,
      roles: mine.roles,
    },
    game: {
      code: game.code,
      round: game.round,
      rounds,
      roundIndex: rounds.indexOf(game.round),
      mode: game.mode,
      phase: game.phase,
      timerEndsAt: game.timer_ends_at,
      timerRemaining: game.timer_remaining,
      runningTeamId: game.running_team_id,
      autoplay: bool(game.autoplay),
      hostName,
      shownUpTo: game.shown_up_to ?? 0,
    },
    serverNow: new Date().toISOString(),
    map: mapOf(game),
    teams,
    myProgram,
    results,
    standings: computeStandings(game.id),
  };

  if (isHost) {
    view.solutions = solutionsFor(game.round).map((s) => toText(s).text);
    const texts: Record<string, ProgramText> = {};
    for (const t of teamRows) {
      const doc = docOf(programs.get(t.id));
      texts[t.id] = { doc, text: toText(doc).text };
    }
    view.programs = texts;
    view.joinUrls = opts.joinUrls ? opts.joinUrls() : [];
  }
  return view;
}
