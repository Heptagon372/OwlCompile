// 누적 순위 (docs/WEBSITE_SPEC.md §6): 누적 점수 → 도착 라운드 수 → 총 틱 적은 팀. 서버 전용.
// 라운드 열 = 게임에서 고른 라운드들 (FEATURE_V4 §1). rounds[i]는 GameInfo.rounds[i] 라운드의 점수.
import type { RoundNo, StandingRow } from '@/lib/contracts';
import { one } from '../db';
import { resultsOf, roundsOf, teamsOf } from './rows';

export function computeStandings(gameId: string): StandingRow[] {
  const teams = teamsOf(gameId);
  const selected = roundsOf({ rounds: one<{ rounds: string }>('select rounds from games where id = ?', gameId)?.rounds ?? '' });
  const byTeam = new Map<string, Omit<StandingRow, 'rank'>>();
  for (const t of teams) {
    byTeam.set(t.id, { teamId: t.id, total: 0, rounds: selected.map(() => null), goals: 0, ticks: 0 });
  }
  for (const r of resultsOf(gameId)) {
    const row = byTeam.get(r.team_id);
    const col = selected.indexOf(r.round as RoundNo);
    if (!row || col < 0) continue;
    const points = r.score + r.bonus;
    row.rounds[col] = points;
    row.total += points;
    if (r.outcome === 'goal') row.goals += 1;
    row.ticks += r.ticks;
  }
  const seat = new Map(teams.map((t) => [t.id, t.seat]));
  const sorted = [...byTeam.values()].sort(
    (a, b) => b.total - a.total || b.goals - a.goals || a.ticks - b.ticks
      || (seat.get(a.teamId) ?? 0) - (seat.get(b.teamId) ?? 0),
  );
  // 세 기준이 모두 같으면 같은 등수 (1, 1, 3 …)
  const out: StandingRow[] = [];
  sorted.forEach((row, i) => {
    const prev = out[i - 1];
    const tied = prev && prev.total === row.total && prev.goals === row.goals && prev.ticks === row.ticks;
    out.push({ ...row, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}
