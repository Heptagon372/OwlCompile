// 홈 (DESIGN_V4 §6): 로그인 안 했으면 /login, 계정이 하나도 없으면 /setup.
//  - 진행자·관리자: 인사말 + 지표 카드 4장(대기 인원·진행 중 게임·가입 회원·열린 초대) + 진행 중 게임 + 빠른 실행 타일
//  - 참가자: 인사말 + 큰 "대기실로" 카드(참가 중이면 "게임으로 돌아가기") 중심
//  - 아래: 라운드 목록
// 서버 컴포넌트: MAP_LIST 의 이름·난이도·상한·새 요소(intro)만 쓴다. 정답(SOLUTIONS·ROUND_EXTRAS)은 가져오지 않는다.
// 숫자는 모두 합계만 보여 준다 (개인정보 없음). 대기 명단 이름은 대기실 규칙대로 표시 이름만.
import { redirect } from 'next/navigation';
import { MAP_LIST } from '@/lib/engine/maps';
import { listAllGames, listInvites, listUsers, needsSetup } from '@/lib/server/auth';
import { activeGameOf, listGamesFor, openGames, waitingUsers } from '@/lib/server/game';
import { requirePageUser } from '@/lib/server/session';
import { PlayerHome, RoundsPanel, StaffHome, type RoundCardInfo } from '@/components/lobby/HomeViews';
import { cumulativeCounts, dailyCounts } from '@/components/lobby/lobbyUtil';
import { AppShell } from '@/components/ui/AppShell';

export const dynamic = 'force-dynamic';

const SPARK_DAYS = 7;
const DAY_MS = 86_400_000;

function todayLabel(now: number): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul' }).format(new Date(now));
}

export default async function HomePage() {
  if (needsSetup()) redirect('/setup');
  const user = await requirePageUser();
  const now = Date.now();
  const today = todayLabel(now);
  const waitingNames = waitingUsers().map((w) => w.displayName);
  const open = openGames();
  const rounds: RoundCardInfo[] = MAP_LIST.map((m) => ({
    round: m.round, name: m.name, difficulty: m.difficulty, cap: m.cap, intro: m.intro,
  }));

  if (user.role === 'player') {
    const my = activeGameOf(user.id);
    return (
      <AppShell user={user} title="홈">
        <div className="flex flex-col gap-5 lg:gap-6">
          <PlayerHome
            name={user.displayName}
            role={user.role}
            today={today}
            waitingNames={waitingNames}
            openGameCount={open.length}
            myGame={my ? { code: my.code, phase: my.phase } : null}
          />
          <RoundsPanel rounds={rounds} />
        </div>
      </AppShell>
    );
  }

  const games = user.role === 'admin' ? listAllGames() : listGamesFor(user);
  const active = games.filter((g) => g.phase !== 'finished');
  const users = listUsers();
  const invites = listInvites('');
  const weekAgo = now - SPARK_DAYS * DAY_MS;
  const userDates = users.map((u) => u.createdAt);
  return (
    <AppShell user={user} title="홈">
      <div className="flex flex-col gap-5 lg:gap-6">
        <StaffHome
          name={user.displayName}
          role={user.role}
          today={today}
          waitingNames={waitingNames}
          activeGames={active}
          openGameCount={open.length}
          gameSpark={dailyCounts(games.map((g) => g.createdAt), SPARK_DAYS, now)}
          memberCount={users.length}
          memberSpark={cumulativeCounts(userDates, SPARK_DAYS, now)}
          membersNew={userDates.filter((d) => Date.parse(d) >= weekAgo).length}
          pendingInvites={invites.filter((i) => i.status === 'pending').length}
          inviteSpark={dailyCounts(invites.map((i) => i.createdAt), SPARK_DAYS, now)}
        />
        <RoundsPanel rounds={rounds} />
      </div>
    </AppShell>
  );
}
