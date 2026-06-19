const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isInteractiveCodexArgs,
  parseCodexTtyCandidates,
} = require('../../src/tty-detect');

test('interactive Codex detector accepts resume and remote TUI commands', () => {
  assert.equal(isInteractiveCodexArgs('codex resume 019e'), true);
  assert.equal(isInteractiveCodexArgs('node /bin/codex --remote unix:///tmp/app.sock'), true);
  assert.equal(isInteractiveCodexArgs('node /home/test/bin/codex --dangerously-bypass-approvals-and-sandbox resume'), true);
  assert.equal(isInteractiveCodexArgs('/home/test/vendor/bin/codex --dangerously-bypass-approvals-and-sandbox resume'), true);
});

test('interactive Codex detector rejects non-interactive Codex commands', () => {
  assert.equal(isInteractiveCodexArgs('codex app-server --listen unix:///tmp/app.sock'), false);
  assert.equal(isInteractiveCodexArgs('codex exec "prompt"'), false);
  assert.equal(isInteractiveCodexArgs('codex debug app-server send-message-v2 test'), false);
  assert.equal(isInteractiveCodexArgs('node /home/test/a5_codex/discord-codex-bridge/src/index.js'), false);
});

test('parseCodexTtyCandidates returns newest interactive pts candidate', () => {
  const output = [
    ' 100 pts/1    codex app-server --listen unix:///tmp/app.sock',
    ' 101 pts/2    codex resume 019e',
    ' 102 ?        codex resume 019f',
    ' 103 pts/3    node /home/test/bin/codex --remote unix:///tmp/app.sock',
    '',
  ].join('\n');

  assert.deepEqual(parseCodexTtyCandidates(output), [
    { pid: 103, tty: '/dev/pts/3', args: 'node /home/test/bin/codex --remote unix:///tmp/app.sock' },
    { pid: 101, tty: '/dev/pts/2', args: 'codex resume 019e' },
  ]);
});
