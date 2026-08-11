#!/usr/bin/env node
const { spawnSyncWithAutoShell } = require('./util');
const fs = require('fs');
const path = require('path');

const SUBTARGETS = ['plugin', 'cli', 'utils', 'scripts'];

function run(cmd, args = []) {
  const result = spawnSyncWithAutoShell(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Clean and build main
fs.rmSync(path.join(process.cwd(), 'build'), { recursive: true, force: true });
run('tsc');

// Clean and build any existing subtargets
for (const target of SUBTARGETS) {
  const targetDir = path.join(process.cwd(), target);
  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    console.log(`Building ${target}`);
    fs.rmSync(path.join(targetDir, 'build'), { recursive: true, force: true });
    run('tsc', ['--build', targetDir]);
  }
}

const entry = path.join(process.cwd(), 'build', 'index.js');
const marker = '// CommonJS facade: require/default import returns the API; named exports stay properties.';
if (fs.existsSync(entry) && !fs.readFileSync(entry, 'utf8').includes(marker)) {
  fs.appendFileSync(
    entry,
    [
      '',
      marker,
      'const expoShareContentDefault = exports.default;',
      "if (expoShareContentDefault && (typeof expoShareContentDefault === 'object' || typeof expoShareContentDefault === 'function')) {",
      '  Object.assign(expoShareContentDefault, exports);',
      '  module.exports = expoShareContentDefault;',
      '  module.exports.addShareErrorListener = expoShareContentDefault.addShareErrorListener;',
      '  module.exports.addShareListener = expoShareContentDefault.addShareListener;',
      '  module.exports.clearPendingSharesAsync = expoShareContentDefault.clearPendingSharesAsync;',
      '  module.exports.getInitialShareAsync = expoShareContentDefault.getInitialShareAsync;',
      '  module.exports.getPendingSharesAsync = expoShareContentDefault.getPendingSharesAsync;',
      '  module.exports.releaseSharedFilesAsync = expoShareContentDefault.releaseSharedFilesAsync;',
      '  module.exports.createShareContentApi = exports.createShareContentApi;',
      '  module.exports.dedupeShares = exports.dedupeShares;',
      '}',
      '',
    ].join('\n')
  );
}
