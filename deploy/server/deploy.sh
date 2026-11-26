#!/usr/bin/env bash
# Auto-deploy: if GitHub's main has a new commit, build it in a fresh release
# folder, switch the site to it, restart, and roll back if it doesn't come up.
# Runs every minute from eksu-deploy.timer (as the eksu user). --force rebuilds.
set -euo pipefail
REPO_URL="https://github.com/Amigo-1234/eksu-sports-hub.git"
BASE=/srv/eksu
exec 9>"$BASE/.deploy.lock"
flock -n 9 || exit 0   # a deploy is already running

cd "$BASE"
[ -d repo/.git ] || git clone --quiet --no-checkout "$REPO_URL" repo
git -C repo fetch --quiet origin main
SHA=$(git -C repo rev-parse origin/main)
CURRENT=$(basename "$(readlink -f current 2>/dev/null || echo none)")
[ "${1:-}" = "--force" ] || [ "$SHA" != "$CURRENT" ] || exit 0

echo "Deploying $SHA (was $CURRENT)"
REL="$BASE/releases/$SHA"
rm -rf "$REL"
git -C repo worktree prune
git -C repo worktree add --quiet --detach "$REL" "$SHA"
cd "$REL"
set -a; . "$BASE/shared/env"; set +a
npm ci --no-audit --no-fund --loglevel=error
NODE_OPTIONS=--max-old-space-size=4096 npm run build

PREV=$(readlink -f "$BASE/current" 2>/dev/null || true)
ln -sfn "$REL" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
sudo /usr/bin/systemctl restart eksu-web

ok=0
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then ok=1; break; fi
  sleep 2
done
if [ $ok = 1 ]; then
  echo "Live: $SHA"
  # Keep the 3 newest releases.
  ls -1dt "$BASE"/releases/*/ | tail -n +4 | while read -r old; do git -C "$BASE/repo" worktree remove --force "$old" || rm -rf "$old"; done
else
  echo "New release did not start; rolling back to $PREV" >&2
  if [ -n "$PREV" ]; then ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"; sudo /usr/bin/systemctl restart eksu-web; fi
  exit 1
fi
