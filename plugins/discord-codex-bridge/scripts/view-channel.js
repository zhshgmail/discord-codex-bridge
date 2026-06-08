#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.codex', 'channels', 'discord');
const DEFAULT_ENV_FILE = path.join(DEFAULT_CONFIG_DIR, '.env');
const DEFAULT_BRIDGE_ENV_FILE = path.join(os.homedir(), '.config', 'discord-codex-bridge.env');

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
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

function requireUndici() {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', '@discordjs', 'rest', 'node_modules', 'undici'),
    path.join(__dirname, '..', 'node_modules', 'discord.js', 'node_modules', 'undici'),
    path.join(__dirname, '..', 'node_modules', 'undici'),
    'undici',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('Unable to load undici');
}

function usage() {
  process.stderr.write('Usage: view-channel.js --channel CHANNEL_ID [--json]\n');
}

function parseArgs(argv) {
  const args = { channel: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--channel') args.channel = argv[++i] || '';
    else if (arg === '--thread') args.channel = argv[++i] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function channelTypeName(type) {
  const types = {
    0: 'GUILD_TEXT',
    1: 'DM',
    2: 'GUILD_VOICE',
    3: 'GROUP_DM',
    4: 'GUILD_CATEGORY',
    5: 'GUILD_ANNOUNCEMENT',
    10: 'ANNOUNCEMENT_THREAD',
    11: 'PUBLIC_THREAD',
    12: 'PRIVATE_THREAD',
    13: 'GUILD_STAGE_VOICE',
    14: 'GUILD_DIRECTORY',
    15: 'GUILD_FORUM',
    16: 'GUILD_MEDIA',
  };
  return types[type] || `UNKNOWN_${type}`;
}

function normalizeChannel(channel) {
  return {
    id: channel.id,
    type: channel.type,
    typeName: channelTypeName(channel.type),
    guildId: channel.guild_id || null,
    parentId: channel.parent_id || null,
    ownerId: channel.owner_id || null,
    name: channel.name || null,
    topic: channel.topic || null,
    lastMessageId: channel.last_message_id || null,
    rateLimitPerUser: channel.rate_limit_per_user || 0,
    nsfw: Boolean(channel.nsfw),
    archived: channel.thread_metadata?.archived ?? null,
    locked: channel.thread_metadata?.locked ?? null,
    messageCount: channel.message_count ?? null,
    memberCount: channel.member_count ?? null,
  };
}

function formatText(channel) {
  return [
    `id: ${channel.id}`,
    `type: ${channel.typeName} (${channel.type})`,
    `guild_id: ${channel.guildId || ''}`,
    `parent_id: ${channel.parentId || ''}`,
    `name: ${channel.name || ''}`,
    `topic: ${channel.topic || ''}`,
    `last_message_id: ${channel.lastMessageId || ''}`,
    `rate_limit_per_user: ${channel.rateLimitPerUser}`,
    `nsfw: ${channel.nsfw}`,
    channel.archived === null ? '' : `archived: ${channel.archived}`,
    channel.locked === null ? '' : `locked: ${channel.locked}`,
    channel.messageCount === null ? '' : `message_count: ${channel.messageCount}`,
    channel.memberCount === null ? '' : `member_count: ${channel.memberCount}`,
  ].filter(Boolean).join('\n');
}

async function main() {
  loadEnvFile(process.env.DISCORD_BRIDGE_ENV_FILE || DEFAULT_BRIDGE_ENV_FILE);
  const configDir = process.env.DISCORD_CONFIG_DIR || process.env.DISCORD_STATE_DIR || DEFAULT_CONFIG_DIR;
  loadEnvFile(process.env.DISCORD_ENV_FILE || path.join(configDir, '.env'));

  const args = parseArgs(process.argv.slice(2));
  if (!args.channel) {
    usage();
    throw new Error('--channel is required');
  }

  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) throw new Error(`DISCORD_BOT_TOKEN is missing. Set it in ${process.env.DISCORD_ENV_FILE || DEFAULT_ENV_FILE}.`);

  const insecureTls = parseBool(process.env.DISCORD_INSECURE_TLS, false);
  if (insecureTls) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const proxyUrl =
    process.env.DISCORD_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';

  const undici = requireUndici();
  if (proxyUrl) {
    undici.setGlobalDispatcher(
      new undici.ProxyAgent({
        uri: proxyUrl,
        requestTls: { rejectUnauthorized: !insecureTls },
        proxyTls: { rejectUnauthorized: !insecureTls },
      }),
    );
  }

  const response = await undici.fetch(`https://discord.com/api/v10/channels/${args.channel}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text}`);

  const channel = normalizeChannel(JSON.parse(text));
  process.stdout.write(args.json ? `${JSON.stringify(channel, null, 2)}\n` : `${formatText(channel)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

