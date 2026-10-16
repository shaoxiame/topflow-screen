'use strict';
// Execute production supervisor logic only in the shared disposable PC fixture.
// All device/proc/kernel/service paths and signals are replaced by local mocks.
// These cases do not prove hardware timing or atomic ownership of vendor locks.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const fixtureSource=fs.readFileSync(path.join(__dirname,'native-supervisor.test.js'),'utf8');
const begin=fixtureSource.indexOf('function fixture(t){');
const end=fixtureSource.indexOf("test('native scripts parse",begin);
assert(begin>0&&end>begin,'Shared local shell fixture anchors changed');
const fixture=vm.runInNewContext(fixtureSource.slice(begin,end)+'\nfixture;',{fs,os,path,assert,dash,unix,quote,spawnSync,spawn,process,project});
const supervisor=fs.readFileSync(path.join(project,'native/supervisor.sh'),'utf8');
const receipt='DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=0 LCDLOCK=0 AUTO=0 LEVEL=100 TIMEOUT=30 PERIODIC=0 SENSOR=0 LUX=-1 INTERNAL=1 AUTOLOCK=1 DIRECT=1';
const unrelated=['sysZteSleepLock','zteSleepBacklight','network_fixture_lock'];
function prepared(t){
  const f=fixture(t);f.put('factory');f.rendererCapability(receipt);
  f.put('wakelockMap.txt','sysZteSleepLock 800\nzte_topsw_devui 777\nnetwork_fixture_lock 801\n');
  f.put('wake-active',unrelated.concat('zte_topsw_devui_auto_sleep_lock').join(' ')+'\n');
  return f;
}
function inject(code){
  const anchor='trap restore_factory EXIT';assert(supervisor.includes(anchor));
  return supervisor.replace(anchor,()=>code+'\n'+anchor);
}
function mapHook(code){
  let source=inject(`factory_lock_owner() {\n  audit_map_owner=$(audit_original_map_owner) || return 1\n${code}\n  printf '%s\\n' "$audit_map_owner"\n}`);
  // Rename only the production definition. The injected wrapper calls it intact.
  source=source.replace('factory_lock_owner() {','audit_original_map_owner() {');
  return source;
}
function resultOf(f,source=supervisor){return f.execute(source,['--confirmed']);}
function noLaunch(result){assert.doesNotMatch(result.events,/renderer-adopt/,result.events);}
function preserved(f){
  const active=fs.readFileSync(path.join(f.base,'wake-active'),'utf8').trim().split(/\s+/);
  for(const lock of unrelated)assert(active.includes(lock),'unrelated kernel lock removed: '+lock);
  const map=fs.readFileSync(path.join(f.base,'wakelockMap.txt'),'utf8');
  assert.match(map,/sysZteSleepLock 800/);assert.match(map,/network_fixture_lock 801/);
}
function restored(result){assert.match(result.events,/factory-start/);assert.match(result.events,/ubus -t 2 -v list zwrt_deviceui/);}

test('direct handover removes only the stopped factory display locks, then restores after a new renderer exits',t=>{
  const f=prepared(t),r=resultOf(f);assert.equal(r.status,0,r.stderr+r.stdout);
  const stop=r.events.indexOf('ubus -t 2 call service delete');
  const del=r.events.indexOf('internalDeleteWakelock');
  const unlock=r.events.indexOf('factory-autosleep-release');
  const render=r.events.indexOf('renderer-adopt');
  assert(stop>=0&&del>stop&&unlock>del&&render>unlock,r.events);
  assert(r.events.indexOf('factory-start')>render,r.events);
  assert.match(r.events,/internalDeleteWakelock \{"sourceId":777,"lockName":"zte_topsw_devui"\}/);
  preserved(f);restored(r);
  assert.match(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),/^failure:RENDERER_EXITED/);
});

test('conflicting, duplicate, truncated and oversized internal maps stop before deleting the original service',t=>{
  for(const content of ['zte_topsw_devui 888\n','zte_topsw_devui 777\nzte_topsw_devui 777\n','zte_topsw_devui 777','x'.repeat(8193)+'\n']){
    const f=prepared(t);f.put('wakelockMap.txt',content);const r=resultOf(f);
    assert.notEqual(r.status,0,r.stderr+r.stdout);noLaunch(r);
    assert.doesNotMatch(r.events,/service delete|internalDeleteWakelock|factory-autosleep-release|factory-start/);
  }
});

test('a stable empty internal map permits no internal delete and still verifies the exact kernel display lock',t=>{
  const f=prepared(t);f.put('wakelockMap.txt','');const r=resultOf(f);
  assert.doesNotMatch(r.events,/internalDeleteWakelock/);assert.match(r.events,/factory-autosleep-release/);
  assert.match(r.events,/renderer-adopt/);restored(r);
  const active=fs.readFileSync(path.join(f.base,'wake-active'),'utf8');
  for(const lock of unrelated)assert(active.includes(lock));
});

test('factory lock API error, successful no-op and exact kernel unlock failure all prevent rendering and restore the original',t=>{
  for(const flag of ['lock-api-fail','lock-api-noop','factory-unlock-fail']){
    const f=prepared(t);f.put(flag);const r=resultOf(f);assert.notEqual(r.status,0,r.stderr+r.stdout);
    noLaunch(r);restored(r);preserved(f);
    assert.match(r.stdout,/FACTORY_LOCK_HANDOVER_FAILED/);
    if(flag!=='factory-unlock-fail')assert.doesNotMatch(r.events,/factory-autosleep-release/);
  }
});

test('an internal owner changed after stopping the factory is never deleted',t=>{
  const f=prepared(t);const r=resultOf(f,mapHook(`
  if [ ! -f "$TF_FIX/factory" ]; then
    printf 'sysZteSleepLock 800\\nzte_topsw_devui 888\\nnetwork_fixture_lock 801\\n' > "$TF_FIX/wakelockMap.txt"
    audit_map_owner=888
  fi`));
  assert.notEqual(r.status,0);noLaunch(r);restored(r);preserved(f);
  assert.doesNotMatch(r.events,/internalDeleteWakelock|factory-autosleep-release/);
});

test('a factory respawn during post-stop map inspection is detected before touching its locks',t=>{
  const f=prepared(t);const r=resultOf(f,mapHook(`
  if [ ! -f "$TF_FIX/factory" ]; then
    log fixture-factory-respawn
    touch "$TF_FIX/factory"
    audit_proc="$TF_FIX/p""roc"
    cp "$TF_FIX/factory-stat" "$audit_proc/777/stat"
    cp "$TF_FIX/factory-exe" "$audit_proc/777/exe"
  fi`));
  assert.notEqual(r.status,0);noLaunch(r);preserved(f);
  assert.match(r.events,/fixture-factory-respawn/);
  assert.doesNotMatch(r.events,/internalDeleteWakelock|factory-autosleep-release/);
});

test('changing the factory birth time during the final pre-stop map read must not delete the new instance',t=>{
  const f=prepared(t);const r=resultOf(f,mapHook(`
  if [ -f "$TF_FIX/factory" ]; then
    audit_proc="$TF_FIX/p""roc"
    sed 's/ 77$/ 78/' "$audit_proc/777/stat" > "$TF_FIX/new-stat"
    mv "$TF_FIX/new-stat" "$audit_proc/777/stat"
    log fixture-factory-identity-changed
  fi`));
  assert.match(r.events,/fixture-factory-identity-changed/);assert.notEqual(r.status,0);
  noLaunch(r);assert.doesNotMatch(r.events,/service delete|internalDeleteWakelock|factory-autosleep-release/);
});

test('a transition lease lost during the first stopped-factory map read prevents the internal lock delete',t=>{
  const f=prepared(t);const r=resultOf(f,mapHook(`
  if [ ! -f "$TF_FIX/factory" ]; then
    awk '{for(i=1;i<=NF;i++)if($i!~/^topflow_screen_/)print $i}' "$TF_FIX/wake-active" > "$TF_FIX/wake-new"
    mv "$TF_FIX/wake-new" "$TF_FIX/wake-active"
    log fixture-guard-expired
  fi`));
  assert.match(r.events,/fixture-guard-expired/);assert.notEqual(r.status,0);noLaunch(r);restored(r);preserved(f);
  assert.doesNotMatch(r.events,/internalDeleteWakelock|factory-autosleep-release/);
});

test('a transition lease lost during the final lock read cannot be silently reacquired and reported as successful handover',t=>{
  const f=prepared(t);const r=resultOf(f,mapHook(`
  if grep -q '^factory-autosleep-release$' "$TF_FIX/events"; then
    awk '{for(i=1;i<=NF;i++)if($i!~/^topflow_screen_/)print $i}' "$TF_FIX/wake-active" > "$TF_FIX/wake-new"
    mv "$TF_FIX/wake-new" "$TF_FIX/wake-active"
    log fixture-final-guard-expired
  fi`));
  assert.match(r.events,/fixture-final-guard-expired/);assert.notEqual(r.status,0);noLaunch(r);restored(r);preserved(f);
});

test('known injected screens, non-system executable libraries and a foreign bind mount block before service deletion',t=>{
  for(const kind of ['preload','mapped-hook','arbitrary-library','mount','init']){
    const f=prepared(t);
    if(kind==='preload')f.put('proc/777/environ','LD_PRELOAD=/tmp/foreign.so\0');
    if(kind==='mapped-hook')f.put('proc/777/maps','0000-9999 r-xp 0000 00:00 1 /data/plugins/touchui-hook.so\n');
    if(kind==='arbitrary-library')f.put('proc/777/maps','0000-9999 r-xp 0000 00:00 1 /tmp/renamed-plugin.so\n');
    if(kind==='mount')f.put('proc/self/mountinfo','40 30 1:2 / '+unix(path.join(f.base,'factory-start'))+' rw - tmpfs tmpfs rw\n');
    if(kind==='init')f.put('factory-start','#!/bin/sh\nPROG=/data/plugins/foreign/zte_topsw_devui\n');
    const r=resultOf(f);assert.notEqual(r.status,0,kind);noLaunch(r);
    assert.doesNotMatch(r.events,/service delete|internalDeleteWakelock|factory-autosleep-release|factory-start/);
  }
});

test('unreadable mount metadata cannot be accepted as an absence of mounts',t=>{
  const f=prepared(t);const r=resultOf(f,inject(`
awk() { for audit_arg in "$@"; do case "$audit_arg" in */self/mountinfo) log fixture-mount-read-failed; return 2;; esac; done; command awk "$@"; }
cat() { for audit_arg in "$@"; do case "$audit_arg" in */self/mountinfo) log fixture-mount-read-failed; return 2;; esac; done; command cat "$@"; }
`));
  assert.match(r.events,/fixture-mount-read-failed/);assert.notEqual(r.status,0);noLaunch(r);
  assert.doesNotMatch(r.events,/service delete/);
});

test('unreadable process mappings cannot be accepted as an absence of preload libraries',t=>{
  const f=prepared(t);const r=resultOf(f,inject(`
awk() { for audit_arg in "$@"; do case "$audit_arg" in */777/maps) log fixture-maps-read-failed; return 2;; esac; done; command awk "$@"; }
grep() { for audit_arg in "$@"; do case "$audit_arg" in */777/maps) log fixture-maps-read-failed; return 2;; esac; done; command grep "$@"; }
cat() { for audit_arg in "$@"; do case "$audit_arg" in */777/maps) log fixture-maps-read-failed; return 2;; esac; done; command cat "$@"; }
`));
  assert.match(r.events,/fixture-maps-read-failed/);assert.notEqual(r.status,0);noLaunch(r);
  assert.doesNotMatch(r.events,/service delete/);
});

test('unreadable process environment is not accepted as an empty preload environment',t=>{
  const f=prepared(t);const r=resultOf(f,inject(`
tr() { log fixture-environment-read-failed; return 2; }
`));
  assert.match(r.events,/fixture-environment-read-failed/);assert.notEqual(r.status,0);noLaunch(r);
  assert.doesNotMatch(r.events,/service delete/);
});

test('service delete error and a lease that expires while stopping cannot proceed to vendor lock handover',t=>{
  for(const fault of ['response-error','expired-lease']){
    const f=prepared(t);
    const call="ubus -t 2 call service delete '{\"name\":\"zte_topsw_devui\"}'";
    assert(supervisor.includes(call),'The stop request must have an explicit bounded timeout');
    let source=supervisor.replace(call,()=> 'audit_service_delete');
    const helper=`audit_service_delete() {
  log fixture-service-delete
  audit_proc="$TF_FIX/p""roc"
  rm -f "$TF_FIX/factory" "$audit_proc/777/stat" "$audit_proc/777/exe"
  ${fault==='response-error'?'return 1':`awk '{for(i=1;i<=NF;i++)if($i!~/^topflow_screen_/)print $i}' "$TF_FIX/wake-active" > "$TF_FIX/wake-new"
  mv "$TF_FIX/wake-new" "$TF_FIX/wake-active"
  return 0`}
}`;
    source=source.replace('trap restore_factory EXIT',()=>helper+'\ntrap restore_factory EXIT');
    const r=resultOf(f,source);assert.match(r.events,/fixture-service-delete/);assert.notEqual(r.status,0);
    noLaunch(r);restored(r);preserved(f);
    assert.doesNotMatch(r.events,/internalDeleteWakelock|factory-autosleep-release/);
  }
});
