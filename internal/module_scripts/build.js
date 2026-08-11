#!/usr/bin/env node
const { spawnSyncWithAutoShell } = require('./util');
const fs = require('fs');
const path = require('path');

const SUBTARGETS = ['plugin', 'cli', 'utils', 'scripts'];
const args = process.argv.slice(2);
const target = args[0];

let tscArgs;
if (SUBTARGETS.includes(target)) {
  const targetDir = path.join(process.cwd(), target);
  if (!fs.existsSync(path.join(targetDir, 'tsconfig.json'))) {
    console.log(`tsconfig.json not found in ${target}, skipping build for ${target}`);
    process.exit(0);
  }
  tscArgs = ['--build', targetDir, ...args.slice(1)];
} else {
  tscArgs = [...args];
}

const result = spawnSyncWithAutoShell('tsc', tscArgs, { stdio: 'inherit' });
if ((result.status ?? 0) === 0) {
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
}
process.exit(result.status ?? 0);
