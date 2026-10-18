'use strict';
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const tests = [
  'device-api.test.js', 'ui-contract.test.js', 'network-status.test.js',
  'plugin-manager.test.js', 'production-manager.test.js', 'manager-cancel.test.js', 'manager-theme.test.js', 'manager-confirm.test.js', 'manager-wallpaper.test.js', 'manager-wallpaper-ui.test.js', 'manager-wallpaper-migration.test.js',
  'aoyou-adapter.test.js', 'aoyou-ufi-transport.test.js', 'no-remote-integration.test.js'
];
console.log('Public source tests: synthetic/mocked transport only; no device access.');
console.log('Excluded: private historical evidence, release archive checks, native compiler/font tests, shell and migration suites requiring historical packages. See docs/BUILD.md.');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests.map(t => path.join('tests', t))], {cwd:path.resolve(__dirname, '..'), stdio:'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
