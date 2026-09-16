#!/usr/bin/env bash
# Lightsail(Ubuntu 24.04) 자동 설치: docs/DEPLOY_AWS.md 3·5·6·7·8단계를 한 번에 한다.
# 고정 IP를 연결하고 방화벽에 HTTPS(443)를 연 뒤, 인스턴스 SSH 창에서:
#   curl -fsSL https://raw.githubusercontent.com/Heptagon372/OwlCompile/main/deploy/lightsail-launch.sh | sudo bash
# 내 도메인을 쓰려면 끝에 붙인다: ... | sudo bash -s -- owl.example.com
# 도메인을 안 주면 이 서버의 공인 IP로 sslip.io 주소를 만든다 (3.39.12.34 → 3-39-12-34.sslip.io).
# 다시 실행해도 된다: 최신 코드로 다시 빌드하고, 관리자가 이미 있으면 새로 만들지 않는다.
# 설치 기록: /var/log/owl-setup.log · 관리자 비밀번호: sudo cat /root/owl-admin.txt

REPO="${OWL_REPO:-https://github.com/Heptagon372/OwlCompile.git}"
APP_USER=ubuntu
APP_DIR="/home/$APP_USER/OwlCompile"
DB_PATH=/var/lib/owl-compile/owl.db

step() { printf '\n==> %s\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

# URL이 응답할 때까지 최대 secs초 기다린다
wait_for() {
  local url=$1 secs=$2 i
  for ((i = 0; i < secs; i += 3)); do
    curl -fsS --max-time 5 "$url" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

# 스크립트 전체를 읽은 뒤 실행한다 (curl | bash 도중 다른 명령이 표준 입력을 먹지 않게)
main() {
  set -euo pipefail
  exec > >(tee -a /var/log/owl-setup.log) 2>&1
  export DEBIAN_FRONTEND=noninteractive
  export HOME="${HOME:-/root}"

  [ "$(id -u)" -eq 0 ] || { echo "sudo로 실행하세요." >&2; exit 1; }
  id "$APP_USER" >/dev/null 2>&1 || { echo "$APP_USER 사용자가 없습니다 (Lightsail Ubuntu 이미지 기준)." >&2; exit 1; }

  local domain="${1:-}"
  if [ -z "$domain" ]; then
    local ip
    ip=$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
    domain="${ip//./-}.sslip.io"
  fi
  step "주소: https://$domain"

  step "패키지 설치"
  # 첫 부팅 때 자동 업데이트가 apt를 잡고 있어도 기다렸다가 진행한다
  echo 'DPkg::Lock::Timeout "600";' > /etc/apt/apt.conf.d/99owl-lock-timeout
  apt-get update
  apt-get install -y git curl build-essential python3 openssl debian-keyring debian-archive-keyring apt-transport-https gnupg

  if ! swapon --show | grep -q .; then
    step "스왑 2GB 만들기"
    [ -f /swapfile ] || fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi

  if ! node -v 2>/dev/null | grep -q '^v22\.'; then
    step "Node.js 22 설치"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
  node -v

  if ! command -v caddy >/dev/null 2>&1; then
    step "Caddy 설치"
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update
    apt-get install -y caddy
  fi

  step "코드 받기"
  if [ -d "$APP_DIR/.git" ]; then
    as_app git -C "$APP_DIR" pull --ff-only
  else
    as_app git clone "$REPO" "$APP_DIR"
  fi
  as_app git -C "$APP_DIR" log --oneline -1

  step "설치와 빌드 (몇 분 걸립니다)"
  systemctl stop owl-compile 2>/dev/null || true
  as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build"

  step "앱 서비스 등록"
  sed "s#^OWL_PUBLIC_URL=.*#OWL_PUBLIC_URL=https://$domain#" "$APP_DIR/deploy/owl-compile.env.example" > /etc/owl-compile.env
  cp "$APP_DIR/deploy/owl-compile.service" /etc/systemd/system/owl-compile.service
  systemctl daemon-reload
  systemctl enable owl-compile
  systemctl restart owl-compile
  if ! wait_for http://127.0.0.1:3000/api/health 90; then
    journalctl -u owl-compile -n 50 --no-pager
    echo "앱이 켜지지 않았습니다. 위 로그를 확인하세요." >&2
    exit 1
  fi

  step "관리자 계정"
  # 관리자가 없으면 /setup이 열린다(200). 인터넷에 열기 전에 서버에서 무작위 비밀번호로 만든다
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/setup)" = "200" ]; then
    local pw
    pw=$(openssl rand -base64 36 | tr -dc 'A-Za-z0-9')
    pw=${pw:0:20}
    as_app bash -c "cd '$APP_DIR' && OWL_DB_PATH='$DB_PATH' npm run --silent admin:create -- --username admin --password '$pw' --name 관리자" >/dev/null
    (
      umask 077
      printf 'OWL COMPILE 관리자\n주소: https://%s/login\n아이디: admin\n비밀번호: %s\n로그인한 뒤 /account에서 비밀번호를 바꾸세요.\n' "$domain" "$pw" > /root/owl-admin.txt
    )
    echo "관리자 admin을 만들었습니다. 비밀번호 보기: sudo cat /root/owl-admin.txt"
  else
    echo "관리자가 이미 있어서 건너뜁니다."
  fi

  step "HTTPS (Caddy)"
  sed "s/owl\.example\.com/$domain/g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl enable caddy
  systemctl restart caddy

  step "인증서 발급 기다리는 중 (최대 3분)"
  if ! wait_for "https://$domain/api/health" 180; then
    echo "https://$domain 에 아직 연결되지 않습니다. Lightsail 방화벽에 HTTP(80)·HTTPS(443)가 열려 있는지, 고정 IP가 연결됐는지 확인하세요." >&2
    echo "Caddy 로그: journalctl -u caddy -n 50 --no-pager" >&2
    exit 1
  fi

  step "완료: https://$domain"
  echo "관리자 비밀번호 보기: sudo cat /root/owl-admin.txt"
}

main "$@"
