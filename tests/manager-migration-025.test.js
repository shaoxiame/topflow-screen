'use strict';
// Exact released bytes are verified before recovery. Device, boot, process and
// runtime paths are redirected to disposable PC files; no device is contacted.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.env.TF_SHELL || (process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh');
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const fixtureSource=fs.readFileSync(path.join(__dirname,'native-supervisor.test.js'),'utf8');
const begin=fixtureSource.indexOf('function fixture(t){'),end=fixtureSource.indexOf("test('native scripts parse",begin);
assert(begin>0&&end>begin,'Shared local shell fixture anchors changed');
const fixture=vm.runInNewContext(fixtureSource.slice(begin,end).replace('timeout:15000','timeout:30000')+'\nfixture;',{fs,os,path,assert,dash,unix,quote,spawnSync,spawn,process,project});
const plugin=require('../src/ufi-plugin.js');
const {tarMembers}=require('../tools/build.cjs');
const controller=fs.readFileSync(path.join(project,'native/screenctl.sh'),'utf8');
const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:controller,hardwareTested:false,members:['./','./topflow-screen.sha256','./ui/','./ui/index.html']};
const oldDigest='0702ffaf6ff94b0974bf617926e5232dcabc27f7d8770b87b4038c0eb885bc1c';
const archive=fs.readFileSync(path.join(project,'.cache/recovery-025/topflow-native.tar.gz'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(archive),oldDigest);
const members=tarMembers(archive);
const bootId='01234567-89ab-cdef-0123-456789abcdef';
const realHashShell=`sha256sum() { ${quote(unix(process.execPath))} -e ${quote("const fs=require('node:fs'),c=require('node:crypto');const h=p=>c.createHash('sha256').update(fs.readFileSync(p.replace(/^\\/([a-z])\\//,(_,d)=>d+':/'))).digest('hex');const a=process.argv.slice(1);if(a[0]==='-c'){for(const l of fs.readFileSync(a[1]==='-'?0:a[1],'utf8').trim().split(/\\n/)){const m=l.match(/^([a-f0-9]{64})  (.+)$/);if(!m||h(m[2])!==m[1])process.exit(1);}}else process.stdout.write(h(a[0])+'  '+a[0]+'\\n');")} -- "$@"; }`;
const backupTools=`od() { ${quote(unix(process.execPath))} -e ${quote("const f=process.argv.at(-1).replace(/^\\/([a-z])\\//,(_,d)=>d+':/');process.stdout.write(require('fs').readFileSync(f).subarray(0,16).toString('hex')+'\\n');")} -- "$@"; }
dd() { ${quote(unix(process.execPath))} -e ${quote("const a=Object.fromEntries(process.argv.slice(1).map(s=>s.split('='))),f=a.if.replace(/^\\/([a-z])\\//,(_,d)=>d+':/'),b=require('fs').readFileSync(f);process.stdout.write(b.subarray(Number(a.bs)*Number(a.skip),Number(a.bs)*(Number(a.skip)+Number(a.count))));")} -- "$@"; }
base64() { ${quote(unix(process.execPath))} -e ${quote("process.stdout.write(require('fs').readFileSync(0).toString('base64'));")}; }`;

function installed(t){
  const f=fixture(t),boot=path.join(f.base,'ufi_tools_boot.sh');
  for(const member of members){
    const relative=member.name.replace(/^\.\//,'').replace(/\/$/,'');if(!relative)continue;
    const target=path.join(f.root,relative);
    if(member.type==='5')fs.mkdirSync(target,{recursive:true});
    else {fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,member.content);}
  }
  f.put('root/.topflow-install','TOPFLOW_SCREEN_INSTALL_V1\n'+oldDigest+'\n');
  f.put('root/.topflow-files',members.map(m=>m.name.replace(/^\.\//,'').replace(/\/$/,'')).filter(Boolean).join('\n')+'\n');
  fs.mkdirSync(path.join(f.proc,'sys/kernel/random'),{recursive:true});
  f.put('proc/sys/kernel/random/boot_id',bootId+'\n');f.put('factory');
  const line=`sh ${unix(f.root)}/screenctl.sh autostart-run >/dev/null 2>&1 & # TOPFLOW_SCREEN_AUTOSTART_V1`;
  // Keep installed helper byte-for-byte original for migration hash checks.
  // Only its execution is redirected to a local copy with root/stat doubles.
  const py=process.env.TF_PYTHON || (process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3');
  const util=path.join(f.base,'hook-stat.py');
  fs.writeFileSync(util,`import os,sys\nsys.stdout.reconfigure(newline=chr(10))\ncmd,p=sys.argv[1],sys.argv[-1]\nif cmd=='chmod': os.chmod(p,int(sys.argv[2],8))\nelse:\n s=os.stat(p); f=sys.argv[2]\n vals={'%u':'0','%g':'0','%h':str(s.st_nlink),'%a':oct(s.st_mode&0o777)[2:],'%d:%i:%u:%g:%h:%a:%s:%Y:%Z':str((s.st_dev,s.st_ino,0,0,s.st_nlink,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns))}\n print(vals[f])\n`);
  const pycall=quote(unix(py))+' '+quote(unix(util));
  const prelude=`PATH=${quote(unix(path.dirname(dash)))}:$PATH\nexport PATH\nflock() { :; }\nstat() { if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; else ${pycall} stat "$2" "$3"; fi; }\n${realHashShell}\nchmod() { ${pycall} chmod "$1" "$2"; }\nchgrp() { :; }\n`;
  const helper=fs.readFileSync(path.join(f.root,'boot-hook.sh'),'utf8').replaceAll('/data/plugins/topflow-screen',unix(f.root)).replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(boot)));
  const helperPath=path.join(f.base,'boot-helper.sh');
  fs.writeFileSync(helperPath,'#!/bin/sh\n'+prelude+helper.replace(/^#![^\n]+\n/,''));
  function enabled(original='#!/bin/sh\n'){
    f.put('root/.autostart-enabled','TOPFLOW_SCREEN_AUTOSTART_V1\n'+oldDigest+'\n'+hash(fs.readFileSync(path.join(f.root,'boot-integrity.sha256')))+'\n');
    fs.writeFileSync(boot,'#!/bin/sh\n'+line+'\n'+original.slice(10));
  }
  function executeSource(source){
    source=source.replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(boot)));
    source=source.replace('set -eu',()=>`set -eu\n${realHashShell}\n${backupTools}\nsh() { if [ "$1" = ${quote(unix(path.join(f.root,'boot-hook.sh')))} ]; then log boot-helper-disable; command sh ${quote(unix(helperPath))} "$2"; else command sh "$@"; fi; }\n`);
    return f.execute(source,[]);
  }
  function ownedBoot(){
    const result=spawnSync(dash,[unix(helperPath),'enable'],{encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr+result.stdout);enabled();
  }
  return {...f,boot,line,enabled,ownedBoot,command:(action,snapshot)=>executeSource(plugin.buildScreenCommand(action,payload,action!=='status',snapshot)),backup:(snapshot,offset)=>executeSource(plugin.buildWallpaperBackupCommand(payload,snapshot,offset))};
}

test('installed 0.2.5 is readable and recoverable without starting any old executable',t=>{
  const f=installed(t);f.put('run/last-status','factory-restored\n');
  let result=f.command('status');assert.equal(result.status,0,result.stderr+result.stdout);
  const state=plugin.parseScreenStatus(result.stdout);assert.equal(state.versionMismatch,true);assert.equal(state.mode,'factory');assert.equal(state.failure,undefined);assert.equal(state.autostart.enabled,false);
  assert.doesNotMatch(result.events,/flock|kill|service delete|renderer-adopt|boot-helper/);
  for(const action of ['start','autostart-enable','autostart-disable']){result=f.command(action);assert.notEqual(result.status,0);assert.match(result.stdout,/INSTALLED_VERSION_MISMATCH/);}
  result=f.command('restore');assert.equal(result.status,0,result.stderr+result.stdout);assert(fs.existsSync(f.root));
  result=f.command('uninstall');assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));assert(!fs.existsSync(f.boot));
});

test('0.2.5 wallpaper exports bounded verified bytes without files or lifecycle writes and refuses changed data before cleanup',t=>{
 const f=installed(t),bytes=Buffer.alloc(307216,61);Buffer.from('54465750353635314001e00100b00400','hex').copy(bytes);
 f.put('root/lock-wallpaper.rgb565',bytes);const before=fs.readdirSync(f.root).sort();
 let result=f.backup();assert.equal(result.status,0,result.stderr+result.stdout);
 const snap=require('../src/manager-wallpaper-migration.js').snapshot(result.stdout);assert.equal(snap.sha256,hash(bytes));assert.equal(snap.bootId,bootId);
 result=f.backup(snap,24576);assert.equal(result.status,0,result.stderr+result.stdout);const chunk=result.stdout.split(/\r?\n/).find(x=>x.startsWith('TOPFLOW_WALLPAPER_CHUNK=')).split('=')[1];assert.deepEqual(Buffer.from(chunk,'base64'),bytes.subarray(24576,49152));
 assert.deepEqual(fs.readdirSync(f.root).sort(),before);assert.doesNotMatch(result.events,/kill|service delete|factory-start|boot-helper|renderer-adopt/);
 bytes[307215]^=1;f.put('root/lock-wallpaper.rgb565',bytes);result=f.command('uninstall',snap);assert.notEqual(result.status,0);assert.match(result.stdout,/WALLPAPER_BACKUP_CHANGED/);assert(fs.existsSync(f.root));assert.doesNotMatch(result.events,/kill|service delete|factory-start|boot-helper/);
});
test('0.2.5 export rejects malformed or pending wallpaper before allowing upgrade cleanup',t=>{
 for(const mode of ['invalid','pending']){const f=installed(t);f.put(mode==='invalid'?'root/lock-wallpaper.rgb565':'root/.lock-wallpaper.pending','invalid');const result=f.backup();assert.notEqual(result.status,0,result.stdout);assert.match(result.stdout,/WALLPAPER_INVALID_FILE|WALLPAPER_UPLOAD_PENDING/);assert(fs.existsSync(f.root));}
});

test('0.2.5 migration rejects modified executable bytes, member list or ownership before writes',t=>{
  for(const name of ['topflow-screen','topflow-factory-bus-aarch64','screenctl.sh','supervisor.sh','boot-hook.sh','.topflow-files','.topflow-install']){
    const f=installed(t);fs.appendFileSync(path.join(f.root,name),'changed');
    const result=f.command('uninstall');assert.notEqual(result.status,0,name);assert.match(result.stdout,/UNVERIFIED_|INSTALLED_VERSION_MISMATCH/);
    assert.doesNotMatch(result.events,/flock|kill|service delete|factory-start|boot-helper/);assert(fs.existsSync(f.root));
  }
});

test('0.2.5 enabled migration validates all packaged files and leaves a damaged installation and shared hook intact',t=>{
  for(const name of ['ui/network.html','licenses/musl-COPYRIGHT.txt','build-manifest.json','boot-integrity.sha256']){
    const f=installed(t);f.enabled();const before=fs.readFileSync(f.boot);fs.appendFileSync(path.join(f.root,name),'changed');
    const status=f.command('status');assert.notEqual(status.status,0,name);assert.match(status.stdout,/UNVERIFIED_LEGACY_FILES/);
    assert.doesNotMatch(status.events,/flock|kill|service delete|factory-start|boot-helper/);
    const result=f.command('uninstall');assert.notEqual(result.status,0,name);assert.match(result.stdout,/UNVERIFIED_LEGACY_FILES/);
    assert.deepEqual(fs.readFileSync(f.boot),before);assert(fs.existsSync(f.root));assert(fs.existsSync(path.join(f.root,'.autostart-enabled')));
    assert.doesNotMatch(result.events,/kill|service delete|factory-start|boot-helper/);
  }
});

test('0.2.5 enabled migration removes only its own boot line and complete bounded state',t=>{
  const f=installed(t),original='#!/bin/sh\n# Independent plugin bytes must remain unchanged\nsh /data/plugins/aoyou-world/boot.sh >/dev/null 2>&1 &\nexit 0\n';
  f.enabled(original);f.put('run/autostart.attempt',bootId+'\n');f.put('run/autostart.status','failed READY_TIMEOUT\n');f.put('run/autostart.lock','');f.put('root/.autostart-hook.lock','');
  let result=f.command('status');assert.equal(result.status,0,result.stderr+result.stdout);
  const state=plugin.parseScreenStatus(result.stdout);assert.equal(state.versionMismatch,true);assert.equal(state.autostart.enabled,true);assert.equal(state.autostart.hook,'present');
  result=f.command('restore');assert.equal(result.status,0,result.stderr+result.stdout);assert(fs.existsSync(path.join(f.root,'.autostart-enabled')));assert(fs.readFileSync(f.boot,'utf8').includes(f.line));
  result=f.command('uninstall');assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);
  assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));assert.equal(fs.readFileSync(f.boot,'utf8'),original);
  assert.equal((result.events.match(/boot-helper-disable/g)||[]).length,1);assert.doesNotMatch(result.events,/service delete|renderer-adopt/);
});

test('an exactly owned interrupted 0.2.5 uninstall can finish after the old helper and renderer are gone',t=>{
  const f=installed(t);f.put('root/.uninstalling','uninstalling\n');
  for(const name of ['supervisor.sh','boot-hook.sh','topflow-screen'])fs.unlinkSync(path.join(f.root,name));
  const result=f.command('uninstall');assert.equal(result.status,0,result.stderr+result.stdout);assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
});

test('0.2.5 migration removes its own created boot file only with the matching file-identity receipt',t=>{
  const f=installed(t);f.ownedBoot();assert(fs.existsSync(path.join(f.root,'autostart-boot-created')));
  const result=f.command('uninstall');assert.equal(result.status,0,result.stderr+result.stdout);
  assert(!fs.existsSync(f.boot));assert(!fs.existsSync(f.root));assert(!fs.existsSync(f.run));
  assert.doesNotMatch(result.events,/service delete|renderer-adopt/);
});
