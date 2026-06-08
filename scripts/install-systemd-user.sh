#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="${DISCORD_CONFIG_DIR:-$HOME/.codex/channels/discord}"
ENV_FILE="${DISCORD_ENV_FILE:-$CONFIG_DIR/.env}"
SERVICE_ENV="${DISCORD_BRIDGE_SERVICE_ENV:-$HOME/.config/discord-codex-bridge.env}"
SERVICE_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/discord-codex-bridge.service"

mkdir -p "$CONFIG_DIR" "$(dirname "$SERVICE_ENV")" "$(dirname "$SERVICE_FILE")"
chmod 700 "$CONFIG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/config/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

cat > "$SERVICE_ENV" <<EOF
DISCORD_ENV_FILE=$ENV_FILE
DISCORD_CONFIG_DIR=$CONFIG_DIR
DISCORD_STATE_DIR=$CONFIG_DIR
CODEX_CWD=${CODEX_CWD:-$PWD}
PATH=$PATH
NO_PROXY=localhost,127.0.0.1,::1,0.0.0.0
no_proxy=localhost,127.0.0.1,::1,0.0.0.0
EOF
chmod 600 "$SERVICE_ENV"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Discord Codex Bridge
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$SERVICE_ENV
ExecStart=$(command -v node) $ROOT_DIR/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable discord-codex-bridge.service

echo "Installed $SERVICE_FILE"
echo "Edit $ENV_FILE, then run:"
echo "  systemctl --user restart discord-codex-bridge.service"
