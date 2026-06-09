---
name: configure
description: Configure the Discord Codex bridge token, proxy, TLS, Codex target mode, and config directory. Use when the user pastes a Discord bot token, asks to configure Discord, asks where bridge config lives, or wants setup status.
---

# Discord Configure

Configure the bridge through `$DISCORD_CONFIG_BASE_DIR/.env` by default,
falling back to `$HOME/.codex/channels/discord/.env`.
For multiple bots/sessions, set `DISCORD_BRIDGE_INSTANCE`, which uses
`$DISCORD_CONFIG_BASE_DIR/$DISCORD_BRIDGE_INSTANCE/.env`. `DISCORD_CONFIG_DIR` or
`DISCORD_ENV_FILE` may override the location.

## No token provided

Show status without revealing secrets:

1. Resolve config dir:
   `DISCORD_CONFIG_DIR || DISCORD_STATE_DIR || $DISCORD_CONFIG_BASE_DIR/$DISCORD_BRIDGE_INSTANCE || $HOME/.codex/channels/discord/$DISCORD_BRIDGE_INSTANCE`.
2. Read `.env` if present.
3. Report whether `DISCORD_BOT_TOKEN` is set; if set, show only the first 6
   characters plus `...`.
4. Report proxy/TLS settings:
   `DISCORD_PROXY_URL`, `HTTPS_PROXY`/`HTTP_PROXY`, and
   `DISCORD_INSECURE_TLS`.
5. Report Codex mode: `CODEX_TARGET_MODE`, `CODEX_CWD`,
   `CODEX_APP_SERVER_SOCKET`, `CODEX_TARGET_THREAD_ID`,
   `CODEX_TTY_PROMPT_FORMAT`.
6. End with the next concrete step: add token, restart service, or send a DM.

## Token or key/value provided

If the user provides a Discord bot token, prefer the helper:

```bash
node scripts/manage-access.js configure --token TOKEN
```

It writes or updates:

```env
DISCORD_BOT_TOKEN=<token>
```

If the user asks to set proxy/TLS/mode, write or update only the named keys.
Common keys:

- `DISCORD_BRIDGE_INSTANCE`
- `DISCORD_CONFIG_BASE_DIR`
- `DISCORD_CONFIG_DIR`
- `DISCORD_ENV_FILE`
- `DISCORD_BRIDGE_BIN_DIR`
- `DISCORD_BRIDGE_SOCKET_DIR`
- `DISCORD_PROXY_URL`
- `DISCORD_INSECURE_TLS`
- `CODEX_TARGET_MODE`
- `CODEX_APP_SERVER_SOCKET`
- `CODEX_TARGET_THREAD_ID`
- `CODEX_TARGET_THREAD_RESUME`
- `CODEX_DENY_SERVER_REQUESTS`
- `CODEX_CWD`
- `CODEX_TTY_PROMPT_FORMAT`
- `CODEX_TTY`

Implementation rules:

- Prefer `scripts/manage-access.js configure --token TOKEN` for tokens.
- For other keys, create `$DISCORD_CONFIG_DIR` or `$DISCORD_CONFIG_BASE_DIR/$DISCORD_BRIDGE_INSTANCE`.
- Preserve existing `.env` keys not being changed.
- Write with mode `0600`.
- Never echo the full token.
- After changing `.env`, remind that the systemd service reads it at startup:

```bash
discord-codex-bridge restart
```

For named instances, use:

```bash
discord-codex-bridge restart --instance "$DISCORD_BRIDGE_INSTANCE"
```

## Bot setup reminders

Discord Developer Portal requirements:

- Enable **Message Content Intent**.
- Invite the bot with `bot` scope.
- For guild usage, grant View Channels, Send Messages, Read Message History,
  Send Messages in Threads, Attach Files, Send TTS Messages, Mention Everyone,
  and Add Reactions as needed.
