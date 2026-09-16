# AWS Lightsail 배포 가이드

OWL COMPILE을 AWS Lightsail 서버 한 대에 올리는 방법입니다. 올리고 나면 참가자 폰이 **와이파이·모바일 데이터 상관없이** `https://내도메인`으로 들어옵니다. 행사장 와이파이가 기기끼리 통신을 막아 두어도 상관없습니다.

```
폰 · 진행자 노트북 · 프로젝터
        │ https
        ▼
Caddy (443, 인증서 자동 발급·갱신)
        │
        ▼
Next.js 앱 (127.0.0.1:3000, systemd가 켜 둠)
        │
        ▼
SQLite (/var/lib/owl-compile/owl.db)
```

**왜 서버 한 대(Lightsail)인가.** 실시간 화면 갱신(SSE)과 자동 제출 타이머가 서버 프로세스의 메모리에서 돌고, 데이터는 서버 디스크의 SQLite 파일 하나에 있습니다. 그래서 계속 켜져 있는 서버 한 대가 필요합니다. Lambda·Amplify Hosting 같은 서버리스에서는 동작하지 않습니다. ECS·Elastic Beanstalk·App Runner는 서버를 1대로 고정하고 영구 디스크를 따로 붙여야 해서 번거롭습니다.

**주의.** 모든 기기가 인터넷을 거쳐 들어오므로 행사장 인터넷이 끊기면 게임도 끊깁니다. 대비책으로 README의 행사 PC 방식(같은 와이파이)도 알아 둡니다.

처음 한 번 30~40분 걸립니다. 아래 명령의 `owl.example.com`은 내 도메인으로 바꿔 읽습니다.

## 빠른 설치 (자동 스크립트)

[1단계](#1-인스턴스-만들기)와 [2단계](#2-고정-ip와-방화벽)(인스턴스 만들기, 고정 IP 연결, 방화벽에 HTTPS 443 추가)를 한 뒤, 인스턴스의 **SSH를 사용하여 연결** 창에 한 줄만 붙여 넣습니다. 3·5·6·7·8단계를 [`deploy/lightsail-launch.sh`](../deploy/lightsail-launch.sh)가 자동으로 합니다.

```bash
curl -fsSL https://raw.githubusercontent.com/Heptagon372/OwlCompile/main/deploy/lightsail-launch.sh | sudo bash
```

- **EC2에서도 됩니다**(Ubuntu 또는 Amazon Linux 2023). 고정 IP 대신 **탄력적 IP**를 연결하고, 방화벽 대신 인스턴스의 **보안 그룹 인바운드 규칙**에 HTTP(80)·HTTPS(443)를 소스 `0.0.0.0/0`으로 추가합니다. 탄력적 IP가 없으면 서버를 껐다 켤 때 주소가 바뀝니다.
- **서버에 nginx가 이미 켜져 있으면** Caddy 대신 nginx에 이 주소용 설정 파일(`owl-compile.conf`)만 추가하고 certbot으로 인증서를 받습니다. 같은 서버의 다른 사이트 설정은 건드리지 않습니다. 그 주소를 이미 다른 사이트가 쓰고 있으면 멈추고, 기존 사이트를 내리고 바꾸려면 명령 끝에 `--replace-site`를 붙입니다(`| sudo bash -s -- example.com --replace-site`). 기존 설정과 파일은 `/root/owl-replaced-sites/<시각>/`에 백업되고, 같은 폴더의 `restore.sh`로 되돌립니다.
- 주소는 고정 IP로 만든 sslip.io 주소가 됩니다(예: `https://3-39-12-34.sslip.io`). 내 도메인을 쓰려면 A 레코드를 먼저 연결하고([4단계 A](#4-도메인-정하기)) 명령 끝을 `| sudo bash -s -- owl.example.com`으로 바꿉니다.
- 10분 안팎 걸립니다. 마지막에 `완료: https://…`가 나오면 끝입니다.
- 관리자 `admin`의 비밀번호는 서버에서 무작위로 만들어집니다. `sudo cat /root/owl-admin.txt`로 보고, 로그인한 뒤 `/account`에서 바꿉니다.
- 다시 실행해도 됩니다. 최신 코드로 다시 빌드하고, 관리자가 이미 있으면 그대로 둡니다.
- 설치 기록은 `/var/log/owl-setup.log`에 남습니다.

끝나면 [9단계](#9-확인)로 확인합니다. 아래 3~8단계는 이 스크립트가 하는 일을 손으로 하는 방법입니다.

---

## 0. 준비물

- AWS 계정
- 도메인 하나. 없어도 됩니다([4단계 B](#4-도메인-정하기))
- GitHub 저장소 `Heptagon372/OwlCompile`. 서버는 GitHub의 `main` 브랜치를 받아 빌드합니다. **PC에서 고친 내용은 먼저 GitHub에 push해야 서버에 반영됩니다.**

## 1. 인스턴스 만들기

[Lightsail 콘솔](https://lightsail.aws.amazon.com) → **인스턴스 생성**

| 항목 | 선택 |
|---|---|
| 리전 | 서울 (ap-northeast-2) |
| 플랫폼 | Linux/Unix |
| 블루프린트 | OS 전용 → **Ubuntu 24.04 LTS** |
| 플랜 | 메모리 **2GB 이상** 권장. 1GB도 되지만 3단계의 스왑이 꼭 필요합니다 |
| 이름 | `owl-compile` |

참가자 24명(6팀) 규모면 이 정도로 충분합니다.

## 2. 고정 IP와 방화벽

인스턴스 → **네트워킹** 탭

1. **고정 IP 생성** → 이 인스턴스에 연결합니다. 인스턴스를 재시작해도 주소가 바뀌지 않습니다.
2. **IPv4 방화벽**에 규칙을 추가합니다: **HTTPS (TCP 443)**. SSH(22)와 HTTP(80)는 기본으로 열려 있습니다. HTTP(80)는 인증서 발급에 쓰이니 닫지 않습니다.
3. 3000번 포트는 **열지 않습니다.** 앱은 Caddy를 거쳐서만 들어오게 합니다.

## 3. 서버 접속과 기본 설치

인스턴스 화면의 **SSH를 사용하여 연결**을 누르면 브라우저에 터미널이 열립니다. 아래 명령을 차례로 붙여 넣습니다.

**기본 패키지.** `build-essential`·`python3`는 better-sqlite3의 미리 빌드된 파일을 못 받을 때 직접 빌드하는 데 씁니다.

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl build-essential python3
```

**스왑 2GB.** 빌드하다 메모리가 모자라 멈추는 것을 막습니다.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

`free -h`의 `Swap:` 줄이 `2.0Gi`면 됩니다.

**Node.js 22.**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

`v22.`로 시작하면 됩니다.

## 4. 도메인 정하기

**A. 도메인이 있을 때.** 도메인 관리 화면(가비아, Route 53 등)에서 A 레코드를 추가합니다: `owl.example.com` → 2단계의 고정 IP. 반영까지 몇 분 걸릴 수 있습니다.

**B. 도메인이 없을 때.** [sslip.io](https://sslip.io)를 씁니다. 고정 IP의 점(`.`)을 `-`로 바꾸고 `.sslip.io`를 붙이면 그 IP로 연결되는 주소가 됩니다. 따로 설정할 것은 없습니다.

- 고정 IP가 `3.39.12.34`이면 → `3-39-12-34.sslip.io`

sslip.io는 여러 사람이 함께 쓰는 무료 서비스라 인증서 발급이 드물게 실패할 수 있습니다. 행사용으로는 A가 더 안정적입니다.

정한 주소를 터미널 변수에 넣고, 그 주소가 고정 IP를 가리키는지 확인합니다. **SSH 창을 새로 열었다면 `DOMAIN=` 줄을 다시 실행합니다.**

```bash
DOMAIN=owl.example.com
getent hosts $DOMAIN
```

고정 IP가 출력되면 됩니다. 아무것도 안 나오면 DNS가 아직 반영되지 않은 것이니 몇 분 뒤 다시 확인합니다.

## 5. 코드 받고 빌드

```bash
cd ~
git clone https://github.com/Heptagon372/OwlCompile.git
cd OwlCompile
npm ci
npm run build
```

빌드는 몇 분 걸립니다. 마지막에 `Route (app)`로 시작하는 페이지 표가 나오면 성공입니다. `Killed`로 끝나면 메모리 부족이니 3단계 스왑을 확인합니다.

## 6. 환경 변수와 서비스 등록

```bash
sudo cp deploy/owl-compile.env.example /etc/owl-compile.env
sudo sed -i "s#https://owl.example.com#https://$DOMAIN#" /etc/owl-compile.env
sudo cp deploy/owl-compile.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now owl-compile
```

몇 초 뒤 확인합니다.

```bash
grep OWL_PUBLIC_URL /etc/owl-compile.env
curl -s http://127.0.0.1:3000/api/health
```

첫 줄에 내 도메인이, 둘째 줄에 `{"ok":true}`가 나오면 됩니다. 이제 서버가 재부팅되거나 앱이 죽어도 systemd가 다시 켭니다.

| 환경 변수 | 값 | 하는 일 |
|---|---|---|
| `OWL_PUBLIC_URL` | `https://내도메인` | 진행자 참가 안내·보드 대기실·초대 링크에 쓸 주소 |
| `OWL_TRUST_PROXY` | `1` | Caddy가 붙인 헤더로 https 여부와 접속 IP를 판단합니다(로그인 쿠키 Secure, 로그인 시도 제한). 앱이 127.0.0.1에만 열려 있어서 안전합니다 |
| `OWL_DB_PATH` | `/var/lib/owl-compile/owl.db` | DB 위치. 코드 폴더 밖이라 업데이트해도 섞이지 않습니다 |

로그인 사용자가 `ubuntu`가 아니거나 코드를 다른 폴더에 받았다면 `/etc/systemd/system/owl-compile.service`의 `User`와 경로를 고친 뒤 `sudo systemctl daemon-reload && sudo systemctl restart owl-compile`을 실행합니다.

## 7. 관리자 계정 만들기 (HTTPS 열기 전에)

가입한 사람이 0명이면 `/setup` 페이지에서 **누구나** 관리자를 만들 수 있습니다. 8단계에서 사이트가 인터넷에 열리기 전에 서버에서 먼저 만듭니다.

```bash
cd ~/OwlCompile
OWL_DB_PATH=/var/lib/owl-compile/owl.db npm run admin:create -- --username 아이디 --password '비밀번호' --name 관리자
```

- 아이디는 영문·숫자·밑줄(`_`) 3~20자, 비밀번호는 8자 이상입니다.
- 비밀번호가 터미널 기록에 남으니, 9단계에서 로그인한 뒤 계정 페이지(`/account`)에서 바로 바꿉니다.

## 8. HTTPS 켜기 (Caddy)

**Caddy 설치** (공식 저장소)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy
```

**설정 적용**

```bash
sudo cp ~/OwlCompile/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i "s/owl.example.com/$DOMAIN/" /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

`Valid configuration`이 나오면 됩니다. 인증서는 reload 직후 자동으로 받습니다. 1분쯤 뒤 확인합니다.

```bash
journalctl -u caddy -n 50 --no-pager | grep -i certificate
```

`certificate obtained successfully`가 보이면 HTTPS가 켜진 것입니다.

설정 파일 [`deploy/Caddyfile`](../deploy/Caddyfile)은 페이지·스크립트는 압축하고 실시간 스트림(`text/event-stream`)은 압축하지 않습니다. 압축 대상을 바꿀 때 스트림을 넣으면 화면이 실시간으로 갱신되지 않을 수 있습니다.

## 9. 확인

1. PC 브라우저에서 `https://owl.example.com` → 로그인 화면 → 7단계의 관리자로 로그인합니다.
2. **와이파이를 끈 폰**(LTE·5G)으로 같은 주소를 엽니다. 열리면 다른 네트워크에서도 접속되는 것입니다.
3. 진행자 콘솔에서 게임을 만들고 **참가 안내**의 주소가 `https://owl.example.com/join`인지, 그 아래 안내가 "인터넷 주소라서 …"인지 확인합니다.
4. 폰으로 참가했을 때 보드 대기실 화면에 바로 나타나면 실시간 갱신까지 정상입니다.

진행자 노트북과 프로젝터 화면도 모두 이 도메인으로 엽니다. IP 주소로 직접 열거나 도메인과 섞어 쓰면 로그인이 풀리거나 "다른 사이트에서 온 요청" 오류가 납니다.

## 10. 업데이트

PC에서 고친 내용을 GitHub에 push한 뒤, 서버 SSH에서 실행합니다.

```bash
bash ~/OwlCompile/deploy/update.sh
```

GitHub 최신 코드를 받고, 앱을 멈추고, 설치·빌드한 뒤 다시 켭니다([`deploy/update.sh`](../deploy/update.sh)). **빌드하는 몇 분 동안 사이트가 꺼지므로 행사 중에는 실행하지 않습니다.** 실패하면 이전 버전으로 되돌리는 명령을 화면에 보여 줍니다.

## 11. 백업과 복원

**스냅샷 (서버 통째로).** Lightsail 인스턴스 → **스냅샷** 탭 → 수동 스냅샷 생성. 행사 전날과 행사 직후에 한 번씩 찍어 둡니다.

**DB 파일만.** 앱이 켜져 있어도 됩니다.

```bash
bash ~/OwlCompile/deploy/backup.sh
```

`~/owl-backups/owl-날짜-시각.db`가 생깁니다. PC로 가져오려면 Lightsail 콘솔 → **계정** → **SSH 키**에서 서울 리전 기본 키(`.pem`)를 받고, PC의 PowerShell에서 실행합니다.

```powershell
scp -i LightsailDefaultKey-ap-northeast-2.pem ubuntu@고정IP:~/owl-backups/*.db .
```

**복원.** 앱을 멈추고, 예전 WAL 파일을 지운 뒤 백업을 제자리에 놓습니다.

```bash
sudo systemctl stop owl-compile
rm -f /var/lib/owl-compile/owl.db-wal /var/lib/owl-compile/owl.db-shm
cp ~/owl-backups/owl-백업파일이름.db /var/lib/owl-compile/owl.db
sudo systemctl start owl-compile
```

## 12. 문제 해결

| 증상 | 확인할 것 |
|---|---|
| `npm run build`가 `Killed`로 끝남 | 메모리 부족입니다. `free -h`로 스왑이 켜졌는지 확인합니다(3단계) |
| `npm ci`에서 better-sqlite3 빌드 오류 | `node -v`가 22인지, `build-essential`·`python3`가 설치됐는지 확인합니다 |
| `https://도메인`이 안 열림 | Lightsail 방화벽에 443이 있는지(2단계), `getent hosts $DOMAIN`이 고정 IP인지(4단계), `journalctl -u caddy -n 50 --no-pager`에 오류가 있는지 봅니다 |
| 인증서 발급 실패 (sslip.io) | 함께 쓰는 발급 한도에 걸렸을 수 있습니다. 한 시간쯤 뒤 `sudo systemctl reload caddy`를 다시 하거나 실제 도메인을 씁니다 |
| `502 Bad Gateway` | 앱이 꺼져 있습니다. `systemctl status owl-compile --no-pager`, `journalctl -u owl-compile -n 50 --no-pager` |
| 참가 안내에 `172.26.x.x` 같은 주소가 나옴 | `OWL_PUBLIC_URL`이 적용되지 않았습니다. `/etc/owl-compile.env`를 확인하고 `sudo systemctl restart owl-compile` |
| 버튼을 누르면 "다른 사이트에서 온 요청은 받을 수 없습니다" | 도메인 하나로만 엽니다. IP로 연 탭은 닫고 도메인으로 다시 로그인합니다 |
| 화면이 실시간으로 안 바뀜 | `/etc/caddy/Caddyfile`을 고쳤다면 `encode`의 압축 대상에 `text/event-stream`이 들어가지 않았는지 봅니다 |
| 사이트에 들어가면 `/setup`이 뜸 | 관리자가 없습니다. 바로 7단계를 실행합니다 |

앱 로그 실시간 보기: `journalctl -u owl-compile -f` (끝내려면 `Ctrl + C`)

## 13. 행사가 끝나면

Lightsail은 인스턴스가 있는 동안 계속 요금이 나갑니다. 더 쓰지 않으면 스냅샷을 찍거나 DB를 PC로 받아 둔 뒤(11단계) 인스턴스를 삭제하고, **고정 IP도 해제**합니다. 인스턴스에 연결되지 않은 고정 IP는 따로 요금이 붙을 수 있습니다.
