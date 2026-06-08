# Discord Codex Bridge

Proxy-aware Discord bridge and Codex plugin skills for remote Codex chat/control.

The bridge can route Discord DMs, guild mentions, or opted-in channels into:

- an already-running interactive `codex resume` TTY (`CODEX_TARGET_MODE=tty`);
- a Codex app-server thread that replies back to Discord (`CODEX_TARGET_MODE=turn`);
- a target app-server thread using `wake` or `inject` modes.

The repository also ships Codex skills for setup and access management:

- `$discord-codex-bridge` — install, run, and diagnose the bridge.
- `$configure` — write token/proxy/TLS/mode config.
- `$access` — manage allowed Discord users and channels.

## Config Directory

By default, all local config and state lives under:

```text
~/.codex/channels/discord/
├── .env
└── state.json
```

This mirrors the channel config pattern used by Claude Code's Discord plugin,
but uses Codex's home directory. Override paths with:

- `DISCORD_CONFIG_DIR`
- `DISCORD_ENV_FILE`
- `DISCORD_STATE_DIR`
- `DISCORD_BRIDGE_STATE_DIR`

Never commit `.env` or `state.json`.

## Setup

Install the Codex plugin/skills from this marketplace repo:

```bash
codex plugin marketplace add zhshgmail/discord-codex-bridge --ref main
codex plugin add discord-codex-bridge@discord-codex-bridge
```

Create a Discord application and bot in the Discord Developer Portal. Enable
**Message Content Intent**. Invite the bot to a shared server; for guild usage,
grant View Channels, Send Messages, Read Message History, Send Messages in
Threads, and Add Reactions.

Install and create the local config template:

```bash
cd plugins/discord-codex-bridge
npm install
scripts/install-systemd-user.sh
```

Edit `~/.codex/channels/discord/.env`:

```env
DISCORD_BOT_TOKEN=<your bot token>
CODEX_TARGET_MODE=tty
CODEX_CWD=/path/to/your/project
```

Start the service:

```bash
systemctl --user restart discord-codex-bridge.service
systemctl --user status discord-codex-bridge.service --no-pager
```

## Proxy and Corporate TLS

Use an explicit proxy:

```env
DISCORD_PROXY_URL=http://proxy.example.com:8080
```

If omitted, the bridge falls back to `HTTPS_PROXY`, `https_proxy`,
`HTTP_PROXY`, or `http_proxy`.

For trusted corporate DLP/TLS interception environments only:

```env
DISCORD_INSECURE_TLS=true
```

This disables Node TLS verification for Discord traffic and Codex child
processes started by the bridge. Prefer installing the corporate root CA when
possible.

## Access

First setup can bootstrap the first human DM or first guild @mention:

```env
DISCORD_BOOTSTRAP_FIRST_USER=true
DISCORD_BOOTSTRAP_GUILD_MENTIONS=true
```

After your intended user is allowed, lock this down:

```env
DISCORD_BOOTSTRAP_FIRST_USER=false
DISCORD_BOOTSTRAP_GUILD_MENTIONS=false
```

Manage access:

```bash
cd plugins/discord-codex-bridge
node scripts/manage-access.js status
node scripts/manage-access.js allow <discord-user-id>
node scripts/manage-access.js remove <discord-user-id>
node scripts/manage-access.js channel add <discord-channel-id>
node scripts/manage-access.js channel rm <discord-channel-id>
```

The running bridge re-reads `state.json` on every inbound message, so access
changes do not need a restart.

## TTY Mode

`CODEX_TARGET_MODE=tty` injects accepted Discord messages into the current
interactive `codex resume` terminal. This is the only mode that reaches an
already-open Codex TUI session.

The bridge auto-detects a `codex ... resume` TTY. If multiple sessions exist,
set:

```env
CODEX_TTY=/dev/pts/N
```

On hosts that block unprivileged `TIOCSTI`, keep:

```env
CODEX_TTY_USE_SUDO=true
```

Prompt formatting:

```env
CODEX_TTY_PROMPT_FORMAT=compact  # compact | full | plain
```

`compact` sends a short Discord source line, message content, and a local
reply helper command. `full` preserves the XML-style metadata envelope. `plain`
injects only message text.

## App-Server Modes

`CODEX_TARGET_MODE=turn` starts/resumes a Codex app-server thread, waits for
the final answer, and posts it back to Discord.

If `CODEX_TARGET_THREAD_ID` is set, all accepted Discord messages route to that
thread. Without it, the bridge creates one Codex thread per Discord channel.

Other modes:

- `wake`: start a turn and acknowledge Discord immediately.
- `inject`: append a raw user item to the target thread.

## Manual Reply Helper

From any Codex session:

```bash
cd plugins/discord-codex-bridge
printf '%s' 'reply text' | node scripts/send-message.js --channel CHANNEL_ID --reply-to MESSAGE_ID
```

`DISCORD_ALLOW_EVERYONE=true` allows outbound replies to ping `@everyone`.
Leave it false for safer default behavior.

## Development

```bash
cd plugins/discord-codex-bridge
npm run check
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
python3 /path/to/skill-creator/scripts/quick_validate.py skills/discord-codex-bridge
python3 /path/to/skill-creator/scripts/quick_validate.py skills/configure
python3 /path/to/skill-creator/scripts/quick_validate.py skills/access
```
