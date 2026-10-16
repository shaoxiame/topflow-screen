'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateProductionScript}=require('../tools/build.cjs');
const {managerOnly}=require('../tools/production-manager.cjs');
const root=path.resolve(__dirname,'..');
test('production manager has no removed store, SDK, telemetry scheduler, or remote script loader',()=>{
  const script=managerOnly(fs.readFileSync(path.join(root,'src/ufi-plugin.js'),'utf8'));
  validateProductionScript(script);
  assert.doesNotMatch(script,/plugin\.shaneyun\.com|UFIPluginTelemetry|TopFlowScreenTelemetrySDK|TopFlowPluginCenter|device-sdk|api\/public\/plugins|createElement\(['"]script['"]\)/);
});
test('production bundle validator refuses removed integrations even if they are unused',()=>{
  for(const source of ['plugin.shaneyun.com','UFIPluginTelemetry','TopFlowScreenTelemetrySDK','TopFlowPluginCenter','device-sdk','api/public/plugins']) {
    assert.throws(()=>validateProductionScript('/* '+source+' */'),/Removed store or telemetry/);
  }
});
test('native runtime and deployment scripts contain no removed store domain or telemetry SDK',()=>{
  const names=fs.readdirSync(path.join(root,'native')).filter(n=>/\.(?:c|h|sh)$/.test(n));
  for(const name of names)assert.doesNotMatch(fs.readFileSync(path.join(root,'native',name),'utf8'),/plugin\.shaneyun\.com|UFIPluginTelemetry|TopFlowScreenTelemetrySDK|TopFlowPluginCenter|device-sdk/,name);
});
test('manager CSS is a local scoped stylesheet without network assets',()=>{
  const css=fs.readFileSync(path.join(root,'src/manager.css'),'utf8');
  assert.match(css,/\.tf-package-/);
  assert.doesNotMatch(css,/@import|url\s*\(|<\/style|https?:/i);
});
