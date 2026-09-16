#!/usr/bin/env bash
# 서버를 GitHub 최신 코드로 업데이트한다 (docs/DEPLOY_AWS.md 10단계).
# 사용: bash ~/OwlCompile/deploy/update.sh
# 빌드하는 동안(몇 분) 사이트가 꺼지므로 행사 중에는 실행하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."

before=$(git rev-parse --short HEAD)
git pull --ff-only
after=$(git rev-parse --short HEAD)
echo "코드: $before → $after"

trap 'echo "업데이트 실패: 사이트가 꺼져 있습니다. 이전 버전으로 되돌리려면:" >&2
echo "  cd ~/OwlCompile && git reset --hard $before && npm ci && npm run build && sudo systemctl start owl-compile" >&2' ERR

sudo systemctl stop owl-compile
npm ci
npm run build
sudo systemctl start owl-compile

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "업데이트 완료"
    exit 0
  fi
  sleep 1
done
echo "서버가 30초 안에 응답하지 않습니다. 로그: journalctl -u owl-compile -n 50 --no-pager" >&2
exit 1
