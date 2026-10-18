'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const VERSION = '0.2.11';
const FACTORY_BINARY_SHA256 = '781e3c6ffa2a9db4d61a3cf1bb38461131dc3faed07499a2c9360bc582040dd2';
const { managerOnly } = require('./production-manager.cjs');
const SOURCES = ['manager-theme.js', 'manager-confirm.js', 'manager-wallpaper.js', 'manager-wallpaper-ui.js', 'manager-wallpaper-migration.js', 'ufi-plugin.js'];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function tarMembers(archive) {
  const tar = zlib.gunzipSync(archive, { maxOutputLength: 24 * 1024 * 1024 });
  const members = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(value => value === 0)) break;
    const str = (start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0];
    const type = str(156, 1) || '0';
    const rawSize = str(124, 12).trim();
    if (!/^[0-7]+$/.test(rawSize)) throw Error('Invalid tar size');
    const size = parseInt(rawSize, 8);
    const name = (str(345, 155) ? str(345, 155) + '/' : '') + str(0, 100);
    const expected = parseInt(str(148, 8).trim(), 8);
    let checksum = 0; for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== expected) throw Error('Invalid tar header checksum');
    if (!['0', '5'].includes(type)) throw Error('Unsupported archive type (links/PAX refused): ' + name);
    if (!/^[A-Za-z0-9._/-]+\/?$/.test(name) || name.startsWith('/') || name.split('/').includes('..') || name.includes('.payload') || name.includes('.install-owner')) throw Error('Unsafe archive path');
    if (offset + 512 + size > tar.length) throw Error('Truncated tar member');
    if (members.some(member => member.name === name)) throw Error('Duplicate tar member');
    members.push({ name, type, size, content: tar.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const member of members) if (/\.so(?:\.|$)|(?:^|\/)build-bus-import(?:\/|$)|(?:^|\/)(?:analysis|fixtures?|mocks?|demos?)(?:[./-]|$)/i.test(member.name)) throw Error('Device libraries or build-only import stubs must not be deployed');
  for (const required of ['./topflow-screen', './topflow-factory-bus-aarch64', './screenctl.sh', './supervisor.sh', './topflow-screen.sha256', './ui/index.html', './build-manifest.json']) if (!members.some(member => member.name === required && member.type === '0')) throw Error('Missing required native member: ' + required);
  return members;
}

function verifyNativeSources(manifest, members, readSource = name => fs.readFileSync(path.join(ROOT, 'native', name))) {
  const hashes = manifest.sourceSha256;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) throw Error('Missing native source hashes');
  for(const name of ['lock_wallpaper.h','key_press.h','power_menu.h','upstream/include/key_input.h','upstream/src/key_input.c'])if(!Object.hasOwn(hashes,name))throw Error('Missing power-key native source hash: '+name);
  for(const name of ['factory_power_state.h','test-factory-power.ps1','test-device-power-events.ps1','test-factory-bus.ps1','test-sleep-provider-recovery.ps1','test-wake-resume.ps1'])if(!Object.hasOwn(hashes,name))throw Error('Missing factory-power native source hash: '+name);
  for(const name of ['sms_session_restore.h','sms_session_pages.h'])if(!Object.hasOwn(hashes,name))throw Error('Missing SMS session native source hash: '+name);
  for(const name of ['wifi_state.h','wifi_state_runtime.h','page_state_sync.h','band_state_sync.h','display_pages.h','test-display-external-sync.ps1','radio_status.h','lockscreen_status.h','lockscreen_chart.h','test-lockscreen.c','test-lockscreen.ps1'])if(!Object.hasOwn(hashes,name))throw Error('Missing native source hash: '+name);
  for(const name of ['modem_logic.h','modem_pages.h','test-modem-ambr.c','test-modem-ambr.ps1'])if(!Object.hasOwn(hashes,name))throw Error('Missing native source hash: '+name);
  if(!Object.hasOwn(hashes,'test-wake-sensor.ps1'))throw Error('Missing native source hash: test-wake-sensor.ps1');
  for(const name of ['sim_source_logic.h','sim_source_runtime.h','test-modem-source.c','test-modem-source.ps1'])if(!Object.hasOwn(hashes,name))throw Error('Missing native source hash: '+name);
  for (const required of ['network_status.h','network_runtime.h','sms_ufi.h','test-network-status.ps1','test-network-runtime.ps1','test-dashboard-layout.cpp','test-dashboard-layout.ps1','cell_form.h','test-display-layout.cpp','test-display-layout.ps1','test-display-settings.ps1','soft_lock.h','test-soft-lock.ps1','test-pin.ps1','test-lock-layout.cpp','test-lock-layout.ps1','display_policy.h','display_native.h','test-auto-brightness.ps1','test-render-style.cpp','test-render-style.ps1','sms_submit.h','advanced_controls.h','form_logic.h','form_pages.h','test-controls.ps1','home_mode.h','test-home-mode.ps1','preview/generate-pages.js']) if (!Object.hasOwn(hashes, required)) throw Error('Missing native source hash: ' + required);
  for (const required of ['interaction.h','test-interaction.ps1','test-render-perf.cpp','test-render-perf.ps1','upstream/src/html_view.cpp']) if (!Object.hasOwn(hashes, required)) throw Error('Missing native source hash: ' + required);
  for (const required of ['battery_state.h','upstream/include/data.h','upstream/src/data.c','preview/render-battery.js','test-battery.ps1','test-chart.ps1','test-render-health.ps1','test-presentation.ps1']) if (!Object.hasOwn(hashes, required)) throw Error('Missing native source hash: ' + required);
  for (const required of ['topflow_main.c', 'screenctl.sh', 'supervisor.sh','factory_bus.c','factory_bus_protocol.h','factory_bus_client.h','factory_bus_logic.h','factory_lifecycle.h','factory_guard.h','display_runtime.h','display_handover.h','display_idle_guard.h','native_failure.h','test-startup-diagnostics.ps1','test-display-preflight.ps1','test-display-runtime.ps1','test-sensor-handover.ps1','test-screen-geometry.ps1','test-main-lock.ps1','pin_policy.h','pin_native.h','pin_view.h','screen_geometry.h','upstream/include/devui_config.h','upstream/include/touch_input.h','upstream/src/touch_input.c','pinyin_logic.h','pinyin_data.h','form_pages.h']) if (!Object.hasOwn(hashes, required)) throw Error('Missing native source hash: ' + required);
  for (const [name, expected] of Object.entries(hashes)) {
    if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Invalid native source manifest entry');
    if (sha256(readSource(name)) !== expected) throw Error('Stale native archive source: ' + name);
  }
  for (const member of members) {
    if (member.type === '0' && (['./screenctl.sh', './supervisor.sh', './boot-hook.sh'].includes(member.name) || member.name.startsWith('./ui/'))) {
      if (!member.content.equals(Buffer.from(readSource(member.name.slice(2))))) throw Error('Stale native archive content: ' + member.name);
    }
  }
}

function verifyNativeBinaries(manifest,members){
  const get=name=>{const member=members.find(item=>item.name==='./'+name&&item.type==='0');if(!member)throw Error('Missing binary/checksum member: '+name);return member.content;};
  const sums=get('topflow-screen.sha256').toString('utf8').trim().split(/\r?\n/);
  const expected=[['topflow-screen','binarySha256'],['topflow-factory-bus-aarch64','factoryBusSha256']];
  if(sums.length!==2)throw Error('Both native binaries must have exact checksum entries');
  for(const [name,key] of expected){
    const binary=get(name),hash=sha256(binary);
    if(hash!==manifest[key]||sums.filter(line=>line===hash+'  '+name).length!==1)throw Error('Native binary checksum mismatch: '+name);
    if(binary.length<64||binary.subarray(0,4).toString('hex')!=='7f454c46'||binary[4]!==2||binary[5]!==1||binary.readUInt16LE(18)!==183)throw Error('Native binary is not AArch64 ELF64: '+name);
  }
  return {binaryHash:manifest.binarySha256,factoryBusHash:manifest.factoryBusSha256};
}

function verifyNativeRootProofs(manifest, readSource = name => fs.readFileSync(path.join(ROOT, name))) {
  const required = ['native/test-device-power-events.ps1', 'native/test-factory-bus.ps1', 'native/test-sleep-provider-recovery.ps1', 'native/test-wake-resume.ps1', 'tests/manager-wallpaper-migration-audit.test.js', 'tests/manager-wallpaper-migration.test.js', 'tests/native-band-state-sync.test.js', 'tests/native-page-state-sync.test.js', 'tests/native-power-key.test.js', 'tests/native-power-menu.test.js', 'tests/native-power-transport.test.js', 'tests/native-extra.test.js', 'tests/native-sms-ufi.test.js', 'tests/native-sms-session-restore.test.js', 'tests/native-sms-session-ui.test.js', 'tests/native-ufi.test.js', 'tests/native-wallpaper-files.test.js', 'tests/native-wallpaper.test.js', 'tests/native-wifi-integration.test.js', 'tests/native-wifi-state.test.js'].sort();
  const hashes = manifest.rootProofSha256;
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) throw Error('Missing root native proof hashes');
  if (JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(required)) throw Error('Invalid root native proof paths');
  for (const name of required) {
    if (!/^[a-f0-9]{64}$/.test(hashes[name])) throw Error('Invalid root native proof hash: ' + name);
    if (sha256(readSource(name)) !== hashes[name]) throw Error('Stale root native proof: ' + name);
  }
}

function emitPayload(payload) {
  // UFI opens TXT content in a normal textarea. Avoid one megabyte-long line;
  // decoding these bounded chunks yields the exact original bytes and source.
  const metadata = { ...payload };
  delete metadata.archiveBase64; delete metadata.screenctlSource;
  let code = 'globalThis.TopFlowPackagePayload={};\n';
  for (const [key,value] of Object.entries(metadata)) code += 'globalThis.TopFlowPackagePayload[' + JSON.stringify(key) + ']=' + JSON.stringify(value) + ';\n';
  for (const name of ['archiveBase64','screenctlSource']) {
    if (typeof payload[name] !== 'string') throw Error('Payload string missing: ' + name);
    const parts = []; for (let at=0;at<payload[name].length;at+=1024) parts.push(JSON.stringify(payload[name].slice(at,at+1024)));
    code += 'globalThis.TopFlowPackagePayload.' + name + '=[\n' + parts.join(',\n') + '\n].join("");\n';
  }
  return code;
}
function verifyBootIntegrity(manifest, members) {
  const boot = manifest.nativeAutostart;
  if (!boot || boot.defaultEnabled !== false || boot.hook !== '/data/plugins/ufi_tools_boot.sh' || boot.readinessSecondsMaximum !== 120 || boot.attemptsPerBoot !== 1 || boot.retry !== false || boot.deviceBootVerified !== false || boot.systemStartupFilesModified !== false) throw Error('Invalid native autostart contract');
  const sum = members.find(item => item.name === './boot-integrity.sha256' && item.type === '0');
  if (!sum || !members.some(item => item.name === './boot-hook.sh' && item.type === '0')) throw Error('Missing boot integrity/helper');
  const expected = members.filter(item => item.type === '0' && item !== sum).map(item => sha256(item.content) + '  ' + item.name.slice(2)).sort();
  const actual = sum.content.toString('utf8').trim().split('\n').sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Boot integrity must cover every packaged file exactly');
  return true;
}
function verifyNativeLiveContract(manifest) {
  if (manifest.liveDeviceDataOnly !== true || manifest.includesPreviewFixtures !== false || manifest.heartbeatClock !== 'CLOCK_MONOTONIC') throw Error('Native runtime must declare live-only data and the monotonic heartbeat protocol');
  const display=manifest.displayCompatibility;
  if(!display || display.ubusPath!=='/bin/ubus' || display.internalLockSnapshot!=='two-stable-complete-reads' || display.factoryAutosleepHandover!=='explicit-wake-owned-transfer' || display.directSwitch!==true || display.receiptVersion!==2 || display.factoryBinarySha256!==FACTORY_BINARY_SHA256 || display.postDisplayOffIdleSeconds!==180 || display.sensorAfterDrm!==true || display.startupOrder!=='policy-drm-sensor-frame-lcd' || display.pinFactoryEnum!=='0-enabled-1-disabled' || display.noPinStartup!=='hold-to-unlock-local' || display.noPinWake!=='hold-to-unlock-local') throw Error('Native display compatibility fixes are absent or stale');
}
function verifyNativeReleaseContract(manifest, {reviewOnly=false,diagnosticCandidate=false}={}) {
  if(manifest.hardwareTested!==false || manifest.target!=='aarch64-linux-musl')throw Error('Native build must declare its untested hardware status and target');
  if(reviewOnly)return;
  if(!diagnosticCandidate && manifest.defaultViewOnly!==false)throw Error('Native UI must enable confirmed controls after adoption and unlock without a manual enable gate');
  if(manifest.releaseReadiness!==(diagnosticCandidate?'DIAGNOSTIC_CANDIDATE':'DEVICE_ACCEPTANCE_PENDING') || manifest.factoryLifecycleProtocol!==1)throw Error('Native lifecycle protocol review is incomplete');
  if(manifest.sideEffectfulDebugfsReadRemoved!==true || manifest.nativeFailureProtocol!==1)throw Error('Native startup diagnostic contract is incomplete');
  if(diagnosticCandidate && manifest.unresolvedStartupFailure!==true)throw Error('Historical diagnostic candidate must retain its unresolved startup status');
  if(!diagnosticCandidate && (manifest.adaptationFixCandidate!==true || manifest.pendingDeviceAcceptance!==true))throw Error('Native adaptation candidate acceptance markers are incomplete');
  if(!diagnosticCandidate && (manifest.performanceFixCandidate!==true || manifest.userConfirmedFunctionalRelease!=='0.1.5' || manifest.devicePerformanceVerified!==false))throw Error('Native performance candidate must distinguish the user-confirmed previous functional release from current unverified performance');
  if(!diagnosticCandidate && (manifest.aggregationUiFixCandidate!==true || manifest.homeViewFollowsObservedAggregation!==true || manifest.aggregationPageDefaultVisible!==false || manifest.aggregationDeviceVerified!==false))throw Error('Native aggregation navigation candidate must follow observed device mode and retain unverified device status');
  if(!diagnosticCandidate && (!manifest.userReportedDisplayHandover || manifest.userReportedDisplayHandover.version!=='0.1.4' || manifest.userReportedDisplayHandover.successful!==true))throw Error('Native adaptation candidate must distinguish previous user-reported display handover from current hardware verification');
  if(!diagnosticCandidate && ['unresolvedStartupFailure','startupFailureFixCandidate','startupRootCauseConfirmed','confirmedFailureStage'].some(key=>Object.hasOwn(manifest,key)))throw Error('Stale startup-failure markers must not describe the current adaptation candidate');
  if(!diagnosticCandidate && manifest.version!==VERSION)throw Error('Native package version does not match the current release');
  if(!diagnosticCandidate){
    const power=manifest.nativeFactoryPower;
    if(!power||power.eventSource!=="zwrt_device_power_state_event"||power.sourcePriority!=="event-before-raw"||power.preflight!=="effective-uci-read"||power.offEventLatch!=="until-mc-on"||power.darkReadbackMilliseconds!==1000||power.darkCorrection!=="only-if-observed-bright"||power.quickenAck!=="quickening-event-only-dark-confirmed"||power.quickenAckMethod!=="poweroff_quicken_compelte"||power.quickenAckResetFlag!==0||power.quickenAckPerEvent!==1||power.quickenAckPerCycle!==1||power.normalAck!=="oem-off-reboot-dark-confirmed"||power.normalAckMethod!=="poweroff_compelte"||power.normalAckPerCycle!==1||power.rebootEvent!=="zwrt_mode_lcd_reboot"||power.resetAck!==false||power.subscribesShutdownParticipant!==false||power.source!=='/etc/config/zwrt_zte_mc_tmp'||power.section!=='mode'||power.field!=='mode_main_state'||power.off!=='mode_power_off*'||JSON.stringify(power.on)!=='["mode_power_on","mode_power_on_charger"]'||power.settingIsPowerState!==false||power.unknownAfterOff!=='remain-dark'||power.inputDuringOff!=='discard'||power.writesFactoryMode!==false||power.completionResult!=="confirmed-unknown-stale"||power.completionUnknown!=="remain-dark-no-replay"||power.lateCompletion!=="exact-sequence-once-bounded4"||power.completionLookup!=="readonly-short-lived-child"||power.completionLookupMilliseconds!==500||power.completionRpcMilliseconds!==1500||power.additionalResidentProcesses!==0||power.concurrentLookupChildrenMaximum!==1||power.sleepProviderRemoval!=="explicit-mc-off-only"||power.sleepProviderRecoveryMilliseconds!==3000||power.sleepProviderLookupMilliseconds!==500||power.sleepProviderSubscribeMilliseconds!==1000||power.sleepProviderOffPolling!==false||power.sleepProviderResume!=="mc-on-and-provider-ready"||power.hardwareTested!==false)throw Error('Native factory-power contract is absent or stale');
    const wallpaper=manifest.nativeLockWallpaper;
    if(!wallpaper||wallpaper.format!=='TFWP5651'||wallpaper.width!==320||wallpaper.height!==480||wallpaper.fileBytes!==307216||wallpaper.pixelFormat!=='RGB565_LE'||wallpaper.path!=='/data/plugins/topflow-screen/lock-wallpaper.rgb565'||wallpaper.refresh!=='lock-entry'||wallpaper.bufferBytes!==307200||wallpaper.noBackgroundPolling!==true||wallpaper.fallback!=='default'||wallpaper.factoryFilesUntouched!==true||wallpaper.uninstallRemovesCustomWallpaper!==true||wallpaper.staging!=='.lock-wallpaper.upload'||wallpaper.receipt!=='.lock-wallpaper.pending'||wallpaper.chunk!=='.lock-wallpaper.chunk'||wallpaper.transport!=='run-shell-locked-chunks'||wallpaper.chunkBytesMaximum!==24576||wallpaper.transaction!=='sha256-nonce32-current-boot-id-offset'||wallpaper.commit!=='same-directory-atomic-rename'||JSON.stringify(wallpaper.checks)!=='["root-owner","regular-file","no-symlink","single-hardlink","size","header","sha256"]'||wallpaper.unknownUpload!=='retain-old-image-explicit-abort-no-retry'||wallpaper.uninstallPending!=='remove-owned-pending-under-lifecycle-lock'||wallpaper.recovery!=='nonce-and-current-boot-guarded-explicit-abort'||wallpaper.stalePixels!=='never-commit-after-boot-change'||wallpaper.hardwareTested!==false)throw Error('Native lock wallpaper contract is absent or stale');
    const key=manifest.nativePowerKey;
    if(!key||key.thresholdMilliseconds!==1200||key.longPress!=='power-menu-overlay'||key.alreadyAwake!=='preserve-unlocked-state'||key.asleep!=='existing-wake-before-menu'||key.locked!=='menu-visible-actions-disabled'||key.authorization!=='control_guard'||JSON.stringify(key.actions)!=='["device.poweroff","device.reboot"]'||key.capabilityEndpoint!=='http://127.0.0.1:9460/capabilities'||key.controlEndpoint!=='http://127.0.0.1:9460/control'||key.confirmation!=='second-confirmation-and-capability-recheck'||key.submissionsPerConfirmation!==1||key.timeoutMilliseconds!==10000||key.outcome!=="transport-progress-without-retry"||key.completeResponse!=="framed-response-before-eof"||key.automaticRetry!==false||key.cancel!=='restore-page-and-scroll'||key.invalidateOldPending!==true||JSON.stringify(key.clearOn)!=='["sleep","resync"]'||key.hardwareTested!==false)throw Error('Native power-key menu contract is absent or stale');
    const ambr=manifest.nativeAmbr;
    if(!ambr||JSON.stringify(ambr.targets)!=='["5G","4G1","4G2"]'||ambr.source!=='per-modem-qos'||ambr.uplink!=='ambr_ul'||ambr.downlink!=='ambr_dl'||ambr.unit!=='Mbps'||JSON.stringify(ambr.displayOrder)!=='["tx_speed","rx_speed","qci","ambr_ul","ambr_dl"]'||ambr.crossModemFallback!==false||ambr.additionalDeviceRequests!==0||ambr.meaning!=='network-last-reported-limit'||ambr.hardwareTested!==false)throw Error('Native AMBR display contract is absent or stale');
    const sms=manifest.nativeSms,network=manifest.nativeNetwork;
    if(!sms||sms.endpoint!=='http://127.0.0.1:2333/api/goform/goform_set_cmd_process'||sms.action!=='SEND_SMS'||sms.authorization!=='existing-UFI-session-with-AD'||sms.sessionRestore!=='explicit-UFI-LD-LOGIN'||sms.sessionRestorePassword!=='memory-only-wiped'||sms.sessionRestoreMaxPerMinute!==3||sms.sessionRestoreResend!==false||sms.sessionRestoreCookiePersist!==false||sms.confirmedResult!=='UFI-result-success'||sms.sender!=='host'||sms.encoding!=='UTF16BE-hex'||sms.submitCountPerConfirmation!==1||sms.automaticRetry!==false||sms.deviceSendVerified!==false)throw Error('Native UFI SMS contract is absent or stale');
    if(!network||network.aggregationStatus!=='source-aware-plus-owned-factory-tcp-observation'||network.quota!=='aggregation.traffic.remaining_bytes'||network.today!=='aggregation.traffic.today_used_bytes'||network.ethernet!=='kernel-carrier-and-negotiated-speed'||network.carriers!=='official-nrca-lteca-and-primary'||network.noActiveProbe!==true||network.deviceAggregationVerified!==false)throw Error('Native network observations contract is absent or stale');
    const sim=manifest.nativeSimSource;
    if(!sim||JSON.stringify(sim.targets)!=='["5G","4G1","4G2"]'||JSON.stringify(sim.sources)!=='["removable","builtin"]'||sim.rawSource!=='0-removable-1-builtin'||sim.primary!=='sim_switch_slot'||sim.external!=='sub_modem_switch_slot'||sim.externalModemNumbers?.['4G1']!==1||sim.externalModemNumbers?.['4G2']!==0||sim.readback!=='raw-st_slot'||sim.refresh!=='on-demand-and-active-page'||sim.requiresKnownSource!==false||sim.selection!=="explicit-absolute-target"||sim.presenceRequired!==false||sim.unknownReadback!=="unconfirmed"||sim.externalMustBeEnabled!==true||sim.automaticRetry!==false||sim.deviceSwitchVerified!==false)throw Error('Native SIM source contract is absent or stale');
  }
}
function validateProductionScript(script) {
  if (/plugin\.shaneyun\.com|UFIPluginTelemetry|TopFlowScreenTelemetrySDK|TopFlowPluginCenter|device-sdk|telemetry\/|api\/public\/plugins/.test(script)) throw Error('Removed store or telemetry integration found in production bundle');
  if (/NON_PRODUCTION_PASSWORD_SENTINEL|TF_FIXTURES|aoyou-status-summary|installed-plugins|BEGIN OPENSSH PRIVATE KEY|TopflowDeviceAPI|TopFlowAoyou|TopFlowUI|demoSnapshot|setSnapshot|createMockTransport|(?:source: )(?:device-api|aoyou-adapter|screen-ui)\.js/.test(script)) throw Error('Private source or preview/demo interface found in production bundle');
}
function validateReleaseGate(gate,reviewOnly,diagnosticCandidate=false){
  if(reviewOnly&&diagnosticCandidate)throw Error('Choose either review or diagnostic candidate output');
  if(reviewOnly)return;
  if(diagnosticCandidate){
    const diagnostic=gate&&gate.diagnosticCandidate;
    if(!gate||gate.hardwareVerified!==false||gate.knownCriticalGapsResolved!==false||!diagnostic||diagnostic.enabled!==true||diagnostic.sideEffectReadRemoved!==true||diagnostic.localValidationPassed!==true||diagnostic.unresolvedStartupFailure!==true)throw Error('DIAGNOSTIC_BUILD_BLOCKED: Known side-effect fix and bounded failure diagnostics must pass local review; original startup failure stays unresolved');
    return;
  }
  if(!gate||gate.state!=='device-acceptance-pending'||gate.code!=='DEVICE_ACCEPTANCE_PENDING'||gate.hardwareVerified!==false||gate.localValidationPassed!==true||gate.localImplementationReviewed!==true||gate.adaptationFixCandidate!==true)throw Error('PACKAGE_RELEASE_BLOCKED: '+(gate&&gate.reason||'Incomplete lifecycle review gate'));
}
function diagnosticReadme(summary,outputName){
  return [
    'TopFlow 屏幕 '+(summary.version||VERSION)+' 诊断自测版',
    '状态：DIAGNOSTIC_CANDIDATE；尚未通过设备验收。',
    '用户启用0.1.1后出现 RENDERER_EXITED。本次只读复核观察到原厂恢复；不保证每次恢复。',
    '本版移除有副作用的debugfs读取，并加入固定失败阶段码和真实退出状态。原退出根因仍未确定。',
    '本轮未更改屏幕排版；仅包含真实原厂/UFI接口，无演示数据或模拟接口。',
    '',
    '更新：先确认原厂正在运行。在UFI插件列表移除旧TopFlow记录，保存并刷新；',
    '再导入 '+outputName+'，点击保存并等待刷新。不要改名叠加两个TopFlow记录。',
    'UFI跳过同名重复导入，单选文件不代表已经保存。其它插件记录不要修改。',
    '在“功能列表”折叠区域外打开“TopFlow 屏幕 · 管理”，默认只读且不自动切换。',
    '管理器精确识别已交付的0.1.0 c3f71f86…与0.1.1 40c3b519…组件；固定归属、清单与四个',
    '执行文件SHA-256均匹配才允许一次确认后恢复原厂、清旧组件、安装新包并启动。未知版本拒绝。',
    '等待显示的是上限，不是预计完成时间；最长6分钟，可取消。不会释放原厂锁。',
    '若失败，记录页面的主错误、失败阶段与退出状态即可；不要反复启用。原始日志、密码不记录。',
    '“恢复原厂”和“卸载”仍独立可用；卸载先确认原厂稳定，再清理仅本插件路径及唯一UFI记录。',
    '开发者本轮只读设备，未安装、执行新版预检、切换或改设备配置；此文件仅供用户手动自测。',
    '',
    'TXT字节数：'+summary.bytes+'；最长源码行：'+summary.maxLineLength+'字符。',
    '与既有遨游约728KB合计约'+(summary.bytes+728090)+'字节，仍需计入其它插件与UFI全部头部5MB限制。',
    'TXT SHA-256：'+summary.sha256,
    '原生归档 SHA-256：'+summary.nativeArchiveSha256,
    '默认 node tools/build.cjs 仍拒绝发布；仅独立诊断门槛通过后 --diagnostic-candidate 才生成此文件。',
    '复杂功能与未支持边界见 analysis/factory-feature-inventory.txt；不能视为原厂全部功能等价。',''
  ].join('\n');
}
function releaseReadme(summary,outputName){
  return [
    'TopFlow 屏幕 '+summary.version+' — 开机唤醒与更新设置保留版',
    '状态：DEVICE_ACCEPTANCE_PENDING；hardwareTested=false。0.2.11 修复已消费的唤醒通知取消自身显示事务、导致 DISPLAY_RUNTIME 的条件缺陷；开机通知与休眠服务恢复后走标准点亮流程，新到的 OFF 通知仍能中断事务。更新仅在旧组件已明确开启自启动、完整状态回读一致且新版启动与壁纸恢复成功后，恢复一次自启动并再次核验；失败、取消或未知不擅自开启。保留 0.2.10 修复短信设备登录密码框固定显示六个圆点的问题，遮罩数量随实际输入字符数更新，密码始终不明文显示。增加原厂明确 OFF 后睡眠服务移除、重建期间的等待与重订阅；收到 MC 开机通知且服务恢复后自动唤醒插件画面，不需要再按一次电源键。真正断连或恢复超时仍交回原厂，不会反复抢占屏幕。保留 0.2.9 修复关机完成通知未确认时退出并恢复原厂界面的条件缺陷，保留原厂电源键开机及 OFF 门禁；本次没有故障设备在线验证，仍保留既有短信、壁纸与状态同步功能；本轮电脑检查通过后仍需实机验收。',
    '历史 0.2.1 已由用户实机验收；0.2.3 电源键长按菜单已在电脑验证，本轮未新增实机测试。现固定三个主页面：首页、网络、功能；普通/聚合共用一个首页位置。',
    '长按实体电源键打开关机/重启菜单；锁定时需先解锁，再次确认并复查能力后只提交一次；取消返回原页面和滚动位置。',
    '首页随设备最新回读的聚合开关状态切换；未启用、未知或过期时显示普通页，已启用但离线仍显示聚合页。',
    '屏幕取消手动模式选择和聚合开关；读取现有设备状态，不新增GPIO读取，也不判断是谁操作了开关。',
    '保留0.1.6跟手拖动：横向翻页与纵向滚动跟随手指；松手后翻页按144毫秒目标收尾，慢帧跳进当前进度。',
    '顶部状态和返回栏固定；文字改用细分字重，圆角抗锯齿，减少图表和背景颗粒；物理分辨率仍为320×480。',
    '顶部电池区分充电、插电未充电、满电和未知状态；不会按电量百分比猜测是否充电。',
    '缓存仅在进程内存：字形覆盖图上限384KiB、最多512项；两张翻页缓冲仅在横滑与收尾期间保留。',
    '保留 0.1.5 显示方向；锁屏随普通/聚合模式显示运营商、真实制式和双曲线速率卡，无密码时显示本地长按解锁页与进度反馈。',
    '亮度可选固定或自适应；固定亮度支持1%草稿微调与预设，确认后生效。自适应沿原曲线滤波渐变。',
    '接管并解锁后默认可操作，无需额外启用；原厂PIN仍须验证，每次修改和短信发送仍需确认。',
    '第二页加入主载波/多载波明细及网口插线、协商速率与吞吐；主基带手动LTE/NR锁小区保留，回读配置不等同驻留。',
    '聚合页显示官方剩余与今日流量；区分开启、在线与监测未知，不再把未知统一显示等待上线。',
    '各卡详情依次显示实时上行、实时下行、QCI、签约上行、签约下行；签约值读取本卡AMBR（Mbps），非测速，未知显示—。',
    '保留各卡插拔卡/内置卡切换，按该模组原厂接口提交并回读；卡源未知仍可明确选择；未启用需先启用。',
    '短信改走现有UFI SEND_SMS及AD会话校验，一次确认只提交一次；会话失效可在插件短信页恢复设备登录，超时不重发。',
    '保留原厂切换、休眠和PIN保护；显示配置与光感瞬态失败分开，立即锁屏独立；本轮未安装或修改设备。',
    '',
    summary.reviewOnly?'此页仅供本地审查，安装和启动已禁用；不要改名当作可上传TXT。':'安装：在已登录UFI的插件管理中选择 '+outputName+'，再点击“提交”保存，等待完成后刷新。',
    '“功能列表”下方的 TopFlow 屏幕内嵌卡片就是操控页；插件列表文件名打开源码，无需编辑。',
    '更新0.1.0至0.2.10已核验版本：旧屏幕可保持运行，移除旧TopFlow插件记录、点击“提交”保存并刷新，',
    '再导入本包并点击“提交”保存刷新。UFI跳过同名导入，不会覆盖旧记录；不要改名叠加，也不要删除其他插件。',
    '管理器仅识别已交付且列入核验清单的旧归档；固定归属、清单和执行文件哈希匹配后，',
    '顶部检查已导入TXT与设备组件；发现旧版显示“更新到 v'+summary.version+'”，一次确认自动恢复原厂、清理、安装并启动，无需手动来回切换。',
    '更新前只读校验壁纸并暂存本页内存，卸载时在生命周期锁内复核；恢复失败保留内存并提供重试，请勿关闭或刷新页面。',
    '管理页只比较已导入TXT与本机已安装组件；不连接旧插件商店、下载远程SDK或发送遥测。未知或被改动版本拒绝迁移。',
    '',
    '打开管理页默认只读取状态。点击切换并确认后直接点亮插件屏幕；无密码时先本地长按解锁，已启用密码时保留原厂PIN锁屏保护。',
    '不再要求等待原厂自然熄屏。实际安全前置检查失败会停止接管并显示具体代码。',
    '若旧版仍返回等待状态，可在管理页取消并确认恢复结果。关闭页面不会自动切换实体屏。',
    '恢复：点击切换回原厂并确认，页面验证进程与服务；画面、触摸仍须用户观察。',
    '卸载：先确认原厂稳定，再清理本插件路径及唯一UFI记录；归属不明、未知文件、上传或记录删除未确认时停止，不假报卸净。',
    '若失败，请保留页面主错误、固定阶段码和退出状态，先恢复原厂；不要重复盲目启用。',
    '',
    'TXT含管理器、独立样式和真实接口原生程序，无演示数据、模拟接口、密码、订阅或原厂字体/库。',
    '独立安装开机自启动默认关闭；更新保留已完整回读确认的开启选择，新版运行及壁纸恢复成功后恢复一次并核验，不自动重试；使用UFI官方启动项，服务就绪后尝试一次，关闭取消待执行任务，卸载移除本插件启动项。',
    '本版修复和未支持能力见 项目文档；不宣称与原厂全部功能等价。',
    '版本 '+summary.version+'；TXT '+summary.bytes+' 字节；与既有遨游约728KB合计约 '+(summary.bytes+728090)+' 字节。',
    '本项目限制单TXT小于4MiB；UFI全部自定义头部上限5MB，其它插件也计入。',
    'TXT SHA-256：'+summary.sha256,
    '原生归档 SHA-256：'+summary.nativeArchiveSha256,
    ''
  ].join('\n');
}
function build(outputDir, options = {}) {
  const releaseGate = JSON.parse(fs.readFileSync(path.join(ROOT, 'analysis/release-gate.json'), 'utf8'));
  const reviewOnly=options.reviewOnly===true;
  const diagnosticCandidate=options.diagnosticCandidate===true;
  validateReleaseGate(releaseGate,reviewOnly,diagnosticCandidate);
  if(!reviewOnly&&!diagnosticCandidate) {
    if(releaseGate.version!==VERSION) throw Error('PACKAGE_RELEASE_BLOCKED: Re-run npm run prepare:release for this version');
    for(const name of ['src/manager-theme.js','src/manager-confirm.js','src/manager-wallpaper.js','src/manager-wallpaper-ui.js','src/manager-wallpaper-migration.js','src/ufi-plugin.js','src/manager.css','tools/build.cjs','tools/production-manager.cjs']) {
      if(releaseGate.sourceSha256?.[name]!==sha256(fs.readFileSync(path.join(ROOT,name)))) throw Error('PACKAGE_RELEASE_BLOCKED: Source changed after public validation: '+name);
    }
  }
  outputDir = path.resolve(outputDir || path.join(ROOT, reviewOnly?'review':diagnosticCandidate?'diagnostic':'dist'));
  const distRelative = path.relative(path.join(ROOT, 'dist'), outputDir);
  if (reviewOnly&&(!distRelative || !distRelative.startsWith('..' + path.sep) && !path.isAbsolute(distRelative))) throw Error('Review output must not use dist or its descendants');
  if (diagnosticCandidate&&(!distRelative || !distRelative.startsWith('..' + path.sep) && !path.isAbsolute(distRelative))) throw Error('Diagnostic candidate output must not use dist or its descendants');
  const archive = fs.readFileSync(path.join(ROOT, 'native/topflow-native.tar.gz'));
  const members = tarMembers(archive);
  for(const member of members) {
    if(member.type==='0' && /plugin\.shaneyun\.com|UFIPluginTelemetry|TopFlowScreenTelemetrySDK|TopFlowPluginCenter|device-sdk/.test(member.content.toString('latin1'))) {
      throw Error('Removed store or telemetry bytes found in native payload: '+member.name);
    }
  }
  const get = name => members.find(member => member.name === './' + name).content;
  const manifest = JSON.parse(get('build-manifest.json').toString('utf8'));
  verifyNativeReleaseContract(manifest,{reviewOnly,diagnosticCandidate});
  verifyNativeLiveContract(manifest);
  verifyNativeSources(manifest, members);
  verifyNativeRootProofs(manifest);
  verifyBootIntegrity(manifest, members);
  const {binaryHash,factoryBusHash}=verifyNativeBinaries(manifest,members);
  const payload = { version: VERSION, defaultViewOnly:manifest.defaultViewOnly, nativeAutostart:manifest.nativeAutostart,nativeFactoryPower:manifest.nativeFactoryPower,nativePowerKey:manifest.nativePowerKey,nativeLockWallpaper:manifest.nativeLockWallpaper,nativeControlAuthorization:manifest.nativeControlAuthorization, nativeNetwork:manifest.nativeNetwork,nativeAmbr:manifest.nativeAmbr,nativeSimSource:manifest.nativeSimSource,nativeSms:manifest.nativeSms, nativeManualCell:manifest.nativeManualCell, nativeSoftLock:manifest.nativeSoftLock, nativeBrightness:manifest.nativeBrightness, directSwitch:manifest.displayCompatibility.directSwitch, sensorAfterDrm:manifest.displayCompatibility.sensorAfterDrm, startupOrder:manifest.displayCompatibility.startupOrder,  hardwareTested: false, reviewOnly, diagnosticCandidate, adaptationFixCandidate:manifest.adaptationFixCandidate, aggregationUiFixCandidate:manifest.aggregationUiFixCandidate, homeViewFollowsObservedAggregation:manifest.homeViewFollowsObservedAggregation, nativeHomeNavigation:manifest.nativeHomeNavigation, aggregationPageDefaultVisible:manifest.aggregationPageDefaultVisible, aggregationDeviceVerified:manifest.aggregationDeviceVerified, performanceFixCandidate:manifest.performanceFixCandidate, userConfirmedFunctionalRelease:manifest.userConfirmedFunctionalRelease, devicePerformanceVerified:manifest.devicePerformanceVerified, performanceScope:manifest.performanceScope, nativePerformance:manifest.nativePerformance, nativeBattery:manifest.nativeBattery, confirmedLockCause:manifest.confirmedLockCause, retainedExistingTouchBackend:manifest.retainedExistingTouchBackend, uprightOrientationMatched:manifest.uprightOrientationMatched, factoryPinEnum:manifest.displayCompatibility.pinFactoryEnum, noPinStartup:manifest.displayCompatibility.noPinStartup, noPinWake:manifest.displayCompatibility.noPinWake, userReportedDisplayHandover:manifest.userReportedDisplayHandover, pendingDeviceAcceptance:manifest.pendingDeviceAcceptance, acceptanceStatus:diagnosticCandidate?'DIAGNOSTIC_CANDIDATE':'DEVICE_ACCEPTANCE_PENDING',releaseBlocked: reviewOnly?'REVIEW_ONLY':null, archiveBase64: archive.toString('base64'), archiveSha256: sha256(archive), screenctlSha256: sha256(get('screenctl.sh')), screenctlSource: get('screenctl.sh').toString('utf8'), members: members.map(member => member.name) };
  const managerCss = fs.readFileSync(path.join(ROOT, 'src/manager.css'), 'utf8');
  if (/<\/style/i.test(managerCss) || /@import|url\s*\(/i.test(managerCss)) throw Error('Manager stylesheet must be self-contained');
  const modules = SOURCES.map(name => {
    const raw = fs.readFileSync(path.join(ROOT, 'src', name), 'utf8');
    const text = name === 'ufi-plugin.js' ? managerOnly(raw) : raw;
    new vm.Script(text, { filename: name });
    if (/<\/script/i.test(text)) throw Error('Source contains script closing tag: ' + name);
    return '/* source: ' + name + ' */\n' + text;
  });
  const script = emitPayload(payload) + modules.join('\n;\n');
  validateProductionScript(script);
  const name = 'TopFlow 屏幕';
  const pluginMetadata={name,version:VERSION,build:sha256(script+'\n'+managerCss).slice(0,16),author:'善恶',description:'中兴 TopFlow 原生屏幕；开机自启、原厂切换、三卡卡源与 UFI 功能集成',target:'ZTE TopFlow / MU5252',status:reviewOnly?'REVIEW_ONLY':diagnosticCandidate?'DIAGNOSTIC_CANDIDATE':'DEVICE_ACCEPTANCE_PENDING'};
  // Same public source-header convention as the reference AoYou plugin.
  // UFI requires raw plugin source: store metadata is generated by the host.
  // Public @version is for the source header; component version detection and
  // updates belong in this plugin's own manager, never in forged store tags.
  const header='<script id="topflow-screen-plugin-source">\n// '+name+' v'+VERSION+' — UFI-TOOLS-ZWRT 原生屏幕插件\n'+Object.entries(pluginMetadata).map(([key,value])=>'// @'+key+' '+value).join('\n')+'\n';
  const txt = header+script+'\n</script>\n<style id="topflow-screen-plugin-style">\n'+managerCss+'\n</style>\n';
  if (/\[KANO_META\]|<!--\s*\[KANO_PLUGIN_(?:START|END)\]/.test(txt)) throw Error('Raw plugin must not include internal store markers');
  const bytes = Buffer.byteLength(txt, 'utf8');
  const maxLineLength = Math.max(...txt.split('\n').map(line=>line.length));
  if (maxLineLength > 4096) throw Error('TXT source line exceeds the editor compatibility limit');
  if (bytes >= 4 * 1024 * 1024) throw Error('UFI TXT package exceeds 4 MiB');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputName=reviewOnly?'topflow-screen.UNVERIFIED.html':diagnosticCandidate?'topflow-screen-'+VERSION+'-diagnostic.txt':'topflow-screen.txt';
  fs.writeFileSync(path.join(outputDir, outputName), txt, 'utf8');
  if (!reviewOnly&&!diagnosticCandidate) fs.writeFileSync(path.join(outputDir, 'topflow-screen-' + payload.version + '.txt'), txt, 'utf8');
  const officialMetadata={name,description:pluginMetadata.description,version:VERSION,author:'善恶',category:'设备管理',device_models:['TOPFLOW']};
  if (!reviewOnly&&!diagnosticCandidate) {
    for(const filename of ['topflow-screen.txt','topflow-screen-'+VERSION+'.txt']) {
      fs.writeFileSync(path.join(outputDir,filename+'.meta.json'),JSON.stringify(officialMetadata,null,2)+'\n','utf8');
    }
  }
  const summary = { plugin: name, version: payload.version, defaultViewOnly:payload.defaultViewOnly, nativeAutostart:payload.nativeAutostart,nativeFactoryPower:payload.nativeFactoryPower,nativePowerKey:payload.nativePowerKey,nativeLockWallpaper:payload.nativeLockWallpaper,nativeControlAuthorization:payload.nativeControlAuthorization, nativeNetwork:payload.nativeNetwork,nativeAmbr:payload.nativeAmbr,nativeSimSource:payload.nativeSimSource,nativeSms:payload.nativeSms, nativeManualCell:payload.nativeManualCell, nativeSoftLock:payload.nativeSoftLock, nativeBrightness:payload.nativeBrightness, directSwitch:payload.directSwitch, sensorAfterDrm:payload.sensorAfterDrm, startupOrder:payload.startupOrder,  receiptVersion:manifest.displayCompatibility.receiptVersion, factoryBinarySha256:manifest.displayCompatibility.factoryBinarySha256, reviewOnly,diagnosticCandidate,adaptationFixCandidate:payload.adaptationFixCandidate,aggregationUiFixCandidate:payload.aggregationUiFixCandidate,homeViewFollowsObservedAggregation:payload.homeViewFollowsObservedAggregation,nativeHomeNavigation:payload.nativeHomeNavigation,aggregationPageDefaultVisible:payload.aggregationPageDefaultVisible,aggregationDeviceVerified:payload.aggregationDeviceVerified,performanceFixCandidate:payload.performanceFixCandidate,userConfirmedFunctionalRelease:payload.userConfirmedFunctionalRelease,devicePerformanceVerified:payload.devicePerformanceVerified,performanceScope:payload.performanceScope,nativePerformance:payload.nativePerformance,nativeBattery:payload.nativeBattery,confirmedLockCause:payload.confirmedLockCause,retainedExistingTouchBackend:payload.retainedExistingTouchBackend,uprightOrientationMatched:payload.uprightOrientationMatched,factoryPinEnum:payload.factoryPinEnum,noPinStartup:payload.noPinStartup,noPinWake:payload.noPinWake,userReportedDisplayHandover:payload.userReportedDisplayHandover,pendingDeviceAcceptance:payload.pendingDeviceAcceptance,releaseBlocked:payload.releaseBlocked,acceptanceStatus:payload.acceptanceStatus, bytes, maxLineLength, sha256: sha256(txt), nativeArchiveSha256: payload.archiveSha256, nativeBinarySha256: binaryHash, factoryBusSha256:factoryBusHash, hardwareTested: false, sources: SOURCES, nativeMembers: payload.members };
  summary.pluginMetadata=pluginMetadata;
  summary.storeIntegration={officialDocumentationOnly:true,telemetry:false,remoteSDK:false};
  summary.officialMetadata=officialMetadata;
  summary.managerCssSha256=sha256(managerCss);
  fs.writeFileSync(path.join(outputDir, reviewOnly?'build-manifest.UNVERIFIED.json':diagnosticCandidate?'build-manifest.DIAGNOSTIC.json':'build-manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  if(diagnosticCandidate){fs.writeFileSync(path.join(outputDir,'README.DIAGNOSTIC.txt'),diagnosticReadme(summary,outputName),'utf8');return summary;}
  fs.writeFileSync(path.join(outputDir, reviewOnly?'README.UNVERIFIED.txt':'README.txt'), releaseReadme(summary,outputName), 'utf8');
  return summary;
}
if (require.main === module) console.log(JSON.stringify(build(undefined, {reviewOnly: process.argv.includes('--review-only'),diagnosticCandidate: process.argv.includes('--diagnostic-candidate')}), null, 2));
module.exports = { VERSION,build, tarMembers, verifyNativeSources,verifyNativeRootProofs,verifyNativeBinaries,verifyBootIntegrity,verifyNativeReleaseContract,validateReleaseGate,validateProductionScript,verifyNativeLiveContract,emitPayload,diagnosticReadme,releaseReadme };
