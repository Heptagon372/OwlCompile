// 관리자 계정 만들기·복구 CLI (docs/WEBSITE_SPEC.md §4).
// 사용: npm run admin:create -- --username x --password y [--name 이름]
// 같은 아이디가 있으면 관리자·활성으로 되돌리고 비밀번호를 새로 정한다. DB 위치는 OWL_DB_PATH 또는 data/owl.db.
import { upsertAdmin } from '../lib/server/auth';
import { HttpError } from '../lib/server/http';
import { dbPath, resetDb } from '../lib/server/db';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith('--')) {
        out[a.slice(2)] = v;
        i++;
      } else {
        out[a.slice(2)] = '';
      }
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username ?? '';
  const password = args.password ?? '';
  const name = args.name || username;
  if (!username || !password || 'help' in args) {
    console.log('사용법: npm run admin:create -- --username 아이디 --password 비밀번호 [--name 표시이름]');
    return username || password ? 1 : 'help' in args ? 0 : 1;
  }
  try {
    const result = await upsertAdmin({ username, password, displayName: name });
    console.log(
      result === 'created'
        ? `관리자 ${username} 계정을 만들었습니다. (${dbPath()})`
        : `${username} 계정을 관리자로 되돌리고 비밀번호를 바꿨습니다. 기존 로그인은 모두 끊겼습니다. (${dbPath()})`,
    );
    return 0;
  } catch (err) {
    if (err instanceof HttpError) {
      console.error(`실패: ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    resetDb();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
