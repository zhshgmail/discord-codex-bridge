---
name: configure
description: Configure the Discord Codex bridge token, proxy, TLS, Codex target mode, and config directory. Use when the user pastes a Discord bot token, asks to configure Discord, asks where bridge config lives, or wants setup status.
---

# Discord Configure

Configure the bridge through `~/.codex/channels/discord/.env` by default.
`DISCORD_CONFIG_DIR` or `DISCORD_ENV_FILE` may override the location.

## No token provided

Show status without revealing secrets:

1. Resolve config dir:
   `DISCORD_CONFIG_DIR || DISCORD_STATE_DIR || ~/.codex/channels/discord`.
2. Read `.env` if present.
3. Report whether `DISCORD_BOT_TOKEN` is set; if set, show only the first 6
   characters plus `...`.
4. Report proxy/TLS settings:
   `DISCORD_PROXY_URL`, `HTTPS_PROXY`/`HTTP_PROXY`, and
   `DISCORD_INSECURE_TLS`.
5. Report Codex mode: `CODEX_TARGET_MODE`, `CODEX_CWD`,
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

- `DISCORD_PROXY_URL`
- `DISCORD_INSECURE_TLS`
- `CODEX_TARGET_MODE`
- `CODEX_CWD`
- `CODEX_TTY_PROMPT_FORMAT`
- `CODEX_TTY`

Implementation rules:

- Prefer `scripts/manage-access.js configure --token TOKEN` for tokens.
- For other keys, `mkdir -p ~/.codex/channels/discord`.
- Preserve existing `.env` keys not being changed.
- Write with mode `0600`.
- Never echo the full token.
- After changing `.env`, remind that the systemd service reads it at startup:

```bash
systemctl --user restart discord-codex-bridge.service
```

## Bot setup reminders

Discord Developer Portal requirements:

- Enable **Message Content Intent**.
- Invite the bot with `bot` scope.
- For guild usage, grant View Channels, Send Messages, Read Message History,
  Send Messages in Threads, Attach Files, Send TTS Messages, Mention Everyone,
  and Add Reactions as needed.
