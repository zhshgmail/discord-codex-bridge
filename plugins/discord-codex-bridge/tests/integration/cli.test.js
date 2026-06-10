const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN = path.join(ROOT, 'bin', 'discord-codex-bridge');

function makeHarness() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-bridge-cli-'));
  const fakeBin = path.join(tmp, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const systemctlLog = path.join(tmp, 'systemctl.log');
  fs.writeFileSync(path.join(fakeBin, 'systemctl'), [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(systemctlLog)}`,
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });

  const env = {
    ...process.env,
    HOME: tmp,
    XDG_CONFIG_HOME: path.join(tmp, '.config'),
    XDG_RUNTIME_DIR: path.join(tmp, 'run'),
    DISCORD_CONFIG_BASE_DIR: path.join(tmp, 'discord-config'),
    DISCORD_BRIDGE_BIN_DIR: path.join(tmp, 'local-bin'),
    DISCORD_BRIDGE_SOCKET_DIR: path.join(tmp, 'sockets'),
    PATH: `${fakeBin}:${process.env.PATH}`,
  };

  return { tmp, env, systemctlLog };
}

function runCli(args, env) {
  return spawnSync(BIN, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
}

test('path shows per-instance config, state, socket, and service paths', () => {
  const { tmp, env } = makeHarness();
  const result = runCli(['path', '--instance', 'codex01'], env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`config_dir=${path.join(tmp, 'discord-config', 'codex01')}`));
  assert.match(result.stdout, new RegExp(`env_file=${path.join(tmp, 'discord-config', 'codex01', '.env')}`));
  assert.match(result.stdout, new RegExp(`state_dir=${path.join(tmp, 'discord-config', 'codex01')}`));
  assert.match(result.stdout, new RegExp(`socket=${path.join(tmp, 'sockets', 'codex01', 'app-server.sock')}`));
  assert.match(result.stdout, /service=discord-codex-bridge@codex01\.service/);
});

test('configure-current writes a resumable app-server turn configuration', () => {
  const { tmp, env } = makeHarness();
  const socket = path.join(tmp, 'custom.sock');
  const result = runCli([
    'configure-current',
    '--instance', 'codex01',
    '--thread', 'thread-123',
    '--socket', socket,
    '--cwd', '/work/project',
  ], env);

  assert.equal(result.status, 0, result.stderr);
  const envFile = path.join(tmp, 'discord-config', 'codex01', '.env');
  const text = fs.readFileSync(envFile, 'utf8');
  assert.match(text, /^DISCORD_BRIDGE_INSTANCE='codex01'$/m);
  assert.match(text, /^CODEX_TARGET_MODE='turn'$/m);
  assert.match(text, /^CODEX_TARGET_THREAD_ID='thread-123'$/m);
  assert.match(text, /^CODEX_TARGET_THREAD_RESUME='true'$/m);
  assert.match(text, new RegExp(`^CODEX_APP_SERVER_SOCKET='${socket}'$`, 'm'));
  assert.match(text, /^CODEX_CWD='\/work\/project'$/m);
});

test('install --dry-run previews files without writing service files', () => {
  const { tmp, env } = makeHarness();
  const result = runCli(['install', '--instance', 'codex01', '--dry-run'], env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/i);
  assert.match(result.stdout, /discord-codex-bridge@codex01\.service/);
  assert.equal(
    fs.existsSync(path.join(tmp, '.config', 'systemd', 'user', 'discord-codex-bridge@codex01.service')),
    false,
  );
});

test('install preserves proxy environment for the user service', () => {
  const { tmp, env } = makeHarness();
  const result = runCli(['install', '--instance', 'codex01'], {
    ...env,
    HTTPS_PROXY: 'http://proxy.example.test:8080',
    HTTP_PROXY: 'http://proxy.example.test:8080',
    https_proxy: 'http://lower-proxy.example.test:8080',
    http_proxy: 'http://lower-proxy.example.test:8080',
  });

  assert.equal(result.status, 0, result.stderr);
  const serviceEnv = fs.readFileSync(path.join(tmp, '.config', 'discord-codex-bridge', 'codex01.env'), 'utf8');
  assert.match(serviceEnv, /^HTTPS_PROXY=http:\/\/proxy\.example\.test:8080$/m);
  assert.match(serviceEnv, /^HTTP_PROXY=http:\/\/proxy\.example\.test:8080$/m);
  assert.match(serviceEnv, /^https_proxy=http:\/\/lower-proxy\.example\.test:8080$/m);
  assert.match(serviceEnv, /^http_proxy=http:\/\/lower-proxy\.example\.test:8080$/m);
});

test('upgrade --dry-run previews check, install, and restart steps', () => {
  const { env } = makeHarness();
  const result = runCli(['upgrade', '--instance', 'codex01', '--dry-run'], env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/i);
  assert.match(result.stdout, /npm run check/);
  assert.match(result.stdout, /install-systemd-user\.sh --instance codex01/);
  assert.match(result.stdout, /systemctl --user restart discord-codex-bridge@codex01\.service/);
});
