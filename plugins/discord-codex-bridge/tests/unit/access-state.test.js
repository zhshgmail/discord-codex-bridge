const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  addUnique,
  loadState,
  normalizeState,
  removeValue,
  saveState,
} = require('../../src/access-state');

test('normalizeState deduplicates IDs and applies secure defaults', () => {
  const state = normalizeState({
    dmPolicy: 'unknown',
    allowFrom: ['100000000000000000', '100000000000000000', ''],
    groups: {
      200000000000000000: {
        requireMention: '',
        allowFrom: ['300000000000000000', '300000000000000000'],
        allowBots: 'true',
      },
    },
    mentionPatterns: ['^codex\\b', '^codex\\b'],
    replyToMode: 'bad',
    textChunkLimit: 'bad',
  });

  assert.equal(state.dmPolicy, 'pairing');
  assert.deepEqual(state.allowFrom, ['100000000000000000']);
  assert.deepEqual(state.groups['200000000000000000'], {
    requireMention: true,
    allowFrom: ['300000000000000000'],
    allowBots: true,
  });
  assert.deepEqual(state.mentionPatterns, ['^codex\\b']);
  assert.equal(state.replyToMode, 'first');
  assert.equal(state.textChunkLimit, 2000);
});

test('saveState writes normalized JSON and loadState reads it back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-access-state-'));
  const statePath = path.join(dir, 'state.json');

  saveState(statePath, {
    dmPolicy: 'allowlist',
    allowFrom: ['100000000000000000'],
    groups: {},
    pendingPairings: {
      ABC123: { userId: '200000000000000000' },
    },
  });

  const stat = fs.statSync(statePath);
  assert.equal(stat.mode & 0o777, 0o600);

  const loaded = loadState(statePath);
  assert.equal(loaded.dmPolicy, 'allowlist');
  assert.deepEqual(loaded.allowFrom, ['100000000000000000']);
  assert.deepEqual(Object.keys(loaded.pendingPairings), ['ABC123']);
});

test('addUnique validates Discord snowflake IDs', () => {
  const ids = [];
  addUnique(ids, '100000000000000000', 'USER_ID');
  addUnique(ids, '100000000000000000', 'USER_ID');

  assert.deepEqual(ids, ['100000000000000000']);
  assert.throws(() => addUnique(ids, 'abc', 'USER_ID'), /snowflake/);
});

test('removeValue mutates lists in place', () => {
  const ids = ['100000000000000000', '200000000000000000'];
  removeValue(ids, '100000000000000000');
  assert.deepEqual(ids, ['200000000000000000']);
});
