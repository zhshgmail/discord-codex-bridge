'use strict';

const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG_BASE_DIR = path.join(os.homedir(), '.codex', 'channels', 'discord');
const DEFAULT_SINGLE_CONFIG_DIR = DEFAULT_CONFIG_BASE_DIR;
const DEFAULT_SINGLE_BRIDGE_ENV_FILE = path.join(os.homedir(), '.config', 'discord-codex-bridge.env');
const DEFAULT_INSTANCE_BRIDGE_ENV_DIR = path.join(os.homedir(), '.config', 'discord-codex-bridge');

function normalizeInstanceName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^[A-Za-z0-9_.@-]+$/.test(raw)) {
    throw new Error(`Discord bridge instance name must use only letters, numbers, dot, underscore, dash, or @: ${raw}`);
  }
  return raw;
}

function resolveDiscordPaths(env = process.env) {
  const instance = normalizeInstanceName(env.DISCORD_BRIDGE_INSTANCE || env.DISCORD_INSTANCE || '');
  const configBaseDir = env.DISCORD_CONFIG_BASE_DIR || DEFAULT_CONFIG_BASE_DIR;
  const defaultConfigDir = instance ? path.join(configBaseDir, instance) : DEFAULT_SINGLE_CONFIG_DIR;
  const configDir = env.DISCORD_CONFIG_DIR || env.DISCORD_STATE_DIR || defaultConfigDir;
  const envFile = env.DISCORD_ENV_FILE || path.join(configDir, '.env');
  const stateDir = env.DISCORD_BRIDGE_STATE_DIR || env.DISCORD_STATE_DIR || configDir;
  const bridgeEnvFile = env.DISCORD_BRIDGE_ENV_FILE || (
    instance
      ? path.join(DEFAULT_INSTANCE_BRIDGE_ENV_DIR, `${instance}.env`)
      : DEFAULT_SINGLE_BRIDGE_ENV_FILE
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
    defaultBridgeEnvFile: bridgeEnvFile,
  };
}

module.exports = {
  DEFAULT_CONFIG_BASE_DIR,
  DEFAULT_SINGLE_BRIDGE_ENV_FILE,
  DEFAULT_SINGLE_CONFIG_DIR,
  normalizeInstanceName,
  resolveDiscordPaths,
};
