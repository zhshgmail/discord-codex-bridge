#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveDiscordPaths } = require('../src/config-paths');

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
  process.stderr.write('Usage: read-message.js --channel CHANNEL_ID --message MESSAGE_ID [--json]\n');
}

function parseArgs(argv) {
  const args = { channel: '', message: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--channel') args.channel = argv[++i] || '';
    else if (arg === '--thread') args.channel = argv[++i] || '';
    else if (arg === '--message') args.message = argv[++i] || '';
    else if (arg === '--message-id') args.message = argv[++i] || '';
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

function normalizeMessage(message) {
  return {
    id: message.id,
    channelId: message.channel_id,
    guildId: message.guild_id || null,
    timestamp: message.timestamp,
    editedTimestamp: message.edited_timestamp || null,
    type: message.type,
    author: {
      id: message.author?.id || null,
      username: message.author?.username || null,
      globalName: message.author?.global_name || null,
      bot: Boolean(message.author?.bot),
    },
    content: message.content || '',
    referencedMessageId: message.referenced_message?.id || null,
    mentionEveryone: Boolean(message.mention_everyone),
    mentions: Array.isArray(message.mentions)
      ? message.mentions.map(user => ({
        id: user.id,
        username: user.username || null,
        globalName: user.global_name || null,
        bot: Boolean(user.bot),
      }))
      : [],
    mentionRoles: message.mention_roles || [],
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(att => ({
        id: att.id,
        filename: att.filename,
        contentType: att.content_type || null,
        size: att.size || 0,
        url: att.url,
      }))
      : [],
  };
}

function formatText(message) {
  const name = message.author.globalName || message.author.username || message.author.id || 'unknown';
  const attachments = message.attachments.length
    ? `attachments: ${message.attachments.map(att => `${att.filename || att.id} (${att.size} bytes)`).join(', ')}`
    : 'attachments: none';
  return [
    `id: ${message.id}`,
    `channel_id: ${message.channelId}`,
    `guild_id: ${message.guildId || ''}`,
    `timestamp: ${message.timestamp}`,
    `author: ${name} (${message.author.id})${message.author.bot ? ' bot' : ''}`,
    `reply_to: ${message.referencedMessageId || ''}`,
    `mention_everyone: ${message.mentionEveryone}`,
    `mentions: ${message.mentions.map(user => `${user.globalName || user.username || user.id} (${user.id})`).join(', ')}`,
    `mention_roles: ${message.mentionRoles.join(', ')}`,
    attachments,
    '',
    message.content || (message.attachments.length ? '(attachments only)' : '(empty)'),
  ].join('\n');
}

async function main() {
  let discordPaths = resolveDiscordPaths(process.env);
  loadEnvFile(discordPaths.bridgeEnvFile);
  discordPaths = resolveDiscordPaths(process.env);
  loadEnvFile(discordPaths.envFile);
  discordPaths = resolveDiscordPaths(process.env);

  const args = parseArgs(process.argv.slice(2));
  if (!args.channel || !args.message) {
    usage();
    throw new Error('--channel and --message are required');
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

  const response = await undici.fetch(`https://discord.com/api/v10/channels/${args.channel}/messages/${args.message}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text}`);

  const message = normalizeMessage(JSON.parse(text));
  process.stdout.write(args.json ? `${JSON.stringify(message, null, 2)}\n` : `${formatText(message)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
