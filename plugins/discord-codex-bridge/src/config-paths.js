'use strict';

const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG_BASE_DIR = path.join(os.homedir(), '.codex', 'channels', 'discord');
const DEFAULT_SINGLE_CONFIG_DIR = DEFAULT_CONFIG_BASE_DIR;
const DEFAULT_SINGLE_BRIDGE_ENV_FILE = path.join(os.homedir(), '.config', 'discord-codex-bridge.env');
const DEFAULT_INSTANCE_BRIDGE_ENV_DIR = path.join(os.homedir(), '.config', 'discord-codex-bridge');
const EXPAND_ENV_KEYS = new Set([
  'CODEX_APP_SERVER_SOCKET',
  'CODEX_CWD',
  'DISCORD_BRIDGE_BIN_DIR',
  'DISCORD_BRIDGE_ENV_FILE',
  'DISCORD_BRIDGE_SOCKET_DIR',
  'DISCORD_BRIDGE_STATE_DIR',
  'DISCORD_CONFIG_BASE_DIR',
  'DISCORD_CONFIG_DIR',
  'DISCORD_ENV_FILE',
  'DISCORD_SEND_HELPER',
  'DISCORD_STATE_DIR',
  'XDG_BIN_HOME',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
]);

function normalizeInstanceName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^[A-Za-z0-9_.@-]+$/.test(raw)) {
    throw new Error(`Discord bridge instance name must use only letters, numbers, dot, underscore, dash, or @: ${raw}`);
  }
  return raw;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function expandEnvReferences(value, env = process.env) {
  return String(value).replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
    const key = braced || bare;
    return env[key] === undefined ? match : env[key];
  });
}

function envValue(env, key) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return '';
  return EXPAND_ENV_KEYS.has(key) ? expandEnvReferences(value, env) : value;
}

function xdgConfigHome(env = process.env) {
  return envValue(env, 'XDG_CONFIG_HOME') || path.join(os.homedir(), '.config');
}

function loadEnvFile(file, env = process.env) {
  if (!file) return;
  const fs = require('node:fs');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (env[key] === undefined) {
      const stripped = stripQuotes(rawValue);
      env[key] = EXPAND_ENV_KEYS.has(key) ? expandEnvReferences(stripped, env) : stripped;
    }
  }
}

function resolveDiscordPaths(env = process.env) {
  const instance = normalizeInstanceName(env.DISCORD_BRIDGE_INSTANCE || env.DISCORD_INSTANCE || '');
  const configBaseDir = envValue(env, 'DISCORD_CONFIG_BASE_DIR') || DEFAULT_CONFIG_BASE_DIR;
  const defaultConfigDir = instance ? path.join(configBaseDir, instance) : DEFAULT_SINGLE_CONFIG_DIR;
  const configDir = envValue(env, 'DISCORD_CONFIG_DIR') || envValue(env, 'DISCORD_STATE_DIR') || defaultConfigDir;
  const envFile = envValue(env, 'DISCORD_ENV_FILE') || path.join(configDir, '.env');
  const stateDir = envValue(env, 'DISCORD_BRIDGE_STATE_DIR') || envValue(env, 'DISCORD_STATE_DIR') || configDir;
  const defaultBridgeEnvFile = instance
    ? path.join(xdgConfigHome(env), 'discord-codex-bridge', `${instance}.env`)
    : path.join(xdgConfigHome(env), 'discord-codex-bridge.env');
  const bridgeEnvFile = envValue(env, 'DISCORD_BRIDGE_ENV_FILE') || (
    defaultBridgeEnvFile
  );

  return {
    instance,
    configBaseDir,
    configDir,
    envFile,
    stateDir,
    bridgeEnvFile,
    defaultConfigDir,
    defaultEnvFile: path.join(defaultConfigDir, '.env'),
    defaultBridgeEnvFile,
  };
}

module.exports = {
  DEFAULT_CONFIG_BASE_DIR,
  DEFAULT_SINGLE_BRIDGE_ENV_FILE,
  DEFAULT_SINGLE_CONFIG_DIR,
  expandEnvReferences,
  loadEnvFile,
  normalizeInstanceName,
  resolveDiscordPaths,
  xdgConfigHome,
};
