#!/usr/bin/env bash
# DB를 파일 하나로 안전하게 복사한다. 서버가 켜져 있어도 된다 (docs/DEPLOY_AWS.md 11단계).
# 사용: bash ~/OwlCompile/deploy/backup.sh  →  ~/owl-backups/owl-YYYYMMDD-HHMMSS.db
set -euo pipefail
cd "$(dirname "$0")/.."

db="${OWL_DB_PATH:-/var/lib/owl-compile/owl.db}"
out="$HOME/owl-backups/owl-$(date +%Y%m%d-%H%M%S).db"
mkdir -p "$(dirname "$out")"

node -e '
const Database = require("better-sqlite3");
const [src, dest] = process.argv.slice(1);
const db = new Database(src, { fileMustExist: true });
db.backup(dest).then(() => {
  db.close();
  console.log("백업 완료: " + dest);
});
' "$db" "$out"
