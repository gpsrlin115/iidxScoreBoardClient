# Frontend deployment to OCI

The `.github/workflows/deploy-frontend.yml` workflow builds and deploys the
frontend whenever `main` is updated. It uploads `dist/` with the same rsync
staging path used by the previous manual deployment (`/tmp/iidx-dist/`), then
switches the Caddy document root safely. It can also be retried manually from
the Actions tab.

## Required repository secrets

Add these Actions secrets to `gpsrlin115/iidxScoreBoardClient`:

- `OCI_HOST`: the OCI VM hostname or public IP
- `OCI_USER`: the SSH deployment user
- `OCI_SSH_KEY`: a dedicated private key created for this Actions workflow
- `OCI_KNOWN_HOSTS`: the verified `known_hosts` entry for `OCI_HOST`

Secrets belong to a repository, so the values already configured in
`gpsrlin115/iidxScoreBoard` are not automatically available to the client
repository.

## One-time setup from the Mac

Use the existing Mac key only to bootstrap a dedicated Actions key:

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

The sudoers entry permits only the fixed deployment command. The deployment
script validates the uploaded Vite bundle, rejects non-regular files, keeps the
previous `dist` directory as a backup, and restores it if the local Caddy
health check fails. GitHub Actions replaces the former manual sequence of
rsyncing to `/tmp/iidx-dist/` and then opening an interactive OCI SSH session.

## First deployment

After the server command and four secrets are configured, merge this workflow
to `main`. The merge triggers the first deployment. Later `main` updates
deploy automatically. A failed deployment can be retried with:

```bash
gh workflow run deploy-frontend.yml --repo gpsrlin115/iidxScoreBoardClient
```
