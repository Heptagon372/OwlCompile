// 버전형 DB 마이그레이션 (docs/FEATURE_V4.md §6): 옛 스키마로 만든 DB 파일을 v2로 올린 뒤 데이터·제약을 확인한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA_VERSION, getDb, resetDb, schemaVersion } from '@/lib/server/db';

// ------------------------------------------------------------------ 옛 스키마 (v4 전의 CREATE 문 그대로)
const OLD_SCHEMA_TODAY = `
create table if not exists users (
  id text primary key,
  username text unique not null collate nocase,
  display_name text not null,
  password_hash text not null,
  role text not null check (role in ('admin','host','player')),
  status text not null default 'active' check (status in ('active','disabled')),
  must_change_password integer not null default 0,
  created_at text not null,
  last_login_at text
);
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users on delete cascade,
  created_at text not null,
  expires_at text not null
);
create index if not exists sessions_user on sessions(user_id);
create table if not exists invites (
  code text primary key,
  role text not null check (role in ('host','player')),
  note text not null default '',
  created_by text references users on delete set null,
  created_at text not null,
  expires_at text,
  used_by text references users on delete set null,
  used_at text,
  revoked_at text
);
create index if not exists invites_used_by on invites(used_by);
create table if not exists games (
  id text primary key,
  code text unique not null,
  host_id text not null references users,
  round integer not null default 1 check (round between 1 and 5),
  phase text not null default 'lobby' check (phase in ('lobby','coding','sealed','running','scored','finished')),
  timer_ends_at text,
  timer_remaining integer,
  running_team_id text,
  autoplay integer not null default 1,
  created_at text not null,
  shown_up_to integer not null default 0
);
create table if not exists teams (
  id text primary key,
  game_id text not null references games on delete cascade,
  name text not null,
  color text not null,
  seat integer not null,
  patch_left integer not null default 1
);
create index if not exists teams_game on teams(game_id);
create table if not exists members (
  id text primary key,
  game_id text not null references games on delete cascade,
  team_id text not null references teams on delete cascade,
  user_id text not null references users on delete cascade,
  role text not null check (role in ('runner','turner','controller','architect')),
  joined_at text not null,
  unique (team_id, role)
);
create index if not exists members_game on members(game_id);
create index if not exists members_user on members(user_id);
create table if not exists programs (
  team_id text not null references teams on delete cascade,
  round integer not null,
  game_id text not null,
  doc text not null default '[]',
  version integer not null default 0,
  blocks integer not null default 0,
  submitted_at text,
  submit_order integer,
  sealed_by text check (sealed_by in ('architect','auto')),
  prepatch_doc text,
  primary key (team_id, round)
);
create index if not exists programs_game on programs(game_id, round);
create table if not exists results (
  team_id text not null references teams on delete cascade,
  round integer not null,
  game_id text not null,
  outcome text not null,
  message text not null,
  ticks integer not null,
  blocks integer not null,
  mice integer not null,
  trace text not null,
  used_patch integer not null default 0,
  score integer not null,
  score_lines text not null,
  bonus integer not null default 0,
  bonus_note text not null default '',
  run_order integer not null,
  run_seq integer not null default 0,
  doc text,
  reran integer not null default 0,
  primary key (team_id, round)
);
create index if not exists results_game on results(game_id, round);
create table if not exists game_players (
  game_id text not null references games on delete cascade,
  user_id text not null references users on delete cascade,
  team_id text not null references teams on delete cascade,
  primary key (game_id, user_id)
);
`;

/** 열 추가식 마이그레이션이 생기기 전의 가장 오래된 스키마 (shown_up_to·run_seq·doc·reran·prepatch_doc·game_players 없음) */
const OLD_SCHEMA_OLDEST = OLD_SCHEMA_TODAY
  .replace(',\n  shown_up_to integer not null default 0', '')
  .replace(',\n  prepatch_doc text', '')
  .replace(',\n  run_seq integer not null default 0,\n  doc text,\n  reran integer not null default 0', '')
  .replace(/create table if not exists game_players[\s\S]*?\);\n/, '');

// ------------------------------------------------------------------ 표본 데이터
const T = '2026-09-01T10:00:00.000Z';

function seed(db: Database.Database, oldest: boolean): void {
  const user = db.prepare(`insert into users (id, username, display_name, password_hash, role, created_at)
                           values (?, ?, ?, 'hash', ?, ?)`);
  user.run('u-host', 'host1', '진행자', 'host', T);
  user.run('u-a', 'alice', '앨리스', 'player', T);
  user.run('u-b', 'bob', '밥', 'player', T);
  db.prepare(`insert into sessions (token_hash, user_id, created_at, expires_at) values ('tok', 'u-a', ?, ?)`).run(T, T);
  db.prepare(`insert into invites (code, role, note, created_by, created_at, used_by, used_at)
              values ('ABCD-EFGH', 'player', '앨리스', 'u-host', ?, 'u-a', ?)`).run(T, T);
  if (oldest) {
    db.prepare(`insert into games (id, code, host_id, round, phase, timer_remaining, running_team_id, autoplay, created_at)
                values ('g1', '1234', 'u-host', 3, 'scored', 40, 't-a', 0, ?)`).run(T);
  } else {
    db.prepare(`insert into games (id, code, host_id, round, phase, timer_remaining, running_team_id, autoplay, created_at, shown_up_to)
                values ('g1', '1234', 'u-host', 3, 'scored', 40, 't-a', 0, ?, 2)`).run(T);
  }
  db.prepare(`insert into games (id, code, host_id, round, phase, created_at) values ('g2', '5678', 'u-host', 5, 'finished', ?)`).run(T);
  const team = db.prepare('insert into teams (id, game_id, name, color, seat, patch_left) values (?, ?, ?, ?, ?, ?)');
  team.run('t-a', 'g1', '수리부엉이', '#8E5CFF', 0, 0);
  team.run('t-b', 'g1', '올빼미', '#2FC4D9', 1, 1);
  team.run('t-c', 'g2', '소쩍새', '#FFB020', 0, 1);
  const member = db.prepare('insert into members (id, game_id, team_id, user_id, role, joined_at) values (?, ?, ?, ?, ?, ?)');
  member.run('m1', 'g1', 't-a', 'u-a', 'runner', T);
  member.run('m2', 'g1', 't-a', 'u-a', 'architect', T);
  member.run('m3', 'g1', 't-b', 'u-b', 'turner', T);
  member.run('m4', 'g2', 't-c', 'u-b', 'controller', T);
  db.prepare(`insert into programs (team_id, round, game_id, doc, version, blocks, submitted_at, submit_order, sealed_by)
              values ('t-a', 3, 'g1', '[{"id":"forward"}]', 4, 1, ?, 1, 'architect')`).run(T);
  db.prepare(`insert into programs (team_id, round, game_id) values ('t-b', 3, 'g1')`).run();
  db.prepare(`insert into results (team_id, round, game_id, outcome, message, ticks, blocks, mice, trace, used_patch,
              score, score_lines, bonus, bonus_note, run_order)
              values ('t-a', 3, 'g1', 'goal', '도착', 20, 5, 2, '[]', 0, 150, '[]', 5, '코드 리뷰', 1)`).run();
  if (!oldest) {
    db.prepare(`insert into game_players (game_id, user_id, team_id) values ('g1', 'u-a', 't-a'), ('g1', 'u-b', 't-b'),
                ('g2', 'u-b', 't-c')`).run();
  }
}

const TABLES: Record<string, string> = {
  users: 'id', sessions: 'token_hash', invites: 'code', teams: 'id', members: 'id',
  programs: 'team_id, round', results: 'team_id, round', game_players: 'game_id, user_id',
};

function dump(db: Database.Database, tables: string[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = db.prepare(`select * from ${t} order by ${TABLES[t]}`).all();
  return out;
}

// ------------------------------------------------------------------ 테스트
let dir = '';
const saved = process.env.OWL_DB_PATH;

beforeEach(() => {
  resetDb();
  dir = mkdtempSync(join(tmpdir(), 'owl-migrate-'));
});

afterEach(() => {
  resetDb();
  process.env.OWL_DB_PATH = saved;
  rmSync(dir, { recursive: true, force: true });
});

/** 옛 스키마 파일을 만들고 표본을 넣은 뒤 닫는다. 넣은 행을 돌려준다. */
function buildOld(schema: string, oldest: boolean): { path: string; before: Record<string, unknown[]>; games: unknown[] } {
  const path = join(dir, 'owl.db');
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  seed(db, oldest);
  expect(schemaVersion(db)).toBe(0);
  const tables = Object.keys(TABLES).filter((t) => !(oldest && t === 'game_players'));
  const before = dump(db, tables);
  const games = db.prepare('select * from games order by id').all();
  db.close();
  return { path, before, games };
}

function open(path: string) {
  process.env.OWL_DB_PATH = path;
  resetDb();
  return getDb();
}

/** v2 제약이 걸려 있는지 확인 */
function expectV2Constraints(db: Database.Database): void {
  expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(db.prepare('pragma foreign_key_check').all()).toEqual([]);
  expect(db.prepare('pragma integrity_check').pluck().get()).toBe('ok');
  const gamesSql = db.prepare("select sql from sqlite_master where name = 'games'").pluck().get() as string;
  expect(gamesSql).toContain('between 1 and 7');
  const membersSql = db.prepare("select sql from sqlite_master where name = 'members'").pluck().get() as string;
  expect(membersSql).toContain('unique (team_id, user_id, role)');
  expect(membersSql).not.toContain('unique (team_id, role)');
  const idx = db.prepare("select name from sqlite_master where type = 'index' and tbl_name = 'members'").pluck().all();
  expect(idx).toEqual(expect.arrayContaining(['members_game', 'members_user']));
  expect(db.prepare("select name from sqlite_master where name like '%__v2'").all()).toEqual([]);

  // round 1~7 허용, 8은 거절
  db.prepare(`insert into games (id, code, host_id, round, rounds, mode, created_at)
              values ('g7', '7777', 'u-host', 7, '[6,7]', 'auto', ?)`).run(T);
  expect(() => db.prepare(`insert into games (id, code, host_id, round, created_at) values ('g8', '8888', 'u-host', 8, ?)`).run(T))
    .toThrow(/CHECK/);
  expect(() => db.prepare(`insert into games (id, code, host_id, mode, created_at) values ('g9', '9999', 'u-host', 'x', ?)`).run(T))
    .toThrow(/CHECK/);
  // 역할 공유: 같은 팀 같은 역할에 다른 사람 → 된다. 같은 사람·같은 역할 두 번 → UNIQUE
  db.prepare(`insert into members (id, game_id, team_id, user_id, role, joined_at) values ('m9', 'g1', 't-a', 'u-b', 'runner', ?)`).run(T);
  expect(() => db.prepare(`insert into members (id, game_id, team_id, user_id, role, joined_at)
                           values ('m10', 'g1', 't-a', 'u-a', 'runner', ?)`).run(T)).toThrow(/UNIQUE/);
  // 외래키: 없는 게임의 팀은 거절, 게임을 지우면 팀·팀원이 cascade로 지워진다
  expect(() => db.prepare(`insert into teams (id, game_id, name, color, seat) values ('tx', 'nope', 'x', '#000', 9)`).run())
    .toThrow(/FOREIGN KEY/);
  db.prepare("delete from games where id = 'g2'").run();
  expect(db.prepare("select count(*) from teams where game_id = 'g2'").pluck().get()).toBe(0);
  expect(db.prepare("select count(*) from members where game_id = 'g2'").pluck().get()).toBe(0);
  // 새 테이블 game_exits
  db.prepare(`insert into game_exits (game_id, user_id, reason, at) values ('g1', 'u-b', 'kicked', ?)`).run(T);
}

describe('버전형 마이그레이션 v0 → v2', () => {
  it('v4 직전 스키마: 모든 행이 그대로 남고 games에 rounds·mode가 생긴다', () => {
    const { path, before, games } = buildOld(OLD_SCHEMA_TODAY, false);
    const db = open(path);
    expect(dump(db, Object.keys(TABLES))).toEqual(before);
    const after = db.prepare('select * from games order by id').all() as Record<string, unknown>[];
    expect(after).toEqual((games as Record<string, unknown>[]).map((g) => ({ ...g, rounds: '[1,2,3,4,5]', mode: 'self' })));
    expect(after[0]).toMatchObject({ round: 3, phase: 'scored', shown_up_to: 2, timer_remaining: 40, running_team_id: 't-a', autoplay: 0 });
    expectV2Constraints(db);
  });

  it('가장 오래된 스키마: 열 추가식 마이그레이션 + game_players 채우기 + v2', () => {
    const { path, before } = buildOld(OLD_SCHEMA_OLDEST, true);
    const db = open(path);
    const now = dump(db, Object.keys(before));
    // 새로 생긴 열은 기본값, 나머지는 같다
    expect(now.results).toEqual((before.results as object[]).map((r) => ({ ...r, run_seq: 0, doc: null, reran: 0 })));
    expect(now.programs).toEqual((before.programs as object[]).map((p) => ({ ...p, prepatch_doc: null })));
    for (const t of ['users', 'sessions', 'invites', 'teams', 'members']) expect(now[t]).toEqual(before[t]);
    expect(db.prepare('select * from games where id = ?').get('g1')).toMatchObject({ shown_up_to: 0, rounds: '[1,2,3,4,5]', mode: 'self' });
    expect(db.prepare('select game_id, user_id, team_id from game_players order by game_id, user_id').all()).toEqual([
      { game_id: 'g1', user_id: 'u-a', team_id: 't-a' },
      { game_id: 'g1', user_id: 'u-b', team_id: 't-b' },
      { game_id: 'g2', user_id: 'u-b', team_id: 't-c' },
    ]);
    expectV2Constraints(db);
  });

  it('다시 열어도 아무것도 바뀌지 않는다 (한 번만 올린다)', () => {
    const { path } = buildOld(OLD_SCHEMA_TODAY, false);
    const first = dump(open(path), Object.keys(TABLES));
    const again = open(path);
    expect(schemaVersion(again)).toBe(SCHEMA_VERSION);
    expect(dump(again, Object.keys(TABLES))).toEqual(first);
  });

  it('빈 DB는 처음부터 v2 스키마로 만들어진다', () => {
    const db = open(join(dir, 'fresh.db'));
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    const cols = (db.prepare('pragma table_info(games)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['rounds', 'mode', 'shown_up_to']));
    const membersSql = db.prepare("select sql from sqlite_master where name = 'members'").pluck().get() as string;
    expect(membersSql).toContain('unique (team_id, user_id, role)');
  });
});
