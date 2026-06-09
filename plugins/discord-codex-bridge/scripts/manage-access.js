#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFile: loadBridgeEnvFile, resolveDiscordPaths } = require('../src/config-paths');
const {
  DM_POLICIES,
  loadState,
  saveState,
  assertSnowflake,
  addUnique,
  removeValue,
} = require('../src/access-state');

function usage() {
  process.stderr.write(`Usage:
  manage-access.js status
  manage-access.js configure --token TOKEN [--config-dir DIR]
  manage-access.js pair CODE
  manage-access.js deny CODE
  manage-access.js policy pairing|allowlist|disabled
  manage-access.js allow USER_ID
  manage-access.js remove USER_ID
  manage-access.js group add CHANNEL_ID [--no-mention] [--allow USER_ID[,USER_ID]] [--allow-bots]
  manage-access.js group rm CHANNEL_ID
  manage-access.js group allow CHANNEL_ID USER_ID[,USER_ID]
  manage-access.js group remove CHANNEL_ID USER_ID[,USER_ID]
  manage-access.js group mention CHANNEL_ID on|off
  manage-access.js group allow-bots CHANNEL_ID on|off
  manage-access.js set mentionPatterns '["^hey codex\\\\b"]'

Options:
  --state PATH          Override state.json path
  --config-dir PATH     Override config directory
`);
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

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(normalized);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = stripQuotes(rawValue);
  }
}

function parseBoolWord(value) {
  if (/^(1|true|yes|on)$/i.test(String(value || ''))) return true;
  if (/^(0|false|no|off)$/i.test(String(value || ''))) return false;
  throw new Error(`Expected on/off, got: ${value}`);
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {
    statePath: '',
    configDir: '',
    token: '',
    noMention: false,
    allowIds: [],
    allowBots: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--state') flags.statePath = argv[++i] || '';
    else if (arg === '--config-dir') flags.configDir = argv[++i] || '';
    else if (arg === '--token') flags.token = argv[++i] || '';
    else if (arg === '--no-mention') flags.noMention = true;
    else if (arg === '--allow') flags.allowIds.push(...splitCsv(argv[++i] || ''));
    else if (arg === '--allow-bots') flags.allowBots = true;
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }

  let discordPaths = resolveDiscordPaths(process.env);
  loadBridgeEnvFile(discordPaths.bridgeEnvFile);
  const pathEnv = { ...process.env };
  if (flags.configDir) {
    pathEnv.DISCORD_CONFIG_DIR = flags.configDir;
    delete pathEnv.DISCORD_ENV_FILE;
    delete pathEnv.DISCORD_STATE_DIR;
    delete pathEnv.DISCORD_BRIDGE_STATE_DIR;
  }
  discordPaths = resolveDiscordPaths(pathEnv);
  const configDir = discordPaths.configDir;
  const envFile = discordPaths.envFile;
  return {
    positional,
    flags,
    configDir,
    envFile,
    statePath: flags.statePath || path.join(discordPaths.stateDir, 'state.json'),
  };
}

function groupFor(state, channelId) {
  assertSnowflake(channelId, 'CHANNEL_ID');
  if (!state.groups[channelId]) {
    state.groups[channelId] = { requireMention: true, allowFrom: [], allowBots: false };
  }
  return state.groups[channelId];
}

function parseJsonArray(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be a JSON array: ${error.message}`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array`);
  return parsed.map(item => String(item));
}

function writeToken(envPath, token) {
  if (!token) throw new Error('--token is required');
  fs.mkdirSync(path.dirname(envPath), { recursive: true, mode: 0o700 });
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = existing
    .split(/\r?\n/)
    .filter(line => line.trim() && !/^\s*DISCORD_(BOT_)?TOKEN=/.test(line));
  lines.push(`DISCORD_BOT_TOKEN=${token}`);
  fs.writeFileSync(envPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return envPath;
}

function printStatus(statePath, state) {
  process.stdout.write(`${JSON.stringify({
    statePath,
    dmPolicy: state.dmPolicy,
    allowFrom: state.allowFrom,
    pendingPairings: Object.keys(state.pendingPairings),
    groups: state.groups,
    mentionPatterns: state.mentionPatterns,
    threadCount: Object.keys(state.threads).length,
  }, null, 2)}\n`);
}

function main() {
  const { positional, flags, envFile, statePath } = parseArgs(process.argv.slice(2));
  const [cmd, subcmd, value, extra] = positional;

  if (cmd === 'configure') {
    const envPath = writeToken(envFile, flags.token || subcmd || '');
    process.stdout.write(`${JSON.stringify({ ok: true, envPath }, null, 2)}\n`);
    return;
  }

  const state = loadState(statePath);

  if (!cmd || cmd === 'status') {
    printStatus(statePath, state);
    return;
  }

  if (cmd === 'pair' && subcmd) {
    const pending = state.pendingPairings[subcmd];
    if (!pending) throw new Error(`Pairing code not found: ${subcmd}`);
    addUnique(state.allowFrom, pending.userId, 'pending pairing user');
    delete state.pendingPairings[subcmd];
  } else if (cmd === 'deny' && subcmd) {
    delete state.pendingPairings[subcmd];
  } else if (cmd === 'policy' && subcmd) {
    if (!DM_POLICIES.has(subcmd)) throw new Error(`Policy must be one of: ${Array.from(DM_POLICIES).join(', ')}`);
    state.dmPolicy = subcmd;
  } else if (cmd === 'allow' && subcmd) {
    for (const id of splitCsv(subcmd)) addUnique(state.allowFrom, id, 'USER_ID');
  } else if (cmd === 'remove' && subcmd) {
    for (const id of splitCsv(subcmd)) removeValue(state.allowFrom, id);
  } else if (cmd === 'group' && subcmd === 'add' && value) {
    const group = groupFor(state, value);
    group.requireMention = !flags.noMention;
    group.allowBots = Boolean(flags.allowBots);
    for (const id of flags.allowIds) addUnique(group.allowFrom, id, '--allow');
  } else if (cmd === 'group' && subcmd === 'rm' && value) {
    delete state.groups[value];
  } else if (cmd === 'group' && subcmd === 'allow' && value && extra) {
    const group = groupFor(state, value);
    for (const id of splitCsv(extra)) addUnique(group.allowFrom, id, 'USER_ID');
  } else if (cmd === 'group' && subcmd === 'remove' && value && extra) {
    const group = groupFor(state, value);
    for (const id of splitCsv(extra)) removeValue(group.allowFrom, id);
  } else if (cmd === 'group' && subcmd === 'mention' && value && extra) {
    groupFor(state, value).requireMention = parseBoolWord(extra);
  } else if (cmd === 'group' && subcmd === 'allow-bots' && value && extra) {
    groupFor(state, value).allowBots = parseBoolWord(extra);
  } else if (cmd === 'set' && subcmd === 'mentionPatterns' && value !== undefined) {
    state.mentionPatterns = parseJsonArray(value, 'mentionPatterns');
  } else {
    usage();
    throw new Error('Invalid command');
  }

  saveState(statePath, state);
  process.stdout.write(`${JSON.stringify({ ok: true, statePath }, null, 2)}\n`);
}

main();
