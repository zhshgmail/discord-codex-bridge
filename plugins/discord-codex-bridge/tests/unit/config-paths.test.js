const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  expandEnvReferences,
  loadEnvFile,
  normalizeInstanceName,
  resolveDiscordPaths,
} = require('../../src/config-paths');

test('resolveDiscordPaths isolates named instances under the configured base directory', () => {
  const paths = resolveDiscordPaths({
    DISCORD_BRIDGE_INSTANCE: 'codex01',
    DISCORD_CONFIG_BASE_DIR: '/tmp/discord-config',
    XDG_CONFIG_HOME: '/tmp/xdg-config',
  });

  assert.equal(paths.instance, 'codex01');
  assert.equal(paths.configDir, '/tmp/discord-config/codex01');
  assert.equal(paths.envFile, '/tmp/discord-config/codex01/.env');
  assert.equal(paths.stateDir, '/tmp/discord-config/codex01');
  assert.equal(paths.bridgeEnvFile, '/tmp/xdg-config/discord-codex-bridge/codex01.env');
});

test('resolveDiscordPaths lets explicit path environment variables override defaults', () => {
  const paths = resolveDiscordPaths({
    DISCORD_BRIDGE_INSTANCE: 'codex01',
    DISCORD_CONFIG_BASE_DIR: '/base',
    DISCORD_CONFIG_DIR: '/explicit/config',
    DISCORD_ENV_FILE: '/explicit/config/custom.env',
    DISCORD_STATE_DIR: '/explicit/state',
    DISCORD_BRIDGE_ENV_FILE: '/explicit/service.env',
  });

  assert.equal(paths.configDir, '/explicit/config');
  assert.equal(paths.envFile, '/explicit/config/custom.env');
  assert.equal(paths.stateDir, '/explicit/state');
  assert.equal(paths.bridgeEnvFile, '/explicit/service.env');
});

test('loadEnvFile expands only path-like keys and preserves secrets literally', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-config-paths-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, [
    'DISCORD_CONFIG_BASE_DIR=$HOME/discord',
    'CODEX_APP_SERVER_SOCKET=${DISCORD_CONFIG_BASE_DIR}/codex01/app-server.sock',
    'DISCORD_BOT_TOKEN=$HOME-not-expanded',
    '',
  ].join('\n'));

  const env = { HOME: '/home/tester' };
  loadEnvFile(envFile, env);

  assert.equal(env.DISCORD_CONFIG_BASE_DIR, '/home/tester/discord');
  assert.equal(env.CODEX_APP_SERVER_SOCKET, '/home/tester/discord/codex01/app-server.sock');
  assert.equal(env.DISCORD_BOT_TOKEN, '$HOME-not-expanded');
});

test('normalizeInstanceName rejects unsafe instance names', () => {
  assert.equal(normalizeInstanceName('codex_01@test'), 'codex_01@test');
  assert.throws(() => normalizeInstanceName('../bad'), /instance name/);
  assert.throws(() => normalizeInstanceName('bad/name'), /instance name/);
});

test('expandEnvReferences leaves unknown variables intact', () => {
  assert.equal(
    expandEnvReferences('$HOME/${KNOWN}/$UNKNOWN', { HOME: '/home/tester', KNOWN: 'value' }),
    '/home/tester/value/$UNKNOWN',
  );
});
