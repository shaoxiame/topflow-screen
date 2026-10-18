'use strict';
// Local validation gate only. Does not grant hardware approval or publish anything.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),builder=require('./build.cjs');
const result=cp.spawnSync(process.execPath,[path.join(__dirname,'test-public.cjs')],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)throw Error('Public tests failed; release gate was not created');
const powerResult=cp.spawnSync(process.execPath,['--test','--test-concurrency=1','tests/native-band-state-sync.test.js','tests/native-page-state-sync.test.js','tests/native-ufi.test.js','tests/native-wifi-integration.test.js','tests/native-wifi-state.test.js','tests/manager-wallpaper-migration-audit.test.js','tests/native-power-key.test.js','tests/native-power-menu.test.js','tests/native-wallpaper.test.js','tests/native-wallpaper-files.test.js'],{cwd:root,stdio:'inherit'});
if(powerResult.error)throw powerResult.error;
if(powerResult.status!==0)throw Error('Native power-key/menu tests failed; release gate was not created');
for(const script of ['test-factory-power.ps1','test-main-lock.ps1','test-soft-lock.ps1','test-sensor-handover.ps1','test-display-preflight.ps1','test-display-external-sync.ps1','test-display-settings.ps1','test-wake-sensor.ps1','test-display-policy.ps1','test-auto-brightness.ps1','test-display-runtime.ps1']){
 const displayResult=cp.spawnSync(process.env.TF_POWERSHELL||'pwsh',['-NoProfile','-File',path.join(root,'native',script)],{cwd:root,stdio:'inherit'});
 if(displayResult.error)throw displayResult.error;
 if(displayResult.status!==0)throw Error('Display synchronization proof failed: '+script);
}
const historicalMigration=fs.existsSync(path.join(root,'.cache/recovery-024/topflow-native.tar.gz'));
if(historicalMigration){const legacyResult=cp.spawnSync(process.execPath,['--test','tests/manager-migration-024.test.js'],{cwd:root,stdio:'inherit'});if(legacyResult.error)throw legacyResult.error;if(legacyResult.status!==0)throw Error('Exact 0.2.4 migration test failed');}
const historical025Migration=fs.existsSync(path.join(root,'.cache/recovery-025/topflow-native.tar.gz'));
if(historical025Migration){const legacyResult=cp.spawnSync(process.execPath,['--test','tests/manager-migration-025.test.js'],{cwd:root,stdio:'inherit'});if(legacyResult.error)throw legacyResult.error;if(legacyResult.status!==0)throw Error('Exact 0.2.5 migration test failed');}
const historical026Migration=fs.existsSync(path.join(root,'.cache/recovery-026/topflow-native.tar.gz'));
if(historical026Migration){const legacyResult=cp.spawnSync(process.execPath,['--test','tests/manager-migration-026.test.js'],{cwd:root,stdio:'inherit'});if(legacyResult.error)throw legacyResult.error;if(legacyResult.status!==0)throw Error('Exact 0.2.6 migration test failed');}
const archive=fs.readFileSync(path.join(root,'native/topflow-native.tar.gz'));
const members=builder.tarMembers(archive);
const manifest=JSON.parse(members.find(m=>m.name==='./build-manifest.json').content);
builder.verifyNativeSources(manifest,members);
builder.verifyNativeRootProofs(manifest);
builder.verifyNativeBinaries(manifest,members);
builder.verifyBootIntegrity(manifest,members);
builder.verifyNativeLiveContract(manifest);
builder.verifyNativeReleaseContract(manifest,{});
const gate={schema:1,version:manifest.version,state:'device-acceptance-pending',code:'DEVICE_ACCEPTANCE_PENDING',hardwareVerified:false,
 historical024MigrationVerified:historicalMigration,historical025MigrationVerified:historical025Migration,historical026MigrationVerified:historical026Migration,localValidationPassed:true,localImplementationReviewed:true,adaptationFixCandidate:true,
 reason:'Public-source local tests, source/archive integrity and release contracts passed. No new hardware acceptance is asserted.',
 validationScope:['public-js-tests','factory-quick-boot-off-display-input-gate','native-wifi-and-page-state-sync','native-display-external-policy-and-security','wallpaper-memory-migration','native-power-key-menu-C-harness','native-wallpaper-loader-and-file-lifecycle','native-source-hashes','root-proof-hashes','native-ELF-architecture','boot-file-integrity','existing-release-contracts'],
 exclusions:['private-firmware-evidence-tests','device-installation','device-ABI-validation','display-touch-sleep-hardware-tests'],
 sourceSha256:Object.fromEntries(['src/manager-theme.js','src/manager-confirm.js','src/manager-wallpaper.js','src/manager-wallpaper-ui.js','src/manager-wallpaper-migration.js','src/ufi-plugin.js','src/manager.css','tools/build.cjs','tools/production-manager.cjs'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')])),
 checkedAt:new Date().toISOString()};
fs.mkdirSync(path.join(root,'analysis'),{recursive:true});
fs.writeFileSync(path.join(root,'analysis/release-gate.json'),JSON.stringify(gate,null,2)+'\n');
console.log('Local release gate prepared. hardwareVerified=false; package still requires device acceptance.');
