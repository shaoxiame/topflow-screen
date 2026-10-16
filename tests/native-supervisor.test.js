'use strict';
// Offline POSIX-shell tests. Every device/proc/service path is redirected to a
// disposable LOCAL fixture, and kill/flock/curl/ubus are inert test functions.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const controller=fs.readFileSync(path.join(project,'native/screenctl.sh'),'utf8');
const supervisor=fs.readFileSync(path.join(project,'native/supervisor.sh'),'utf8');
const plugin=require('../src/ufi-plugin.js');
const partialPayload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:controller,hardwareTested:false,members:['./','./topflow-screen.sha256','./ui/','./ui/index.html']};

function fixture(t){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-shell-test-'));
  t.after(()=>{const target=path.resolve(base);assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert(path.basename(target).startsWith('topflow-shell-test-'));fs.rmSync(target,{recursive:true,force:true});});
  const root=path.join(base,'root'),run=path.join(base,'run'),proc=path.join(base,'proc');
  for(const dir of [root,run,proc,path.join(proc,'self'),path.join(root,'ui'),path.join(base,'touch/event0/device')])fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(base,'touch/event0/device/name'),'sitronix');fs.writeFileSync(path.join(base,'font'),'fixture');
  fs.mkdirSync(path.join(base,'power'));for(const file of ['wake_lock','wake_unlock'])fs.writeFileSync(path.join(base,'power',file),'');
  fs.mkdirSync(path.join(base,'lib'));for(const file of ['ld-musl-aarch64.so.1','libubus.so.20230605','libubox.so.20230523'])fs.writeFileSync(path.join(base,'lib',file),'mock');
  fs.writeFileSync(path.join(base,'wake-active'),'sysZteSleepLock zteSleepBacklight\n');
  fs.writeFileSync(path.join(root,'topflow-screen.sha256'),'mock');fs.writeFileSync(path.join(root,'ui/index.html'),'mock');
  fs.writeFileSync(path.join(root,'.lifecycle.lock'),'');
  fs.writeFileSync(path.join(root,'.topflow-install'),'TOPFLOW_SCREEN_INSTALL_V1\n'+'a'.repeat(64)+'\n');
  fs.writeFileSync(path.join(root,'.topflow-files'),'topflow-screen.sha256\nui\nui/index.html\n');
  fs.writeFileSync(path.join(proc,'self/mountinfo'),'');
  fs.writeFileSync(path.join(proc,'uptime'),'1000.00 0.00\n');
  fs.writeFileSync(path.join(base,'wakelockMap.txt'),'sysZteSleepLock 800\n');
  fs.writeFileSync(path.join(base,'factory-start'),`#!/bin/sh\nPROG=/usr/bin/zte_topsw_devui\nprintf 'factory-start\\n' >> ${quote(unix(path.join(base,'events')))}\ntouch ${quote(unix(path.join(base,'factory')))}\ncp ${quote(unix(path.join(base,'factory-stat')))} ${quote(unix(path.join(proc,'777/stat')))}\ncp ${quote(unix(path.join(base,'factory-exe')))} ${quote(unix(path.join(proc,'777/exe')))}\n`,{mode:0o755});
  const paths={base,root,run,proc};
  function put(name,text='1'){fs.writeFileSync(path.join(base,name),text);}
  function rendererCapability(capability){
    put('root/topflow-factory-bus-aarch64','#!/bin/sh\nexit 1\n');fs.chmodSync(path.join(root,'topflow-factory-bus-aarch64'),0o755);
    put('root/topflow-screen',`#!/bin/sh\nif [ "$1" = --monotonic-seconds ]; then if [ -f ${quote(unix(path.join(base,'clock-failed')))} ]; then exit 7; fi; if [ -f ${quote(unix(path.join(base,'monotonic')))} ]; then cat ${quote(unix(path.join(base,'monotonic')))}; else printf '1000\\n'; fi; exit 0; fi\nif [ "$1" = --display-preflight ]; then printf '%s\\n' ${quote(capability)}; exit 0; fi\nprintf 'renderer-adopt %s | %s\\n' "$1" "$2" >> ${quote(unix(path.join(base,'events')))}\nexit 1\n`);fs.chmodSync(path.join(root,'topflow-screen'),0o755);
  }
  function processRecord(pid,start,exe,cmd){
    const dir=path.join(proc,String(pid));fs.mkdirSync(dir,{recursive:true});
    const fields=Array(20).fill('0');fields[0]='S';fields[19]=String(start);
    fs.writeFileSync(path.join(dir,'stat'),`${pid} (fixture process) ${fields.join(' ')}\n`);
    fs.writeFileSync(path.join(dir,'exe'),exe||'unrelated');
    fs.writeFileSync(path.join(dir,'cmdline'),cmd||'unrelated\0');
    fs.writeFileSync(path.join(dir,'maps'),'');fs.writeFileSync(path.join(dir,'environ'),'');
  }
  processRecord(777,77,'/usr/bin/zte_topsw_devui');
  fs.copyFileSync(path.join(proc,'777/stat'),path.join(base,'factory-stat'));fs.copyFileSync(path.join(proc,'777/exe'),path.join(base,'factory-exe'));
  const mocks=`
PATH=${quote(unix(path.dirname(dash)))}:$PATH
export PATH
TF_FIX=${quote(unix(base))}
log() { printf '%s\\n' "$*" >> "$TF_FIX/events"; }
stat() { if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; elif [ "$2" = %a ]; then printf '600\\n'; elif [ "$2" = %h ]; then if [ -f "$TF_FIX/hard-linked" ]; then printf '2\\n'; else printf '1\\n'; fi; else printf '0\\n'; fi; }
chmod() { return 0; }
readlink() { if [ "$1" = -f ]; then printf '%s\\n' "$2"; else cat "$1" 2>/dev/null; fi; }
pidof() { [ -f "$TF_FIX/factory" ] && printf '777\\n'; }
flock() {
  log "flock $*"
  if [ "$1" = -n ] && [ "$2" = 9 ] && [ -f "$TF_FIX/active-control" ]; then return 1; fi
  if [ "$1" = -n ] && [ "$2" = 8 ] && [ -f "$TF_FIX/active-supervisor" ]; then return 1; fi
  return 0
}
kill() {
  log "kill $*"
  if [ "$2" = "$$" ]; then command kill "$@"; return; fi
  if [ "$2" = 4242 ]; then touch "$TF_FIX/cancelled"; fi
  if [ "$2" = 4343 ]; then rm -f "$TF_FIX/proc/4343/stat" "$TF_FIX/proc/4343/exe"; fi
  if [ "$2" = 4444 ]; then rm -f "$TF_FIX/proc/4444/stat" "$TF_FIX/proc/4444/exe"; fi
}
sleep() {
  if [ -f "$TF_FIX/advance-wait-clock" ]; then
    read -r up idle < "$TF_FIX/proc/uptime"
    step=$(cat "$TF_FIX/advance-wait-clock")
    printf '%s.00 0.00\\n' "$(( \${up%%.*} + step ))" > "$TF_FIX/proc/uptime"
    log "wait-sleep $1"
  fi
  if [ -f "$TF_FIX/cancel-preflight-wait" ]; then command kill -TERM "$$"; fi
  if [ -f "$TF_FIX/cancelled" ]; then
    log cleanup-finished
    if [ -f "$TF_FIX/cleanup-publishes-guard-failure" ]; then
      printf 'failure:TRANSITION_GUARD_RELEASE_UNCONFIRMED\\n' > "$TF_FIX/run/last-status"
      printf '4343 456\\n' > "$TF_FIX/run/renderer.pid"
    fi
    rm -f "$TF_FIX/active-supervisor" "$TF_FIX/proc/4242/stat" "$TF_FIX/cancelled"
  fi
}
date() { printf '1000\\n'; }
ubus() {
  log "ubus $*"
  if [ "$1" = -t ] && [ "$3" = call ] && [ "$4" = service ]; then shift 2; fi
  if [ "$1" = -t ] && [ "$3" = call ]; then
    [ ! -f "$TF_FIX/lock-api-fail" ] || return 1
    if [ ! -f "$TF_FIX/lock-api-noop" ]; then awk '$1!="zte_topsw_devui"' "$TF_FIX/wakelockMap.txt" > "$TF_FIX/map-new"; mv "$TF_FIX/map-new" "$TF_FIX/wakelockMap.txt"; fi
  elif [ "$1" = -t ]; then
    [ ! -f "$TF_FIX/provider-missing" ] || return 1
    printf '"zwrt_deviceui_touch_status_get" "zwrt_deviceui_direct_power_mode_get" "zwrt_deviceui_direct_power_mode_set"\\n'
  elif [ "$3" = list ]; then
    if [ -f "$TF_FIX/term-before-handover" ]; then command kill -TERM "$$"; fi
    printf 'zte_topsw_devui\\n'
  elif [ "$3" = delete ]; then rm -f "$TF_FIX/factory" "$TF_FIX/proc/777/stat" "$TF_FIX/proc/777/exe"; if [ -f "$TF_FIX/fail-provider-after-handover" ]; then touch "$TF_FIX/provider-missing"; fi; fi
}
curl() { log curl-read; printf '{"modems":[]}\\n'; }
sha256sum() { return 0; }
`;
  function execute(source,args,options={}){
    source=source.replaceAll('/tmp/wakelockMap.txt',unix(path.join(base,'wakelockMap.txt')));
    let adapted=source.replaceAll('/data/plugins/topflow-screen',unix(root)).replaceAll('/tmp/topflow-screen',unix(run)).replaceAll('/proc/',unix(proc)+'/').replaceAll('/etc/init.d/zte_topsw_devui',unix(path.join(base,'factory-start'))).replaceAll('/sys/class/input/',unix(path.join(base,'touch'))+'/').replaceAll('/usr/ui/fonts/ZTEZhengYuan.ttf',unix(path.join(base,'font'))).replaceAll('/sys/power/',unix(path.join(base,'power'))+'/').replaceAll('/lib/ld-musl-',unix(path.join(base,'lib'))+'/ld-musl-').replaceAll('/lib/libubus.',unix(path.join(base,'lib'))+'/libubus.').replaceAll('/lib/libubox.',unix(path.join(base,'lib'))+'/libubox.');
    adapted=adapted.replaceAll(unix(proc)+'/self/fd/','/proc/self/fd/');
    adapted=adapted.replace('# END GUARD_IO',()=>`# END GUARD_IO
guard_active_io() { [ ! -f "$TF_FIX/guard-read-fail" ] || return 1; cat "$TF_FIX/wake-active"; }
guard_acquire_io() { log "guard-acquire $1 10000000000"; [ ! -f "$TF_FIX/guard-write-fail" ] || return 1; printf '%s\\n' "$1" >> "$TF_FIX/wake-active"; }
guard_release_io() { log "guard-release $1"; [ ! -f "$TF_FIX/guard-release-fail" ] || return 1; awk -v own="$1" '{for(i=1;i<=NF;i++) if($i!=own) print $i}' "$TF_FIX/wake-active" > "$TF_FIX/wake-new"; mv "$TF_FIX/wake-new" "$TF_FIX/wake-active"; }
`);
    adapted=adapted.replace('# END FACTORY_LOCK_IO',()=>`# END FACTORY_LOCK_IO
factory_autosleep_release_io() { log factory-autosleep-release; [ ! -f "$TF_FIX/factory-unlock-fail" ] || return 1; awk '{for(i=1;i<=NF;i++)if($i!="zte_topsw_devui_auto_sleep_lock")print $i}' "$TF_FIX/wake-active" > "$TF_FIX/wake-new"; mv "$TF_FIX/wake-new" "$TF_FIX/wake-active"; }
`);
    const realHash = options.realHash ? `
sha256sum() {
 if [ "$2" = - ]; then ${quote(unix(process.execPath))} -e ${quote("const fs=require('node:fs'),c=require('node:crypto');for(const l of fs.readFileSync(0,'utf8').trim().split(/\\n/)){const m=l.match(/^([a-f0-9]{64})  (.+)$/);if(!m)process.exit(1);const p=m[2].replace(/^\\/([a-z])\\//,(_,d)=>d+':/');if(c.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==m[1])process.exit(1);}")}; else return 0; fi
}
` : '';
    adapted=adapted.replace('set -eu',()=> 'set -eu\n'+mocks+realHash);
    adapted=adapted.replace('    ps_line=$(cat',()=> '    if [ "$1" = "$$" ]; then printf \'100\\n\'; return; fi\n    if [ -f "$TF_FIX/fake-child-birth" ] && [ "$1" != 777 ] && [ "$1" != 4444 ]; then printf \'100\\n\'; return; fi\n    ps_line=$(cat');
    const script=path.join(base,'test.sh');fs.writeFileSync(script,adapted);
    // This watchdog limits only local test processes. Windows process startup
    // plus real archive hashes can exceed 5 s; device deadline assertions stay
    // unchanged and still use their isolated clocks.
    const result=spawnSync(dash,[unix(script),...args],{encoding:'utf8',timeout:15000});
    if(result.error)throw result.error;
    return {...result,events:fs.existsSync(path.join(base,'events'))?fs.readFileSync(path.join(base,'events'),'utf8'):''};
  }
  return {...paths,put,processRecord,execute,rendererCapability};
}

test('native scripts parse as POSIX sh and never invoke vendor stop, touch unload or networking changes',()=>{
  for(const file of ['screenctl.sh','supervisor.sh']){
    const result=spawnSync(dash,['-n',unix(path.join(project,'native',file))],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
  const code=(controller+'\n'+supervisor).split('\n').filter(line=>!line.trimStart().startsWith('#')).join('\n');
  assert.doesNotMatch(code,/\b(?:rmmod|modprobe|killall|reboot|ifconfig|iptables|nft|uci)\b|init\.d\/zte_topsw_devui (?:stop|restart)/);
  assert.match(code,/ubus -t 2 call service delete '\{"name":"zte_topsw_devui"\}'/);
});

test('restore waits for supervisor cleanup before factory start and only signals verified identity',t=>{
  const f=fixture(t);f.put('active-supervisor');f.put('run/supervisor.pid','4242 123\n');
  f.processRecord(4242,123,'/bin/busybox','sh\0'+unix(f.root)+'/supervisor.sh\0--confirmed\0');
  const result=f.execute(controller,['restore','--confirmed']);
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('kill -TERM 4242')<result.events.indexOf('cleanup-finished'));
  assert(result.events.indexOf('cleanup-finished')<result.events.indexOf('factory-start'));
  assert.equal((result.events.match(/factory-start/g)||[]).length,1);
});

test('PID reuse or a different supervisor script refuses restore without killing anyone',t=>{
  const f=fixture(t);f.put('active-supervisor');f.put('run/supervisor.pid','4242 123\n');
  f.processRecord(4242,999,'/bin/busybox','sh\0unrelated.sh\0');
  const result=f.execute(controller,['restore','--confirmed']);
  assert.equal(result.status,8);
  assert.doesNotMatch(result.events,/kill |factory-start/);
});

test('orphan recovery stops only our exact binary with matching process birth time',t=>{
  const f=fixture(t);f.put('run/renderer.pid','4343 456\n');
  f.processRecord(4343,456,unix(f.root)+'/topflow-screen');
  const result=f.execute(controller,['restore','--confirmed']);
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('kill -TERM 4343')<result.events.indexOf('factory-start'));
});

test('status remains read-only and requires a renderer heartbeat after first frame',t=>{
  const f=fixture(t);f.rendererCapability('unused');f.put('run/renderer.pid','4343 456\n');
  f.processRecord(4343,456,unix(f.root)+'/topflow-screen');
  let result=f.execute(controller,['status']);
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).ready,false);assert.equal(result.events,'');
  f.put('run/heartbeat','999\n');result=f.execute(controller,['status']);
  assert.deepEqual(JSON.parse(result.stdout),{mode:'custom',pid:4343,ready:true,heartbeatAge:1,supervised:false,autostart:{enabled:false,hook:'absent',state:'disabled',reason:'NONE'}});
  f.put('run/heartbeat','900\n');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).ready,false);
});

test('a reused renderer PID does not stop a different instance or start a competing factory',t=>{
  const f=fixture(t);f.put('run/renderer.pid','4343 456\n');
  f.processRecord(4343,999,unix(f.root)+'/topflow-screen');
  const result=f.execute(controller,['restore','--confirmed']);
  assert.equal(result.status,8);
  assert.doesNotMatch(result.events,/kill |factory-start/);
});

test('TERM during supervisor preflight exits through cleanup without handing over display',t=>{
  const f=fixture(t);f.put('factory');f.put('term-before-handover');
  const result=f.execute(supervisor,['--confirmed']);
  assert.equal(result.status,143,result.stderr+result.stdout);
  assert.doesNotMatch(result.events,/ubus -t 2 call service delete|factory-start|curl-read/);
  assert(!fs.existsSync(path.join(f.run,'supervisor.pid')));
});

test('unknown display policy refuses handover before original services are stopped',t=>{
  const f=fixture(t);f.put('factory');
  f.put('root/topflow-screen',`#!/bin/sh\nprintf 'display-preflight %s\\n' "$1" >> ${quote(unix(path.join(f.base,'events')))}\n[ "$1" = --display-preflight ] || exit 99\nexit 7\n`);
  fs.chmodSync(path.join(f.root,'topflow-screen'),0o755);
  const result=f.execute(supervisor,['--confirmed']);
  assert.equal(result.status,7,result.stderr+result.stdout);
  assert.match(result.events,/display-preflight --display-preflight/);
  assert.doesNotMatch(result.events,/ubus -t 2 call service delete|factory-start|curl-read|kill /);
  assert(fs.existsSync(path.join(f.base,'factory')));
  assert(!fs.existsSync(path.join(f.run,'supervisor.pid')));
});

test('a legacy exit-zero renderer cannot bypass the complete display and PIN receipt',t=>{
  const f=fixture(t);f.put('factory');
  for(const receipt of ['','DISPLAY_PREFLIGHT_OK PIN_GUARD=none','DISPLAY_PREFLIGHT_OK PIN_GUARD=unknown BRIGHTNESS=0 LCDLOCK=0','DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=256 LCDLOCK=1','DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=4 LCDLOCK=0','DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=0 SUSPENDED=0 LCDLOCK=0']){
    f.rendererCapability(receipt);const result=f.execute(supervisor,['--confirmed']);
    assert.equal(result.status,7,result.stderr+result.stdout);assert.doesNotMatch(result.events,/guard-acquire|ubus -t 2 call service delete/);
  }
});

test('handover takes only an expiring own guard and passes the verified receipt as one argument',t=>{
  const f=fixture(t);f.put('factory');const receipt='DISPLAY_PREFLIGHT_OK PIN_GUARD=initial-300s-v1 BRIGHTNESS=0 LCDLOCK=0 AUTO=0 LEVEL=100 TIMEOUT=30 PERIODIC=0 SENSOR=0 LUX=-1 INTERNAL=0 AUTOLOCK=0 DIRECT=1';f.rendererCapability(receipt);
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('guard-acquire')<result.events.indexOf('ubus -t 2 call service delete'));
  assert.match(result.events,/guard-acquire topflow_screen_\d+_100 10000000000/);
  assert(result.events.includes('renderer-adopt --display-adopt | '+receipt));
  assert(result.events.lastIndexOf('guard-release')>result.events.lastIndexOf('ubus -t 2 -v list zwrt_deviceui'));
  assert.deepEqual(fs.readFileSync(path.join(f.base,'wake-active'),'utf8').trim().split(/\s+/),['sysZteSleepLock','zteSleepBacklight']);
});

test('unconfirmed timed guard blocks handover while keeping the original provider alive',t=>{
  const f=fixture(t);f.put('factory');f.put('guard-read-fail');f.rendererCapability('DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=0 LCDLOCK=0 AUTO=0 LEVEL=100 TIMEOUT=30 PERIODIC=0 SENSOR=0 LUX=-1 INTERNAL=0 AUTOLOCK=0 DIRECT=1');
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,8,result.stderr+result.stdout);
  assert.match(result.events,/guard-acquire .* 10000000000/);assert.doesNotMatch(result.events,/ubus -t 2 call service delete|factory-start|renderer-adopt/);
  assert(fs.existsSync(path.join(f.base,'factory')));
});

test('factory process without its methods cannot confirm restoration or allow component removal',t=>{
  const f=fixture(t);f.put('provider-missing');const result=f.execute(controller,['uninstall','--confirmed']);
  assert.equal(result.status,5);assert(fs.existsSync(f.root));assert(fs.existsSync(path.join(f.root,'.topflow-install')));assert.doesNotMatch(result.stdout,/COMPONENTS_REMOVED/);
  assert.doesNotMatch(result.events,/guard-release/,'bounded guard expires if recovery remains unconfirmed');
});

test('an orphan bus helper is stopped before the original service is restarted',t=>{
  const f=fixture(t);f.processRecord(4444,555,unix(f.root)+'/topflow-factory-bus-aarch64');
  const result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('kill -TERM 4444')<result.events.indexOf('factory-start'));assert.doesNotMatch(result.events,/kill -TERM 777/);
});

test('restoration releases only recorded verified custom identities after stable factory methods',t=>{
  const f=fixture(t);f.put('run/renderer.pid','4343 456\n');f.processRecord(4343,456,unix(f.root)+'/topflow-screen');
  f.put('wake-active','sysZteSleepLock zteSleepBacklight zte_topsw_devui topflow_screen_4343_456 topflow_screen_4343_456_idle topflow_screen_4343_4569 topflow_screen_4343_4569_idle\n');
  const result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  const remaining=fs.readFileSync(path.join(f.base,'wake-active'),'utf8').trim().split(/\s+/);
  assert.deepEqual(remaining,['sysZteSleepLock','zteSleepBacklight','zte_topsw_devui','topflow_screen_4343_4569','topflow_screen_4343_4569_idle']);
  assert(result.events.includes('guard-release topflow_screen_4343_456_idle'));
  assert(result.events.indexOf('guard-release topflow_screen_4343_456')>result.events.lastIndexOf('ubus -t 2 -v list zwrt_deviceui'));
});

test('uninstall restores factory and removes exactly the verified local component and runtime fixtures',t=>{
  const f=fixture(t);f.put('run/pin-state','BOOT_FIXTURE 2 300\n');
  const result=f.execute(controller,['uninstall','--confirmed']);
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);
  assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
  assert(fs.existsSync(path.join(f.base,'factory')),'factory and unrelated fixture files survive');
});

test('uninstall refuses unknown files and preserves the installation',t=>{
  const f=fixture(t);f.put('root/unrecognized-user-file','must survive');
  const result=f.execute(controller,['uninstall','--confirmed']);
  assert.notEqual(result.status,0);
  assert(fs.existsSync(path.join(f.root,'unrecognized-user-file')));
  assert(fs.existsSync(path.join(f.root,'ui/index.html')));
  assert.doesNotMatch(result.stdout,/COMPONENTS_REMOVED/);
});

test('uninstall refuses a nested mount and missing ownership marker before deleting files',t=>{
  const f=fixture(t);f.put('proc/self/mountinfo','22 1 0:1 / '+unix(f.root)+'/ui rw - tmpfs tmpfs rw\n');
  let result=f.execute(controller,['uninstall','--confirmed']);assert.notEqual(result.status,0);assert(fs.existsSync(path.join(f.root,'ui/index.html')));
  f.put('proc/self/mountinfo','');fs.unlinkSync(path.join(f.root,'.topflow-install'));
  result=f.execute(controller,['uninstall','--confirmed']);assert.notEqual(result.status,0);assert(fs.existsSync(path.join(f.root,'ui/index.html')));
});

test('an orphan without its PID record is identified and stopped before factory restoration and deletion',t=>{
  const f=fixture(t);f.processRecord(4343,456,unix(f.root)+'/topflow-screen');
  const result=f.execute(controller,['uninstall','--confirmed']);
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('kill -TERM 4343')<result.events.indexOf('factory-start'));
  assert.match(result.stdout,/COMPONENTS_REMOVED/);
});

test('an orphan with unreadable process identity blocks factory takeover and deletion',t=>{
  const f=fixture(t);f.processRecord(4343,456,unix(f.root)+'/topflow-screen');fs.unlinkSync(path.join(f.proc,'4343/stat'));
  const result=f.execute(controller,['uninstall','--confirmed']);
  assert.notEqual(result.status,0);assert(fs.existsSync(path.join(f.root,'ui/index.html')));
  assert.doesNotMatch(result.events,/kill |factory-start/);
});

test('uploaded but unextracted package is identified read-only and removed by the in-memory controller',t=>{
  const f=fixture(t);f.put('factory');f.put('root/.install-owner','c'.repeat(32));f.put('root/.payload.tar.gz','incomplete upload, never executed');
  const before=fs.readdirSync(f.run);
  const status=f.execute(plugin.buildScreenCommand('status',partialPayload),[]);
  assert.equal(status.status,0,status.stderr+status.stdout);
  assert.match(status.stdout,/TOPFLOW_SCREEN=\{"partial":true,"uploadActive":false,"versionMismatch":false,"mode":"factory","autostart":/,status.stderr);
  assert.deepEqual(plugin.parseScreenStatus(status.stdout),{installed:true,partial:true,uploadActive:false,mode:'factory',pid:null,ready:false,heartbeatAge:null,supervised:false,autostart:{enabled:false,hook:'absent',state:'disabled',reason:'NONE'}});
  assert.deepEqual(fs.readdirSync(f.run),before);
  assert.doesNotMatch(status.events,/flock|kill|factory-start/);
  const removed=f.execute(plugin.buildScreenCommand('uninstall',partialPayload,true),[]);
  assert.equal(removed.status,0,removed.stderr+removed.stdout);
  assert.match(removed.stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);
  assert.equal(fs.existsSync(f.root),false);assert.equal(fs.existsSync(f.run),false);
});

test('partial install with mismatched bundle ownership is preserved before any service or lock writes',t=>{
  const f=fixture(t);f.put('root/.install-owner','c'.repeat(32));f.put('root/.payload.tar.gz','partial');
  const result=f.execute(plugin.buildScreenCommand('uninstall',{...partialPayload,archiveSha256:'d'.repeat(64)},true),[]);
  assert.equal(result.status,1,result.stderr+result.stdout);
  assert.match(result.stdout,/INSTALLED_VERSION_MISMATCH/);assert.equal(fs.existsSync(f.root),true);
  assert.equal(fs.existsSync(path.join(f.run,'control.lock')),false);assert.doesNotMatch(result.events,/kill|factory-start/);
});

test('partial install requires a valid ownership token and refuses hard-linked files',t=>{
  const f=fixture(t);f.put('root/.install-owner','not-a-token');f.put('root/.payload.tar.gz','partial');
  let result=f.execute(controller,['uninstall','--confirmed']);
  assert.equal(result.status,9);assert.match(result.stderr,/partial install owner/);assert.equal(fs.existsSync(f.root),true);
  f.put('root/.install-owner','c'.repeat(32));f.put('hard-linked');
  result=f.execute(controller,['uninstall','--confirmed']);assert.equal(result.status,9);assert.match(result.stderr,/Unsafe plugin tree/);
  assert.equal(fs.existsSync(f.root),true);assert.doesNotMatch(result.events,/kill|factory-start/);
});

test('an unlinked own executable is still stopped before restoring the factory display',t=>{
  const f=fixture(t);f.put('run/renderer.pid','4343 456\n');
  f.processRecord(4343,456,unix(f.root)+'/topflow-screen (deleted)');
  const result=f.execute(controller,['restore','--confirmed']);
  assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('kill -TERM 4343')<result.events.indexOf('factory-start'));
});

test('uninstall refuses an in-flight or unknown upload before touching locks or services',t=>{
  const f=fixture(t);f.put('root/.install-owner','c'.repeat(32));f.put('root/.upload-active','c'.repeat(32));
  const result=f.execute(controller,['uninstall','--confirmed']);
  assert.equal(result.status,9);assert.match(result.stderr,/Upload still active/);
  assert.doesNotMatch(result.events,/flock|kill|factory-start/);assert.equal(fs.existsSync(f.root),true);
});

test('upload completion and extraction share the uninstall control lock and cannot advance when busy',t=>{
  const f=fixture(t);f.put('root/.install-owner','c'.repeat(32));f.put('root/.upload-active','c'.repeat(32));f.put('active-control');
  let result=f.execute(plugin.buildUploadComplete('c'.repeat(32),partialPayload),[]);
  assert.equal(result.status,1);assert.match(result.stdout,/CONTROL_BUSY/);assert.equal(fs.existsSync(path.join(f.root,'.upload-active')),true);
  result=f.execute(plugin.buildInstallFinish('c'.repeat(32),partialPayload),[]);
  assert.equal(result.status,1);assert.match(result.stdout,/CONTROL_BUSY/);assert.equal(fs.existsSync(path.join(f.root,'.install-owner')),true);
});
function watchdogHarness(t,samples){
  const f=fixture(t);
  const clock=supervisor.slice(supervisor.indexOf('clock_uint() {'),supervisor.indexOf('# Open the existing installation lock'));
  const loop=supervisor.slice(supervisor.indexOf('last_beat=$started_at'),supervisor.indexOf('if ! own_renderer; then\n'));
  const cases=samples.map((s,i)=>`${i+1}) now_value=${s.now}; printf '%s' ${quote(s.beat)} > "$RUN/heartbeat";;`).join('\n');
  const source=`#!/bin/sh\nset -eu\nROOT=/data/plugins/topflow-screen\nRUN=/tmp/topflow-screen\n${clock}
tick=0
started_at=10
handover_guard_active=1
supervisor_guard=own-guard
own_renderer() { tick=$((tick+1)); [ "$tick" -le ${samples.length} ] || return 1; case "$tick" in ${cases} esac; }
factory_running() { return 1; }
monotonic_now() { printf '%s\\n' "$now_value"; }
guard_release() { log "released $1"; }
date() { log WALL_CLOCK_USED; return 99; }
sleep() { log "healthy $tick"; }
${loop}
printf 'WATCHDOG_LAST=%s TICK=%s\\n' "$last_beat" "$tick"
`;
  return f.execute(source,[]);
}

test('watchdog ignores truncated/backward/future samples and measures liveness from the last valid monotonic beat',t=>{
  const result=watchdogHarness(t,[{now:1000,beat:'999\n'},{now:1001,beat:''},{now:1002,beat:'10'},{now:1003,beat:'1000000'},{now:1004,beat:'1004\n'}]);
  assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/stalled/);
  assert.match(result.stdout,/WATCHDOG_LAST=1004/);assert.equal((result.events.match(/healthy/g)||[]).length,5);
  assert.equal((result.events.match(/released/g)||[]).length,1);assert.doesNotMatch(result.events,/WALL_CLOCK_USED/);
});

test('suspend and NTP jumps do not count as elapsed watchdog time, but a genuine monotonic gap recovers',t=>{
  const result=watchdogHarness(t,[{now:1000,beat:'1000'},{now:1000,beat:''},{now:1001,beat:'1001'},{now:1013,beat:'bad'},{now:1014,beat:''}]);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Renderer stalled/);
  assert.match(result.stdout,/WATCHDOG_LAST=1001 TICK=5/);assert.equal((result.events.match(/healthy/g)||[]).length,4);
  assert.doesNotMatch(result.events,/WALL_CLOCK_USED/);
});

test('status accepts boot-time zero but fails closed when the monotonic command fails or a beat is in the future',t=>{
  const f=fixture(t);f.rendererCapability('unused');f.put('run/renderer.pid','4343 456\n');f.processRecord(4343,456,unix(f.root)+'/topflow-screen');
  f.put('monotonic','0\n');f.put('run/heartbeat','0\n');
  let result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).ready,true);
  f.put('run/heartbeat','1\n');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).ready,false);
  f.put('clock-failed');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).ready,false);
  assert.equal(result.events,'');
});

async function waitForFile(file){
  const until=Date.now()+5000;
  while(!fs.existsSync(file)){if(Date.now()>until)throw Error('Local concurrency barrier timed out: '+file);await new Promise(resolve=>setTimeout(resolve,15));}
}

for(const reinstall of [false,true])test('concurrent loaded controller cannot recreate RUN after uninstall'+(reinstall?' or act on an identical reinstallation (ABA)':''),async t=>{
  const f=fixture(t);f.put('factory');
  const block=controller.slice(controller.indexOf('lifecycle_lock() {'),controller.indexOf('# END LIFECYCLE_LOCK'));
  const ready=path.join(f.base,'opened'),resume=path.join(f.base,'resume');
  const script=path.join(f.base,'delayed-start.sh');
  // Two real local shells, actual inherited fd and real filesystem inode. The
  // unavailable flock syscall is replaced only at its before-acquire barrier.
  fs.writeFileSync(script,`#!/bin/sh\nset -eu\nPATH=${quote(unix(path.dirname(dash)))}:$PATH\nexport PATH\nROOT=${quote(unix(f.root))}\nRUN=${quote(unix(f.run))}
stat() {
 if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}';
 elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}';
 elif [ "$2" = %a ]; then printf '600\\n'; elif [ "$2" = %h ]; then printf '1\\n'; else printf '0\\n'; fi
}
readlink() { [ "$1" = -f ] && printf '%s\\n' "$2"; }
flock() { printf opened > ${quote(unix(ready))}; IFS= read -r resume_word; [ "$resume_word" = resume ]; }
${block}
(
lifecycle_lock
mkdir "$RUN"
printf 'BAD_RUNTIME_CREATED\\n'
)
`);
  const child=spawn(dash,[unix(script)],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  await waitForFile(ready);
  const removed=f.execute(controller,['uninstall','--confirmed']);assert.equal(removed.status,0,removed.stderr+removed.stdout);assert(!fs.existsSync(f.run));assert(!fs.existsSync(f.root));
  if(reinstall){fs.mkdirSync(f.root);f.put('root/.topflow-install','TOPFLOW_SCREEN_INSTALL_V1\n'+'a'.repeat(64)+'\n');f.put('root/.lifecycle.lock','');}
  child.stdin.end('resume\n');const result=await done;
  assert.equal(result.code,8,stderr+stdout);assert.match(stderr,/Installation changed/);assert.doesNotMatch(stdout,/BAD_RUNTIME_CREATED/);assert(!fs.existsSync(f.run));
});


function preflightSequence(f,codes,{afterSuccessClock}={}) {
  f.rendererCapability('unused');
  const pathCount=quote(unix(path.join(f.base,'preflight-count'))),events=quote(unix(path.join(f.base,'events')));
  const sequence=codes.map((code,i)=>`${i+1}) printf '%s\n' ${quote(code)}; ${code.startsWith('DISPLAY_PREFLIGHT_OK')?(afterSuccessClock?`printf '${afterSuccessClock}.00 0.00\n' > ${quote(unix(path.join(f.proc,'uptime')))}; `:'')+'exit 0':'exit 7'};;`).join('\n');
  f.put('root/topflow-screen',`#!/bin/sh\nif [ "$1" = --monotonic-seconds ]; then printf '1000\n'; exit 0; fi\nif [ "$1" = --display-preflight ]; then\n n=$(cat ${pathCount} 2>/dev/null || printf 0); n=$((n+1)); printf '%s\n' "$n" > ${pathCount}; printf 'preflight %s\n' "$n" >> ${events}\n case "$n" in ${sequence}\n *) printf '%s\n' ${quote(codes.at(-1))}; exit 7;; esac\nfi\nprintf 'renderer-adopt\n' >> ${events}\nexit 1\n`);
  fs.chmodSync(path.join(f.root,'topflow-screen'),0o755);
}
const goodReceipt='DISPLAY_PREFLIGHT_OK PIN_GUARD=none BRIGHTNESS=0 LCDLOCK=0 AUTO=0 LEVEL=100 TIMEOUT=30 PERIODIC=0 SENSOR=0 LUX=-1 INTERNAL=0 AUTOLOCK=0 DIRECT=1';

test('preflight failure codes survive cleanup and remain bounded in read-only status',t=>{
  const f=fixture(t);f.put('factory');preflightSequence(f,['SLEEP_PROVIDER_UNAVAILABLE']);
  let result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,7,result.stderr+result.stdout);
  assert.match(result.stdout,/TOPFLOW_ERROR=SLEEP_PROVIDER_UNAVAILABLE/);
  assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:SLEEP_PROVIDER_UNAVAILABLE\n');
  result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).failure,'SLEEP_PROVIDER_UNAVAILABLE');
  assert.doesNotMatch(result.events,/service delete|factory-start|guard-acquire/);
  preflightSequence(f,['SECRET_FIELD=never-echo-this']);result=f.execute(supervisor,['--confirmed']);
  assert.match(result.stdout,/TOPFLOW_ERROR=DISPLAY_LIFECYCLE_PREFLIGHT_FAILED/);assert.doesNotMatch(result.stdout+result.stderr,/never-echo/);
});

test('direct handover rejects unstable preflight instead of silently waiting minutes',t=>{
  const f=fixture(t);f.put('factory');preflightSequence(f,['FACTORY_INTERNAL_LOCK_UNSTABLE',goodReceipt]);
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,7,result.stderr+result.stdout);
  assert.match(result.stdout,/FACTORY_INTERNAL_LOCK_UNSTABLE/);
  assert.equal((result.events.match(/preflight /g)||[]).length,1);
  assert.doesNotMatch(result.events,/service delete|guard-acquire|wait-sleep 5/);
});

test('direct handover transfers an owned display lock and leaves unrelated locks intact',t=>{
  const f=fixture(t);f.put('factory');f.put('wakelockMap.txt','zte_topsw_devui 777\nsysZteSleepLock 800\n');
  f.put('wake-active','sysZteSleepLock zteSleepBacklight zte_topsw_devui_auto_sleep_lock other_network_lock\n');
  f.rendererCapability(goodReceipt.replace('INTERNAL=0 AUTOLOCK=0','INTERNAL=1 AUTOLOCK=1'));
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.indexOf('service delete')<result.events.indexOf('internalDeleteWakelock'));
  assert(result.events.indexOf('internalDeleteWakelock')<result.events.indexOf('renderer-adopt'));
  assert.match(result.events,/factory-autosleep-release/);
  const locks=fs.readFileSync(path.join(f.base,'wake-active'),'utf8');
  assert.match(locks,/sysZteSleepLock/);assert.match(locks,/zteSleepBacklight/);assert.match(locks,/other_network_lock/);
  assert.doesNotMatch(locks,/zte_topsw_devui_auto_sleep_lock/);
});

test('TERM during direct-handover map verification restores without a competing renderer',t=>{
  const f=fixture(t);f.put('factory');f.put('cancel-preflight-wait');f.rendererCapability(goodReceipt);
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,143,result.stderr+result.stdout);
  assert.doesNotMatch(result.events,/service delete|renderer-adopt/);assert(fs.existsSync(path.join(f.base,'factory')));
});

test('waiting status requires the exact live supervisor and computes remaining time from suspend-inclusive uptime',t=>{
  const f=fixture(t);f.put('factory');f.put('run/last-status','waiting:FACTORY_AUTOSLEEP_LOCK_ACTIVE:1360\n');
  let result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).failure,'PREFLIGHT_ABORTED');
  f.put('run/supervisor.pid','4242 123\n');f.processRecord(4242,123,'/bin/busybox','sh\0'+unix(f.root)+'/supervisor.sh\0--confirmed\0');
  result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).waitingRemaining,360);
  f.put('proc/uptime','1300.25 0.00\n');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).waitingRemaining,60);
  f.put('run/last-status','waiting:FACTORY_AUTOSLEEP_LOCK_ACTIVE:evil:1360\n');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).waiting,undefined);
  assert.doesNotMatch(result.events,/flock|kill|factory-start/);
});

function legacyFixture(f,version='0.1.0'){
  const crypto=require('node:crypto'),{tarMembers}=require('../tools/build.cjs');
  const digest=version==='0.1.1'?'40c3b519c49ff033d640ee49a87798704cbf6f13352749cb6eeec06af49b5dbc':'c3f71f86bc6eec94b626c58ab35aa8e42d8b0fd959dc9fea0766aa896034d8e4';
  const archive=fs.readFileSync(path.join(project,'analysis/fixtures/topflow-native-'+version+'-'+digest.slice(0,8)+'.tar.gz'));
  assert.equal(crypto.createHash('sha256').update(archive).digest('hex'),digest);
  const members=tarMembers(archive);
  for(const item of members){const relative=item.name.replace(/^\.\//,'').replace(/\/$/,'');if(!relative)continue;const dst=path.join(f.root,relative);if(item.type==='5')fs.mkdirSync(dst,{recursive:true});else {fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,item.content);}}
  f.put('root/.topflow-install','TOPFLOW_SCREEN_INSTALL_V1\n'+digest+'\n');
  f.put('root/.topflow-files',members.map(m=>m.name.replace(/^\.\//,'').replace(/\/$/,'')).filter(Boolean).join('\n')+'\n');
}

test('failed deployed 0.1.1 is pinned by exact archive and file hashes for recovery, never direct start',t=>{
  const f=fixture(t);legacyFixture(f,'0.1.1');f.put('factory');
  let result=f.execute(plugin.buildScreenCommand('status',partialPayload),[],{realHash:true});assert.equal(result.status,0,result.stderr+result.stdout);assert.equal(plugin.parseScreenStatus(result.stdout).versionMismatch,true);
  result=f.execute(plugin.buildScreenCommand('start',partialPayload,true),[],{realHash:true});assert.notEqual(result.status,0);assert.match(result.stdout,/INSTALLED_VERSION_MISMATCH/);assert.doesNotMatch(result.events,/service delete|renderer-adopt/);
  const helper=path.join(f.root,'topflow-factory-bus-aarch64'),original=fs.readFileSync(helper);fs.appendFileSync(helper,'changed');
  result=f.execute(plugin.buildScreenCommand('restore',partialPayload,true),[],{realHash:true});assert.notEqual(result.status,0);assert.match(result.stdout,/UNVERIFIED_LEGACY_FILES/);
  fs.writeFileSync(helper,original);f.put('root/.uninstalling','uninstalling\n');fs.unlinkSync(path.join(f.root,'supervisor.sh'));
  result=f.execute(plugin.buildScreenCommand('uninstall',partialPayload,true),[],{realHash:true});assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});

function diagnosticRenderer(f, diagnostic, exitCommand='exit 7') {
  f.rendererCapability(goodReceipt);
  const file=path.join(f.root,'topflow-screen');
  let source=fs.readFileSync(file,'utf8');
  const record=diagnostic===null?'':`printf '%s' ${quote(diagnostic)} > ${quote(unix(path.join(f.run,'renderer.failure')))}\nchmod 600 ${quote(unix(path.join(f.run,'renderer.failure')))}\n`;
  source=source.replace(/exit 1\n$/,()=>record+exitCommand+'\n');
  fs.writeFileSync(file,source);
}

test('native failure preserves bounded startup stage and actual child wait status after factory restoration',t=>{
  const f=fixture(t);f.put('factory');
  for(const exit of [0,7,139]){
    diagnosticRenderer(f,'TF_NATIVE_FAILURE_V1 DRM_INIT\n','exit '+exit);
    const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
    assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),`failure:RENDERER_EXITED:${exit}:DRM_INIT\n`);
    const status=f.execute(controller,['status']);assert.deepEqual(JSON.parse(status.stdout),{mode:'factory',failure:'RENDERER_EXITED',rendererExitStatus:exit,rendererFailure:'DRM_INIT',autostart:{enabled:false,hook:'absent',state:'disabled',reason:'NONE'}});
    assert(fs.existsSync(path.join(f.base,'factory')));
  }
});

test('signal exit is preserved numerically without guessing it was an explicit exit or a signal',t=>{
  const f=fixture(t);f.put('factory');diagnosticRenderer(f,null,`exec ${quote(unix(dash))} -c 'kill -TERM $$'`);
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:RENDERER_EXITED:143:-\n');
});

test('exit collector never waits for a live child or unreadable proc identity, and reaps a confirmed zombie once',t=>{
  const f=fixture(t);f.processRecord(4343,456,'unrelated');
  const functions=supervisor.slice(supervisor.indexOf('known_renderer_failure() {'),supervisor.indexOf('record_status() {'));
  const code='#!/bin/sh\nset -eu\nRUN=/tmp/topflow-screen\nrenderer=4343\nrenderer_reaped=0\nrenderer_exit=\nrenderer_detail=\n'+functions+'\nwait() { log reaped; return 139; }\ncollect_renderer_exit\ncollect_renderer_exit\nprintf "%s:%s\\n" "$renderer_reaped" "$renderer_exit"\n';
  let result=f.execute(code,[]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'0:\n');assert.doesNotMatch(result.events,/reaped/);
  fs.unlinkSync(path.join(f.proc,'4343/stat'));result=f.execute(code,[]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'0:\n');assert.doesNotMatch(result.events,/reaped/);
  f.processRecord(4343,456,'unrelated');const stat=path.join(f.proc,'4343/stat');fs.writeFileSync(stat,fs.readFileSync(stat,'utf8').replace(') S ',') Z '));
  result=f.execute(code,[]);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'1:139\n');assert.equal((result.events.match(/reaped/g)||[]).length,1);
});

test('native, supervisor, controller and browser accept the same exact diagnostic enum',()=>{
  const header=fs.readFileSync(path.join(project,'native/native_failure.h'),'utf8');
  const codes=[...header.slice(header.indexOf('allowed[]={'),header.indexOf('};')).matchAll(/"([A-Z_]+)"/g)].map(match=>match[1]);assert.equal(codes.length,55);
  for(const code of codes){
    for(const source of [supervisor,controller]){
      const section=source.slice(source.indexOf('known_renderer_failure() {'),source.indexOf('\n}',source.indexOf('known_renderer_failure() {')));
      assert(section.split(/[^A-Z_]+/).includes(code),code);
    }
    assert.equal(plugin.parseScreenStatus('TOPFLOW_SCREEN='+JSON.stringify({mode:'factory',failure:'RENDERER_EXITED',rendererFailure:code})).rendererFailure,code);
  }
});

test('wake diagnostics pass the actual native filter and survive recovery through controller and browser',t=>{
  const codes=['WAKE_SENSOR_GUARD','WAKE_POLICY_READ','WAKE_POLICY_CHANGED','WAKE_SENSOR_PREPARE'];
  const header=fs.readFileSync(path.join(project,'native/native_failure.h'),'utf8');
  const production=header.slice(header.indexOf('static const char*native_failure_code;'),header.indexOf('static void native_failure_publish('));
  const f=fixture(t),source=path.join(f.base,'actual-wake-filter.c'),exe=path.join(f.base,process.platform==='win32'?'actual-wake-filter.exe':'actual-wake-filter');
  fs.writeFileSync(source,'#include <assert.h>\n#include <stddef.h>\n#include <string.h>\n'+production+'\nint main(void){const char*codes[]={'+codes.map(code=>JSON.stringify(code)).join(',')+'};for(unsigned i=0;i<4;i++){native_failure_code=NULL;native_failure_note("WAKE_PRIVATE_UNKNOWN");assert(!native_failure_code);native_failure_note(codes[i]);native_failure_note("DISPLAY_RUNTIME");assert(native_failure_code&&!strcmp(native_failure_code,codes[i]));}return 0;}\n');
  const compiler=process.platform==='win32'?path.join(project,'native/toolchain/zig-x86_64-windows-0.14.1/zig.exe'):'cc';
  const args=(process.platform==='win32'?['cc','-target','x86_64-windows-gnu']:[]).concat(['-O2','-UNDEBUG',source,'-o',exe]);
  let compiled=spawnSync(compiler,args,{encoding:'utf8'});assert.equal(compiled.status,0,compiled.stderr);
  let filtered=spawnSync(exe,[],{encoding:'utf8'});assert.equal(filtered.status,0,filtered.stderr+filtered.stdout);
  f.put('factory');
  for(const code of codes){
    diagnosticRenderer(f,'TF_NATIVE_FAILURE_V1 '+code+'\n');
    const recovered=f.execute(supervisor,['--confirmed']);assert.equal(recovered.status,0,recovered.stderr+recovered.stdout);
    assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),`failure:RENDERER_EXITED:7:${code}\n`);
    const status=f.execute(controller,['status']);assert.equal(status.status,0,status.stderr);
    const parsed=plugin.parseScreenStatus('TOPFLOW_SCREEN='+status.stdout.trim());assert.equal(parsed.mode,'factory');assert.equal(parsed.rendererFailure,code);assert.equal(parsed.rendererExitStatus,7);
  }
});

test('diagnostics discard stale, unrecognized, unterminated, multiple-line and oversized native content',t=>{
  const f=fixture(t);f.put('factory');
  const invalid=[null,'TF_NATIVE_FAILURE_V1 credential-private\n','TF_NATIVE_FAILURE_V1 DRM_INIT','TF_NATIVE_FAILURE_V1 DRM_INIT\nPRIVATE\n','TF_NATIVE_FAILURE_V1 '+ 'A'.repeat(100)+'\n'];
  for(const diagnostic of invalid){
    f.put('run/renderer.failure','TF_NATIVE_FAILURE_V1 PIN_STATE_OPEN\n');
    diagnosticRenderer(f,diagnostic);
    const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
    assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:RENDERER_EXITED:7:-\n');
    assert.doesNotMatch(result.stdout+result.stderr,/credential-private|PRIVATE/);
  }
});

test('a recovery failure remains primary while the native stage and exit status remain available',t=>{
  const f=fixture(t);f.put('factory');f.put('fail-provider-after-handover');diagnosticRenderer(f,'TF_NATIVE_FAILURE_V1 BUS_CONNECT\n');
  const result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,8,result.stderr+result.stdout);
  assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:FACTORY_RESTORE_UNCONFIRMED:7:BUS_CONNECT\n');
  const status=f.execute(controller,['status']);assert.equal(JSON.parse(status.stdout).failure,'FACTORY_RESTORE_UNCONFIRMED');
  assert.equal(JSON.parse(status.stdout).rendererFailure,'BUS_CONNECT');
});

test('only bounded diagnostic metadata is exposed by read-only status and it does not prevent full uninstall',t=>{
  const f=fixture(t);f.put('factory');f.put('run/renderer.failure','TF_NATIVE_FAILURE_V1 DRM_INIT\n');
  f.put('run/last-status','failure:RENDERER_EXITED:7:DRM_INIT\n');
  const before=fs.readFileSync(path.join(f.run,'last-status'));
  let result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).rendererExitStatus,7);
  assert.deepEqual(fs.readFileSync(path.join(f.run,'last-status')),before);assert.doesNotMatch(result.events,/flock|kill|factory-start/);
  for(const record of ['failure:RENDERER_EXITED:999:SECRET_PRIVATE','failure:RENDERER_EXITED:7:DRM_INIT:extra','factory-restored']){
    f.put('run/last-status',record+'\n');result=f.execute(controller,['status']);assert.equal(JSON.parse(result.stdout).rendererFailure,undefined);assert.doesNotMatch(result.stdout,/SECRET_PRIVATE|extra/);
  }
  result=f.execute(controller,['uninstall','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.run));
});

test('known previous archive is read-only identifiable, never startable, and recoverable using the new controller',t=>{
  const f=fixture(t);f.put('factory');legacyFixture(f);
  let result=f.execute(plugin.buildScreenCommand('status',partialPayload),[],{realHash:true});assert.equal(result.status,0,result.stderr+result.stdout);assert.equal(plugin.parseScreenStatus(result.stdout).versionMismatch,true);
  assert.doesNotMatch(result.events,/flock|kill|factory-start/);
  result=f.execute(plugin.buildScreenCommand('start',partialPayload,true),[],{realHash:true});assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/INSTALLED_VERSION_MISMATCH/);
  result=f.execute(plugin.buildScreenCommand('uninstall',partialPayload,true),[],{realHash:true});assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});

test('old migration rejects modified executable bytes and can resume an exactly owned interrupted uninstall',t=>{
  const f=fixture(t);f.put('factory');legacyFixture(f);const old=fs.readFileSync(path.join(f.root,'supervisor.sh'));f.put('root/supervisor.sh','modified');
  let result=f.execute(plugin.buildScreenCommand('uninstall',partialPayload,true),[],{realHash:true});assert.equal(result.status,1,result.stderr+result.stdout);assert.match(result.stdout,/UNVERIFIED_LEGACY_FILES/);assert.doesNotMatch(result.events,/flock|kill|factory-start/);
  fs.writeFileSync(path.join(f.root,'supervisor.sh'),old);fs.unlinkSync(path.join(f.root,'topflow-screen'));
  result=f.execute(plugin.buildScreenCommand('status',partialPayload),[],{realHash:true});assert.equal(result.status,1);
  f.put('root/.uninstalling','uninstalling\n');result=f.execute(plugin.buildScreenCommand('uninstall',partialPayload,true),[],{realHash:true});assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});


test('failed supervisor guard release retains exact recovery identities and prevents success until the new controller confirms cleanup',t=>{
  const f=fixture(t);f.put('factory');f.put('fake-child-birth');f.put('guard-release-fail');f.rendererCapability(goodReceipt);
  let result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,8,result.stderr+result.stdout);
  assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:TRANSITION_GUARD_RELEASE_UNCONFIRMED:1:-\n');
  assert(fs.existsSync(path.join(f.run,'supervisor.pid')));assert(fs.existsSync(path.join(f.run,'renderer.pid')));
  const savedRenderer=fs.readFileSync(path.join(f.run,'renderer.pid'),'utf8').trim().split(/\s+/);assert.equal(savedRenderer.length,2);
  fs.appendFileSync(path.join(f.base,'wake-active'),'topflow_screen_'+savedRenderer[0]+'_'+savedRenderer[1]+'_idle\n');
  result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,5,result.stderr+result.stdout);
  assert(fs.existsSync(path.join(f.run,'renderer.pid')));assert(fs.existsSync(path.join(f.run,'supervisor.pid')));
  fs.unlinkSync(path.join(f.base,'guard-release-fail'));
  result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert(!fs.existsSync(path.join(f.run,'supervisor.pid')));assert(!fs.existsSync(path.join(f.run,'renderer.pid')));
  assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'factory-restored\n');
  assert.doesNotMatch(fs.readFileSync(path.join(f.base,'wake-active'),'utf8'),/topflow_screen_/);
  assert(controller.indexOf('[ "$failure" != TRANSITION_GUARD_RELEASE_UNCONFIRMED ]')<controller.indexOf('    rm -f "$RUN/supervisor.pid" "$RUN/renderer.pid"'));
});


test('controller re-reads exact cleanup identities after cancelling a supervisor whose guard release fails during exit',t=>{
  const f=fixture(t);f.put('factory');f.put('active-supervisor');f.put('run/supervisor.pid','4242 123\n');f.put('cleanup-publishes-guard-failure');f.put('guard-release-fail');
  f.processRecord(4242,123,'/bin/busybox','sh\0'+unix(f.root)+'/supervisor.sh\0--confirmed\0');
  f.put('wake-active','sysZteSleepLock topflow_screen_4242_123 topflow_screen_4343_456_idle\n');
  let result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,5,result.stderr+result.stdout);
  assert(fs.existsSync(path.join(f.run,'renderer.pid')));assert(fs.existsSync(path.join(f.run,'supervisor.pid')));
  assert.doesNotMatch(result.stdout,/Factory process is running/);
  fs.unlinkSync(path.join(f.base,'guard-release-fail'));
  result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert(result.events.includes('guard-release topflow_screen_4343_456_idle'));
  assert(!fs.existsSync(path.join(f.run,'renderer.pid')));assert(!fs.existsSync(path.join(f.run,'supervisor.pid')));
});


test('unfinished factory recovery and a surviving helper both retain identities until a later exact cleanup succeeds',t=>{
  for(const mode of ['factory-provider','surviving-helper']) {
    const f=fixture(t);f.put('factory');f.put('fake-child-birth');f.rendererCapability(goodReceipt);
    if(mode==='factory-provider')f.put('fail-provider-after-handover');
    else f.processRecord(4444,100,unix(f.root)+'/topflow-factory-bus-aarch64');
    let result=f.execute(supervisor,['--confirmed']);assert.equal(result.status,8,result.stderr+result.stdout);
    const failure=mode==='factory-provider'?'FACTORY_RESTORE_UNCONFIRMED':'RENDERER_STILL_ACTIVE';
    assert.equal(fs.readFileSync(path.join(f.run,'last-status'),'utf8'),'failure:'+failure+':1:-\n');
    assert(fs.existsSync(path.join(f.run,'supervisor.pid')));assert(fs.existsSync(path.join(f.run,'renderer.pid')));
    if(mode==='factory-provider')fs.unlinkSync(path.join(f.base,'provider-missing'));
    result=f.execute(controller,['restore','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
    assert(!fs.existsSync(path.join(f.run,'renderer.pid')));assert(!fs.existsSync(path.join(f.run,'supervisor.pid')));
    if(mode==='surviving-helper')assert(result.events.indexOf('kill -TERM 4444')<result.events.lastIndexOf('factory-start'));
  }
});


test('double process death with normal last-status still releases exact saved idle lease before uninstall',t=>{
  const f=fixture(t);f.put('factory');f.put('run/supervisor.pid','4242 123\n');f.put('run/renderer.pid','4343 456\n');f.put('run/last-status','renderer-started\n');
  f.put('wake-active','sysZteSleepLock topflow_screen_4242_123 topflow_screen_4343_456 topflow_screen_4343_456_idle topflow_screen_4343_999_idle\n');
  const result=f.execute(controller,['uninstall','--confirmed']);assert.equal(result.status,0,result.stderr+result.stdout);
  assert.deepEqual(fs.readFileSync(path.join(f.base,'wake-active'),'utf8').trim().split(/\s+/),['sysZteSleepLock','topflow_screen_4343_999_idle']);
  assert.doesNotMatch(result.events,/kill -TERM (?:4242|4343)/);assert(!fs.existsSync(f.run));assert(!fs.existsSync(f.root));
});

test('start refuses a still-active saved exact idle lease before it can overwrite dead process identities',t=>{
  const f=fixture(t);f.put('factory');f.rendererCapability(goodReceipt);f.put('root/supervisor.sh','fixture');
  f.put('run/supervisor.pid','4242 123\n');f.put('run/renderer.pid','4343 456\n');f.put('run/last-status','renderer-started\n');
  f.put('wake-active','sysZteSleepLock topflow_screen_4343_456_idle\n');
  const adapted=controller.replace('[ "$(uname -m)" = aarch64 ]','true').replace('[ -x /etc/init.d/zte_topsw_devui ] && [ -c /dev/dri/card0 ]','true');
  const result=f.execute(adapted,['start','--confirmed']);assert.equal(result.status,8,result.stderr+result.stdout);
  assert.match(result.stdout,/TOPFLOW_ERROR=TRANSITION_GUARD_RELEASE_UNCONFIRMED/);
  assert.equal(fs.readFileSync(path.join(f.run,'renderer.pid'),'utf8'),'4343 456\n');assert.equal(fs.readFileSync(path.join(f.run,'supervisor.pid'),'utf8'),'4242 123\n');
  assert.doesNotMatch(result.events,/kill |service delete|renderer-adopt/);
});
