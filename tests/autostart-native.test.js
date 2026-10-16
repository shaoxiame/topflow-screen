'use strict';
// Every device, boot, runtime and proc path is redirected to a disposable local
// fixture. Shell subprocesses used for screen handover are inert test doubles.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const fixtureSource=fs.readFileSync(path.join(__dirname,'native-supervisor.test.js'),'utf8');
const begin=fixtureSource.indexOf('function fixture(t){'),end=fixtureSource.indexOf("test('native scripts parse",begin);
const fixture=vm.runInNewContext(fixtureSource.slice(begin,end).replace('timeout:15000','timeout:20000')+'\nfixture;',{fs,os,path,assert,dash,unix,quote,spawnSync,spawn,process,project});
const controller=fs.readFileSync(path.join(project,'native/screenctl.sh'),'utf8');
const bootId='01234567-89ab-cdef-0123-456789abcdef';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const realHashShell=`sha256sum() { ${quote(unix(process.execPath))} -e ${quote("const fs=require('node:fs'),c=require('node:crypto');const h=p=>c.createHash('sha256').update(fs.readFileSync(p.replace(/^\\/([a-z])\\//,(_,d)=>d+':/'))).digest('hex');const a=process.argv.slice(1);if(a[0]==='-c'){for(const l of fs.readFileSync(a[1],'utf8').trim().split(/\\n/)){const m=l.match(/^([a-f0-9]{64})  (.+)$/);if(!m||h(m[2])!==m[1])process.exit(1);}}else process.stdout.write(h(a[0])+'  '+a[0]+'\\n');")} -- "$@"; }`;

function setup(t){
  const f=fixture(t),boot=path.join(f.base,'ufi_tools_boot.sh');
  const line=`sh ${unix(f.root)}/screenctl.sh autostart-run >/dev/null 2>&1 & # TOPFLOW_SCREEN_AUTOSTART_V1`;
  fs.mkdirSync(path.join(f.proc,'sys/kernel/random'),{recursive:true});
  f.put('proc/sys/kernel/random/boot_id',bootId+'\n');
  f.put('factory');
  f.put('root/screenctl.sh','#!/bin/sh\nexit 0\n');
  f.put('root/supervisor.sh','#!/bin/sh\nexit 0\n');
  f.put('root/topflow-screen','local renderer placeholder');
  f.put('root/topflow-factory-bus-aarch64','local helper placeholder');
  f.put('root/boot-hook.sh',`#!/bin/sh
case "$1" in
 enable) printf '%s\\n' '#!/bin/sh' ${quote(line)} > ${quote(unix(boot))};;
 disable) [ ! -e ${quote(unix(boot))} ] || rm -f ${quote(unix(boot))};;
 *) exit 1;;
esac
`);
  function integrity(){
    const members=['screenctl.sh','supervisor.sh','boot-hook.sh','topflow-screen','topflow-factory-bus-aarch64','topflow-screen.sha256','ui/index.html'];
    f.put('root/boot-integrity.sha256',members.map(n=>hash(fs.readFileSync(path.join(f.root,n)))+'  '+n+'\n').join(''));
    f.put('root/.topflow-files',[...members,'boot-integrity.sha256','ui'].join('\n')+'\n');
  }
  integrity();
  function enabled(){
    f.put('root/.autostart-enabled','TOPFLOW_SCREEN_AUTOSTART_V1\n'+'a'.repeat(64)+'\n'+hash(fs.readFileSync(path.join(f.root,'boot-integrity.sha256')))+'\n');
    fs.writeFileSync(boot,'#!/bin/sh\n'+line+'\n');
  }
  function run(args,extra=''){
    if(process.env.TF_AUTOSTART_TRACE)extra+='\nset -x\n';
    let source=controller.replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(boot)));
    source=source.replace('# END AUTOSTART',()=>`# END AUTOSTART
${realHashShell}
${extra}
`);
    return f.execute(source,args);
  }
  return {...f,boot,line,integrity,enabled,command:run};
}

test('autostart settings require explicit confirmation and do not exist by default',t=>{
  const f=setup(t);
  for(const action of ['autostart-enable','autostart-disable']){
    const r=f.command([action]);assert.equal(r.status,2,r.stderr);assert(!fs.existsSync(f.boot));assert(!fs.existsSync(path.join(f.root,'.autostart-enabled')));
  }
  const r=f.command(['autostart-run']);assert.equal(r.status,0,r.stderr);assert.equal(r.events,'');
  assert(!fs.existsSync(path.join(f.run,'autostart.attempt')));
});

test('enable is idempotent and arms a future boot without starting or stopping display',t=>{
  const f=setup(t);
  for(let n=0;n<2;n++){
    const r=f.command(['autostart-enable','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/TOPFLOW_AUTOSTART=ENABLED/);
    assert.doesNotMatch(r.events,/kill |service delete|factory-start|renderer-adopt/);
  }
  assert.equal(fs.readFileSync(f.boot,'utf8').split(f.line).length,2);
  const r=f.command(['status']);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).autostart,{enabled:true,hook:'present',state:'enabled',reason:'NONE'});
});

test('corrupt or mismatched boot component prevents enable before shared boot changes',t=>{
  const f=setup(t);f.put('root/supervisor.sh','changed after local package digest');
  const r=f.command(['autostart-enable','--confirmed']);assert.equal(r.status,8,r.stderr);assert.match(r.stdout,/AUTOSTART_INTEGRITY_FAILED/);
  assert(!fs.existsSync(f.boot));assert(!fs.existsSync(path.join(f.root,'.autostart-enabled')));
  assert.doesNotMatch(r.events,/kill |service delete|factory-start|renderer-adopt/);
});

test('status is read-only and refuses enabled status when signed components changed',t=>{
  const f=setup(t);f.enabled();f.put('root/supervisor.sh','corrupt');
  const before=fs.readFileSync(path.join(f.root,'.autostart-enabled'),'utf8');
  const r=f.command(['status']);assert.equal(r.status,0,r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).autostart,{enabled:false,hook:'present',state:'failed',reason:'INTEGRITY_FAILED'});
  assert.equal(fs.readFileSync(path.join(f.root,'.autostart-enabled'),'utf8'),before);assert.equal(r.events,'');
});

test('disable removes the opt-in and future boot hook without stopping the active screen',t=>{
  const f=setup(t);f.enabled();
  const r=f.command(['autostart-disable','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/TOPFLOW_AUTOSTART=DISABLED/);
  assert(!fs.existsSync(path.join(f.root,'.autostart-enabled')));assert(!fs.existsSync(f.boot));
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.cancel'),'utf8'),bootId+'\n');
  assert.doesNotMatch(r.events,/kill |service delete|factory-start|renderer-adopt/);
});

const fastClock=`
wait_now() { if [ -f "$TF_FIX/fast-clock" ]; then n=$(cat "$TF_FIX/fast-clock"); else n=0; fi; n=$((n+30)); printf '%s\\n' "$n" > "$TF_FIX/fast-clock"; printf '%s\\n' "$n"; }
`;
test('boot waits at most its deadline, keeps factory running and never retries that boot',t=>{
  const f=setup(t);f.enabled();
  let r=f.command(['autostart-run'],fastClock+'\nautostart_dependencies_ready() { log readiness-check; return 1; }');
  assert.equal(r.status,0,r.stderr+r.stdout);assert.equal(fs.readFileSync(path.join(f.run,'autostart.status'),'utf8'),'failed READY_TIMEOUT\n');
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.attempt'),'utf8'),bootId+'\n');assert(fs.existsSync(path.join(f.base,'factory')));
  assert.doesNotMatch(r.events,/service delete|renderer-adopt/);assert(!fs.existsSync(path.join(f.run,'autostart.pid')));
  const checks=(r.events.match(/readiness-check/g)||[]).length;assert(checks>0&&checks<6);
  r=f.command(['autostart-run'],fastClock+'\nautostart_dependencies_ready() { log readiness-check; return 1; }');
  assert.equal(r.status,0,r.stderr);assert.equal((r.events.match(/readiness-check/g)||[]).length,checks);
});

test('a ready boot launches the normal controller once and confirms three healthy samples',t=>{
  const f=setup(t);f.enabled();
  const extra=fastClock+`
autostart_dependencies_ready() { return 0; }
sh() {
  if [ "$1" = "$ROOT/screenctl.sh" ] && [ "$2" = start ]; then log "boot-start $*"; return 0; fi
  if [ "$1" = "$ROOT/screenctl.sh" ] && [ "$2" = status ]; then log boot-status; printf '{"mode":"custom","ready":true,"supervised":true}\\n'; return 0; fi
  command sh "$@"
}
`;
  const r=f.command(['autostart-run'],extra);assert.equal(r.status,0,r.stderr+r.stdout);
  assert.equal((r.events.match(/boot-start /g)||[]).length,1);assert.equal((r.events.match(/boot-status/g)||[]).length,3);
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.status'),'utf8'),'started SCREEN_READY\n');
  assert(!fs.existsSync(path.join(f.run,'autostart.pid')));
});

test('failed startup never retries or issues another factory/display command',t=>{
  const f=setup(t);f.enabled();
  const extra=fastClock+`
autostart_dependencies_ready() { return 0; }
sh() { if [ "$1" = "$ROOT/screenctl.sh" ] && [ "$2" = start ]; then log boot-start-failed; return 8; fi; command sh "$@"; }
`;
  const r=f.command(['autostart-run'],extra);assert.equal(r.status,0,r.stderr);assert.equal((r.events.match(/boot-start-failed/g)||[]).length,1);
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.status'),'utf8'),'failed START_FAILED\n');assert.doesNotMatch(r.events,/kill |service delete|factory-start/);
});

test('opt-in removed during readiness prevents the pending boot handover',t=>{
  const f=setup(t);f.enabled();
  const extra=fastClock+`
autostart_dependencies_ready() { rm -f "$ROOT/.autostart-enabled"; return 1; }
sh() { if [ "$1" = "$ROOT/screenctl.sh" ]; then log forbidden-start; return 1; fi; command sh "$@"; }
`;
  const r=f.command(['autostart-run'],extra);assert.equal(r.status,0,r.stderr);
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.status'),'utf8'),'cancelled USER_CANCELLED\n');assert.doesNotMatch(r.events,/forbidden-start|kill |service delete/);
});

test('manual restoration cancels the pending boot worker and preserves future-boot opt-in',t=>{
  const f=setup(t);f.enabled();f.put('run/autostart.pid','4242 123\n');f.put('run/autostart.attempt',bootId+'\n');
  f.processRecord(4242,123,'/bin/busybox','sh\0'+unix(f.root)+'/screenctl.sh\0autostart-run\0');
  const r=f.command(['restore','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);
  assert.match(r.events,/kill -TERM 4242/);assert(fs.existsSync(path.join(f.root,'.autostart-enabled')));assert(fs.existsSync(f.boot));
  assert.equal(fs.readFileSync(path.join(f.run,'autostart.cancel'),'utf8'),bootId+'\n');assert(!fs.existsSync(path.join(f.run,'autostart.pid')));
});

test('cancel refuses a reused or unrelated live worker identity without signalling it',t=>{
  const f=setup(t);f.enabled();f.put('run/autostart.pid','4242 123\n');
  f.processRecord(4242,123,'/bin/busybox','sh\0/unrelated/script.sh\0');
  const r=f.command(['restore','--confirmed']);assert.equal(r.status,8,r.stderr);assert.match(r.stdout,/AUTOSTART_WORKER_UNVERIFIED/);assert.doesNotMatch(r.events,/kill |service delete/);
});

test('a successful uninstall removes all own autostart metadata and no shared record survives',t=>{
  const f=setup(t);f.enabled();f.put('run/autostart.attempt',bootId+'\n');f.put('run/autostart.status','failed READY_TIMEOUT\n');f.put('run/autostart.lock','');f.put('root/.autostart-hook.lock','');
  const r=f.command(['uninstall','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);
  assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));assert(!fs.existsSync(f.boot));
});

test('an old installation cannot silently delete an unknown newer boot hook',t=>{
  const f=setup(t);fs.unlinkSync(path.join(f.root,'boot-hook.sh'));fs.unlinkSync(path.join(f.root,'boot-integrity.sha256'));
  fs.writeFileSync(f.boot,'#!/bin/sh\n'+f.line+'\n');
  const r=f.command(['uninstall','--confirmed']);assert.equal(r.status,8,r.stderr);assert.match(r.stdout,/AUTOSTART_HOOK_CONFLICT/);assert(fs.existsSync(f.root));assert(fs.existsSync(f.boot));
  assert.doesNotMatch(r.events,/kill |service delete|factory-start/);
});

test('boot startup requires unchanged installation, active opt-in and no cancel flag under lock',t=>{
  for(const change of ['none','cancel','disable','identity']){
    const f=setup(t);f.enabled();f.put('run/autostart.attempt',bootId+'\n');
    const source=controller.replace('case "${1:-status}" in',`case "\${1:-status}" in
 test-guard)
    prepare_run
    autostart_boot_start_guard start --confirmed --autostart ${quote(bootId)} ${change==='identity'?quote('different-inode'):'"$(stat -c %d:%i "$ROOT")"'}
    echo GUARD_PASSED
    ;;
`);
    if(change==='cancel')f.put('run/autostart.cancel',bootId+'\n');
    if(change==='disable')fs.unlinkSync(path.join(f.root,'.autostart-enabled'));
    const adapted=source.replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(f.boot))).replace('# END AUTOSTART',()=> '# END AUTOSTART\n'+realHashShell);
    const r=f.execute(adapted,['test-guard']);assert.equal(r.status,change==='none'?0:8,r.stderr+r.stdout);
    assert.equal(r.stdout.includes('GUARD_PASSED'),change==='none');
  }
});

test('supervisor never inherits the boot-worker lock and worker does not keep lifecycle lock while waiting',()=>{
  assert.match(controller,/supervisor\.sh" --confirmed --lifecycle-held[^\n]*6>&- 9>&-/);
  const worker=controller.slice(controller.indexOf('autostart_worker() {'),controller.indexOf('# END AUTOSTART'));
  assert(worker.indexOf('exec 7<&-')<worker.indexOf('autostart_dependencies_ready'));
  assert(worker.indexOf('exec 9>&-')<worker.indexOf('autostart_dependencies_ready'));
  assert.doesNotMatch(worker,/\.log|>>|while[^\n]*sh /);
});

test('real controller and real boot editor preserve another plugin through enable, disable and complete uninstall',t=>{
  const f=setup(t),py=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3';
  const util=path.join(f.base,'hook-stat.py');
  fs.writeFileSync(util,`import os,sys\nsys.stdout.reconfigure(newline=chr(10))\ncmd,p=sys.argv[1],sys.argv[-1]\nif cmd=='chmod': os.chmod(p,int(sys.argv[2],8))\nelse:\n s=os.stat(p); f=sys.argv[2]\n vals={'%u':'0','%g':'0','%h':str(s.st_nlink),'%a':oct(s.st_mode&0o777)[2:],'%d:%i:%u:%g:%h:%a:%s:%Y:%Z':str((s.st_dev,s.st_ino,0,0,s.st_nlink,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns))}\n print(vals[f])\n`);
  const pycall=quote(unix(py))+' '+quote(unix(util));
  const prelude=`PATH=${quote(unix(path.dirname(dash)))}:$PATH\nexport PATH\nflock() { :; }\nstat() { if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; else ${pycall} stat "$2" "$3"; fi; }\n${realHashShell}\nchmod() { ${pycall} chmod "$1" "$2"; }\nchgrp() { :; }\n`;
  const helper=fs.readFileSync(path.join(project,'native/boot-hook.sh'),'utf8').replace(/\r/g,'').replaceAll('/data/plugins/topflow-screen',unix(f.root)).replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(f.boot)));
  f.put('root/boot-hook.sh','#!/bin/sh\n'+prelude+helper.replace(/^#![^\n]+\n/,''));f.integrity();
  const original='#!/bin/sh\n# Existing independent plugin\nsh /data/plugins/aoyou-world/boot.sh >/dev/null 2>&1 &\nexit 0\n';
  fs.writeFileSync(f.boot,original);
  let r=f.command(['autostart-enable','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);
  assert.equal(fs.readFileSync(f.boot,'utf8'),'#!/bin/sh\n'+f.line+'\n'+original.slice(10));
  r=f.command(['status']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).autostart.enabled,true);
  r=f.command(['autostart-disable','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);assert.equal(fs.readFileSync(f.boot,'utf8'),original);
  r=f.command(['autostart-enable','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);
  r=f.command(['uninstall','--confirmed']);assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);
  assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));assert.equal(fs.readFileSync(f.boot,'utf8'),original);
  assert.doesNotMatch(r.events,/service delete|renderer-adopt/);
});
