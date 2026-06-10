#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${DISCORD_BRIDGE_BIN_DIR:-${XDG_BIN_HOME:-$HOME/.local/bin}}"

INSTANCE="${DISCORD_BRIDGE_INSTANCE:-${DISCORD_INSTANCE:-}}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --instance)
      INSTANCE="${2:-}"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: install-systemd-user.sh [--instance INSTANCE_VALUE]
       install-systemd-user.sh [--instance INSTANCE_VALUE] --dry-run

Without an instance name, installs the legacy single service:
  discord-codex-bridge.service

With an instance name, installs isolated config and service:
  $DISCORD_CONFIG_BASE_DIR/$DISCORD_BRIDGE_INSTANCE/.env
  $XDG_CONFIG_HOME/discord-codex-bridge/$DISCORD_BRIDGE_INSTANCE.env
  discord-codex-bridge@$DISCORD_BRIDGE_INSTANCE.service

Options:
  --dry-run   Print resolved paths and commands without writing files.
EOF
      exit 0
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

DRY_RUN="${DRY_RUN:-false}"

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

append_env_if_set() {
  local key="$1"
  local value="${!key:-}"
  [[ -n "$value" ]] || return 0
  printf '%s=%s\n' "$key" "$value" >> "$SERVICE_ENV"
}

if [[ "$DRY_RUN" == "true" ]]; then
  cat <<EOF
[dry-run] Would install Discord Codex Bridge
plugin_dir=$ROOT_DIR
instance=$INSTANCE
config_dir=$CONFIG_DIR
env_file=$ENV_FILE
service_env=$SERVICE_ENV
service_file=$SERVICE_FILE
service_name=$SERVICE_NAME
bin_link=$BIN_DIR/discord-codex-bridge
commands:
  mkdir -p "$CONFIG_DIR" "$(dirname "$SERVICE_ENV")" "$(dirname "$SERVICE_FILE")" "$BIN_DIR"
  cp "$ROOT_DIR/config/.env.example" "$ENV_FILE"  # only if missing
  systemctl --user daemon-reload
  systemctl --user enable "$SERVICE_NAME"
EOF
  exit 0
fi

mkdir -p "$CONFIG_DIR" "$(dirname "$SERVICE_ENV")" "$(dirname "$SERVICE_FILE")"
mkdir -p "$BIN_DIR"
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
append_env_if_set DISCORD_PROXY_URL
append_env_if_set HTTPS_PROXY
append_env_if_set HTTP_PROXY
append_env_if_set https_proxy
append_env_if_set http_proxy
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
ln -sfn "$ROOT_DIR/bin/discord-codex-bridge" "$BIN_DIR/discord-codex-bridge"

echo "Installed $SERVICE_FILE"
echo "Installed CLI symlink $BIN_DIR/discord-codex-bridge"
echo "Edit $ENV_FILE, then run:"
echo "  discord-codex-bridge restart${INSTANCE:+ --instance $INSTANCE}"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "Add $BIN_DIR to PATH, or set DISCORD_BRIDGE_BIN_DIR to a directory already in PATH."
fi
