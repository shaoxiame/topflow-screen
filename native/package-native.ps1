$ErrorActionPreference='Stop'
$root=$PSScriptRoot
foreach($dependency in @(@('vendor/litehtml','8836bc1bc35ca0cfd71dc0386ef841d5cbc3bd5e'),@('vendor/freetype','023fd06e3dbe84ab7327ddddd9fe851824fe1ade'))){
 $actual=& git -C (Join-Path $root $dependency[0]) rev-parse HEAD
 if($LASTEXITCODE -ne 0 -or $actual -ne $dependency[1]){throw "Dependency revision mismatch: $($dependency[0]); run tools/bootstrap.ps1"}
 if((& git -C (Join-Path $root $dependency[0]) status --porcelain).Length){throw "Dependency was modified: $($dependency[0])"}
}
$payload=Join-Path $root 'payload'
if(Test-Path -LiteralPath $payload){
 $resolved=[IO.Path]::GetFullPath($payload)
 if($resolved -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'payload')) -or (Get-Item -LiteralPath $payload).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'Unexpected staging directory'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force $payload,"$payload/ui","$payload/licenses" | Out-Null
Copy-Item (Join-Path (Split-Path $root -Parent) 'LICENSE') "$payload/licenses/PolyForm-Noncommercial-1.0.0.txt" -Force
Copy-Item "$root/bin/topflow-screen-aarch64" "$payload/topflow-screen" -Force
Copy-Item "$root/bin/topflow-factory-bus-aarch64" "$payload/topflow-factory-bus-aarch64" -Force
Copy-Item "$root/screenctl.sh","$root/supervisor.sh","$root/boot-hook.sh","$root/NOTICE.txt","$root/REBUILD.txt" $payload -Force
Copy-Item "$root/ui/*" "$payload/ui" -Recurse -Force
Copy-Item "$root/upstream/LICENSE" "$payload/licenses/u60pro-devui-MIT.txt" -Force
Copy-Item "$root/vendor/litehtml/LICENSE" "$payload/licenses/litehtml-BSD.txt" -Force
Copy-Item "$root/vendor/litehtml/src/gumbo/LICENSE" "$payload/licenses/gumbo-Apache.txt" -Force
Copy-Item "$root/vendor/freetype/docs/FTL.TXT" "$payload/licenses/FreeType-FTL.txt" -Force
$gzipSource=[IO.File]::ReadAllText("$root/vendor/freetype/src/gzip/zlib.h")
$gzipEnd=$gzipSource.IndexOf('*/')
if($gzipEnd -lt 0 -or $gzipSource -notmatch 'Jean-loup Gailly'){throw 'FreeType gzip license notice missing'}
[IO.File]::WriteAllText("$payload/licenses/FreeType-gzip-zlib.txt",$gzipSource.Substring(0,$gzipEnd+2)+"`n")
Copy-Item "$root/toolchain/zig-x86_64-windows-0.14.1/lib/libc/musl/COPYRIGHT" "$payload/licenses/musl-COPYRIGHT.txt" -Force
Copy-Item "$root/toolchain/zig-x86_64-windows-0.14.1/lib/libcxx/LICENSE.TXT" "$payload/licenses/LLVM-libcxx.txt" -Force
Copy-Item "$root/toolchain/zig-x86_64-windows-0.14.1/lib/libcxxabi/LICENSE.TXT" "$payload/licenses/LLVM-libcxxabi.txt" -Force
Copy-Item "$root/vendor/pinyin/LICENSE" "$payload/licenses/pinyin-data-MIT.txt" -Force
Copy-Item "$root/vendor/openwrt/LGPL-2.1.txt","$root/vendor/openwrt/openwrt-NOTICE.txt" "$payload/licenses" -Force
$manifest=@{
 schema=1; version='0.2.6'; target='aarch64-linux-musl'; application='topflow-screen'; hardwareTested=$false
 nativeFactoryPower=@{source='/etc/config/zwrt_zte_mc_tmp';section='mode';field='mode_main_state';off='mode_power_off*';on=@('mode_power_on','mode_power_on_charger');settingIsPowerState=$false;unknownAfterOff='remain-dark';inputDuringOff='discard';writesFactoryMode=$false;additionalProcesses=0;hardwareTested=$false}
 nativeAutostart=@{defaultEnabled=$false;hook='/data/plugins/ufi_tools_boot.sh';readinessSecondsMaximum=120;attemptsPerBoot=1;retry=$false;failure='existing-factory-rollback';disabledCancelsPending=$true;uninstall='remove-owned-hook-and-bounded-state';systemStartupFilesModified=$false;integrity='boot-integrity.sha256';deviceBootVerified=$false}
 defaultViewOnly=$false; physicalScreenProgramSwitch=$false
 nativeControlAuthorization=@{initial='blocked-until-adopt-and-unlock';noPin='hold-to-unlock-local';pin='requires-pin-policy-and-login';sleep='revoked';writes='per-action-confirmation';manualEnableGate=$false}
 nativePowerKey=@{thresholdMilliseconds=1200;longPress='power-menu-overlay';alreadyAwake='preserve-unlocked-state';asleep='existing-wake-before-menu';locked='menu-visible-actions-disabled';authorization='control_guard';actions=@('device.poweroff','device.reboot');capabilityEndpoint='http://127.0.0.1:9460/capabilities';controlEndpoint='http://127.0.0.1:9460/control';confirmation='second-confirmation-and-capability-recheck';submissionsPerConfirmation=1;automaticRetry=$false;cancel='restore-page-and-scroll';invalidateOldPending=$true;clearOn=@('sleep','resync');hardwareTested=$false}
 nativeLockWallpaper=@{format='TFWP5651';width=320;height=480;fileBytes=307216;pixelFormat='RGB565_LE';path='/data/plugins/topflow-screen/lock-wallpaper.rgb565';refresh='lock-entry';bufferBytes=307200;noBackgroundPolling=$true;fallback='default';factoryFilesUntouched=$true;uninstallRemovesCustomWallpaper=$true;staging='.lock-wallpaper.upload';receipt='.lock-wallpaper.pending';chunk='.lock-wallpaper.chunk';transport='run-shell-locked-chunks';chunkBytesMaximum=24576;transaction='sha256-nonce32-current-boot-id-offset';commit='same-directory-atomic-rename';checks=@('root-owner','regular-file','no-symlink','single-hardlink','size','header','sha256');unknownUpload='retain-old-image-explicit-abort-no-retry';uninstallPending='remove-owned-pending-under-lifecycle-lock';recovery='nonce-and-current-boot-guarded-explicit-abort';stalePixels='never-commit-after-boot-change';hardwareTested=$false}
 nativeSms=@{endpoint='http://127.0.0.1:2333/api/goform/goform_set_cmd_process';action='SEND_SMS';sender='host';encoding='UTF16BE-hex';authorization='existing-UFI-session-with-AD';confirmedResult='UFI-result-success';submitCountPerConfirmation=1;automaticRetry=$false;deviceSendVerified=$false}
 nativeAmbr=@{targets=@('5G','4G1','4G2');source='per-modem-qos';uplink='ambr_ul';downlink='ambr_dl';unit='Mbps';displayOrder=@('tx_speed','rx_speed','qci','ambr_ul','ambr_dl');crossModemFallback=$false;additionalDeviceRequests=0;meaning='network-last-reported-limit';hardwareTested=$false}
 nativeNetwork=@{aggregationStatus='source-aware-plus-owned-factory-tcp-observation';quota='aggregation.traffic.remaining_bytes';today='aggregation.traffic.today_used_bytes';ethernet='kernel-carrier-and-negotiated-speed';carriers='official-nrca-lteca-and-primary';noActiveProbe=$true;deviceAggregationVerified=$false}
 nativeSimSource=@{targets=@('5G','4G1','4G2');sources=@('removable','builtin');rawSource='0-removable-1-builtin';primary='sim_switch_slot';external='sub_modem_switch_slot';externalModemNumbers=@{ '4G1'=1;'4G2'=0 };readback='raw-st_slot';refresh='on-demand-and-active-page';requiresKnownSource=$false;selection="explicit-absolute-target";presenceRequired=$false;unknownReadback="unconfirmed";externalMustBeEnabled=$true;automaticRetry=$false;deviceSwitchVerified=$false}
 nativeManualCell=@{actions=@('cell.lock_lte','cell.lock_nr');target='primary-modem-only';input='numeric-keypad';nrBand='fresh-supported-sa-or-nsa';confirmation='capability-and-parameters-rechecked';readback='exact-lock-config-not-camping';automaticRetry=$false}
 nativeSoftLock=@{holdMilliseconds=1000;trigger='inside-button-continuous-press';cancel='release-outside-or-interruption';consumeCompletingRelease=$true;credential=$false;factoryPinPriority=$true}
 nativeBrightness=@{ui='fixed-or-adaptive';fixedDraftPercentStep=1;fixedPresets=@(5,10,25,50,75,100);confirmedApply=$true;curve='original-integer-lux';sampleMilliseconds=1000;filter='median3-q8-quarter';deadbandLevels=8;rampMillisecondsMinimum=100;rampLevelsMaximum=3;steadyWrites=0;invalidOrStale='freeze';duringGesture='defer';existingLifecycle=$true}
 heartbeatClock='CLOCK_MONOTONIC'; liveDeviceDataOnly=$true; includesPreviewFixtures=$false
 performanceFixCandidate=$true; userConfirmedFunctionalRelease='0.1.5'; performanceScope=@('rendering','animation','scrolling'); devicePerformanceVerified=$false
 aggregationUiFixCandidate=$true; homeViewFollowsObservedAggregation=$true; aggregationPageDefaultVisible=$false; aggregationDeviceVerified=$false
 nativeHomeNavigation=@{mainPageCount=3;homePageSlots=1;homeSlotModes=@('normal','aggregate');modeSource='fresh-aggregation.enabled';modeDerivedFrom='zwrt_router.network.opms_wan_mode==SMULTIWAN';disabledUnknownOrStaleView='normal';enabledOfflineView='aggregate';physicalSwitchOriginDetected=$false;screenModeOverride=$false;screenAggregationToggle=$false}
 nativePerformance=@{touchMotion='continuous-drag';pageSettleMilliseconds=144;frameIntervalMilliseconds=16;lateFrames='skip-to-monotonic-progress';pinnedHeader='status-and-back';retainedDocuments=1;glyphEntriesLimit=512;glyphCoverageBytesLimit=393216;cssEntriesLimit=4;cssFileBytesLimit=262144;pinnedHeaderBufferBytes=61440;swipeBuffers=2;swipeBufferBytesMaximum=1966080;swipeBufferLifetime='active-horizontal-drag-and-settle';cacheStorage='process-memory-only';backgroundRefreshDeferralMilliseconds=160}
 nativeBattery=@{chargeStatusField='battery.charging';chargeStatusEnum='1-charging-2-discharging-3-not-charging-4-full';connectionField='battery.charger_connect';connectionIndependent=$true;percentInfersCharging=$false;missingOrConflictingState='unknown';display='level-and-charge-state';chargingIcon='css-rectangles';additionalAnimationTimers=$false}
 nativeChart=@{samples=30;series=@('download','upload');format='RGB565';transitionFrames=4;transitionMilliseconds=180;idleAnimation=$false}
 nativeControls=@('wifi.radio.set','band.set_lte','band.set_nr_sa','band.set_nr_nsa','cell.lock_lte','cell.lock_nr','cell.unlock_all','mihomo.mode','mihomo.selector','cellular.connect','cellular.disconnect','cellular.set','vendor.sim_switch_slot','vendor.sub_modem_switch_slot','vendor.external_modem_enable','ufi.SEND_SMS','wifi.configure','wifi.guest.set','client.block','client.unblock','traffic.calibrate','traffic.set_clear_day','apn.add','apn.modify','apn.delete','apn.enable','apn.set_mode','power.direct_supply.set','sleep.set','cooling.fan.set_enabled','cooling.liquid.set_enabled','vendor.qos_mode','vendor.quick_boot','wifi.set_dual_band','network.set_mode','device.reboot','device.poweroff','vendor.primary_sim_pin_verify','vendor.primary_sim_puk_unlock','vendor.wps_start','vendor.wps_cancel','vendor.primary_operator_scan','vendor.primary_operator_select','vendor.primary_operator_automatic','vendor.display_brightness','vendor.display_automatic','vendor.display_timeout','ufi.sms_forward_config','ufi.sms_forward_toggle','ufi.sms_forward_filter','ufi.sms_forward_power_notice')
 releaseReadiness='DEVICE_ACCEPTANCE_PENDING'; adaptationFixCandidate=$true; confirmedLockCause='FACTORY_PIN_ENUM_INVERTED'; retainedExistingTouchBackend=$true; uprightOrientationMatched=$true; userReportedDisplayHandover=@{version='0.1.4';successful=$true}; userReportedTouch=@{version='0.1.4';working=$true;inputBlockedBy='initial-pin-protection-countdown'}; pendingDeviceAcceptance=$true; sideEffectfulDebugfsReadRemoved=$true; nativeFailureProtocol=1; factoryLifecycleProtocol=1; compatibleFactoryBehaviorVerified=$false
 displayCompatibility=@{adapter='existing-ubus-plus-observed-kernel-lock';ubusPath='/bin/ubus';internalLockSnapshot='two-stable-complete-reads';factoryAutosleepHandover='explicit-wake-owned-transfer';directSwitch=$true;receiptVersion=2;sensorAfterDrm=$true;startupOrder='policy-drm-sensor-frame-lcd';factoryBinarySha256='781e3c6ffa2a9db4d61a3cf1bb38461131dc3faed07499a2c9360bc582040dd2';postDisplayOffIdleSeconds=180;automaticBrightness='original-lux-curve-median-lowpass-ramp';pinHandover='enabled-only-initial-300s-v2';pinFactoryEnum='0-enabled-1-disabled';noPinStartup='hold-to-unlock-local';noPinWake='hold-to-unlock-local';pinAttempts=5;pinCooldownSeconds=300;periodicWakeSupported=$false;displayObservation='guarded-frame-brightness-lcdlock';readToClearEventConsumed=$false;hardwareVerified=$false}
 nativeInput=@('ASCII','offline-single-character-Pinyin','UTF8-to-UTF16BE-SMS')
 existingRuntimeDependencies=@('/lib/ld-musl-aarch64.so.1','/lib/libubus.so.20230605','/lib/libubox.so.20230523')
 pinyin=(Get-Content -LiteralPath "$root/vendor/pinyin/provenance.json" -Raw | ConvertFrom-Json)
 sourceSha256=@{}
 rootProofSha256=@{}
 upstream='d1d0856e19d58a2a98104e47afbdcfc51e1dc3d1'
 litehtml='8836bc1bc35ca0cfd71dc0386ef841d5cbc3bd5e'
 freetype='023fd06e3dbe84ab7327ddddd9fe851824fe1ade'
 publicRebuild=@{privateFirmwareInputs=$false;helperImports='vendor/openwrt/link-imports.json';fontRedistributed=$false;hardwareVerified=$false}
 zig='0.14.1'; zigArchiveSha256='554f5378228923ffd558eac35e21af020c73789d87afeabf4bfd16f2e6feed2c'
 binarySha256=(Get-FileHash "$payload/topflow-screen" -Algorithm SHA256).Hash.ToLowerInvariant()
 factoryBusSha256=(Get-FileHash "$payload/topflow-factory-bus-aarch64" -Algorithm SHA256).Hash.ToLowerInvariant()
}
foreach($sourceFile in @((Get-ChildItem -LiteralPath $root -File | Where-Object {$_.Extension -in @('.h','.c','.cpp')} | ForEach-Object {$_.Name}))+@('build.ps1','build-factory-bus.ps1','screenctl.sh','supervisor.sh','vendor/pinyin/provenance.json','vendor/pinyin/LICENSE','vendor/openwrt/openwrt-NOTICE.txt','vendor/openwrt/LGPL-2.1.txt','REBUILD.txt','NOTICE.txt','package-native.ps1','upstream/include/data.h','upstream/include/devui_config.h','upstream/include/touch_input.h','upstream/src/data.c','upstream/src/drm_disp.c','upstream/src/html_view.cpp','upstream/src/touch_input.c')){$manifest.sourceSha256[$sourceFile]=(Get-FileHash "$root/$sourceFile" -Algorithm SHA256).Hash.ToLowerInvariant()}
$manifest.sourceSha256['test-display-preflight.ps1']=(Get-FileHash -LiteralPath "$root/test-display-preflight.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['boot-hook.sh']=(Get-FileHash -LiteralPath "$root/boot-hook.sh" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['test-display-runtime.ps1']=(Get-FileHash -LiteralPath "$root/test-display-runtime.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['test-sensor-handover.ps1']=(Get-FileHash -LiteralPath "$root/test-sensor-handover.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
foreach($proof in @('test-display-external-sync.ps1','test-modem-source.ps1','test-wake-sensor.ps1','test-network-status.ps1','test-network-runtime.ps1','test-dashboard-layout.cpp','test-dashboard-layout.ps1','test-display-settings.ps1','test-display-layout.cpp','test-display-layout.ps1','test-soft-lock.ps1','test-pin.ps1','test-lock-layout.ps1','test-auto-brightness.ps1','test-render-style.ps1','test-controls.ps1','test-home-mode.ps1','preview/generate-pages.js','test-screen-geometry.ps1','test-main-lock.ps1','test-interaction.ps1','test-render-perf.cpp','test-render-perf.ps1','test-battery.ps1','test-chart.ps1','test-render-health.ps1','test-presentation.ps1','preview/render-battery.js')){$manifest.sourceSha256[$proof]=(Get-FileHash -LiteralPath "$root/$proof" -Algorithm SHA256).Hash.ToLowerInvariant()}
$manifest.sourceSha256['test-startup-diagnostics.ps1']=(Get-FileHash -LiteralPath "$root/test-startup-diagnostics.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['test-modem-ambr.ps1']=(Get-FileHash -LiteralPath "$root/test-modem-ambr.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['test-lockscreen.ps1']=(Get-FileHash -LiteralPath "$root/test-lockscreen.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['test-factory-power.ps1']=(Get-FileHash -LiteralPath "$root/test-factory-power.ps1" -Algorithm SHA256).Hash.ToLowerInvariant()
foreach($publicSource in @('preview/font.js','vendor/openwrt/link-imports.json')){$manifest.sourceSha256[$publicSource]=(Get-FileHash -LiteralPath "$root/$publicSource" -Algorithm SHA256).Hash.ToLowerInvariant()}
foreach($powerSource in @('upstream/include/key_input.h','upstream/src/key_input.c')){$manifest.sourceSha256[$powerSource]=(Get-FileHash -LiteralPath "$root/$powerSource" -Algorithm SHA256).Hash.ToLowerInvariant()}
foreach($rootProof in @('tests/manager-wallpaper-migration-audit.test.js','tests/manager-wallpaper-migration.test.js','tests/native-band-state-sync.test.js','tests/native-page-state-sync.test.js','tests/native-ufi.test.js','tests/native-wifi-integration.test.js','tests/native-wifi-state.test.js','tests/native-power-key.test.js','tests/native-power-menu.test.js','tests/native-wallpaper.test.js','tests/native-wallpaper-files.test.js')){$manifest.rootProofSha256[$rootProof]=(Get-FileHash -LiteralPath (Join-Path (Split-Path $root -Parent) $rootProof) -Algorithm SHA256).Hash.ToLowerInvariant()}
$manifest.sourceSha256['preview/render-modem-ambr.js']=(Get-FileHash -LiteralPath "$root/preview/render-modem-ambr.js" -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest.sourceSha256['upstream/include/drm_disp.h']=(Get-FileHash -LiteralPath "$root/upstream/include/drm_disp.h" -Algorithm SHA256).Hash.ToLowerInvariant()
foreach($uiFile in Get-ChildItem -LiteralPath "$root/ui" -Recurse -File){$relative=$uiFile.FullName.Substring($root.Length+1).Replace('\','/');$manifest.sourceSha256[$relative]=(Get-FileHash -LiteralPath $uiFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
$json=$manifest|ConvertTo-Json -Depth 4
[IO.File]::WriteAllText("$payload/topflow-screen.sha256", "$($manifest.binarySha256)  topflow-screen`n$($manifest.factoryBusSha256)  topflow-factory-bus-aarch64`n")
[IO.File]::WriteAllText("$root/build-manifest.json",$json)
[IO.File]::WriteAllText("$payload/build-manifest.json",$json)
$bootSums=@(Get-ChildItem -LiteralPath $payload -Recurse -File | Where-Object {$_.Name -ne 'boot-integrity.sha256'} | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$_.FullName.Substring($payload.Length+1).Replace('\','/') })
[IO.File]::WriteAllText("$payload/boot-integrity.sha256",($bootSums -join "`n")+"`n")
& tar -czf "$root/topflow-native.tar.gz" -C $payload .
if($LASTEXITCODE -ne 0){throw 'Native archive failed'}
Get-Item "$root/topflow-native.tar.gz"
