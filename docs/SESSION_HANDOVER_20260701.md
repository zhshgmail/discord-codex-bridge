# Session Handover — 2026-07-01

## Start Here

High priority task: continue the `discord-codex-bridge` usability fix after the
TTY-injection blocking incident. Read this handover, then work only in:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
git status --short --branch
systemctl --user list-units --all 'discord-codex-bridge*' --no-pager
systemctl --user list-unit-files 'discord-codex-bridge*' --no-pager
discord-codex-bridge doctor --instance codex01 | sed -E 's/(TOKEN|SECRET|KEY|PROXY|PASS)([^=]*=).*/\1\2<redacted>/I'
```

Do not restart either Discord bridge service until you intentionally change the
target mode away from unsafe TTY injection or add an explicit safe TTY queue.
Current live config still says `CODEX_TARGET_MODE='tty'`, but both services are
disabled and inactive. Restarting as-is can reintroduce the blocking behavior.
Do not run `doctor --channel` in Start Here unless you intentionally want to
fetch and print live Discord channel content.

Before implementing, resolve the product decision with the user:

1. If "must appear in the current console input box" is required, do not default
   to app-server sidecar. Implement safer TTY behavior instead: no auto-submit
   while a turn/input may be active, queue messages, and provide an explicit
   pull/confirm action.
2. If "must never block or corrupt current Codex input" is higher priority, use
   app-server sidecar by default. Discord messages will not be typed into the
   visible input box.

## Constraints And Red Lines

- Do not use `CODEX_TARGET_MODE=tty` as the default unattended path. Disk logs
  show it used `TIOCSTI` into `/dev/pts/7` and blocked the current Codex process.
- Do not describe app-server `turn` mode as exact-console behavior. It is a
  sidecar thread path and does not type Discord text into the active terminal.
- Do not guess the target thread id. If multiple candidate Codex sessions exist,
  the CLI should list candidates or require `--thread`; it must not silently bind
  Discord to an old session.
- Do not re-enable the legacy default `discord-codex-bridge.service` while also
  using `discord-codex-bridge@codex01.service`. The incident had both services
  active, and both injected the same messages.
- Do not publish or print secrets. `.env` checks must redact token, proxy, key,
  and password values.

## Environment Freeze

Disk fact check timestamp: 2026-07-01 21:09-21:13 America/Los_Angeles.

Repo:

```text
path: /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
remote: https://github.com/zhshgmail/discord-codex-bridge.git
branch: main
HEAD: 024e065bae549d3b839401984f03105eae24c448
upstream HEAD: 024e065bae549d3b839401984f03105eae24c448
status before this handover: clean
status after creating this handover: docs/SESSION_HANDOVER_20260701.md is new
```

Recent commits:

```text
024e065 Fix bridge exact-console routing
d1b23f8 Add bridge session handoff
211f1ce document marketplace upgrade flow
f029c52 preserve proxy env for bridge service
5c4597e harden bridge release workflow
```

Current local service state:

```text
systemctl --user list-units --all 'discord-codex-bridge*': 0 loaded units
discord-codex-bridge.service: disabled
discord-codex-bridge@codex01.service: disabled
bridge src/index.js process: not running
```

Current remaining Codex processes:

```text
codex app-server listening on /run/user/1000/discord-codex-bridge/codex01/app-server.sock
interactive Codex TUI exists on pts/7 via `codex --dangerously-bypass-approvals-and-sandbox resume`
```

Current `codex01` config, redacted:

```text
env_file: /home/zheng/.codex/channels/discord/codex01/.env
DISCORD_BOT_TOKEN=<redacted>
CODEX_TARGET_MODE='tty'
CODEX_TARGET_THREAD_ID=''
CODEX_TARGET_THREAD_RESUME=''
CODEX_APP_SERVER_SOCKET=''
CODEX_TTY=''
CODEX_TTY_PID=''
CODEX_TTY_PROMPT_FORMAT='minimal'
CODEX_CWD='/home/zheng/workspace/a5/a5_codex'
```

Current access state from `doctor`:

```text
dmPolicy: pairing
allowFrom includes user 1004200500721360906
guild channel 1501649396922712105 is enabled
channel requireMention: true
channel allowBots: true
threadCount: 0
```

Session file candidate for the visible Codex TUI:

```text
2026-07-01 21:09:52
thread id: 019eed38-8a71-71d1-84fc-e4d43dadd8bb
originator: codex-tui
cwd: /home/zheng/workspace/a5/a5_codex
file: /home/zheng/.codex/sessions/2026/06/21/rollout-2026-06-21T19-46-06-019eed38-8a71-71d1-84fc-e4d43dadd8bb.jsonl
```

Do not treat this as automatically confirmed for routing. It is a strong disk
candidate, but a safe CLI should either verify it with the app-server or ask the
user when candidates are ambiguous.

## Background

The user reported that Discord bridge messages were garbled and, more
importantly, blocked the Codex process until a manual Enter was sent. Disk logs
show the raw Discord message previews were clean, but two running bridge
services injected long messages into the same TTY.

Observed root cause:

```text
discord-codex-bridge.service and discord-codex-bridge@codex01.service were both active.
Both used CODEX_TARGET_MODE=tty.
Both injected accepted Discord messages into /dev/pts/7 using TIOCSTI.
The TTY injection path does not wait for the current Codex turn/input to be idle.
```

Mitigation already performed in the prior turn:

```bash
systemctl --user stop discord-codex-bridge.service discord-codex-bridge@codex01.service
systemctl --user disable discord-codex-bridge.service discord-codex-bridge@codex01.service
```

Evidence from service logs:

```text
message 1521735381400293497 was accepted at 2026-07-01T04:33:07Z
both node[432] and node[436] injected it into /dev/pts/7
codex01 service stopped at 2026-07-01T04:34:02Z
legacy default service stopped at 2026-07-01T04:36:30Z
```

The user rejected a manual recovery procedure as too hard to use. They also
asked what "default migrate to app-server sidecar" means; answer given:
sidecar avoids blocking but Discord text will not appear as typed input in the
current terminal input box. That tradeoff is unresolved.

## Task Definition

Implement a product-level usability fix for the plugin. The next session should
not just provide more shell steps.

### Track A: If non-blocking is the top priority

Build a one-command safe setup path:

```bash
discord-codex-bridge safe-connect --instance codex01 --cwd "$PWD" --channel 1501649396922712105
```

Expected behavior:

- Stop or warn about the legacy default `discord-codex-bridge.service`.
- Ensure only the named instance is used.
- Start or reuse the app-server socket.
- Discover the best current `codex-tui` session for the cwd.
- If exactly one safe candidate exists, configure app-server `turn` mode.
- If no candidate or multiple candidates exist, print candidates and require
  `--thread THREAD_ID`.
- Restart only `discord-codex-bridge@codex01.service`.
- Run or print a `doctor` verification summary.
- Never write to the visible terminal input box.

### Track B: If exact visible console is required

Keep TTY mode, but make it safe by default:

- Add a TTY inbox/queue mode that records accepted Discord messages without
  auto-submitting to the TTY while local Codex may be active.
- Add a user command to pull or confirm the next queued message.
- Make direct auto-submit TTY injection require an explicit danger flag such as
  `--allow-tty-autosubmit`.
- `doctor` must warn loudly when direct TTY auto-submit is active.

Expected queue shape:

```text
state_dir: /home/zheng/.codex/channels/discord/codex01
queue file: tty-inbox.jsonl
one JSON object per accepted message:
  {"messageId":"...","channelId":"...","authorId":"...","receivedAt":"...","prompt":"...","metadata":{...}}
```

Recommended first implementation slice for Track B:

1. Add unit tests around queue read/write helpers, ideally in a new focused
   file such as `plugins/discord-codex-bridge/tests/unit/tty-inbox.test.js`.
2. Add integration tests in `plugins/discord-codex-bridge/tests/integration/cli.test.js`
   for:

```text
configure-tty --instance codex01 --tty /dev/pts/42
doctor --instance codex01
```

Expected assertion: `doctor` prints a warning when TTY auto-submit is active
and does not claim this mode is safe for unattended use.

3. Add a runtime test or integration seam for:

```text
CODEX_TARGET_MODE=tty
CODEX_TTY_AUTOSUBMIT=false
```

Expected assertions:

```text
accepted Discord message is appended to tty-inbox.jsonl
no TIOCSTI injector is called
no submit sequence is sent to the terminal
the service response/log tells the user how to pull or confirm the queued message
```

4. Add a CLI command such as:

```bash
discord-codex-bridge tty-inbox --instance codex01 list
discord-codex-bridge tty-inbox --instance codex01 pop --inject
```

`pop --inject` may use TTY injection, but it must be an explicit local action,
not automatic Discord delivery.

The user has not approved either track after the sidecar explanation. Ask one
short question before coding if this handover is used to resume work:

```text
Should we optimize for non-blocking sidecar even though Discord text will not be typed into the current input box, or preserve exact-console visibility with a safer manual/queued TTY mode?
```

## Concrete Implementation Plan

Use TDD. Existing tests live under:

```text
plugins/discord-codex-bridge/tests/unit
plugins/discord-codex-bridge/tests/integration
```

Current test baseline from disk:

```text
command: npm test
location: /home/zheng/workspace/a5/a5_codex/discord-codex-bridge/plugins/discord-codex-bridge
result: pass
unit: 12 pass, 0 fail
integration: 7 pass, 0 fail
```

Recommended first implementation slice for Track A:

1. Add integration tests in `plugins/discord-codex-bridge/tests/integration/cli.test.js`.
2. Extend the test harness with fake `systemctl`, fake `codex`, and a temporary
   `.codex/sessions/**/*.jsonl` session file.
3. Add a failing test for:

```text
safe-connect --instance codex01 --cwd /work/project --channel 1501649396922712105 --no-open
```

Expected test assertions:

```text
env file contains CODEX_TARGET_MODE='turn'
env file contains CODEX_TARGET_THREAD_ID='<discovered codex-tui id>'
env file contains CODEX_TARGET_THREAD_RESUME='true'
env file contains CODEX_APP_SERVER_SOCKET='<instance socket>'
systemctl log includes `stop discord-codex-bridge.service`
systemctl log includes `disable discord-codex-bridge.service`
systemctl log includes `restart discord-codex-bridge@codex01.service`
stdout includes a warning that sidecar does not type into the visible input box
```

4. Add a failing test for ambiguous candidates:

```text
two codex-tui session files under the same cwd
safe-connect exits non-zero
stdout/stderr lists both thread ids
env file is not changed to a guessed thread
```

5. Implement minimal Bash in `plugins/discord-codex-bridge/bin/discord-codex-bridge`.
6. Update docs and skills:

```text
README.md
plugins/discord-codex-bridge/skills/discord-codex-bridge/SKILL.md
plugins/discord-codex-bridge/skills/configure/SKILL.md if setup wording changes
```

7. Verify:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge/plugins/discord-codex-bridge
npm test
npm run check
```

Do not call the fix complete without a real Discord smoke test or explicitly
stating that live Discord smoke was not run.

Live smoke recipe after implementation:

```bash
cd /home/zheng/workspace/a5/a5_codex/discord-codex-bridge
discord-codex-bridge doctor --instance codex01
systemctl --user status discord-codex-bridge.service --no-pager || true
systemctl --user status discord-codex-bridge@codex01.service --no-pager
journalctl --user -u discord-codex-bridge@codex01.service -n 80 --no-pager
```

Then send a short Discord message in channel `1501649396922712105` that mentions
the bot. Expected sidecar result: no text is typed into the current terminal
input box; logs show one accepted message, no `Injected Discord message into
Codex TTY`, and a Codex turn starts or queues via app-server. Expected safer TTY
result: logs show the message was queued, no `TIOCSTI` call happens until a
local `tty-inbox pop --inject` action is run. Cleanup after smoke should leave
only the intended service enabled and should not re-enable the legacy default
unit.

## Acceptance Criteria

Minimum acceptance for the next code change:

- A normal user has a one-command path to recover from TTY mode without manually
  editing `.env`, manually finding session files, or manually disabling the
  legacy default unit.
- `doctor` or the new command detects the two-service TTY hazard.
- The command never enables both the legacy default service and a named
  instance.
- If the chosen route is sidecar, user-facing output clearly says Discord text
  will not be typed into the current input box.
- If the chosen route is TTY, auto-submit is not the default unattended path.
- Tests cover the current incident shape: duplicate services + TTY mode +
  recovery to safer state.

## Known Risks

- `connect` currently executes `codex --remote ... resume "$thread_id"` at the
  end. For tests and non-interactive recovery, add `--no-open` or implement the
  safer behavior in a separate command.
- The current app-server socket exists and is listening, but the bridge `.env`
  does not reference it. Restarting the service before reconfiguring will not
  use the socket.
- The latest mtime session file for `cwd=/home/zheng/workspace/a5/a5_codex` is
  a `codex-tui` thread under a 2026-06-21 path. This is plausible because the
  session is resumed, but code must not rely on path date alone.
- There are unrelated old processes matching `orchestrator|orch` in an a5_ops
  workspace and `/tmp/orch_*.log` files. They are not bridge work; do not kill
  them as part of this plugin fix.
- Memory registry lookup failed because `/home/zheng/.codex/memories/MEMORY.md`
  did not exist at handover time. This handover is based on live disk checks and
  current conversation state, not memory files.

## Key Files

```text
plugins/discord-codex-bridge/bin/discord-codex-bridge
  Main CLI. Existing commands: connect, configure-current, configure-tty, doctor.

plugins/discord-codex-bridge/src/index.js
  Runtime bridge. TTY mode injects into terminal; app-server turn mode waits on
  thread idle before turn/start.

plugins/discord-codex-bridge/src/tty-detect.js
  Detects interactive Codex TTY candidates. Useful if Track B is chosen.

plugins/discord-codex-bridge/tests/integration/cli.test.js
  Existing integration tests for path/configure/install/upgrade CLI behavior.

README.md
plugins/discord-codex-bridge/skills/discord-codex-bridge/SKILL.md
  User-facing docs must be updated with the safer default workflow.
```

## Must-Include State Inventory

Background tasks:

```text
No bridge node process is running.
Unrelated old commands matching orchestrator|orch exist in a5_ops paths.
Do not treat them as bridge tasks.
```

Unpushed commits and PRs:

```text
git log @{u}..HEAD: empty
gh pr list --state open --author @me: no output during disk check
branch list: main plus remotes/origin/main
```

KB/shared infra changes this session:

```text
No code or docs had been changed before this handover file.
No memory write was performed.
```

Workspace/archive drift:

```text
Bridge repo status was clean before this handover.
After this handover was generated, `docs/SESSION_HANDOVER_20260701.md` is an
intentional new file. Preserve it, review it, then commit it as the handover
artifact unless the user asks not to commit.
No gitignored bridge workspace artifact is required to resume.
```

Hand-fix surgeries:

```text
No source file was edited in the bridge repo before this handover.
Live service stop/disable commands were executed outside git state.
```

Cross-team pings:

```text
The a5_ops review thread is intentionally out of scope for the next session.
Do not resume tilelang review until the bridge usability issue is resolved.
```

Open Discord thread:

```text
channel: 1501649396922712105
incident message: 1521735381400293497
manual mitigation replies sent: 1521736048059617551, 1521736262783074304, 1521736338855035002
pending product decision: sidecar non-blocking vs exact-console queued/manual TTY
```

## Disk Fact Check Commands Used

```bash
git status --short --branch
git remote -v
git log --oneline -10
git rev-parse --show-toplevel
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
git rev-parse @{u}
git log --oneline @{u}..HEAD
systemctl --user list-units --all 'discord-codex-bridge*' --no-pager
systemctl --user list-unit-files 'discord-codex-bridge*' --no-pager
ps -eo pid,ppid,tty,stat,lstart,args | rg 'discord-codex-bridge|codex app-server|codex --remote|codex .*resume|plugins/discord-codex-bridge/src/index.js' || true
discord-codex-bridge path --instance codex01
discord-codex-bridge doctor --instance codex01
discord-codex-bridge doctor --instance codex01 --channel 1501649396922712105
journalctl --user -u discord-codex-bridge.service -u discord-codex-bridge@codex01.service -n 80 --no-pager
ls -l /run/user/1000/discord-codex-bridge/codex01/app-server.sock
ss -xlpn | rg 'discord-codex-bridge/codex01/app-server.sock|codex' || true
pgrep -af 'orchestrator|orch' 2>&1 | head
ls /tmp/orch_*.log 2>&1 | tail -10
gh pr list --state open --author @me
npm test
npm run check
```

## Subagent Review Disposition

Subagent `019f2106-8c18-7ae1-99fa-2ce4a70f543b` reviewed this handover with
disk fact checks. Findings and disposition:

```text
P1 untracked handover state: adopted. The document now says the handover file is a new intentional file and should be committed unless the user says otherwise.
P2 sanitizer too narrow and doctor --channel too noisy: adopted. Start Here now uses local doctor only and a broader redaction filter; live channel fetch is reserved for smoke testing.
P2 Track B under-specified: adopted. Track B now includes queue storage shape, commands, and test assertions.
P3 smoke test missing recipe: adopted. The handover now includes sidecar and safer-TTY smoke expectations and cleanup rules.
```

## Self-Challenge

- Context sufficient: yes, with one intentional product question before coding.
- Commands executable: yes, every Start Here command includes absolute path or
  cwd setup.
- Version frozen: yes, repo path, branch, HEAD, and upstream SHA are recorded.
- Red lines clear: yes, do not restart TTY config as-is and do not guess thread.
- Knowledge persistence: yes for this incident; no memory file was available on
  disk, so the handover carries the tactical state inline.
- Prompt minimality: yes.

Quality gate self-score:

```text
strategic clarity: 8/10
execution completeness: 8/10
reproducibility: 9/10
knowledge persistence: 8/10
prompt minimality: 10/10
```

## Minimal Restart Prompt

> Read `docs/SESSION_HANDOVER_20260701.md` and execute the Start Here section.
> Focus on the Discord plugin usability fix; do not resume a5_ops review first.
