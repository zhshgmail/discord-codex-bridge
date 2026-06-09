#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnvFile: loadBridgeEnvFile, resolveDiscordPaths } = require('../src/config-paths');

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
  process.stderr.write('Usage: list-channels.js --guild GUILD_ID [--json]\n');
}

function parseArgs(argv) {
  const args = { guild: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--guild') args.guild = argv[++i] || '';
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
    2: 'GUILD_VOICE',
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
    name: channel.name || '',
    parentId: channel.parent_id || null,
    position: channel.position ?? 0,
    topic: channel.topic || '',
  };
}

function formatText(channels) {
  if (!channels.length) return '(no channels visible to bot)';
  return channels
    .map(channel => {
      const parent = channel.parentId ? ` parent=${channel.parentId}` : '';
      const topic = channel.topic ? ` topic=${channel.topic}` : '';
      return `${channel.typeName} ${channel.name || '(unnamed)'} id=${channel.id}${parent}${topic}`;
    })
    .join('\n');
}

async function main() {
  let discordPaths = resolveDiscordPaths(process.env);
  loadBridgeEnvFile(discordPaths.bridgeEnvFile);
  discordPaths = resolveDiscordPaths(process.env);
  loadBridgeEnvFile(discordPaths.envFile);
  discordPaths = resolveDiscordPaths(process.env);

  const args = parseArgs(process.argv.slice(2));
  if (!args.guild) {
    usage();
    throw new Error('--guild is required');
  }

  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) throw new Error(`DISCORD_BOT_TOKEN is missing. Set it in ${discordPaths.envFile}.`);

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

  const response = await undici.fetch(`https://discord.com/api/v10/guilds/${args.guild}/channels`, {
    method: 'GET',
    headers: { Authorization: `Bot ${token}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text}`);

  const channels = JSON.parse(text)
    .map(normalizeChannel)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  process.stdout.write(args.json ? `${JSON.stringify(channels, null, 2)}\n` : `${formatText(channels)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
