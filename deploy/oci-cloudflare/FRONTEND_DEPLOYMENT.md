# OCI 프런트엔드 자동 배포

`.github/workflows/deploy-frontend.yml`은 GitHub Actions에서 프런트엔드를
빌드하고 OCI의 Caddy 문서 루트를 교체합니다. 최초 도입 단계에서는
`workflow_dispatch`로만 실행합니다. 첫 수동 배포가 성공한 뒤 별도 PR에서
`main` push 트리거를 활성화합니다.

배포 과정은 다음 안전장치를 사용합니다.

- GitHub `production` Environment와 `main` 배포 정책
- `opc`와 분리된 최소 권한 `iidxdeploy` 사용자
- 포트 포워딩과 PTY 등을 차단하는 제한된 SSH 공개 키
- 고정된 root 소유 배포 스크립트만 허용하는 sudoers 규칙
- 서버 측 배포 잠금, 번들 검증, 이전 버전 백업 및 헬스체크 롤백
- 검증된 `known_hosts` 항목을 사용한 SSH 호스트 키 확인

## 필요한 Environment Secret

`gpsrlin115/iidxScoreBoardClient`의 `production` Environment에 다음 Secret을
추가합니다.

- `OCI_HOST`: OCI VM의 호스트명 또는 공인 IP
- `OCI_USER`: 전용 배포 사용자 `iidxdeploy`
- `OCI_SSH_KEY`: 이 워크플로 전용 개인 키
- `OCI_KNOWN_HOSTS`: `OCI_HOST`에 대해 별도로 검증한 `known_hosts` 항목

다른 저장소의 Secret은 자동으로 공유되지 않습니다.

## Mac에서 하는 최초 1회 설정

기존 `opc` 키는 전용 사용자를 생성하고 root 소유 배포 명령을 설치하는
bootstrap 용도로만 사용합니다. 아래 명령은 저장소 루트에서 실행합니다.

```bash
set -Eeuo pipefail
umask 077

export REPO="gpsrlin115/iidxScoreBoardClient"
export OCI_HOST="<existing OCI hostname or IP>"
export OCI_BOOTSTRAP_USER="opc"
export OCI_DEPLOY_USER="iidxdeploy"
export OCI_BOOTSTRAP_KEY="$HOME/.ssh/<existing private key>"
export ACTIONS_KEY="$HOME/.ssh/iidx_frontend_actions"

if [[ -e "$ACTIONS_KEY" || -e "$ACTIONS_KEY.pub" ]]; then
  printf 'Actions key already exists: %s\n' "$ACTIONS_KEY" >&2
  exit 1
fi

ssh-keygen -t ed25519 -N '' \
  -C 'github-actions:iidxScoreBoardClient' \
  -f "$ACTIONS_KEY"

ssh -i "$OCI_BOOTSTRAP_KEY" \
  "$OCI_BOOTSTRAP_USER@$OCI_HOST" \
  "if ! id -u '$OCI_DEPLOY_USER' >/dev/null 2>&1; then
     sudo useradd --create-home --user-group \
       --home-dir '/home/$OCI_DEPLOY_USER' \
       --shell /bin/bash '$OCI_DEPLOY_USER'
   fi
   sudo usermod --lock '$OCI_DEPLOY_USER'
   test \"\$(id -nG '$OCI_DEPLOY_USER')\" = '$OCI_DEPLOY_USER'
   sudo chown root:root '/home/$OCI_DEPLOY_USER'
   sudo chmod 0755 '/home/$OCI_DEPLOY_USER'
   sudo install -d -o root -g root -m 0711 \
     '/home/$OCI_DEPLOY_USER/.ssh'
   command -v restorecon >/dev/null &&
     sudo restorecon -RF '/home/$OCI_DEPLOY_USER/.ssh' || true"

printf 'restrict %s\n' "$(cat "$ACTIONS_KEY.pub")" |
  ssh -i "$OCI_BOOTSTRAP_KEY" \
    "$OCI_BOOTSTRAP_USER@$OCI_HOST" \
    "sudo tee '/home/$OCI_DEPLOY_USER/.ssh/authorized_keys' >/dev/null
     sudo chown root:root \
       '/home/$OCI_DEPLOY_USER/.ssh/authorized_keys'
     sudo chmod 0644 '/home/$OCI_DEPLOY_USER/.ssh/authorized_keys'
     command -v restorecon >/dev/null &&
       sudo restorecon -RF '/home/$OCI_DEPLOY_USER/.ssh' || true"

scp -i "$OCI_BOOTSTRAP_KEY" \
  deploy/oci-cloudflare/iidx-deploy-frontend.sh \
  "$OCI_BOOTSTRAP_USER@$OCI_HOST:/tmp/iidx-deploy-frontend.sh"

ssh -i "$OCI_BOOTSTRAP_KEY" \
  "$OCI_BOOTSTRAP_USER@$OCI_HOST" \
  "sudo install -o root -g root -m 0755 \
     /tmp/iidx-deploy-frontend.sh \
     /usr/local/bin/iidx-deploy-frontend
   rm -f /tmp/iidx-deploy-frontend.sh"

printf '%s ALL=(root) NOPASSWD: /usr/local/bin/iidx-deploy-frontend ""\n' \
  "$OCI_DEPLOY_USER" |
  ssh -i "$OCI_BOOTSTRAP_KEY" \
    "$OCI_BOOTSTRAP_USER@$OCI_HOST" \
    'candidate="$(sudo mktemp /etc/sudoers.d/iidx-deploy-frontend.XXXXXX)"
     cleanup() { sudo rm -f -- "$candidate"; }
     trap cleanup EXIT
     sudo tee "$candidate" >/dev/null
     sudo chmod 0440 "$candidate"
     sudo visudo -cf "$candidate"
     sudo mv -- "$candidate" /etc/sudoers.d/iidx-deploy-frontend
     trap - EXIT
     sudo visudo -c'

ssh -i "$OCI_BOOTSTRAP_KEY" \
  "$OCI_BOOTSTRAP_USER@$OCI_HOST" \
  "id '$OCI_DEPLOY_USER'
   sudo -l -U '$OCI_DEPLOY_USER'
   sudo stat -c '%A %U:%G %n' \
     /usr/local/bin/iidx-deploy-frontend \
     /etc/sudoers.d/iidx-deploy-frontend"
```

`iidxdeploy`가 `sudo`, `wheel`, `docker` 등의 추가 그룹에 속하지 않았는지
위 `id` 출력에서 확인합니다. `sudo -l`에는 인자 없는 고정
`/usr/local/bin/iidx-deploy-frontend` 명령만 나타나야 합니다. Actions에서는
항상 `sudo -n`으로 실행하여 비밀번호 입력 대기 없이 실패하게 합니다.

## GitHub Environment 및 Secret 설정

Mac의 기존 `known_hosts` 항목은 OCI 콘솔 등 별도 경로에서 확인한 호스트 키와
일치하는지 먼저 검증합니다. `ssh-keyscan` 결과를 검증 없이 바로 신뢰하지
않습니다.

```bash
set -Eeuo pipefail
umask 077

gh api --method PUT \
  "repos/$REPO/environments/production" \
  --input - <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON

gh api --method POST \
  "repos/$REPO/environments/production/deployment-branch-policies" \
  -f name='main' \
  -f type='branch'

gh secret set OCI_HOST --repo "$REPO" --env production --body "$OCI_HOST"
gh secret set OCI_USER --repo "$REPO" --env production --body "$OCI_DEPLOY_USER"
gh secret set OCI_SSH_KEY --repo "$REPO" --env production < "$ACTIONS_KEY"

known_hosts_file="$(mktemp)"
trap 'rm -f -- "$known_hosts_file"' EXIT
ssh-keygen -F "$OCI_HOST" -f "$HOME/.ssh/known_hosts" > "$known_hosts_file"
test -s "$known_hosts_file"
gh secret set OCI_KNOWN_HOSTS \
  --repo "$REPO" \
  --env production \
  < "$known_hosts_file"
```

## 첫 수동 배포

서버 설정과 Secret 구성이 끝나면 이 워크플로를 `main`에 병합합니다. 첫
배포는 수동으로 실행하고 완료될 때까지 로그를 확인합니다.

```bash
gh workflow run deploy-frontend.yml --repo "$REPO" --ref main
run_id="$(gh run list --repo "$REPO" --workflow deploy-frontend.yml \
  --limit 1 --json databaseId --jq '.[0].databaseId')"
test -n "$run_id"
gh run watch "$run_id" --repo "$REPO" --exit-status
```

성공 후 다음 항목을 확인합니다.

- `https://iidxtier.page/login`이 새 해시의 entry script를 반환하는지
- 로그인, 로그아웃, 새로고침과 SPA 직접 진입이 정상인지
- `/admin/tier-table`, `/tier-table`, `/ddr` 주요 경로가 정상인지
- 서버의 `/opt/iidx-scoreboard/client/.dist-previous`에 직전 버전이 남았는지

첫 수동 배포가 성공한 뒤 별도 PR에서 워크플로에 다음 트리거를 추가합니다.

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

## 키 폐기와 교체

Actions 키를 교체할 때는 새 키로 수동 배포를 먼저 검증한 뒤 이전 공개 키를
`/home/iidxdeploy/.ssh/authorized_keys`에서 제거합니다. 개인 키는 GitHub
Environment Secret과 관리 중인 Mac에만 보관합니다.
