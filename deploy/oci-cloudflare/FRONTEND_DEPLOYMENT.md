# OCI 프런트엔드 배포

`.github/workflows/deploy-frontend.yml` 워크플로는 `main`이 갱신될 때마다
프런트엔드를 빌드하고 배포합니다. 이전 수동 배포와 동일하게 `dist/`를 rsync로
`/tmp/iidx-dist/`에 올린 뒤, Caddy 문서 루트를 안전하게 교체합니다. Actions
탭에서 수동으로 다시 실행할 수도 있습니다.

## 필요한 저장소 Secret

`gpsrlin115/iidxScoreBoardClient`에 다음 Actions Secret을 추가합니다.

- `OCI_HOST`: OCI VM의 호스트명 또는 공인 IP
- `OCI_USER`: SSH 배포 사용자
- `OCI_SSH_KEY`: 이 Actions 워크플로 전용으로 생성한 개인 키
- `OCI_KNOWN_HOSTS`: `OCI_HOST`에 대해 검증한 `known_hosts` 항목

Secret은 저장소별로 분리됩니다. 따라서 `gpsrlin115/iidxScoreBoard`에 이미
설정된 값이 클라이언트 저장소에 자동으로 공유되지는 않습니다.

## Mac에서 하는 최초 1회 설정

기존 Mac 키는 Actions 전용 키를 등록하는 초기 설정에만 사용합니다.

```bash
export REPO="gpsrlin115/iidxScoreBoardClient"
export OCI_HOST="<existing OCI hostname or IP>"
export OCI_USER="<existing SSH user>"
export OCI_BOOTSTRAP_KEY="$HOME/.ssh/<existing private key>"
export ACTIONS_KEY="$HOME/.ssh/iidx_frontend_actions"

test ! -e "$ACTIONS_KEY"
ssh-keygen -t ed25519 -N '' \
  -C 'github-actions:iidxScoreBoardClient' \
  -f "$ACTIONS_KEY"

cat "$ACTIONS_KEY.pub" |
  ssh -i "$OCI_BOOTSTRAP_KEY" "$OCI_USER@$OCI_HOST" \
    'umask 077
     mkdir -p "$HOME/.ssh"
     touch "$HOME/.ssh/authorized_keys"
     key="$(cat)"
     grep -qxF "$key" "$HOME/.ssh/authorized_keys" ||
       printf "%s\n" "$key" >> "$HOME/.ssh/authorized_keys"'

scp -i "$OCI_BOOTSTRAP_KEY" \
  deploy/oci-cloudflare/iidx-deploy-frontend.sh \
  "$OCI_USER@$OCI_HOST:/tmp/iidx-deploy-frontend.sh"

ssh -i "$OCI_BOOTSTRAP_KEY" "$OCI_USER@$OCI_HOST" \
  "sudo install -o root -g root -m 0755 \
    /tmp/iidx-deploy-frontend.sh \
    /usr/local/bin/iidx-deploy-frontend"

printf '%s ALL=(root) NOPASSWD: /usr/local/bin/iidx-deploy-frontend\n' "$OCI_USER" |
  ssh -i "$OCI_BOOTSTRAP_KEY" "$OCI_USER@$OCI_HOST" \
    'sudo tee /etc/sudoers.d/iidx-deploy-frontend >/dev/null &&
     sudo chmod 0440 /etc/sudoers.d/iidx-deploy-frontend &&
     sudo visudo -cf /etc/sudoers.d/iidx-deploy-frontend'

gh secret set OCI_HOST --repo "$REPO" --body "$OCI_HOST"
gh secret set OCI_USER --repo "$REPO" --body "$OCI_USER"
gh secret set OCI_SSH_KEY --repo "$REPO" < "$ACTIONS_KEY"

ssh-keygen -F "$OCI_HOST" -f "$HOME/.ssh/known_hosts" > /tmp/iidx-known-hosts
test -s /tmp/iidx-known-hosts
gh secret set OCI_KNOWN_HOSTS --repo "$REPO" < /tmp/iidx-known-hosts
rm -f /tmp/iidx-known-hosts
```

sudoers 항목은 고정된 배포 명령만 실행할 수 있게 제한합니다. 배포 스크립트는
업로드된 Vite 번들을 검증하고 일반 파일이 아닌 항목을 거부하며, 이전 `dist`
디렉터리를 백업합니다. 로컬 Caddy 헬스체크가 실패하면 이전 버전으로
복원합니다. GitHub Actions는 `/tmp/iidx-dist/`에 rsync한 뒤 OCI에 대화형 SSH로
접속하던 기존 수동 작업을 대체합니다.

## 첫 배포

서버 명령과 네 개의 Secret을 모두 설정한 뒤 이 워크플로를 `main`에
병합합니다. 병합하면 첫 배포가 실행되고, 이후 `main` 갱신도 자동으로
배포됩니다. 실패한 배포는 다음 명령으로 다시 실행할 수 있습니다.

```bash
gh workflow run deploy-frontend.yml --repo gpsrlin115/iidxScoreBoardClient
```
