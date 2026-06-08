#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DM_POLICIES = new Set(['pairing', 'allowlist', 'disabled']);

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
}

function normalizeBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function normalizeGroup(value, fallbackRequireMention = true) {
  const group = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    requireMention: normalizeBool(group.requireMention, fallbackRequireMention),
    allowFrom: normalizeIdList(group.allowFrom),
    allowBots: normalizeBool(group.allowBots, false),
  };
}

function normalizeState(parsed, options = {}) {
  const fallbackRequireMention = normalizeBool(options.defaultRequireMention, true);
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const allowFrom = normalizeIdList(source.allowFrom);
  const groups = {};

  if (source.groups && typeof source.groups === 'object' && !Array.isArray(source.groups)) {
    for (const [channelId, group] of Object.entries(source.groups)) {
      if (!channelId) continue;
      groups[String(channelId)] = normalizeGroup(group, fallbackRequireMention);
    }
  }

  const dmPolicy = DM_POLICIES.has(source.dmPolicy) ? source.dmPolicy : 'pairing';
  const pendingPairings =
    source.pendingPairings && typeof source.pendingPairings === 'object' && !Array.isArray(source.pendingPairings)
      ? source.pendingPairings
      : {};

  return {
    dmPolicy,
    allowFrom,
    groups,
    pendingPairings,
    mentionPatterns: normalizeIdList(source.mentionPatterns),
    ackReaction: typeof source.ackReaction === 'string' ? source.ackReaction : '',
    replyToMode: ['first', 'all', 'off'].includes(source.replyToMode) ? source.replyToMode : 'first',
    textChunkLimit: Number.isInteger(source.textChunkLimit) ? source.textChunkLimit : 2000,
    chunkMode: ['length', 'newline'].includes(source.chunkMode) ? source.chunkMode : 'newline',
    threads: source.threads && typeof source.threads === 'object' && !Array.isArray(source.threads) ? source.threads : {},
  };
}

function loadState(file, options = {}) {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')), options);
  } catch {
    return normalizeState({}, options);
  }
}

function saveState(file, state, options = {}) {
  const normalized = normalizeState(state, options);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(normalized, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function assertSnowflake(value, label = 'Discord ID') {
  if (!/^\d{16,25}$/.test(String(value || ''))) {
    throw new Error(`${label} must be a Discord snowflake ID, got: ${value}`);
  }
}

function addUnique(list, value, label) {
  assertSnowflake(value, label);
  if (!list.includes(value)) list.push(value);
}

function removeValue(list, value) {
  const next = list.filter(item => item !== value);
  list.length = 0;
  list.push(...next);
}

module.exports = {
  DM_POLICIES,
  normalizeState,
  loadState,
  saveState,
  assertSnowflake,
  addUnique,
  removeValue,
};
