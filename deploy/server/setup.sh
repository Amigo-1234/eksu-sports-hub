#!/usr/bin/env bash
# One-time setup of the EKSU Sports Hub server (Ubuntu 22.04/24.04, run as root).
# Installs Node 22, Caddy (automatic HTTPS) and git, creates the app user and
# folders, opens ports 80/443, and installs the web + auto-deploy services.
# Secrets are NOT set here: put them in /srv/eksu/shared/env (see env.example).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

# Node 22 (NodeSource).
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (official repo).
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

# Oracle's Ubuntu images block everything but SSH in iptables: allow web traffic.
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport $p -m state --state NEW -j ACCEPT
done
netfilter-persistent save

# App user and folders.
id eksu >/dev/null 2>&1 || useradd --system --create-home --home-dir /srv/eksu --shell /usr/sbin/nologin eksu
mkdir -p /srv/eksu/releases /srv/eksu/shared /srv/eksu/repo
[ -f /srv/eksu/shared/env ] || install -m 600 "$HERE/env.example" /srv/eksu/shared/env
chown -R eksu:eksu /srv/eksu
chmod 600 /srv/eksu/shared/env

install -m 755 "$HERE/deploy.sh" /usr/local/bin/eksu-deploy
install -m 644 "$HERE/eksu-web.service" "$HERE/eksu-deploy.service" "$HERE/eksu-deploy.timer" /etc/systemd/system/
install -m 644 "$HERE/Caddyfile" /etc/caddy/Caddyfile
# The deploy job (runs as eksu) may restart only the web service.
echo 'eksu ALL=(root) NOPASSWD: /usr/bin/systemctl restart eksu-web, /usr/bin/systemctl is-active eksu-web' > /etc/sudoers.d/eksu-deploy
chmod 440 /etc/sudoers.d/eksu-deploy

systemctl daemon-reload
systemctl enable eksu-web eksu-deploy.timer
systemctl reload-or-restart caddy
echo "Setup done. Next: fill /srv/eksu/shared/env, then: sudo -u eksu /usr/local/bin/eksu-deploy --force && systemctl start eksu-deploy.timer"
