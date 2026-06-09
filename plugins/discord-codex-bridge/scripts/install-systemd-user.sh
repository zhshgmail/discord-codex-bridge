#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

INSTANCE="${DISCORD_BRIDGE_INSTANCE:-${DISCORD_INSTANCE:-}}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: install-systemd-user.sh [--instance NAME]

Without an instance name, installs the legacy single service:
  discord-codex-bridge.service

With an instance name, installs isolated config and service:
  ~/.codex/channels/discord/NAME/.env
  ~/.config/discord-codex-bridge/NAME.env
  discord-codex-bridge@NAME.service
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$INSTANCE" && ! "$INSTANCE" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
  echo "Instance name must use only letters, numbers, dot, underscore, dash, or @: $INSTANCE" >&2
  exit 2
fi

CONFIG_BASE_DIR="${DISCORD_CONFIG_BASE_DIR:-$HOME/.codex/channels/discord}"
if [[ -n "$INSTANCE" ]]; then
  CONFIG_DIR="${DISCORD_CONFIG_DIR:-$CONFIG_BASE_DIR/$INSTANCE}"
  SERVICE_ENV="${DISCORD_BRIDGE_SERVICE_ENV:-${XDG_CONFIG_HOME:-$HOME/.config}/discord-codex-bridge/$INSTANCE.env}"
  SERVICE_NAME="${DISCORD_BRIDGE_SERVICE_NAME:-discord-codex-bridge@$INSTANCE.service}"
else
  CONFIG_DIR="${DISCORD_CONFIG_DIR:-$CONFIG_BASE_DIR}"
  SERVICE_ENV="${DISCORD_BRIDGE_SERVICE_ENV:-$HOME/.config/discord-codex-bridge.env}"
  SERVICE_NAME="${DISCORD_BRIDGE_SERVICE_NAME:-discord-codex-bridge.service}"
fi
ENV_FILE="${DISCORD_ENV_FILE:-$CONFIG_DIR/.env}"
SERVICE_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$SERVICE_NAME"

mkdir -p "$CONFIG_DIR" "$(dirname "$SERVICE_ENV")" "$(dirname "$SERVICE_FILE")"
chmod 700 "$CONFIG_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT_DIR/config/.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

cat > "$SERVICE_ENV" <<EOF
DISCORD_BRIDGE_INSTANCE=$INSTANCE
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
systemctl --user enable "$SERVICE_NAME"

echo "Installed $SERVICE_FILE"
echo "Edit $ENV_FILE, then run:"
echo "  systemctl --user restart $SERVICE_NAME"
