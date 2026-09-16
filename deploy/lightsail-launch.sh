#!/usr/bin/env bash
# AWS 서버 자동 설치: docs/DEPLOY_AWS.md 3·5·6·7·8단계를 한 번에 한다.
# 지원: Lightsail·EC2의 Ubuntu/Debian, Amazon Linux 2023 (x86_64·arm64)
# 먼저 고정 IP(EC2는 탄력적 IP)를 연결하고 방화벽(EC2는 보안 그룹)에 HTTP 80·HTTPS 443을 연 뒤, 서버 SSH 창에서:
#   curl -fsSL https://raw.githubusercontent.com/Heptagon372/OwlCompile/main/deploy/lightsail-launch.sh | sudo bash
# 내 도메인을 쓰려면 끝에 붙인다: ... | sudo bash -s -- owl.example.com
# 도메인을 안 주면 이 서버의 공인 IP로 sslip.io 주소를 만든다 (3.39.12.34 → 3-39-12-34.sslip.io).
# 다시 실행해도 된다: 최신 코드로 다시 빌드하고, 관리자가 이미 있으면 새로 만들지 않는다.
# 설치 기록: /var/log/owl-setup.log · 관리자 비밀번호: sudo cat /root/owl-admin.txt

REPO="${OWL_REPO:-https://github.com/Heptagon372/OwlCompile.git}"
DB_PATH=/var/lib/owl-compile/owl.db
PKG=""
APP_USER=""
APP_DIR=""

step() { printf '\n==> %s\n' "$*"; }
die() { echo "오류: $*" >&2; exit 1; }
as_app() { sudo -u "$APP_USER" -H env "PATH=$PATH" "$@"; }

# URL이 응답할 때까지 최대 secs초 기다린다
wait_for() {
  local url=$1 secs=$2 i
  for ((i = 0; i < secs; i += 3)); do
    curl -fsS --max-time 5 "$url" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

# 앱을 돌릴 일반 사용자: OWL_APP_USER → sudo를 부른 사용자 → 이미지 기본 사용자
pick_app_user() {
  local u
  for u in "${OWL_APP_USER:-}" "${SUDO_USER:-}" ubuntu ec2-user admin; do
    if [ -n "$u" ] && [ "$u" != root ] && id "$u" >/dev/null 2>&1; then
      echo "$u"
      return 0
    fi
  done
  return 1
}

go_arch() {
  case "$(uname -m)" in
    x86_64) echo amd64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) return 1 ;;
  esac
}

install_packages() {
  step "패키지 설치"
  case "$PKG" in
    apt)
      # 첫 부팅 때 자동 업데이트가 apt를 잡고 있어도 기다렸다가 진행한다
      echo 'DPkg::Lock::Timeout "600";' > /etc/apt/apt.conf.d/99owl-lock-timeout
      apt-get update
      apt-get install -y git curl ca-certificates build-essential python3 openssl tar
      ;;
    dnf)
      # Amazon Linux 2023은 curl-minimal이 기본이라 curl 패키지는 설치하지 않는다 (충돌)
      dnf install -y git gcc-c++ make python3 openssl tar
      ;;
  esac
}

make_swap() {
  [ -n "$(swapon --show --noheadings)" ] && return 0
  step "스왑 2GB 만들기"
  [ -f /swapfile ] || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

# nodejs.org 공식 배포 파일 (배포판 패키지와 무관하게 같은 방식, SHA-256 확인)
install_node() {
  [[ "$(node -v 2>/dev/null || true)" == v22.* ]] && return 0
  step "Node.js 22 설치"
  local arch base file tmp
  arch=$(go_arch) || die "지원하지 않는 CPU입니다: $(uname -m)"
  [ "$arch" = amd64 ] && arch=x64
  base=https://nodejs.org/dist/latest-v22.x
  tmp=$(mktemp -d)
  curl -fsSL "$base/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file=$(awk '{print $2}' "$tmp/SHASUMS256.txt" | grep -E "^node-v22\.[0-9]+\.[0-9]+-linux-${arch}\.tar\.gz$" || true)
  [ -n "$file" ] || die "Node.js 22 내려받기 파일을 찾지 못했습니다."
  curl -fsSL "$base/$file" -o "$tmp/$file"
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c --quiet -)
  rm -rf /opt/nodejs
  mkdir -p /opt/nodejs
  tar -xzf "$tmp/$file" -C /opt/nodejs --strip-components=1 --no-same-owner
  ln -sf /opt/nodejs/bin/node /usr/local/bin/node
  ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm
  ln -sf /opt/nodejs/bin/npx /usr/local/bin/npx
  rm -rf "$tmp"
}

# GitHub 공식 릴리스 바이너리 + 공식 systemd 설정 (SHA-512 확인)
install_caddy() {
  command -v caddy >/dev/null 2>&1 && return 0
  step "Caddy 설치"
  local arch tag ver name tmp
  arch=$(go_arch) || die "지원하지 않는 CPU입니다: $(uname -m)"
  tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/caddyserver/caddy/releases/latest)
  ver=${tag##*/v}
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Caddy 최신 버전을 찾지 못했습니다 ($tag)."
  name="caddy_${ver}_linux_${arch}.tar.gz"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v$ver/$name" -o "$tmp/$name"
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v$ver/caddy_${ver}_checksums.txt" -o "$tmp/checksums.txt"
  (cd "$tmp" && grep " $name\$" checksums.txt | sha512sum -c --quiet -)
  tar -xzf "$tmp/$name" -C "$tmp" caddy
  install -m 0755 "$tmp/caddy" /usr/bin/caddy
  rm -rf "$tmp"
  getent group caddy >/dev/null || groupadd --system caddy
  id caddy >/dev/null 2>&1 || useradd --system --gid caddy --create-home --home-dir /var/lib/caddy \
    --shell /usr/sbin/nologin --comment "Caddy web server" caddy
  mkdir -p /etc/caddy
  cat > /etc/systemd/system/caddy.service <<'UNIT'
# Caddy 공식 systemd 설정 (github.com/caddyserver/dist init/caddy.service)
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
}

# 스크립트 전체를 읽은 뒤 실행한다 (curl | bash 도중 다른 명령이 표준 입력을 먹지 않게)
main() {
  set -euo pipefail
  exec > >(tee -a /var/log/owl-setup.log) 2>&1
  export HOME="${HOME:-/root}"
  export PATH="/usr/local/bin:$PATH"
  export DEBIAN_FRONTEND=noninteractive

  [ "$(id -u)" -eq 0 ] || die "sudo로 실행하세요."
  [ -r /etc/os-release ] || die "OS를 알 수 없습니다 (/etc/os-release 없음)."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu | debian) PKG=apt ;;
    amzn)
      [ "${VERSION_ID:-}" = 2023 ] || die "Amazon Linux ${VERSION_ID:-}은(는) 지원하지 않습니다. Amazon Linux 2023이나 Ubuntu 24.04로 서버를 만드세요."
      PKG=dnf
      ;;
    *) die "지원하지 않는 OS입니다: ${PRETTY_NAME:-알 수 없음}. Ubuntu 24.04나 Amazon Linux 2023을 쓰세요." ;;
  esac
  APP_USER=$(pick_app_user) || die "앱을 돌릴 일반 사용자를 찾지 못했습니다. OWL_APP_USER=사용자이름 으로 정해 주세요."
  APP_DIR="$(getent passwd "$APP_USER" | cut -d: -f6)/OwlCompile"
  step "OS: ${PRETTY_NAME:-$ID} · CPU: $(uname -m) · 사용자: $APP_USER"
  local mem_mb
  mem_mb=$(awk '/^MemTotal:/ {print int($2 / 1024)}' /proc/meminfo)
  [ "$mem_mb" -ge 900 ] || echo "메모리가 ${mem_mb}MB라 빌드가 오래 걸리거나 실패할 수 있습니다. 1GB 이상을 권장합니다."

  install_packages
  make_swap
  install_node
  node -v
  install_caddy

  local domain="${1:-}"
  if [ -z "$domain" ]; then
    local ip
    ip=$(curl -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
    [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "이 서버의 공인 IP를 알아내지 못했습니다. 도메인을 직접 주세요: ... | sudo bash -s -- 도메인"
    domain="${ip//./-}.sslip.io"
  fi
  step "주소: https://$domain"

  step "코드 받기"
  if [ -d "$APP_DIR/.git" ]; then
    as_app git -C "$APP_DIR" pull --ff-only
  else
    as_app git clone "$REPO" "$APP_DIR"
  fi
  as_app git -C "$APP_DIR" log --oneline -1

  # 마지막으로 빌드한 커밋 이후 앱 코드(deploy/·docs/ 밖)가 안 바뀌었으면 빌드를 건너뛴다
  local head built_marker="$APP_DIR/.next/owl-commit" built=""
  head=$(as_app git -C "$APP_DIR" rev-parse HEAD)
  [ -f "$APP_DIR/.next/BUILD_ID" ] && [ -f "$built_marker" ] && built=$(cat "$built_marker")
  if [ -n "$built" ] && as_app git -C "$APP_DIR" diff --quiet "$built" "$head" -- . ':(exclude)deploy' ':(exclude)docs' ':(exclude)README.md' 2>/dev/null; then
    step "빌드 건너뜀 (앱 코드가 마지막 빌드와 같습니다)"
  else
    step "설치와 빌드 (몇 분 걸립니다)"
    systemctl stop owl-compile 2>/dev/null || true
    as_app bash -c "cd '$APP_DIR' && npm ci --no-audit --no-fund && npm run build && git rev-parse HEAD > .next/owl-commit"
  fi

  step "앱 서비스 등록"
  sed "s#^OWL_PUBLIC_URL=.*#OWL_PUBLIC_URL=https://$domain#" "$APP_DIR/deploy/owl-compile.env.example" > /etc/owl-compile.env
  sed -e "s#^User=.*#User=$APP_USER#" -e "s#/home/ubuntu/OwlCompile#$APP_DIR#g" \
    "$APP_DIR/deploy/owl-compile.service" > /etc/systemd/system/owl-compile.service
  systemctl daemon-reload
  systemctl enable owl-compile
  systemctl restart owl-compile
  if ! wait_for http://127.0.0.1:3000/api/health 90; then
    journalctl -u owl-compile -n 50 --no-pager
    die "앱이 켜지지 않았습니다. 위 로그를 확인하세요."
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
  if ! systemctl restart caddy; then
    echo "--- Caddy 로그" >&2
    journalctl -u caddy -n 30 --no-pager -o cat >&2 || true
    echo "--- 80·443 포트를 쓰는 프로그램" >&2
    ss -ltnp 2>/dev/null | grep -E ':(80|443) ' >&2 || echo "(없음)" >&2
    die "Caddy가 켜지지 않았습니다. 위 로그를 보내 주세요."
  fi

  step "인증서 발급 기다리는 중 (최대 3분)"
  if ! wait_for "https://$domain/api/health" 180; then
    echo "https://$domain 에 아직 연결되지 않습니다." >&2
    echo "- EC2: 인스턴스 → 보안 → 보안 그룹 → 인바운드 규칙에 HTTP(80)·HTTPS(443), 소스 0.0.0.0/0이 있는지" >&2
    echo "- Lightsail: 네트워킹 탭 IPv4 방화벽에 HTTP(80)·HTTPS(443)가 있는지" >&2
    echo "- 확인 후 같은 명령을 다시 실행하면 됩니다. Caddy 로그: journalctl -u caddy -n 50 --no-pager" >&2
    exit 1
  fi

  step "완료: https://$domain"
  echo "관리자 비밀번호 보기: sudo cat /root/owl-admin.txt"
}

main "$@"
