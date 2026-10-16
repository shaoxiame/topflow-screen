'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SDK_SHA256 = '50d461aa76f1d35efba50f2b598c08f9b5ba518ae59799546a5862bfac82fc7d';
const CONTRACT = Object.freeze({
  pluginId: 'cb3019be62c69ff3127098cb728c1d35',
  baseUrl: 'https://plugin.shaneyun.com',
  sdkVersion: '2.0.0', sdkSha256: SDK_SHA256,
  telemetry: 'exact-published-version-visible-page-only',
  publicTransport: 'independent-XMLHttpRequest-without-credentials',
  nativeBackgroundService: false, automaticCoreInstallation: false,
  onlineCorePublishedAtBuild: false, publicationPerformed: false
});
function bundleSDK() {
  const source = fs.readFileSync(path.join(__dirname, '../vendor/ufi-device-sdk-2.0.0.js'), 'utf8');
  if (crypto.createHash('sha256').update(source).digest('hex') !== SDK_SHA256) throw Error('Reviewed plugin-center SDK hash changed');
  if (!source.endsWith('})(window);\n')) throw Error('SDK private-scope wrapper anchor changed');
  // Keep the reviewed SDK body intact while isolating its export from other
  // plugins. The facade binds browser methods to their actual host Window.
  return '(function(root){\nvar privateScope={location:root.location,document:root.document,fetch:function(){return root.fetch.apply(root,arguments);},addEventListener:function(){return root.addEventListener.apply(root,arguments);},removeEventListener:function(){return root.removeEventListener.apply(root,arguments);}};\n' +
    source.slice(0, -'})(window);\n'.length) + '})(privateScope);\nroot.TopFlowScreenTelemetrySDK=privateScope.UFIPluginTelemetry;\n})(typeof window!=="undefined"?window:globalThis);\n';
}
module.exports = { bundleSDK, CONTRACT };
