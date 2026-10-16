'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const pack = require('../tools/build.cjs');
const plugin = require('../src/ufi-plugin.js');
const fixture = { archiveBase64: 'YQ==', archiveSha256: 'a'.repeat(64), screenctlSha256: 'b'.repeat(64), screenctlSource: '#!/bin/sh\nprintf \'{"mode":"factory"}\\n\'\n', hardwareTested: false, members: ['./', './screenctl.sh', './supervisor.sh', './topflow-screen', './ui/index.html', './topflow-screen.sha256'] };
const owner = 'c'.repeat(32);

test('browser registration only adds an entry and performs zero device requests', () => {
  let appended = 0, requests = 0;
  const context = {
    TopFlowPackagePayload: fixture,
    document: { body: { append() { appended++; } }, querySelector: () => null, createElement: () => ({}) },
    getData: () => { requests++; }, postData: () => { requests++; }, runShellWithRoot: () => { requests++; },
    fetch: () => { requests++; }, DatadApp: { request: () => { requests++; } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/ufi-plugin.js'), 'utf8'), context);
  assert.equal(appended, 1);
  assert.equal(requests, 0);
  assert.equal(typeof context.__topflow_screen_plugin.open, 'function');
  context.TopFlowUfiPlugin.register(context);
  assert.equal(appended, 1, 'duplicate imports cannot add duplicate entries');
});

test('install start refuses an existing target and does not start any renderer', () => {
  const command = plugin.buildInstallStart(owner, fixture);
  assert.match(command, /\[ ! -e "\$TF_ROOT" \] && \[ ! -L "\$TF_ROOT" \]/);
  assert.match(command, /mkdir "\$TF_ROOT"/);
  assert.match(command, /readlink -f \/data\/plugins/);
  assert(command.indexOf('> "$TF_ROOT/.topflow-files"') < command.indexOf('TOPFLOW_INSTALL=READY'));
  assert(command.indexOf('> "$TF_ROOT/.topflow-install"') < command.indexOf('TOPFLOW_INSTALL=READY'));
  assert.doesNotMatch(command, /mkdir -p|init\.d|ubus|nohup|kill|reboot/);
  assert.throws(() => plugin.buildInstallStart("'; touch /tmp/pwn; '"));
});

test('binary upload uses documented FormData endpoint and validates exact returned path', async () => {
  const requests=[];
  const root={atob,Blob,FormData,location:{href:'http://localhost:8877/ufi-host.html',origin:'http://localhost:8877'},fetch:async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>({result:'success',path:'/data/plugins/topflow-screen/.payload.tar.gz',name:'.payload.tar.gz',size:1})};
  }};
  await plugin.uploadNative(root,fixture);
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'http://localhost:8877/api/upload_file');
  assert.equal(requests[0].options.credentials,'same-origin');
  assert.equal(requests[0].options.headers['Content-Type'],undefined);
  assert.equal(requests[0].options.body.get('path'),'/data/plugins/topflow-screen');
  assert.equal(requests[0].options.body.get('file').name,'.payload.tar.gz');
  root.fetch=async()=>({ok:true,json:async()=>({result:'success',path:'/tmp/wrong',name:'.payload.tar.gz',size:1})});
  await assert.rejects(plugin.uploadNative(root,fixture),{code:'UPLOAD_UNCONFIRMED'});
  assert.doesNotMatch(plugin.buildInstallStart(owner,fixture)+plugin.buildInstallFinish(owner,fixture),/base64 -d|\.payload\.b64/);
});

test('finish validates hash before extraction and never changes factory/startup files', () => {
  const command = plugin.buildInstallFinish(owner, fixture);
  assert(command.indexOf('sha256sum -c -') < command.indexOf('tar -xzf'));
  assert.match(command, /UNEXPECTED_MEMBER/);
  assert.match(command, /INSTALLED_NOT_STARTED/);
  assert.doesNotMatch(command, /\/etc\/|\/usr\/|nohup|ubus|screenctl\.sh start|reboot|rm -rf/);
  assert.throws(() => plugin.buildInstallFinish(owner, { ...fixture, members: ['../../etc/init.d/test'] }));
});

test('screen controls are explicit, narrowly scoped and status is parsed without false success', () => {
  assert.throws(() => plugin.buildScreenCommand('start', fixture), { code: 'CONFIRM_REQUIRED' });
  assert.throws(() => plugin.buildScreenCommand('restore', fixture), { code: 'CONFIRM_REQUIRED' });
  assert.throws(() => plugin.buildScreenCommand('restart', fixture, true), { code: 'INVALID_ACTION' });
  assert.match(plugin.buildScreenCommand('start', fixture, true), /screenctl\.sh" start --confirmed/);
  assert.match(plugin.buildScreenCommand('restore', fixture, true), /set -- restore --confirmed/);
  const status = plugin.buildScreenCommand('status', fixture);
  assert.doesNotMatch(status, /mkdir|chmod|rm -| --confirmed| restart| start|kill /);
  assert.deepEqual(plugin.parseScreenStatus('checksum OK\nTOPFLOW_SCREEN={"mode":"factory"}\n'), { installed: true, partial: false, uploadActive: false, mode: 'factory', pid: null,ready:false,heartbeatAge:null,supervised:false });
  assert.deepEqual(plugin.parseScreenStatus('TOPFLOW_SCREEN={"mode":"factory","installed":false}\n'), { installed: false, partial: false, uploadActive: false, mode: 'factory', pid: null,ready:false,heartbeatAge:null,supervised:false });
  assert.deepEqual(plugin.parseScreenStatus('TOPFLOW_SCREEN={"mode":"custom","pid":234,"ready":true,"heartbeatAge":2,"supervised":true}\n'), { installed:true,partial:false,uploadActive:false,mode:'custom',pid:234,ready:true,heartbeatAge:2,supervised:true });
  assert.throws(() => plugin.parseScreenStatus('Switch supervisor started'), { code: 'STATUS_UNCONFIRMED' });
});

test('current final candidate uses the documented script format and exact live direct-switch native archive', t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'topflow-build-test-'));
  t.after(() => { const target = path.resolve(dir); assert.equal(path.dirname(target), path.resolve(tempRoot)); assert(path.basename(target).startsWith('topflow-build-test-')); fs.rmSync(target, { recursive: true, force: true }); });
  const summary = pack.build(dir);
  const txt = fs.readFileSync(path.join(dir, 'topflow-screen.txt'), 'utf8');
  assert(Buffer.byteLength(txt) < 4 * 1024 * 1024);
  assert(txt.startsWith('<script id="topflow-screen-plugin-source">\n// TopFlow 屏幕 v0.2.2'));
  assert.doesNotMatch(txt,/\[KANO_META\]/,'raw uploads must never include store metadata');
  assert.match(txt,/^\/\/ @name TopFlow 屏幕$/m);assert.match(txt,/^\/\/ @version 0\.2\.2$/m);assert.match(txt,/^\/\/ @build [a-f0-9]{16}$/m);
  assert.equal(txt.match(/^\/\/ @build (.+)$/m)[1],summary.pluginMetadata.build);assert.equal(summary.pluginMetadata.version,summary.version);
  assert.equal(fs.readFileSync(path.join(dir,'topflow-screen-0.2.2.txt'),'utf8'),txt);
  assert.doesNotMatch(txt, /<!--\s*\[KANO_(?:PLUGIN_START|PLUGIN_END)\]/);
  assert.equal((txt.match(/<script(?:\s[^>]*)?>/g) || []).length, 1);
  assert.equal((txt.match(/<\/script>/g) || []).length, 1);
  assert.doesNotMatch(txt,/TopflowDeviceAPI|TopFlowAoyou|TopFlowUI|demoSnapshot|setSnapshot|data-tf-advanced/);
  assert.deepEqual(summary.sources,['ufi-plugin.js']);
  assert.deepEqual(summary.storeIntegration,{officialDocumentationOnly:true,telemetry:false,remoteSDK:false});
  assert.equal(summary.pluginCenter,undefined);
  assert.equal(summary.managerCssSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/manager.css'))).digest('hex'));
  const officialMetadata=JSON.parse(fs.readFileSync(path.join(dir,'topflow-screen-0.2.2.txt.meta.json'),'utf8'));
  assert.deepEqual(officialMetadata,{name:'TopFlow 屏幕',description:summary.pluginMetadata.description,version:'0.2.2',author:'shaoxiame',category:'设备管理',device_models:['TOPFLOW']});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'topflow-screen.txt.meta.json'),'utf8')),officialMetadata);
  assert.equal(fs.existsSync(path.join(dir,'topflow-screen-0.2.2.meta.json')),false,'official metadata sidecar appends to the complete filename');
  assert.doesNotMatch(txt,/plugin\.shaneyun\.com|UFIPluginTelemetry|TopFlowScreenTelemetrySDK|TopFlowPluginCenter|device-sdk|api\/public\/plugins/);
  assert.deepEqual(summary.nativeAmbr,JSON.parse(fs.readFileSync(path.join(__dirname,'../native/build-manifest.json'),'utf8')).nativeAmbr);
  assert(txt.includes(require('../tools/production-manager.cjs').managerOnly(fs.readFileSync(path.join(__dirname,'../src/ufi-plugin.js'),'utf8'))));
  assert.doesNotMatch(txt, /NON_PRODUCTION_PASSWORD_SENTINEL|TF_FIXTURES|aoyou-status-summary|Hong Kong 17/);
  assert.equal(summary.sha256, crypto.createHash('sha256').update(txt).digest('hex'));
  const readme=fs.readFileSync(path.join(dir, 'README.txt'), 'utf8');
  assert.match(readme,/0\.2\.2 管理页与移除旧接入已在电脑验证，本轮未新增实机测试/);assert.match(readme,/用户已确认 0\.2\.1 实机验收/);assert.match(readme,/普通\/聚合共用一个首页位置/);assert.match(readme,/保留0\.1\.6跟手拖动/);assert.match(readme,/保留原厂切换、休眠和PIN保护/);assert.doesNotMatch(readme,/无法触摸|触摸失效|ADOPT_SENSOR_STATE/);
  assert(readme.split('\n').length<44);assert.match(readme,/无需手动来回切换/);assert.match(readme,/只比较已导入TXT与本机已安装组件/);assert.doesNotMatch(readme,/(?:等待|剩余|最长)\s*360\s*秒|最长6分钟|当前0\.1\.1已失败，此默认门槛仍阻断/);
  assert.equal(summary.reviewOnly,false);assert.equal(summary.diagnosticCandidate,false);assert.equal(summary.releaseBlocked,null);assert.equal(summary.acceptanceStatus,'DEVICE_ACCEPTANCE_PENDING');
  assert.equal(summary.hardwareTested,false);assert.equal(summary.directSwitch,true);assert.equal(summary.receiptVersion,2);assert.equal(summary.sensorAfterDrm,true);assert.equal(summary.startupOrder,'policy-drm-sensor-frame-lcd');assert.deepEqual(summary.userReportedDisplayHandover,{version:'0.1.4',successful:true});
  assert.deepEqual(summary.nativeHomeNavigation,{mainPageCount:3,homePageSlots:1,homeSlotModes:['normal','aggregate'],modeSource:'fresh-aggregation.enabled',modeDerivedFrom:'zwrt_router.network.opms_wan_mode==SMULTIWAN',disabledUnknownOrStaleView:'normal',enabledOfflineView:'aggregate',physicalSwitchOriginDetected:false,screenModeOverride:false,screenAggregationToggle:false});assert.equal(summary.aggregationUiFixCandidate,true);assert.equal(summary.homeViewFollowsObservedAggregation,true);assert.equal(summary.aggregationPageDefaultVisible,false);assert.equal(summary.aggregationDeviceVerified,false);assert.equal(summary.performanceFixCandidate,true);assert.equal(summary.userConfirmedFunctionalRelease,'0.1.5');assert.equal(summary.devicePerformanceVerified,false);assert.deepEqual(summary.performanceScope,['rendering','animation','scrolling']);assert.equal(summary.nativePerformance.touchMotion,'continuous-drag');assert.equal(summary.nativePerformance.pageSettleMilliseconds,144);assert.equal(summary.nativePerformance.pinnedHeader,'status-and-back');assert.equal(summary.nativePerformance.glyphCoverageBytesLimit,384*1024);assert.equal(summary.nativePerformance.glyphEntriesLimit,512);assert.equal(summary.nativePerformance.retainedDocuments,1);assert.equal(summary.nativePerformance.swipeBuffers,2);assert.equal(summary.nativePerformance.cacheStorage,'process-memory-only');assert.deepEqual(summary.nativeBattery,{chargeStatusField:'battery.charging',chargeStatusEnum:'1-charging-2-discharging-3-not-charging-4-full',connectionField:'battery.charger_connect',connectionIndependent:true,percentInfersCharging:false,missingOrConflictingState:'unknown',display:'level-and-charge-state',chargingIcon:'css-rectangles',additionalAnimationTimers:false});
  assert.equal(summary.factoryBinarySha256,'781e3c6ffa2a9db4d61a3cf1bb38461131dc3faed07499a2c9360bc582040dd2');
  assert.equal(summary.adaptationFixCandidate,true);assert.equal(summary.confirmedLockCause,'FACTORY_PIN_ENUM_INVERTED');assert.equal(summary.retainedExistingTouchBackend,true);assert.equal(summary.uprightOrientationMatched,true);assert.equal(summary.factoryPinEnum,'0-enabled-1-disabled');assert.equal(summary.noPinStartup,'hold-to-unlock-local');assert.equal(summary.unresolvedStartupFailure,undefined);assert.equal(summary.confirmedFailureStage,undefined);assert.equal(summary.pendingDeviceAcceptance,true);
  assert.equal(fs.existsSync(path.join(dir,'topflow-screen-0.2.2-diagnostic.txt')),false);
  const executed = {};
  const bundledScript=txt.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
  assert.equal(plugin.findInstalledBlockName('<!-- [KANO_PLUGIN_START] topflow-screen.txt -->\n'+txt+'\n<!-- [KANO_PLUGIN_END] topflow-screen.txt -->',bundledScript),'topflow-screen.txt','metadata and script id preserve exact ownership for uninstall');
  vm.runInNewContext(txt.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1], executed);
  assert.equal(executed.TopFlowPackagePayload.reviewOnly, false);
  assert(Buffer.from(executed.TopFlowPackagePayload.archiveBase64,'base64').equals(fs.readFileSync(path.join(__dirname,'../native/topflow-native.tar.gz'))));
  assert.equal(executed.TopFlowPackagePayload.screenctlSource,fs.readFileSync(path.join(__dirname,'../native/screenctl.sh'),'utf8'));
  for(const key of ['defaultViewOnly','aggregationUiFixCandidate','homeViewFollowsObservedAggregation','aggregationPageDefaultVisible','aggregationDeviceVerified','performanceFixCandidate','userConfirmedFunctionalRelease','devicePerformanceVerified','directSwitch','sensorAfterDrm','startupOrder','hardwareTested','adaptationFixCandidate','confirmedLockCause','retainedExistingTouchBackend','uprightOrientationMatched','factoryPinEnum','noPinStartup','noPinWake','pendingDeviceAcceptance'])assert.equal(executed.TopFlowPackagePayload[key],summary[key]);
  assert.deepEqual(JSON.parse(JSON.stringify(executed.TopFlowPackagePayload.nativePerformance)),summary.nativePerformance);
  const manifest=JSON.parse(pack.tarMembers(Buffer.from(executed.TopFlowPackagePayload.archiveBase64,'base64')).find(item=>item.name==='./build-manifest.json').content.toString('utf8'));
  assert.deepEqual(manifest.nativeBattery,summary.nativeBattery);assert.deepEqual(JSON.parse(JSON.stringify(executed.TopFlowPackagePayload.nativeBattery)),summary.nativeBattery);assert.deepEqual(manifest.nativePerformance,summary.nativePerformance);assert.equal(manifest.nativeChart.transitionFrames,4);assert.equal(manifest.nativeChart.transitionMilliseconds,180);
  assert.equal(summary.defaultViewOnly,false);assert.equal(summary.noPinWake,'hold-to-unlock-local');assert.equal(summary.nativeSoftLock.holdMilliseconds,1000);assert.equal(summary.nativeSoftLock.credential,false);assert.equal(summary.nativeBrightness.rampLevelsMaximum,3);assert.equal(summary.nativeBrightness.fixedDraftPercentStep,1);assert.equal(summary.nativeManualCell.readback,'exact-lock-config-not-camping');assert.equal(manifest.defaultViewOnly,false);assert.deepEqual(manifest.nativeControlAuthorization,summary.nativeControlAuthorization);assert.deepEqual(manifest.nativeSms,summary.nativeSms);assert.deepEqual(JSON.parse(JSON.stringify(executed.TopFlowPackagePayload.nativeControlAuthorization)),summary.nativeControlAuthorization);assert.deepEqual(JSON.parse(JSON.stringify(executed.TopFlowPackagePayload.nativeSms)),summary.nativeSms);assert.equal(summary.nativeControlAuthorization.manualEnableGate,false);assert.equal(summary.nativeSms.submitCountPerConfirmation,1);assert.equal(summary.nativeSms.automaticRetry,false);assert.deepEqual(manifest.nativeHomeNavigation,summary.nativeHomeNavigation);assert.deepEqual(JSON.parse(JSON.stringify(executed.TopFlowPackagePayload.nativeHomeNavigation)),summary.nativeHomeNavigation);assert(!manifest.nativeControls.includes('aggregation.set'));assert.equal(manifest.aggregationUiFixCandidate,true);assert.equal(manifest.homeViewFollowsObservedAggregation,true);assert.equal(manifest.aggregationPageDefaultVisible,false);assert.equal(manifest.aggregationDeviceVerified,false);assert.equal(manifest.performanceFixCandidate,true);assert.equal(manifest.userConfirmedFunctionalRelease,'0.1.5');assert.equal(manifest.devicePerformanceVerified,false);assert.deepEqual(manifest.performanceScope,['rendering','animation','scrolling']);
  assert.equal(manifest.version,'0.2.2');assert.equal(manifest.releaseReadiness,'DEVICE_ACCEPTANCE_PENDING');assert.equal(manifest.hardwareTested,false);
  assert.equal(manifest.displayCompatibility.sensorAfterDrm,true);assert.equal(manifest.displayCompatibility.startupOrder,'policy-drm-sensor-frame-lcd');assert.deepEqual(manifest.userReportedDisplayHandover,{version:'0.1.4',successful:true});assert.equal(manifest.confirmedFailureStage,undefined);assert.equal(manifest.displayCompatibility.directSwitch,true);assert.equal(manifest.displayCompatibility.receiptVersion,2);assert.equal(manifest.displayCompatibility.factoryAutosleepHandover,'explicit-wake-owned-transfer');
  assert.equal(summary.maxLineLength,Math.max(...txt.split('\n').map(line=>line.length)));
  assert(summary.maxLineLength<=4096);
});

test('release gate rejects incomplete local verification and review payload blocks installation and activation',async()=>{
  const gate={state:'device-acceptance-pending',code:'DEVICE_ACCEPTANCE_PENDING',hardwareVerified:false,localValidationPassed:true,localImplementationReviewed:true,adaptationFixCandidate:true,knownCriticalGapsResolved:false};
  assert.doesNotThrow(()=>pack.validateReleaseGate(gate,false));
  for(const invalid of [{...gate,state:'blocked'},{...gate,code:'FACTORY_SLEEP_SERVICE_NOT_EQUIVALENT'},{...gate,localValidationPassed:false},{...gate,localImplementationReviewed:false},{...gate,adaptationFixCandidate:false},{...gate,hardwareVerified:true}])assert.throws(()=>pack.validateReleaseGate(invalid,false),/PACKAGE_RELEASE_BLOCKED/);
  assert.doesNotThrow(()=>pack.validateReleaseGate({state:'blocked'},true));
  assert.throws(()=>pack.build(path.resolve(__dirname,'../dist'),{reviewOnly:true}),/Review output must not use dist/);
  const review={...fixture,reviewOnly:true};
  assert.throws(()=>plugin.buildInstallStart(owner,review),{code:'RELEASE_BLOCKED'});
  assert.throws(()=>plugin.buildInstallFinish(owner,review),{code:'RELEASE_BLOCKED'});
  assert.throws(()=>plugin.buildScreenCommand('start',review,true),{code:'RELEASE_BLOCKED'});
  await assert.rejects(plugin.uploadNative({},review),{code:'RELEASE_BLOCKED'});
  assert.match(plugin.buildScreenCommand('status',review),/TOPFLOW_SCREEN=/);
  assert.match(plugin.buildScreenCommand('restore',review,true),/set -- restore --confirmed/);
  assert.match(plugin.buildScreenCommand('uninstall',review,true),/set -- uninstall --confirmed/);
});

test('diagnostic candidate has a separate honest gate and cannot weaken the failed release gate',()=>{
  const failed={state:'device-test-failed',code:'DEVICE_TEST_FAILED_RENDERER_EXITED',hardwareVerified:false,knownCriticalGapsResolved:false,diagnosticCandidate:{enabled:true,sideEffectReadRemoved:true,localValidationPassed:true,unresolvedStartupFailure:true}};
  assert.throws(()=>pack.validateReleaseGate(failed,false),/PACKAGE_RELEASE_BLOCKED/);
  assert.doesNotThrow(()=>pack.validateReleaseGate(failed,false,true));
  for(const key of ['enabled','sideEffectReadRemoved','localValidationPassed','unresolvedStartupFailure'])assert.throws(()=>pack.validateReleaseGate({...failed,diagnosticCandidate:{...failed.diagnosticCandidate,[key]:false}},false,true),/DIAGNOSTIC_BUILD_BLOCKED/);
  assert.throws(()=>pack.validateReleaseGate({...failed,knownCriticalGapsResolved:true},false,true),/DIAGNOSTIC_BUILD_BLOCKED/);
  assert.throws(()=>pack.validateReleaseGate(failed,true,true),/Choose either/);
  const readme=pack.diagnosticReadme({version:'0.1.2',bytes:123,maxLineLength:1024,sha256:'a',nativeArchiveSha256:'b'},'topflow-screen-0.1.2-diagnostic.txt');
  assert.match(readme,/原退出根因仍未确定/);assert.match(readme,/移除旧TopFlow记录/);assert.match(readme,/40c3b519/);assert.match(readme,/不是预计完成时间/);
});

test('native archive inspection rejects symlinks before packaging', () => {
  const tar = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '../native/topflow-native.tar.gz')));
  tar[156] = '2'.charCodeAt(0);
  for (let i = 148; i < 156; i++) tar[i] = 32;
  let sum = 0; for (let i = 0; i < 512; i++) sum += tar[i];
  tar.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  assert.throws(() => pack.tarMembers(zlib.gzipSync(tar)), /Unsupported archive type/);
});

test('review packaging refuses stale native source, lifecycle scripts or UI even with valid archive checksums',()=>{
  const files={'topflow_main.c':Buffer.from('current main'), 'screenctl.sh':Buffer.from('current controller'), 'supervisor.sh':Buffer.from('current supervisor'), 'ui/index.html':Buffer.from('current UI')};
  for(const name of ['modem_logic.h','modem_pages.h','test-modem-ambr.c','test-modem-ambr.ps1','sim_source_logic.h','sim_source_runtime.h','test-modem-source.c','test-modem-source.ps1','test-wake-sensor.ps1','network_status.h','network_runtime.h','sms_ufi.h','test-network-status.ps1','test-network-runtime.ps1','test-dashboard-layout.cpp','test-dashboard-layout.ps1','cell_form.h','test-display-layout.cpp','test-display-layout.ps1','test-display-settings.ps1','soft_lock.h','test-soft-lock.ps1','test-pin.ps1','test-lock-layout.cpp','test-lock-layout.ps1','display_policy.h','display_native.h','test-auto-brightness.ps1','test-render-style.cpp','test-render-style.ps1','sms_submit.h','advanced_controls.h','form_logic.h','form_pages.h','test-controls.ps1','home_mode.h','test-home-mode.ps1','preview/generate-pages.js','battery_state.h','upstream/include/data.h','upstream/src/data.c','preview/render-battery.js','test-battery.ps1','test-chart.ps1','test-render-health.ps1','test-presentation.ps1','interaction.h','test-interaction.ps1','test-render-perf.cpp','test-render-perf.ps1','upstream/src/html_view.cpp','factory_bus.c','factory_bus_protocol.h','factory_bus_client.h','factory_bus_logic.h','factory_lifecycle.h','factory_guard.h','display_runtime.h','display_handover.h','display_idle_guard.h','native_failure.h','test-startup-diagnostics.ps1','test-display-preflight.ps1','test-display-runtime.ps1','test-sensor-handover.ps1','test-screen-geometry.ps1','test-main-lock.ps1','pin_policy.h','pin_native.h','pin_view.h','screen_geometry.h','upstream/include/devui_config.h','upstream/include/touch_input.h','upstream/src/touch_input.c','pinyin_logic.h','pinyin_data.h','form_pages.h'])files[name]=Buffer.from('current '+name);
  for(const name of ['radio_status.h','lockscreen_status.h','lockscreen_chart.h','test-lockscreen.c','test-lockscreen.ps1'])files[name]=Buffer.from('current '+name);
  const manifest={sourceSha256:Object.fromEntries(Object.keys(files).filter(name=>!name.startsWith('ui/')).map(name=>[name,crypto.createHash('sha256').update(files[name]).digest('hex')]))};
  const members=['screenctl.sh','supervisor.sh','ui/index.html'].map(name=>({name:'./'+name,type:'0',content:files[name]}));
  const read=name=>{assert(Object.hasOwn(files,name));return files[name];};
  assert.doesNotThrow(()=>pack.verifyNativeSources(manifest,members,read));
  for(const name of ['radio_status.h','lockscreen_status.h','lockscreen_chart.h','test-lockscreen.c','test-lockscreen.ps1']){
    const missing={...manifest,sourceSha256:{...manifest.sourceSha256}};delete missing.sourceSha256[name];
    assert.throws(()=>pack.verifyNativeSources(missing,members,read),/Missing native source hash/);
    assert.throws(()=>pack.verifyNativeSources({...manifest,sourceSha256:{...manifest.sourceSha256,[name]:'0'.repeat(64)}},members,read),/Stale native archive source/);
  }
  const missingSensorProof={...manifest,sourceSha256:{...manifest.sourceSha256}};delete missingSensorProof.sourceSha256['test-sensor-handover.ps1'];assert.throws(()=>pack.verifyNativeSources(missingSensorProof,members,read),/Missing native source hash: test-sensor-handover.ps1/);
  for(const name of ['modem_logic.h','modem_pages.h','test-modem-ambr.c','test-modem-ambr.ps1','sim_source_logic.h','sim_source_runtime.h','test-modem-source.c','test-modem-source.ps1','test-wake-sensor.ps1','network_status.h','network_runtime.h','sms_ufi.h','test-network-status.ps1','test-network-runtime.ps1','test-dashboard-layout.cpp','test-dashboard-layout.ps1','cell_form.h','test-display-layout.cpp','test-display-layout.ps1','test-display-settings.ps1','soft_lock.h','test-soft-lock.ps1','test-pin.ps1','test-lock-layout.cpp','test-lock-layout.ps1','display_policy.h','display_native.h','test-auto-brightness.ps1','test-render-style.cpp','test-render-style.ps1','sms_submit.h','advanced_controls.h','form_logic.h','form_pages.h','test-controls.ps1','home_mode.h','test-home-mode.ps1','preview/generate-pages.js','battery_state.h','upstream/include/data.h','upstream/src/data.c','preview/render-battery.js','test-battery.ps1','test-chart.ps1','test-render-health.ps1','test-presentation.ps1','interaction.h','test-interaction.ps1','test-render-perf.cpp','test-render-perf.ps1','upstream/src/html_view.cpp','screen_geometry.h','upstream/include/devui_config.h','upstream/include/touch_input.h','upstream/src/touch_input.c']){
    const missing={...manifest,sourceSha256:{...manifest.sourceSha256}};delete missing.sourceSha256[name];
    assert.throws(()=>pack.verifyNativeSources(missing,members,read),/Missing native source hash/);
    assert.throws(()=>pack.verifyNativeSources({...manifest,sourceSha256:{...manifest.sourceSha256,[name]:'0'.repeat(64)}},members,read),/Stale native archive source/);
  }
  assert.throws(()=>pack.verifyNativeSources({...manifest,sourceSha256:{...manifest.sourceSha256,'topflow_main.c':'0'.repeat(64)}},members,read),/Stale native archive source: topflow_main.c/);
  for(const name of ['screenctl.sh','supervisor.sh','ui/index.html']) {
    const stale=members.map(m=>m.name==='./'+name?{...m,content:Buffer.from('older archive bytes')}:m);
    assert.throws(()=>pack.verifyNativeSources(manifest,stale,read),/Stale native archive content/);
  }
  assert.throws(()=>pack.verifyNativeSources({...manifest,sourceSha256:{...manifest.sourceSha256,'../outside':'0'.repeat(64)}},members,read),/Invalid native source manifest/);
});

test('both native executables require exact checksums and the ARM64 architecture',()=>{
  const binary=Buffer.alloc(64);binary.write('7f454c46',0,'hex');binary[4]=2;binary[5]=1;binary.writeUInt16LE(183,18);
  const helper=Buffer.from(binary);helper[63]=1;
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  const manifest={binarySha256:hash(binary),factoryBusSha256:hash(helper)};
  const members=[{name:'./topflow-screen',type:'0',content:binary},{name:'./topflow-factory-bus-aarch64',type:'0',content:helper},{name:'./topflow-screen.sha256',type:'0',content:Buffer.from(hash(binary)+'  topflow-screen\n'+hash(helper)+'  topflow-factory-bus-aarch64\n')}];
  assert.deepEqual(pack.verifyNativeBinaries(manifest,members),{binaryHash:hash(binary),factoryBusHash:hash(helper)});
  assert.throws(()=>pack.verifyNativeBinaries({...manifest,factoryBusSha256:'0'.repeat(64)},members),/checksum mismatch: topflow-factory-bus/);
  assert.throws(()=>pack.verifyNativeBinaries(manifest,members.filter(m=>!m.name.endsWith('aarch64'))),/Missing binary/);
  const invalid=members.map(m=>m.name.endsWith('.sha256')?{...m,content:Buffer.from(hash(binary)+'  topflow-screen\n')}:m);
  assert.throws(()=>pack.verifyNativeBinaries(manifest,invalid),/Both native binaries/);
  helper.writeUInt16LE(62,18);manifest.factoryBusSha256=hash(helper);members[2].content=Buffer.from(hash(binary)+'  topflow-screen\n'+hash(helper)+'  topflow-factory-bus-aarch64\n');
  assert.throws(()=>pack.verifyNativeBinaries(manifest,members),/not AArch64/);
});


test('production validation rejects preview APIs and demo factories regardless of whether they are called',()=>{
  for(const bad of ['TopFlowUI', 'TopflowDeviceAPI', 'TopFlowAoyou', 'demoSnapshot', 'setSnapshot', 'TF_FIXTURES', 'createMockTransport'])assert.throws(()=>pack.validateProductionScript('/* '+bad+' */'),/preview\/demo/);
  assert.doesNotThrow(()=>pack.validateProductionScript(require('../tools/production-manager.cjs').managerOnly(fs.readFileSync(path.join(__dirname,'../src/ufi-plugin.js'),'utf8'))));
});


test('native package must explicitly declare real data and CLOCK_MONOTONIC heartbeat',()=>{
 const valid={liveDeviceDataOnly:true,includesPreviewFixtures:false,heartbeatClock:'CLOCK_MONOTONIC',displayCompatibility:{ubusPath:'/bin/ubus',internalLockSnapshot:'two-stable-complete-reads',factoryAutosleepHandover:'explicit-wake-owned-transfer',directSwitch:true,receiptVersion:2,sensorAfterDrm:true,startupOrder:'policy-drm-sensor-frame-lcd',factoryBinarySha256:'781e3c6ffa2a9db4d61a3cf1bb38461131dc3faed07499a2c9360bc582040dd2',postDisplayOffIdleSeconds:180,pinFactoryEnum:'0-enabled-1-disabled',noPinStartup:'hold-to-unlock-local',noPinWake:'hold-to-unlock-local'}};
 assert.doesNotThrow(()=>pack.verifyNativeLiveContract(valid));
 for(const key of Object.keys(valid.displayCompatibility)){
   const display={...valid.displayCompatibility};delete display[key];
   assert.throws(()=>pack.verifyNativeLiveContract({...valid,displayCompatibility:display}),/compatibility fixes/);
 }
 for(const display of [undefined,{...valid.displayCompatibility,ubusPath:'/sbin/ubus'},{...valid.displayCompatibility,factoryAutosleepHandover:'wait-for-natural-release'},{...valid.displayCompatibility,directSwitch:false},{...valid.displayCompatibility,receiptVersion:1},{...valid.displayCompatibility,factoryBinarySha256:'0'.repeat(64)},{...valid.displayCompatibility,postDisplayOffIdleSeconds:0},{...valid.displayCompatibility,sensorAfterDrm:false},{...valid.displayCompatibility,startupOrder:'policy-sensor-drm-frame-lcd'},{...valid.displayCompatibility,pinFactoryEnum:'1-enabled-0-disabled'},{...valid.displayCompatibility,noPinStartup:'initial-300s-wait'},{...valid.displayCompatibility,noPinWake:'content-without-lock'}])assert.throws(()=>pack.verifyNativeLiveContract({...valid,displayCompatibility:display}),/compatibility fixes/);
 for(const invalid of [{...valid,liveDeviceDataOnly:false},{...valid,includesPreviewFixtures:true},{...valid,heartbeatClock:'CLOCK_REALTIME'},{}])assert.throws(()=>pack.verifyNativeLiveContract(invalid),/live-only/);
});

test('native readiness distinguishes previous user-reported handover from current unverified adaptation',()=>{
 const valid={version:'0.2.2',defaultViewOnly:false,target:'aarch64-linux-musl',hardwareTested:false,releaseReadiness:'DEVICE_ACCEPTANCE_PENDING',factoryLifecycleProtocol:1,nativeFailureProtocol:1,sideEffectfulDebugfsReadRemoved:true,adaptationFixCandidate:true,aggregationUiFixCandidate:true,homeViewFollowsObservedAggregation:true,aggregationPageDefaultVisible:false,aggregationDeviceVerified:false,performanceFixCandidate:true,userConfirmedFunctionalRelease:'0.1.5',devicePerformanceVerified:false,userReportedDisplayHandover:{version:'0.1.4',successful:true},pendingDeviceAcceptance:true};
 valid.nativeAmbr={targets:['5G','4G1','4G2'],source:'per-modem-qos',uplink:'ambr_ul',downlink:'ambr_dl',unit:'Mbps',displayOrder:['tx_speed','rx_speed','qci','ambr_ul','ambr_dl'],crossModemFallback:false,additionalDeviceRequests:0,meaning:'network-last-reported-limit',hardwareTested:false};
 valid.nativeSms={endpoint:'http://127.0.0.1:2333/api/goform/goform_set_cmd_process',action:'SEND_SMS',sender:'host',encoding:'UTF16BE-hex',authorization:'existing-UFI-session-with-AD',confirmedResult:'UFI-result-success',submitCountPerConfirmation:1,automaticRetry:false,deviceSendVerified:false};
 valid.nativeNetwork={aggregationStatus:'source-aware-plus-owned-factory-tcp-observation',quota:'aggregation.traffic.remaining_bytes',today:'aggregation.traffic.today_used_bytes',ethernet:'kernel-carrier-and-negotiated-speed',carriers:'official-nrca-lteca-and-primary',noActiveProbe:true,deviceAggregationVerified:false};
 valid.nativeSimSource={targets:['5G','4G1','4G2'],sources:['removable','builtin'],rawSource:'0-removable-1-builtin',primary:'sim_switch_slot',external:'sub_modem_switch_slot',externalModemNumbers:{'4G1':1,'4G2':0},readback:'raw-st_slot',refresh:'on-demand',requiresKnownSource:false,selection:"explicit-absolute-target",presenceRequired:false,unknownReadback:"unconfirmed",externalMustBeEnabled:true,automaticRetry:false,deviceSwitchVerified:false};
 assert.doesNotThrow(()=>pack.verifyNativeReleaseContract(valid));
 for(const key of Object.keys(valid.nativeAmbr)){const ambr={...valid.nativeAmbr};delete ambr[key];assert.throws(()=>pack.verifyNativeReleaseContract({...valid,nativeAmbr:ambr}),/AMBR/);}
 for(const key of Object.keys(valid.nativeSms)){const sms={...valid.nativeSms};delete sms[key];assert.throws(()=>pack.verifyNativeReleaseContract({...valid,nativeSms:sms}),/UFI SMS/);}
 for(const key of Object.keys(valid.nativeNetwork)){const network={...valid.nativeNetwork};delete network[key];assert.throws(()=>pack.verifyNativeReleaseContract({...valid,nativeNetwork:network}),/network observations/);}
 for(const key of Object.keys(valid.nativeSimSource)){const sim={...valid.nativeSimSource};delete sim[key];assert.throws(()=>pack.verifyNativeReleaseContract({...valid,nativeSimSource:sim}),/SIM source/);}
 for(const [key,value] of [['version','0.1.4'],['defaultViewOnly',true],['target','x86_64-linux'],['hardwareTested',true],['releaseReadiness','DIAGNOSTIC_CANDIDATE'],['factoryLifecycleProtocol',0],['nativeFailureProtocol',0],['sideEffectfulDebugfsReadRemoved',false],['adaptationFixCandidate',false],['performanceFixCandidate',false],['aggregationUiFixCandidate',false],['homeViewFollowsObservedAggregation',false],['aggregationPageDefaultVisible',true],['aggregationDeviceVerified',true],['userConfirmedFunctionalRelease','0.1.4'],['devicePerformanceVerified',true],['userReportedDisplayHandover',{version:'0.1.6',successful:true}],['userReportedDisplayHandover',{version:'0.1.4',successful:false}],['pendingDeviceAcceptance',false]])assert.throws(()=>pack.verifyNativeReleaseContract({...valid,[key]:value}));
 for(const key of Object.keys(valid)){const missing={...valid};delete missing[key];assert.throws(()=>pack.verifyNativeReleaseContract(missing));}
 for(const key of ['unresolvedStartupFailure','startupFailureFixCandidate','startupRootCauseConfirmed','confirmedFailureStage'])assert.throws(()=>pack.verifyNativeReleaseContract({...valid,[key]:true}),/Stale startup-failure/);
 const historical={version:'0.1.2',target:'aarch64-linux-musl',hardwareTested:false,releaseReadiness:'DIAGNOSTIC_CANDIDATE',factoryLifecycleProtocol:1,nativeFailureProtocol:1,sideEffectfulDebugfsReadRemoved:true,unresolvedStartupFailure:true};
 assert.doesNotThrow(()=>pack.verifyNativeReleaseContract(historical,{diagnosticCandidate:true}));
 assert.throws(()=>pack.verifyNativeReleaseContract(historical));
});

test('current install instructions describe direct switching and exact old-version migration without claiming hardware success',()=>{
 const summary={version:'0.2.2',bytes:100,maxLineLength:1024,sha256:'a',nativeArchiveSha256:'b'};
 const text=pack.releaseReadme(summary,'topflow-screen-0.2.2.txt');
 assert(text.split('\n').length<44);assert.match(text,/更新0\.1\.0至0\.2\.1已核验版本/);assert.match(text,/直接点亮插件屏幕/);assert.match(text,/保留原厂PIN锁屏/);
 assert.match(text,/用户已确认 0\.2\.1 实机验收/);assert.match(text,/现固定三个主页面：首页、网络、功能/);assert.match(text,/普通\/聚合共用一个首页位置/);assert.match(text,/未启用、未知或过期时显示普通页/);assert.match(text,/已启用但离线仍显示聚合页/);assert.match(text,/取消手动模式选择和聚合开关/);assert.match(text,/不新增GPIO读取/);assert.match(text,/保留0\.1\.6跟手拖动/);assert.match(text,/跟随手指/);assert.match(text,/144毫秒目标/);assert.match(text,/顶部状态和返回栏固定/);assert.match(text,/缓存仅在进程内存/);assert.match(text,/不会按电量百分比猜测是否充电/);assert.match(text,/本地长按解锁页/);assert.match(text,/亮度可选固定或自适应/);assert.match(text,/手动LTE\/NR锁小区/);assert.match(text,/未支持能力见 项目文档/);assert.match(text,/接管并解锁后默认可操作/);assert.match(text,/每次修改和短信发送仍需确认/);assert.match(text,/一次确认只提交一次/);assert.doesNotMatch(text,/业务写操作默认关闭/);assert.match(text,/上限384KiB、最多512项/);assert.match(text,/保留 0\.1\.5 显示方向/);assert.match(text,/保留原厂切换、休眠和PIN保护/);assert.match(text,/0\.2\.2 管理页与移除旧接入已在电脑验证，本轮未新增实机测试/);assert.doesNotMatch(text,/无法触摸|触摸失效|Type B|ADOPT_SENSOR_STATE/);assert.match(text,/未知或被改动版本拒绝迁移/);assert.match(text,/hardwareTested=false/);
 assert.doesNotMatch(text,/360|最长6分钟|等待6分钟|此默认门槛仍阻断/);assert.match(text,/点击“提交”保存/);assert.doesNotMatch(text,/再点击“保存”/);
 assert.match(pack.releaseReadme({...summary,reviewOnly:true},'topflow-screen.UNVERIFIED.html'),/安装和启动已禁用/);
});


test('payload source uses bounded lines without changing archive bytes or recovery script',()=>{
 const input={...fixture,archiveBase64:Buffer.alloc(1105316,173).toString('base64'),screenctlSource:'#!/bin/sh\n'+"printf 'quote \\\" and slash \\\\';\n".repeat(800)};
 const code=pack.emitPayload(input);const context={};vm.createContext(context);vm.runInContext(code,context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.TopFlowPackagePayload)),input);
 assert(Buffer.from(context.TopFlowPackagePayload.archiveBase64,'base64').equals(Buffer.from(input.archiveBase64,'base64')));
 assert(Math.max(...code.split('\n').map(line=>line.length))<2048);
 assert.doesNotMatch(code,/<\/script/i);
});

test('boot package covers every byte with checksums and declares disabled-by-default bounded startup',()=>{
 const members=pack.tarMembers(fs.readFileSync(path.join(__dirname,'../native/topflow-native.tar.gz')));
 const manifest=JSON.parse(members.find(x=>x.name==='./build-manifest.json').content);
 assert.equal(pack.verifyBootIntegrity(manifest,members),true);
 for(const name of ['./screenctl.sh','./boot-hook.sh','./ui/index.html','./topflow-screen']) {
  const changed=members.map(m=>m.name===name?{...m,content:Buffer.concat([m.content,Buffer.from('x')])}:m);
  assert.throws(()=>pack.verifyBootIntegrity(manifest,changed),/integrity/);
 }
 assert.throws(()=>pack.verifyBootIntegrity(manifest,members.filter(m=>m.name!=='./boot-hook.sh')),/integrity/);
 for(const patch of [{defaultEnabled:true},{hook:'/etc/rc.local'},{attemptsPerBoot:2},{retry:true},{deviceBootVerified:true}])assert.throws(()=>pack.verifyBootIntegrity({...manifest,nativeAutostart:{...manifest.nativeAutostart,...patch}},members),/autostart contract/);
});
