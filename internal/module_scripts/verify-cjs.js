const assert = require('node:assert/strict');

const entry = require('../../build/index.js');

assert.equal(typeof entry, 'object');
assert.equal(entry.default, entry);
for (const exportName of [
  'addShareErrorListener',
  'addShareListener',
  'clearPendingSharesAsync',
  'createShareContentApi',
  'dedupeShares',
  'getInitialShareAsync',
  'getPendingSharesAsync',
  'releaseSharedFilesAsync',
]) {
  assert.equal(typeof entry[exportName], 'function', `${exportName} must be a function`);
}

console.log('CommonJS package entry verified.');
