# Session Handover - 2026-06-11

## Start Here

Current task state: the Discord bridge plugin code was shipped to `origin/main` before this handover. This file is the final handover artifact; if a future agent sees it untracked or unpushed, finish the handover commit/push before doing new work. The live `codex01` service is online on the original machine, and there is no in-flight code change.

Same-machine live-ops commands, only on the original host/session:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
git status --short --branch
git log -3 --oneline
cd plugins/discord-codex-bridge
npm run check
discord-codex-bridge doctor --instance codex01
systemctl --user status discord-codex-bridge@codex01.service --no-pager
```

Cold/offline repo validation, safe for a fresh clone without the live service:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
git status --short --branch
git log -3 --oneline
cd plugins/discord-codex-bridge
npm install
npm run check
cd ../..
git diff --check
```

If asked to validate Discord end to end, use:

```bash
discord-codex-bridge doctor --instance codex01 --channel 1512482377300054076
journalctl --user -u discord-codex-bridge@codex01.service -n 80 --no-pager
```

Do not paste raw `doctor` output into public places. Redact any proxy or token-like values first, especially `DISCORD_PROXY_URL` and `*_PROXY`.

Do not:

- Do not commit or print Discord bot tokens, `state.json`, `.env`, or local `team-memory.json`.
- Do not include the user-forbidden words `open ai`, `openai`, or `codex` in future commit messages for this repo.
- Do not weaken the app-server `turn` path back to TTY injection for current-session bridging.
- Do not restart `discord-codex-bridge@codex01.service` in the middle of a Discord-origin turn unless you manually reply first, because a restart can lose the service-held reply context.
- Do not run marketplace install/upgrade validation against the user's real `HOME` unless the user explicitly wants to mutate their active plugin config/cache. Use the isolated recipe below.
- Do not copy the private server sudo password from local memory into repo docs, commits, Discord, or handover.
- For A5 ops work: do not use `.171` until main reports a host-direct/image fix; do not run `msprof` on `141.61.33.141`; keep `.211` host software read-only.

Minimal restart prompt:

> Read `docs/SESSION_HANDOVER_20260611.md` and follow Start Here.

## Constraints And Red Lines

Security and privacy:

- The Discord bot token exists only in `/home/zheng/.codex/channels/discord/codex01/.env`. Never print it.
- Access state is in `/home/zheng/.codex/channels/discord/codex01/state.json`. Treat it as local operational state, not repo content.
- Team memory is in `/home/zheng/.codex/channels/discord/codex01/team-memory.json`, mode `600`. It contains sensitive server operations data. Do not commit it.
- The user explicitly asked that future commit messages avoid `open ai`, `openai`, and `codex`. Existing historical repo names and code identifiers still contain normal product/project names; the constraint is for commit text.

Bridge behavior:

- Preferred current-session path is app-server socket mode, `CODEX_TARGET_MODE=turn`, not TTY injection.
- TTY mode remains documented but is unsafe when the local TUI has half-typed input; it can merge local drafts with Discord messages.
- Long Discord-origin engineering tasks need `CODEX_TURN_TIMEOUT_MS=1800000` loaded by the running service.
- Service env must preserve proxy variables; losing proxy env causes Discord startup `ConnectTimeoutError`.

A5 team rules recorded from Discord:

- `.211`: host-direct only; host software is read-only. New dependencies only under `/data/z00637938` private venvs; build artifacts under `/data/z00637938`.
- `.141`: absolutely no `msprof`; profiling must go to other A5 machines.
- `.32`: available and preferred; password details are in local memory only.
- `.171`: caution; container NPU currently unusable due `Unsupported soc version: Ascend950PR 957b`. Do not reuse until main announces a fix.

## Environment Freeze

Repository:

- Path: `/home/zheng/workspace/a5/a5_codex/discord-codex-bridge`
- Branch: `main`
- HEAD: `211f1ce8dd025ada6c38472aa23336619a4cd5e3`
- Remote: `https://github.com/zhshgmail/discord-codex-bridge.git`
- Local state before this handover file was created: clean, `main...origin/main`
- Expected local state after this handover is committed and pushed: clean, with one new handover commit on `origin/main`
- Open GitHub PRs by current account: none found via `gh pr list --author @me --state open --limit 20`
- GitCode PR check: not applicable for this GitHub repo; `gc pr list --state open --author @me` does not support `--author`

Recent commits:

```text
211f1ce document marketplace upgrade flow
f029c52 preserve proxy env for bridge service
5c4597e harden bridge release workflow
f2547cc Add Discord bridge CLI
96ce029 Add isolated Discord bridge instances
```

Tool versions checked on the original machine:

```text
node v22.22.2
npm 10.9.7
codex-cli 0.138.0
```

`codex --version` emitted a read-only alias warning under sandboxed review, but still reported the CLI version.

Installed marketplace state in `/home/zheng/.codex/config.toml`:

```toml
[plugins."discord-codex-bridge@discord-codex-bridge"]
enabled = true

[marketplaces.discord-codex-bridge]
last_revision = "211f1ce8dd025ada6c38472aa23336619a4cd5e3"
source_type = "git"
source = "https://github.com/zhshgmail/discord-codex-bridge.git"
ref = "main"
```

Live bridge instance:

- Service: `discord-codex-bridge@codex01.service`
- Status when checked: active since 2026-06-09 21:36:41 PDT
- Main PID when checked: `1137904`
- Bot ID: `1512252330244833410`
- DM channel with owner: `1512482377300054076`
- Guild/channel: `Ccbot/#a5_ops`, `1501649396922712105`
- Target thread: `019e8a84-956f-7562-97c3-1a910e577946`
- App-server socket: `/run/user/1000/discord-codex-bridge/codex01/app-server.sock`

Instance `.env` operational keys:

```env
DISCORD_BRIDGE_INSTANCE='codex01'
CODEX_TARGET_MODE='turn'
CODEX_TARGET_THREAD_ID='019e8a84-956f-7562-97c3-1a910e577946'
CODEX_TARGET_THREAD_RESUME='true'
CODEX_APP_SERVER_SOCKET='/run/user/1000/discord-codex-bridge/codex01/app-server.sock'
CODEX_DENY_SERVER_REQUESTS='false'
CODEX_TURN_POLL_MS='1000'
CODEX_CWD='/home/zheng/workspace/a5/a5_codex'
CODEX_TURN_TIMEOUT_MS=1800000
```

Service env:

- `/home/zheng/.config/discord-codex-bridge/codex01.env`
- Proxy variables are preserved and redacted in logs.
- This matters because the service previously failed on restart when installer rewrote env without proxy variables.

## What Was Done This Session

This session built and hardened a Discord bridge plugin that lets Discord DMs and selected guild text channel messages reach the current session through a shared app-server socket, and lets replies return to Discord.

Shipped changes include:

- Marketplace plugin layout and skills.
- Named isolated instances with `$DISCORD_CONFIG_BASE_DIR/$DISCORD_BRIDGE_INSTANCE`.
- Discord access controls for pairing, allowlists, guild channels, `requireMention`, bot senders, and mention filtering.
- Discord channel utilities for list/view/history/read/send/thread/attachment/TTS/everyone flows.
- Current-session app-server `turn` mode with shared Unix socket `/rpc`, avoiding TTY draft corruption.
- Queue/idle handling to avoid starting queued Discord turns while the current TUI turn is still finishing.
- Offline UT/IT suite and `npm run check`.
- `install --dry-run`, `upgrade`, `connect`, `doctor`, and service-env proxy preservation.
- README coverage for install, marketplace install, marketplace upgrade, direct checkout upgrade, proxy/TLS, access control, Discord utilities, TTY caveats, app-server mode, and development gates.

Latest validation:

```text
npm run check
  syntax: shell and Node syntax checks passed
  test:unit: passed
  test:integration: passed

discord-codex-bridge doctor --instance codex01 --channel 1512482377300054076
  service active
  Discord REST read works
```

## In-Flight Tactical State

No code task is currently in flight. The next likely work is operational:

1. Validate that a fresh user can install from the Git marketplace. This mutates plugin config/cache, so use an isolated environment unless you intend to change the active user install:

   ```bash
   export DCB_TEST_HOME="$(mktemp -d /tmp/dcb-marketplace-home.XXXXXX)"
   export HOME="$DCB_TEST_HOME"
   export CODEX_HOME="$DCB_TEST_HOME/.codex"
   export XDG_CONFIG_HOME="$DCB_TEST_HOME/.config"
   export XDG_CACHE_HOME="$DCB_TEST_HOME/.cache"
   export XDG_DATA_HOME="$DCB_TEST_HOME/.local/share"
   export XDG_STATE_HOME="$DCB_TEST_HOME/.local/state"
   export XDG_BIN_HOME="$DCB_TEST_HOME/.local/bin"
   export DISCORD_CONFIG_BASE_DIR="$DCB_TEST_HOME/.codex/channels/discord"
   export DISCORD_BRIDGE_BIN_DIR="$DCB_TEST_HOME/.local/bin"
   mkdir -p "$CODEX_HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME" "$XDG_BIN_HOME"
   codex plugin marketplace add zhshgmail/discord-codex-bridge --ref main
   codex plugin add discord-codex-bridge@discord-codex-bridge
   discord-codex-bridge install --instance testbot --dry-run
   ```

2. Validate the two-layer upgrade flow. Use the same isolated exports above for marketplace commands; run against the real `codex01` instance only when intentionally updating the live bridge:

   ```bash
   codex plugin marketplace upgrade discord-codex-bridge
   codex plugin add discord-codex-bridge@discord-codex-bridge
   discord-codex-bridge upgrade --instance codex01 --dry-run
   ```

3. If user reports Discord timeout again, check:

   ```bash
   grep -E '^(CODEX_TURN_TIMEOUT_MS|CODEX_TARGET_MODE|CODEX_APP_SERVER_SOCKET)=' /home/zheng/.codex/channels/discord/codex01/.env
   grep -Ei '^(DISCORD_PROXY_URL|HTTPS?_PROXY|https?_proxy|http_proxy)=' /home/zheng/.config/discord-codex-bridge/codex01.env | sed -E 's#(.*=).*#\1[redacted]#'
   journalctl --user -u discord-codex-bridge@codex01.service -n 120 --no-pager
   ```

4. If user asks to publish a release/tag, first decide versioning. Current `package.json` is still `0.1.0`, and marketplace install uses `main` rather than a tag.

## Background Tasks Inventory

No active orchestrator/background worker was found with the narrowed process scan:

```bash
ps -eo pid,ppid,stat,etime,cmd | rg 'python.*orchestrator|orchestrator\.py|/tmp/orch_|orch_' | rg -v 'rg|bwrap|codex-linux-sandbox' | head -40
```

The `/tmp` directory contains old orchestrator logs, including:

```text
/tmp/orch_blackbox.log
/tmp/orch_171_run2.log
/tmp/orch_171_run.log
/tmp/orch_batch_pass_a_lane0.log
/tmp/orch_batch_fail_b_lane1.log
/tmp/orch_batch_pass_b_lane1.log
/tmp/orch_fa_e2e_211.log
/tmp/orch_fa_porta3.log
```

These appear to be historical A5/op-gen artifacts, not active work for this bridge repo.

## Unpushed Commits, Branches, PRs

- `git log @{u}..HEAD`: no output, so no local-only commits before this handover.
- `git branch -vv`: only `main`, tracking `origin/main` at `211f1ce`.
- `gh pr list --author @me --state open --limit 20`: no output.
- No local feature branch needs recovery.

## Workspace Vs Archive Consistency

This repo has no `workspace/<op>` in-flight operator scratch and no `PROGRESS.md`, `RESULTS.md`, `REPORT.md`, or `.opgen_state.json` found under repo max depth 3.

The local plugin cache was synced to the repo plugin after the latest push:

```bash
rsync -a --delete plugins/discord-codex-bridge/ /home/zheng/.codex/plugins/cache/discord-codex-bridge/discord-codex-bridge/0.1.0/
```

If new changes are made, sync cache again only after tests pass and the repo state is intentional.

## Hand-Fix Surgeries

Manual edits in this session were intentional, direct edits to the bridge repo and local memory:

- `plugins/discord-codex-bridge/src/index.js`: app-server turn/idle handling and queue release fixes.
- `plugins/discord-codex-bridge/bin/discord-codex-bridge`: CLI commands `doctor`, `connect`, `upgrade`, install auto-detection, symlink root handling.
- `plugins/discord-codex-bridge/scripts/install-systemd-user.sh`: named instance install, dry-run, service env proxy preservation.
- `plugins/discord-codex-bridge/tests/`: offline UT/IT coverage.
- `README.md` and skills: install, upgrade, release gate, proxy/TLS and usage docs.
- `/home/zheng/.codex/channels/discord/codex01/team-memory.json`: local Discord team memory, including A5 host policies. This is not repo content.

These edits were not produced by a worker that might overwrite them.

## Cross-Team And Discord State

Relevant Discord team memory updates made:

- Stable roster for `Ccbot/#a5_ops`: owner, main, DS, back, blue, tilelang, triton, and self.
- Shared A5 card policy for `.161/.171`.
- `.211` host-mode rule: host-direct only, host software read-only, dependencies/artifacts under `/data/z00637938`.
- A5 host inventory/hard rules:
  - `141.61.33.141`: available, but no profiling with `msprof`.
  - `90.90.93.32`: available; privileged command details are local memory only.
  - `141.61.33.171`: caution; do not reuse until main reports fix.

Open Discord threads:

- No pending unanswered Discord request at handover time.
- Bridge logs show many guild messages ignored with `reason:"needs_mention"`; that is expected because guild channel config requires mention/reply matching.
- For Discord-origin future turns, reply normally in final; bridge should post back automatically. If about to restart service mid-turn, manually reply first with `discord-codex-bridge send`.

## Known Risks And Responses

Risk: Discord-origin engineering task exceeds timeout.

- Current mitigation: `CODEX_TURN_TIMEOUT_MS=1800000`.
- Check service has reloaded `.env`; the old symptom logged `timeoutMs:300000`.

Risk: service loses proxy env after upgrade.

- Fixed in `f029c52`.
- Check `/home/zheng/.config/discord-codex-bridge/codex01.env` has proxy variables redacted by grep command above.
- Logs should include `Configured Discord HTTP proxy`.

Risk: queued Discord turns start while TUI still owns an in-progress turn.

- Fixed by waiting for latest thread turn to become idle before `turn/start`.
- Check journal for `Waiting for Codex thread to become idle before starting Discord turn`.

Risk: fresh install documentation may still be too terse.

- README now has install and upgrade commands.
- If user reports friction, reproduce in a temporary `$HOME`/`DISCORD_CONFIG_BASE_DIR` and add integration tests before changing docs.

Risk: public handover leaks local server secrets.

- This handover intentionally does not include the private sudo password from team memory.
- Keep that pattern.

## Key Files

| Path | Purpose |
| --- | --- |
| `README.md` | User-facing install, upgrade, proxy, access, app-server and development docs |
| `plugins/discord-codex-bridge/bin/discord-codex-bridge` | Main CLI wrapper |
| `plugins/discord-codex-bridge/src/index.js` | Bridge daemon |
| `plugins/discord-codex-bridge/src/config-paths.js` | Config/env path resolution |
| `plugins/discord-codex-bridge/src/access-state.js` | Access state normalization/persistence |
| `plugins/discord-codex-bridge/scripts/install-systemd-user.sh` | User systemd + CLI symlink install |
| `plugins/discord-codex-bridge/scripts/manage-access.js` | Pairing and allowlist management |
| `plugins/discord-codex-bridge/scripts/send-message.js` | Discord send helper |
| `plugins/discord-codex-bridge/tests/unit/*.test.js` | Unit tests |
| `plugins/discord-codex-bridge/tests/integration/cli.test.js` | Offline CLI integration tests |
| `plugins/discord-codex-bridge/skills/*/SKILL.md` | Installed skills |
| `/home/zheng/.codex/channels/discord/codex01/.env` | Local instance config, secret-bearing |
| `/home/zheng/.codex/channels/discord/codex01/state.json` | Local access state |
| `/home/zheng/.codex/channels/discord/codex01/team-memory.json` | Local team memory, secret-bearing |

## Acceptance Criteria For Next Changes

Before claiming future bridge changes are done:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge/plugins/discord-codex-bridge
npm run check
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
git diff --check
PLUGIN_CREATOR_VALIDATE=${PLUGIN_CREATOR_VALIDATE:-$HOME/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py}
SKILL_QUICK_VALIDATE=${SKILL_QUICK_VALIDATE:-$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py}
if [[ -f "$PLUGIN_CREATOR_VALIDATE" ]]; then
  python3 "$PLUGIN_CREATOR_VALIDATE" plugins/discord-codex-bridge
else
  echo "skip plugin validator: $PLUGIN_CREATOR_VALIDATE not found"
fi
if [[ -f "$SKILL_QUICK_VALIDATE" ]]; then
  python3 "$SKILL_QUICK_VALIDATE" plugins/discord-codex-bridge/skills/discord-codex-bridge
  python3 "$SKILL_QUICK_VALIDATE" plugins/discord-codex-bridge/skills/configure
  python3 "$SKILL_QUICK_VALIDATE" plugins/discord-codex-bridge/skills/access
else
  echo "skip skill validator: $SKILL_QUICK_VALIDATE not found"
fi
```

Then run a live gate if the change touches runtime behavior:

```bash
discord-codex-bridge doctor --instance codex01
discord-codex-bridge doctor --instance codex01 --channel 1512482377300054076
```

Redact raw `doctor` output before sharing it outside the local terminal because instance config may include proxy values.

## Knowledge Persistency

Codified in repo:

- Installation and upgrade flow in `README.md`.
- Runtime/release gate guidance in `plugins/discord-codex-bridge/skills/discord-codex-bridge/SKILL.md`.
- Current-session configuration guidance in `plugins/discord-codex-bridge/skills/configure/SKILL.md`.
- Access management policy in `plugins/discord-codex-bridge/skills/access/SKILL.md`.

Codified only in local memory:

- Team roster and mention policy.
- A5 host policies and sensitive operational details.
- Keep local memory mode `600`.

Not codified:

- No durable ROADMAP/design doc exists yet. If the plugin grows beyond bridge operations into a public release process, create `docs/ROADMAP.md` and/or `docs/design/BRIDGE_ARCHITECTURE.md` rather than expanding handovers.

## External Review Outcomes

External review was run before this handover commit. Outcomes:

- Fixed: local-state ambiguity. Start Here and Environment Freeze now distinguish the pre-handover clean state from the handover artifact and state what to do if this file is untracked or unpushed.
- Fixed: marketplace validation mutation risk. In-Flight Tactical State now gives an isolated `HOME`/`CODEX_HOME`/`XDG_*`/Discord config recipe and warns not to mutate the active user install accidentally.
- Fixed: `doctor` output risk. Start Here and live-gate sections now warn to redact proxy/token-like values before sharing output.
- Fixed: live-host vs cold/offline assumptions. Start Here now splits same-machine live ops from cold/offline repo validation.
- Fixed: missing tool versions. Environment Freeze now includes Node, npm, and CLI versions checked on the original machine.
- Fixed: machine-specific validators. Acceptance commands now skip system skill validators explicitly when the helper scripts are absent.
- Not adopted: moving the completed-work appendix later. The current order remains usable, and the high-risk issues were in command safety and environment assumptions rather than section order.
- Fixed: review outcome tracking. This section records each review item and its disposition.

## Self-Review

- Context sufficiency: next session can start from Start Here without reading chat history.
- No hidden restore commands: no gitignored artifacts are required to continue bridge work.
- Multi-artifact comparison: not applicable.
- Prior metrics: no stale performance/accuracy metrics used.
- Archive update rule: not applicable.
- Secret handling: local secrets are referenced by path only, not copied into this repo doc.
- Prompt minimization: restart prompt is one line and points to this file.

Quality score:

- Strategic clarity: 9/10
- Execution completeness: 9/10
- Reproducibility: 9/10
- Knowledge persistency: 8/10
- Prompt minimality: 10/10
