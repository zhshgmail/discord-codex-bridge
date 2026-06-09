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
  process.stderr.write(
    [
      'Usage: fetch-messages.js --channel CHANNEL_ID [--limit N] [--before ID | --after ID | --around ID] [--json]',
      'Fetches recent Discord channel history visible to the bot. Output is oldest-first.',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const args = {
    channel: '',
    limit: 20,
    before: '',
    after: '',
    around: '',
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--channel') args.channel = argv[++i] || '';
    else if (arg === '--limit') args.limit = Number(argv[++i] || 20);
    else if (arg === '--before') args.before = argv[++i] || '';
    else if (arg === '--after') args.after = argv[++i] || '';
    else if (arg === '--around') args.around = argv[++i] || '';
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
    timestamp: message.timestamp,
    editedTimestamp: message.edited_timestamp || null,
    author: {
      id: message.author?.id || null,
      username: message.author?.username || null,
      globalName: message.author?.global_name || null,
      bot: Boolean(message.author?.bot),
    },
    content: message.content || '',
    referencedMessageId: message.referenced_message?.id || null,
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

function formatText(messages) {
  if (!messages.length) return '(no messages)';
  return messages.map(message => {
    const name = message.author.globalName || message.author.username || message.author.id || 'unknown';
    const bot = message.author.bot ? ' bot' : '';
    const attachments = message.attachments.length
      ? ` +${message.attachments.length}att:${message.attachments.map(att => att.filename || att.id).join(',')}`
      : '';
    const reply = message.referencedMessageId ? ` reply_to=${message.referencedMessageId}` : '';
    const content = message.content || (message.attachments.length ? '(attachments only)' : '(empty)');
    return `[${message.timestamp}] ${name}${bot} (${message.author.id}) id=${message.id}${reply}${attachments}\n${content}`;
  }).join('\n\n');
}

async function main() {
  let discordPaths = resolveDiscordPaths(process.env);
  loadEnvFile(discordPaths.bridgeEnvFile);
  discordPaths = resolveDiscordPaths(process.env);
  loadEnvFile(discordPaths.envFile);
  discordPaths = resolveDiscordPaths(process.env);

  const args = parseArgs(process.argv.slice(2));
  if (!args.channel) {
    usage();
    throw new Error('--channel is required');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100) {
    throw new Error('--limit must be an integer from 1 to 100');
  }
  const positionalFilters = [args.before, args.after, args.around].filter(Boolean);
  if (positionalFilters.length > 1) {
    throw new Error('Use only one of --before, --after, or --around');
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

  const params = new URLSearchParams({ limit: String(args.limit) });
  if (args.before) params.set('before', args.before);
  if (args.after) params.set('after', args.after);
  if (args.around) params.set('around', args.around);

  const response = await undici.fetch(`https://discord.com/api/v10/channels/${args.channel}/messages?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${text}`);

  const rawMessages = JSON.parse(text);
  const messages = rawMessages.map(normalizeMessage).reverse();
  process.stdout.write(args.json ? `${JSON.stringify(messages, null, 2)}\n` : `${formatText(messages)}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
