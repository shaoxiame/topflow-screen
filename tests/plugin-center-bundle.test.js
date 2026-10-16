'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { bundleSDK, CONTRACT } = require('../tools/plugin-center-bundle.cjs');

test('reviewed SDK bundles without overwriting another plugin export or making requests', () => {
  let calls = 0;
  const existing = { owner: 'other-plugin' };
  const context = { UFIPluginTelemetry: existing, location: { origin:'http://192.168.0.1:2333' },
    document:{ visibilityState:'hidden' }, fetch(){ calls++; }, XMLHttpRequest:class { constructor(){calls++;} } };
  vm.createContext(context);
  vm.runInContext(bundleSDK(), context);
  assert.equal(context.UFIPluginTelemetry, existing);
  assert.equal(context.TopFlowScreenTelemetrySDK.version, '2.0.0');
  assert.equal(typeof context.TopFlowScreenTelemetrySDK.create, 'function');
  assert.equal(calls, 0);
  assert.equal(CONTRACT.nativeBackgroundService, false);
  assert.equal(CONTRACT.automaticCoreInstallation, false);
});

test('the private SDK keeps credential-free XHR and bounded page lifecycle code intact', () => {
  const source = bundleSDK();
  assert.match(source, /xhr\.withCredentials = false/);
  assert.match(source, /scope\.document\.removeEventListener\('visibilitychange', visibilityChanged\)/);
  assert.match(source, /if \(autoController\) autoController\.abort\(\)/);
  assert.match(source, /const INTERVAL = 60000/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
});
