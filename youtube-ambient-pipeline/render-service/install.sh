#!/usr/bin/env bash
# Installs the ambient render service on Ubuntu 24.04. Run as root from the directory that holds server.mjs:
#   bash install.sh [PUBLIC_IP_OR_HOST]
# Idempotent: re-running upgrades the code and keeps the existing secret.
set -euo pipefail
HOST="${1:-$(curl -4 -s https://ifconfig.me || hostname -I | awk '{print $1}')}"
PORT="${PORT:-8787}"
APP=/opt/ambient-render
ENV=/etc/ambient-render.env
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ffmpeg fonts-dejavu-core curl ca-certificates gnupg >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "   ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}'), node $(node -v)"

echo "== user, directories, code"
id -u ambient >/dev/null 2>&1 || useradd --system --user-group --home /var/lib/ambient-render --shell /usr/sbin/nologin ambient
mkdir -p "$APP" /var/lib/ambient-render
cp "$SRC/server.mjs" "$SRC/render.mjs" "$APP/"
chown -R ambient:ambient /var/lib/ambient-render "$APP"

if [ ! -f "$ENV" ]; then
  SECRET="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40)"
  cat > "$ENV" <<EOT
RENDER_SECRET=$SECRET
PORT=$PORT
PUBLIC_BASE_URL=http://$HOST:$PORT
WORK_DIR=/var/lib/ambient-render
KEEP_DAYS=7
EOT
  chmod 600 "$ENV"
  echo "   wrote $ENV with a new secret"
else
  echo "   keeping existing $ENV"
fi

echo "== systemd"
cat > /etc/systemd/system/ambient-render.service <<'EOT'
[Unit]
Description=Ambient render service (ffmpeg behind a Creatomate-shaped API)
After=network-online.target
Wants=network-online.target

[Service]
User=ambient
Group=ambient
EnvironmentFile=/etc/ambient-render.env
WorkingDirectory=/opt/ambient-render
ExecStart=/usr/bin/node /opt/ambient-render/server.mjs
Restart=always
RestartSec=3
Nice=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/ambient-render
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOT
systemctl daemon-reload
systemctl enable --now ambient-render >/dev/null
systemctl restart ambient-render
sleep 1
echo "== check"
curl -fsS "http://127.0.0.1:$PORT/healthz" && echo
echo
echo "Render service is up."
echo "  Base URL for n8n (render_api_base): http://$HOST:$PORT/v1"
echo "  Secret for the n8n Header Auth credential (Authorization: Bearer <secret>):"
echo "  $(grep ^RENDER_SECRET "$ENV" | cut -d= -f2)"
echo "  Logs: journalctl -u ambient-render -f"
