#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.codex', 'channels', 'discord');

function usage() {
  process.stderr.write(`Usage:
  manage-access.js status
  manage-access.js allow USER_ID
  manage-access.js remove USER_ID
  manage-access.js channel add CHANNEL_ID
  manage-access.js channel rm CHANNEL_ID

Options:
  --state PATH          Override state.json path
  --config-dir PATH     Override config directory
`);
}

function parseArgs(argv) {
  const positional = [];
  let statePath = '';
  let configDir = process.env.DISCORD_CONFIG_DIR || process.env.DISCORD_STATE_DIR || DEFAULT_CONFIG_DIR;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--state') statePath = argv[++i] || '';
    else if (arg === '--config-dir') configDir = argv[++i] || '';
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      positional.push(arg);
    }
  }
  return {
    positional,
    statePath: statePath || path.join(configDir, 'state.json'),
  };
}

function loadState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      allowedUserIds: Array.isArray(parsed.allowedUserIds) ? parsed.allowedUserIds : [],
      allowedChannelIds: Array.isArray(parsed.allowedChannelIds) ? parsed.allowedChannelIds : [],
      threads: parsed.threads && typeof parsed.threads === 'object' ? parsed.threads : {},
    };
  } catch {
    return { allowedUserIds: [], allowedChannelIds: [], threads: {} };
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function addUnique(list, value) {
  if (!/^\d{16,25}$/.test(value)) throw new Error(`Expected a Discord snowflake ID, got: ${value}`);
  if (!list.includes(value)) list.push(value);
}

function removeValue(list, value) {
  const next = list.filter(item => item !== value);
  list.length = 0;
  list.push(...next);
}

function main() {
  const { positional, statePath } = parseArgs(process.argv.slice(2));
  const [cmd, subcmd, value] = positional;
  const state = loadState(statePath);

  if (!cmd || cmd === 'status') {
    process.stdout.write(`${JSON.stringify({
      statePath,
      allowedUserIds: state.allowedUserIds,
      allowedChannelIds: state.allowedChannelIds,
      threadCount: Object.keys(state.threads).length,
    }, null, 2)}\n`);
    return;
  }

  if (cmd === 'allow' && subcmd) {
    addUnique(state.allowedUserIds, subcmd);
  } else if (cmd === 'remove' && subcmd) {
    removeValue(state.allowedUserIds, subcmd);
  } else if (cmd === 'channel' && subcmd === 'add' && value) {
    addUnique(state.allowedChannelIds, value);
  } else if (cmd === 'channel' && subcmd === 'rm' && value) {
    removeValue(state.allowedChannelIds, value);
  } else {
    usage();
    throw new Error('Invalid command');
  }

  saveState(statePath, state);
  process.stdout.write(`${JSON.stringify({ ok: true, statePath }, null, 2)}\n`);
}

main();

