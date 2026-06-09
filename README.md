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

By default, all local config and state lives under the single-instance path:

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

For multiple Discord bots on the same Linux user, set an instance name instead
of sharing the default directory:

```bash
DISCORD_BRIDGE_INSTANCE=codex01 scripts/install-systemd-user.sh
DISCORD_BRIDGE_INSTANCE=codex02 scripts/install-systemd-user.sh
```

That creates isolated paths:

```text
~/.codex/channels/discord/codex01/.env
~/.codex/channels/discord/codex01/state.json
~/.config/discord-codex-bridge/codex01.env
discord-codex-bridge@codex01.service
```

Each instance should have its own Discord bot token, access state, target Codex
thread, and app-server socket. Helper scripts honor the same instance:

```bash
DISCORD_BRIDGE_INSTANCE=codex01 node scripts/manage-access.js status
DISCORD_BRIDGE_INSTANCE=codex02 node scripts/fetch-messages.js --channel CHANNEL_ID
```

## Setup

Install the Codex plugin/skills from this marketplace repo:

```bash
codex plugin marketplace add zhshgmail/discord-codex-bridge --ref main
codex plugin add discord-codex-bridge@discord-codex-bridge
```

Create a Discord application and bot in the Discord Developer Portal. Enable
**Message Content Intent**. Invite the bot to a shared server; for guild text
channels, grant View Channels, Send Messages, Read Message History, Send
Messages in Threads, Attach Files, Send TTS Messages, Mention Everyone, and Add
Reactions as needed.

Install and create the local config template:

```bash
cd plugins/discord-codex-bridge
npm install
scripts/install-systemd-user.sh
```

For an isolated named bot:

```bash
scripts/install-systemd-user.sh --instance codex01
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

For a named instance, edit `~/.codex/channels/discord/codex01/.env` and use:

```bash
systemctl --user restart discord-codex-bridge@codex01.service
systemctl --user status discord-codex-bridge@codex01.service --no-pager
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

Access follows the same model as Claude Code's Discord plugin:

- DMs use `dmPolicy`: `pairing` (default), `allowlist`, or `disabled`.
- `allowFrom` contains Discord user IDs allowed to DM.
- Guild text channels are off by default and must be enabled by channel ID, not
  guild ID.
- Enabled guild channels default to `requireMention: true`, so only `@bot`,
  replies to recent bot messages, or `mentionPatterns` enter Codex context.
- Pass `--no-mention` or run `group mention CHANNEL_ID off` to receive all
  messages in that enabled channel.
- Channel-level `allowFrom` restricts who can trigger that channel. If it is
  empty, global `allowFrom` is used by default.
- Bot-authored messages are ignored unless that channel has `allowBots: true`
  and the bot ID is allowed.

Pairing flow:

```bash
node scripts/manage-access.js status
# unknown DM gets a 6-character pairing code from the bridge
node scripts/manage-access.js pair ABC123
node scripts/manage-access.js policy allowlist
```

Manual configuration:

```bash
node scripts/manage-access.js configure --token YOUR_DISCORD_BOT_TOKEN
node scripts/manage-access.js allow USER_ID
node scripts/manage-access.js remove USER_ID
node scripts/manage-access.js group add CHANNEL_ID
node scripts/manage-access.js group add CHANNEL_ID --no-mention --allow USER_ID,OTHER_ID
node scripts/manage-access.js group allow CHANNEL_ID USER_ID
node scripts/manage-access.js group mention CHANNEL_ID off
node scripts/manage-access.js group allow-bots CHANNEL_ID on
node scripts/manage-access.js group rm CHANNEL_ID
```

The running bridge re-reads `state.json` on every inbound message, so access
changes do not need a restart. Threads inherit their parent text channel's
access config.

The state shape is:

```json
{
  "dmPolicy": "pairing",
  "allowFrom": ["1004200500721360906"],
  "groups": {
    "1234567890123456789": {
      "requireMention": true,
      "allowFrom": [],
      "allowBots": false
    }
  },
  "mentionPatterns": []
}
```

Optional bootstrap env vars exist for private one-user setup, but the default
is pairing:

```env
DISCORD_BOOTSTRAP_FIRST_USER=false
DISCORD_BOOTSTRAP_GUILD_MENTIONS=false
DISCORD_REQUIRE_ALLOW_FROM_IN_GUILDS=true
```

## Discord Channel Utilities

The bundled scripts use the same token, proxy, and TLS settings:

```bash
# 1. view channels / channel
node scripts/list-channels.js --guild GUILD_ID
node scripts/view-channel.js --channel CHANNEL_ID

# 2. retrieve history
node scripts/fetch-messages.js --channel CHANNEL_ID --limit 50

# 3. read message
node scripts/read-message.js --channel CHANNEL_ID --message MESSAGE_ID

# 4. send message
printf '%s' 'reply text' | node scripts/send-message.js --channel CHANNEL_ID

# 5. send message in thread
printf '%s' 'reply text' | node scripts/send-message.js --thread THREAD_ID

# 6. send message with attachment
printf '%s' 'see attached' | node scripts/send-message.js --channel CHANNEL_ID --file /abs/path/file.txt

# 7. send TTS message
printf '%s' 'tts text' | node scripts/send-message.js --channel CHANNEL_ID --tts

# 8. send @everyone
printf '%s' '@everyone update' | node scripts/send-message.js --channel CHANNEL_ID --allow-everyone
```

History output is oldest-first and capped at 100 messages per call.

## TTY Mode

`CODEX_TARGET_MODE=tty` injects accepted Discord messages into the current
interactive `codex resume` terminal. This is the only mode that reaches an
already-open Codex TUI session.

TTY mode is inherently unsafe when a local user may be typing in the Codex TUI.
Codex owns an internal text buffer; TTY injection only simulates keyboard input,
so it cannot see or protect a half-typed local draft. A Discord delivery can
therefore submit local text and Discord text together. Use shared app-server
socket mode for robust current-session bridging.

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
CODEX_TTY_PROMPT_FORMAT=minimal  # minimal | compact | full | plain
CODEX_TTY_BRACKETED_PASTE=false  # safer for Codex TUI TIOCSTI injection
CODEX_TTY_SUBMIT_SEQUENCE=cr    # cr | lf | crlf | lfcr | none | escaped string
CODEX_TTY_SPLIT_SUBMIT=true     # inject text, wait, then inject submit key
CODEX_TTY_SUBMIT_DELAY_MS=500
CODEX_TTY_ACK_ON_DELIVERY=false # do not post "Delivered..." ack messages
```

`minimal` injects a one-line source marker with channel/message IDs and
Discord author ID/name plus `reply=required`, then the Discord text and an end
marker. The end marker helps Codex identify accidental local TUI draft
collisions. `compact` includes the local reply helper command. `full` preserves
the XML-style metadata envelope. `plain` injects only message text.

TTY mode serializes all accepted Discord messages through one global TTY queue,
even when they arrive from different Discord channels. This prevents split
submit delays from interleaving two Discord messages in the same Codex input.

When a current Codex user message has a marker like
`[Discord DM; channel=...; message=...; reply=required]`, Codex should also
send the substantive response back to Discord with `send-message.js` before
returning its normal final answer.

## App-Server Modes

`CODEX_TARGET_MODE=turn` starts/resumes a Codex app-server thread, waits for
the final answer, and posts it back to Discord.

If `CODEX_TARGET_THREAD_ID` is set, all accepted Discord messages route to that
thread. Without it, the bridge creates one Codex thread per Discord channel.

Other modes:

- `wake`: start a turn in the target thread and, by default, avoid a noisy
  delivery acknowledgement. The bridge unsubscribes from the target thread after
  starting the turn so the interactive TUI remains the primary event consumer.
- `inject`: append a raw user item to the target thread.

For a current interactive Codex session without TTY injection, run the TUI and
the bridge against the same Unix app-server socket:

```bash
mkdir -p ~/.codex/app-server-discord/codex01
codex app-server --listen unix://$HOME/.codex/app-server-discord/codex01/app-server.sock
```

In another terminal, connect the Codex TUI to that socket:

```bash
codex --remote unix://$HOME/.codex/app-server-discord/codex01/app-server.sock resume THREAD_ID
```

Set the matching instance `.env`:

```env
CODEX_TARGET_MODE=wake
CODEX_TARGET_THREAD_ID=THREAD_ID
CODEX_TARGET_THREAD_RESUME=false
CODEX_APP_SERVER_SOCKET=/home/YOU/.codex/app-server-discord/codex01/app-server.sock
CODEX_DENY_SERVER_REQUESTS=false
CODEX_WAKE_ACK_ON_DELIVERY=false
```

Use one socket per Discord bridge instance. Sharing a socket across instances
can mix event subscriptions, approvals, and target thread routing.

## Manual Reply Helper

From any Codex session:

```bash
cd plugins/discord-codex-bridge
printf '%s' 'reply text' | node scripts/send-message.js --channel CHANNEL_ID --reply-to MESSAGE_ID
```

To address another bot or user in a guild channel, ping the target explicitly:

```bash
printf '%s' 'question text' | node scripts/send-message.js --channel CHANNEL_ID --mention USER_OR_BOT_ID
```

`--mention ID` prepends `<@ID>` and permits that user/bot mention through
Discord `allowed_mentions`. Use `--reply-mention` when a reply should ping the
author of the referenced message. To actually ping `@everyone`, the message
content must contain `@everyone`, `--allow-everyone` must be passed, and the bot
must have Discord's Mention Everyone permission in that channel.

## Development

```bash
cd plugins/discord-codex-bridge
npm run check
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
python3 /path/to/skill-creator/scripts/quick_validate.py skills/discord-codex-bridge
python3 /path/to/skill-creator/scripts/quick_validate.py skills/configure
python3 /path/to/skill-creator/scripts/quick_validate.py skills/access
```
