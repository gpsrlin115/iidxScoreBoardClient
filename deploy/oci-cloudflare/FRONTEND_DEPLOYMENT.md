# Frontend deployment to OCI

The `.github/workflows/deploy-frontend.yml` workflow builds and deploys the
frontend whenever `main` is updated. It can also be retried manually from the
Actions tab.

## Required repository secrets

Add these Actions secrets to `gpsrlin115/iidxScoreBoardClient`:

- `OCI_HOST`: the OCI VM hostname or public IP
- `OCI_USER`: the SSH deployment user
- `OCI_SSH_KEY`: the complete private key used by that user
- `OCI_KNOWN_HOSTS`: the verified `known_hosts` entry for `OCI_HOST`

Secrets belong to a repository, so the values already configured in
`gpsrlin115/iidxScoreBoard` are not automatically available to the client
repository.

## One-time setup from the Mac

Use the OCI host, user, and key that already work on the Mac:

```bash
export REPO="gpsrlin115/iidxScoreBoardClient"
export OCI_HOST="<existing OCI hostname or IP>"
export OCI_USER="<existing SSH user>"
export OCI_KEY="$HOME/.ssh/<existing private key>"

scp -i "$OCI_KEY" \
  deploy/oci-cloudflare/iidx-deploy-frontend.sh \
  "$OCI_USER@$OCI_HOST:/tmp/iidx-deploy-frontend.sh"

ssh -i "$OCI_KEY" "$OCI_USER@$OCI_HOST" \
  "sudo install -o root -g root -m 0755 \
    /tmp/iidx-deploy-frontend.sh \
    /usr/local/bin/iidx-deploy-frontend"

printf '%s ALL=(root) NOPASSWD: /usr/local/bin/iidx-deploy-frontend\n' "$OCI_USER" |
  ssh -i "$OCI_KEY" "$OCI_USER@$OCI_HOST" \
    'sudo tee /etc/sudoers.d/iidx-deploy-frontend >/dev/null &&
     sudo chmod 0440 /etc/sudoers.d/iidx-deploy-frontend &&
     sudo visudo -cf /etc/sudoers.d/iidx-deploy-frontend'

gh secret set OCI_HOST --repo "$REPO" --body "$OCI_HOST"
gh secret set OCI_USER --repo "$REPO" --body "$OCI_USER"
gh secret set OCI_SSH_KEY --repo "$REPO" < "$OCI_KEY"

ssh-keygen -F "$OCI_HOST" -f "$HOME/.ssh/known_hosts" > /tmp/iidx-known-hosts
test -s /tmp/iidx-known-hosts
gh secret set OCI_KNOWN_HOSTS --repo "$REPO" < /tmp/iidx-known-hosts
rm -f /tmp/iidx-known-hosts
```

The sudoers entry permits only the fixed deployment command. The deployment
script validates the archive, rejects unsafe paths and symbolic links, keeps
the previous `dist` directory as a backup, and restores it if the local Caddy
health check fails.

## First deployment

After the server command and four secrets are configured, merge this workflow
to `main`. The merge triggers the first deployment. Later `main` updates
deploy automatically. A failed deployment can be retried with:

```bash
gh workflow run deploy-frontend.yml --repo gpsrlin115/iidxScoreBoardClient
```
