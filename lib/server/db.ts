// SQLite 연결과 스키마 (docs/WEBSITE_SPEC.md §3). 서버 전용.
// Next.js는 라우트마다 모듈을 따로 번들할 수 있으므로 연결은 globalThis에 하나만 둔다.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type Db = Database.Database;
export type SqlValue = string | number | bigint | null | Buffer;

/** 스키마 버전 (PRAGMA user_version). 0 = 버전 관리 전(열 추가식 마이그레이션만), 2 = FEATURE_V4 §6 */
export const SCHEMA_VERSION = 2;

/**
 * games (v2): round 1~7, rounds = 고른 라운드 JSON 배열, mode = 배정 방식.
 * 예전 게임은 mode 'self'(직접 선택)로 남는다: 늦게 온 사람의 자동 참가 대상이 아니다.
 */
function gamesDdl(name: string): string {
  return `create table if not exists ${name} (
  id text primary key,
  code text unique not null,
  host_id text not null references users,
  round integer not null default 1 check (round between 1 and 7),
  rounds text not null default '[1,2,3,4,5]',
  mode text not null default 'self' check (mode in ('auto','self')),
  phase text not null default 'lobby' check (phase in ('lobby','coding','sealed','running','scored','finished')),
  timer_ends_at text,
  timer_remaining integer,
  running_team_id text,
  autoplay integer not null default 1,
  created_at text not null,
  shown_up_to integer not null default 0
);`;
}

/** members (v2): 역할 공유 — 한 역할을 여러 명이, 한 사람이 여러 역할을. 같은 (팀, 사람, 역할)만 중복 금지 */
function membersDdl(name: string): string {
  return `create table if not exists ${name} (
  id text primary key,
  game_id text not null references games on delete cascade,
  team_id text not null references teams on delete cascade,
  user_id text not null references users on delete cascade,
  role text not null check (role in ('runner','turner','controller','architect')),
  joined_at text not null,
  unique (team_id, user_id, role)
);`;
}

const MEMBERS_INDEXES = `create index if not exists members_game on members(game_id);
create index if not exists members_user on members(user_id);`;

const SCHEMA = schemaSql();

function schemaSql(): string {
  return `
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
${gamesDdl('games')}
create table if not exists teams (
  id text primary key,
  game_id text not null references games on delete cascade,
  name text not null,
  color text not null,
  seat integer not null,
  patch_left integer not null default 1
);
create index if not exists teams_game on teams(game_id);
${membersDdl('members')}
${MEMBERS_INDEXES}
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
create table if not exists game_exits (
  game_id text not null references games on delete cascade,
  user_id text not null references users on delete cascade,
  reason text not null check (reason in ('kicked','left')),
  at text not null,
  primary key (game_id, user_id)
);
`;
}

/** 예전 DB에 나중에 생긴 열을 더한다 (여러 번 실행해도 안전) */
const MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: 'programs', column: 'prepatch_doc', ddl: 'alter table programs add column prepatch_doc text' },
  { table: 'results', column: 'run_seq', ddl: 'alter table results add column run_seq integer not null default 0' },
  // 실제로 실행한 doc (보드가 trace와 같은 코드를 보여 주도록)
  { table: 'results', column: 'doc', ddl: 'alter table results add column doc text' },
  // 패치 후 재실행을 마쳤는지 (패치 허용만 하고 재실행하지 않은 채 점수 확정하는 것을 막는다)
  { table: 'results', column: 'reran', ddl: 'alter table results add column reran integer not null default 0' },
  // 이번 라운드 보드가 지금까지 보여 준 가장 뒤 실행 순서 (다시 고르기·재실행으로 뒤로 가도 결과를 다시 숨기지 않는다)
  { table: 'games', column: 'shown_up_to', ddl: 'alter table games add column shown_up_to integer not null default 0' },
];

function columnsOf(db: Db, table: string): string[] {
  return (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

export function schemaVersion(db: Db): number {
  return Number(db.pragma('user_version', { simple: true }) ?? 0);
}

/**
 * 테이블을 새 정의로 다시 만든다: create new → insert select(공통 열) → drop old → rename.
 * 트랜잭션 안에서, 외래키를 끈 상태로 부른다 (drop이 teams·members를 cascade로 지우지 않게).
 */
function rebuildTable(db: Db, table: string, ddl: (name: string) => string): void {
  const tmp = `${table}__v2`;
  db.exec(`drop table if exists ${tmp}`);
  db.exec(ddl(tmp));
  const next = new Set(columnsOf(db, tmp));
  const shared = columnsOf(db, table).filter((c) => next.has(c)).join(', ');
  db.exec(`insert into ${tmp} (${shared}) select ${shared} from ${table}`);
  db.exec(`drop table ${table}`);
  db.exec(`alter table ${tmp} rename to ${table}`);
}

/** v2 (FEATURE_V4 §6): games round 1~7 + rounds·mode 열, members unique(team_id, user_id, role) */
function migrateToV2(db: Db): void {
  rebuildTable(db, 'games', gamesDdl);
  rebuildTable(db, 'members', membersDdl);
  db.exec(MEMBERS_INDEXES);
}

const VERSIONED: { version: number; up: (db: Db) => void }[] = [{ version: 2, up: migrateToV2 }];

/** 버전형 마이그레이션. 외래키는 트랜잭션 밖에서만 끌 수 있으므로 여기서 껐다 켠다. */
function migrateVersions(db: Db): void {
  if (schemaVersion(db) >= SCHEMA_VERSION) return;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      // 다른 프로세스가 먼저 올렸을 수 있으니 쓰기 잠금을 잡은 뒤 다시 읽는다
      for (const step of VERSIONED) {
        if (schemaVersion(db) >= step.version) continue;
        step.up(db);
        const broken = db.prepare('pragma foreign_key_check').all();
        if (broken.length > 0) throw new Error(`마이그레이션 v${step.version}: 외래키 위반 ${broken.length}건`);
        db.pragma(`user_version = ${step.version}`);
      }
    }).immediate();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

function migrate(db: Db): void {
  // 1) 열 추가식 (버전 관리 전 DB). v2 재생성이 이 열들을 그대로 옮기므로 먼저 한다.
  for (const m of MIGRATIONS) {
    if (!columnsOf(db, m.table).includes(m.column)) db.exec(m.ddl);
  }
  // game_players가 생기기 전의 참가자도 지금 팀으로 기록한다 (이미 있으면 그대로)
  db.exec(`insert or ignore into game_players (game_id, user_id, team_id)
             select game_id, user_id, min(team_id) from members group by game_id, user_id`);
  // 2) 버전형
  migrateVersions(db);
}

/** 이미 연 연결에 스키마를 만들고 마이그레이션한다. 빈 DB는 바로 최신 버전으로 표시한다. */
export function prepareDb(db: Db): void {
  const fresh = !db.prepare("select 1 from sqlite_master where type = 'table' and name = 'games'").get();
  db.exec(SCHEMA);
  if (fresh) db.pragma(`user_version = ${SCHEMA_VERSION}`);
  migrate(db);
}

const store = globalThis as unknown as { __owlDb?: Db };

/** OWL_DB_PATH (테스트는 ':memory:') 또는 data/owl.db */
export function dbPath(): string {
  return process.env.OWL_DB_PATH || resolve(process.cwd(), 'data', 'owl.db');
}

export function getDb(): Db {
  if (store.__owlDb) return store.__owlDb;
  const path = dbPath();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  prepareDb(db);
  store.__owlDb = db;
  return db;
}

export function one<T>(sql: string, ...params: SqlValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: SqlValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: SqlValue[]): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

/** 동기 트랜잭션. 안에서 await 하지 않는다. */
export function tx<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/** 테스트용: 연결을 닫고 다음 getDb()에서 새로 연다 (':memory:'면 빈 DB) */
export function resetDb(): void {
  store.__owlDb?.close();
  store.__owlDb = undefined;
}

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => randomUUID();
export const bool = (v: unknown): boolean => v === 1 || v === true;
