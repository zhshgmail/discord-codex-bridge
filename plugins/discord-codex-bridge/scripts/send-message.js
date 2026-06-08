#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.codex', 'channels', 'discord');
const DEFAULT_ENV_FILE = path.join(DEFAULT_CONFIG_DIR, '.env');

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
      'Usage: send-message.js --channel CHANNEL_ID [--reply-to MESSAGE_ID] [--content TEXT]',
      'If --content is omitted, message content is read from stdin.',
      '',
    ].join('\n'),
  );
}

function parseArgs(argv) {
  const args = { channel: '', replyTo: '', content: null, allowEveryone: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--channel') args.channel = argv[++i] || '';
    else if (arg === '--reply-to') args.replyTo = argv[++i] || '';
    else if (arg === '--content') args.content = argv[++i] || '';
    else if (arg === '--allow-everyone') args.allowEveryone = true;
    else if (arg === '--no-everyone') args.allowEveryone = false;
    else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function chunksForDiscord(text, max = 1900) {
  const chunks = [];
  let rest = text || '(empty message)';
  while (rest.length > max) {
    let idx = rest.lastIndexOf('\n', max);
    if (idx < max * 0.5) idx = rest.lastIndexOf(' ', max);
    if (idx < max * 0.5) idx = max;
    chunks.push(rest.slice(0, idx).trimEnd());
    rest = rest.slice(idx).trimStart();
  }
  chunks.push(rest);
  return chunks;
}

async function main() {
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

  const content = args.content === null ? readStdin() : args.content;
  const allowEveryone =
    args.allowEveryone === null ? parseBool(process.env.DISCORD_ALLOW_EVERYONE, true) : args.allowEveryone;
  const allowedMentions = allowEveryone
    ? { parse: ['users', 'roles', 'everyone'], replied_user: false }
    : { parse: [], replied_user: false };

  let lastResponse = null;
  const chunks = chunksForDiscord(content);
  for (let i = 0; i < chunks.length; i += 1) {
    const body = {
      content: chunks[i],
      allowed_mentions: allowedMentions,
    };
    if (i === 0 && args.replyTo) {
      body.message_reference = {
        message_id: args.replyTo,
        channel_id: args.channel,
        fail_if_not_exists: false,
      };
    }

    const response = await undici.fetch(`https://discord.com/api/v10/channels/${args.channel}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Discord API ${response.status}: ${text}`);
    lastResponse = JSON.parse(text);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, messageId: lastResponse?.id || null })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
