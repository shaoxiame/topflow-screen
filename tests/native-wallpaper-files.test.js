'use strict';
// Actual controller asset functions, with only lifecycle locking and platform
// ownership mapped to a disposable computer directory. No device is contacted.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'native/screenctl.sh'),'utf8');
const shell=process.env.TF_SHELL||(process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh');
const unix=p=>process.platform==='win32'?p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase()):p;
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function pixels(value=19){const b=Buffer.alloc(307216,value);b.write('TFWP5651',0,'ascii');b.writeUInt16LE(320,8);b.writeUInt16LE(480,10);b.writeUInt32LE(307200,12);return b;}
function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-wallpaper-files-')),dir=path.join(base,'plugin');fs.mkdirSync(dir,{mode:0o700});
 t.after(()=>{assert.equal(path.dirname(base),fs.realpathSync(os.tmpdir()));assert(path.basename(base).startsWith('topflow-wallpaper-files-'));fs.rmSync(base,{recursive:true,force:true});});
 const install='a'.repeat(64);fs.writeFileSync(path.join(dir,'.topflow-install'),'TOPFLOW_SCREEN_INSTALL_V1\n'+install+'\n');fs.writeFileSync(path.join(dir,'.topflow-files'),'component\n');fs.writeFileSync(path.join(dir,'component'),'unchanged');fs.writeFileSync(path.join(dir,'.lifecycle.lock'),'');
 const begin=source.indexOf('# BEGIN WALLPAPER'),end=source.indexOf('# END WALLPAPER',begin);assert(begin>0&&end>begin);
 const bootFile=path.join(base,'boot-id');fs.writeFileSync(bootFile,'01234567-89ab-cdef-0123-456789abcdef\n');
 const functions=source.slice(begin,end).replaceAll('/proc/sys/kernel/random/boot_id',unix(bootFile)),treeBegin=source.indexOf('validate_install_tree() {'),treeEnd=source.indexOf('uninstall_components() {',treeBegin);
 const script=path.join(base,'controller.sh');
 const utility=path.join(base,'file-tools.cjs');
 fs.writeFileSync(utility,`const fs=require('fs'),c=require('crypto');const a=process.argv.slice(2),file=a[a.length-1].replace(/^\\/([a-z])\\//,(_,d)=>d+':/'),b=()=>fs.readFileSync(file);if(a[0]==='stat'){const s=fs.statSync(file),v={'%u':0,'%a':700,'%h':s.nlink,'%d:%i:%s:%Y:%Z':[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':')};if(!(a[2] in v))throw Error('Unsupported stat');process.stdout.write(String(v[a[2]])+'\\n');}else if(a[0]==='base64'){const data=a[1]==='-d'?Buffer.from(fs.readFileSync(0,'utf8'),'base64'):b().toString('base64');process.stdout.write(data);}else if(a[0]==='chmod')fs.chmodSync(file,parseInt(a[1],8));else if(a[0]==='od')process.stdout.write(b().subarray(0,16).toString('hex')+'\\n');else if(a[0]==='sha256sum')process.stdout.write(c.createHash('sha256').update(b()).digest('hex')+'  '+file+'\\n');else throw Error('Unknown helper');`);
 const fileTool=quote(unix(process.execPath))+' '+quote(unix(utility));
 // root ownership cannot be represented on Windows. Real stat still supplies
 // link count, exact size and inode identity; symlink predicates are untouched.
 const prelude=`#!/bin/sh\nset -eu\numask 077\nPATH=${quote(unix(path.dirname(shell)))}:$PATH\nexport PATH\nROOT=${quote(unix(dir))}\nstat() { ${fileTool} stat "$@"; }\nod() { ${fileTool} od "$@"; }\nchmod() { ${fileTool} chmod "$@"; }\nsha256sum() { ${fileTool} sha256sum "$@"; }\nbase64() { ${fileTool} base64 "$@"; }\nlifecycle_lock() { [ ! -e ${quote(unix(path.join(base,'busy')))} ] || exit 7; printf 'lock\\n' >> ${quote(unix(path.join(base,'locks')))}; }\n`;
 // Independent parent-path and whole-tree protections are covered by the
 // existing lifecycle suite; this case focuses on dynamic file recognition.
 const tree=source.slice(treeBegin,source.indexOf('# Plugin-owned boot integration.',treeEnd)).replace('[ "$(readlink -f /data/plugins)" = /data/plugins ]','[ -d "$ROOT" ]');
 const runDir=path.join(base,'run');fs.mkdirSync(runDir);fs.writeFileSync(path.join(runDir,'control.lock'),'');
 fs.writeFileSync(script,prelude+functions+'\nRUN='+quote(unix(runDir))+'\nsafe_tree() { [ -d "$1" ] && [ ! -L "$1" ]; }\nno_plugin_processes() { return 0; }\n'+tree+'\ncase "$1" in wallpaper-status) wallpaper_status;; validate-tree) validate_install_tree;; uninstall-owned) uninstall_components;; *) wallpaper_action "$@";; esac\n');
 const initialBoot='01234567-89ab-cdef-0123-456789abcdef',nonce='1'.repeat(32);let currentBoot=initialBoot;
 const run=(action,sha,details={})=>{const args=[action,...(sha===undefined?[]:[...(details.confirmed===false?[]:['--confirmed']),sha,details.nonce||nonce,details.boot||currentBoot,...(action==='wallpaper-chunk'?[String(details.offset),details.base64]:[])])];return spawnSync(shell,['-s'],{input:'set -- '+args.map(quote).join(' ')+'\n. '+quote(unix(script))+'\n',encoding:'utf8',timeout:15000});};
 const ok=(action,sha,details)=>{const r=run(action,sha,details);assert.equal(r.status,0,r.stdout+r.stderr);return r;};
 const status=()=>JSON.parse(ok('wallpaper-status').stdout.split('TOPFLOW_WALLPAPER=')[1]);
 const chunk=(bytes,offset=0,details={})=>ok('wallpaper-chunk',details.sha||hash(pixels()),{...details,offset,base64:bytes.toString('base64')});
 const upload=(bytes,sha,details={})=>{for(let offset=0;offset<bytes.length;offset+=24576)chunk(bytes.subarray(offset,offset+24576),offset,{...details,sha});};
 return {base,dir,run,ok,status,chunk,upload,nonce,initialBoot,boot:value=>{currentBoot=value.trim();fs.writeFileSync(bootFile,value);},put:(n,b)=>fs.writeFileSync(path.join(dir,n),b),read:n=>fs.readFileSync(path.join(dir,n)),exists:n=>fs.existsSync(path.join(dir,n))};
}

test('bounded chunks preserve old wallpaper until exact atomic commit and clear',t=>{
 const f=fixture(t),old=pixels(1),next=pixels(2),digest=hash(next);f.put('lock-wallpaper.rgb565',old);
 const before=f.status();assert.equal(before.bootId,f.initialBoot);assert.equal(before.sha256,hash(old));
 assert.match(f.ok('wallpaper-prepare',digest).stdout,/=PREPARED/);assert.equal(f.status().pendingNonce,f.nonce);
 f.upload(next,digest);let s=f.status();assert.equal(s.uploadedBytes,307216);assert.equal(s.uploadValid,true);assert.equal(s.sha256,hash(old));assert.equal(s.pendingBootId,s.bootId);
 assert.match(f.ok('wallpaper-commit',digest).stdout,/=COMMITTED/);assert(f.read('lock-wallpaper.rgb565').equals(next));assert(!f.exists('.lock-wallpaper.pending'));assert(!f.exists('.lock-wallpaper.upload'));assert(!f.exists('.lock-wallpaper.chunk'));
 assert.equal(f.status().pending,false);assert.match(f.ok('wallpaper-clear',digest).stdout,/=CLEARED/);f.ok('wallpaper-clear',digest);assert.equal(f.status().configured,false);
});

test('unknown chunk outcome permits explicit abort and late chunks cannot resurrect it',t=>{
 const f=fixture(t),old=pixels(3),bytes=pixels(),digest=hash(bytes);f.put('lock-wallpaper.rgb565',old);f.ok('wallpaper-prepare',digest);
 f.chunk(bytes.subarray(0,24576));assert.equal(f.status().uploadedBytes,24576);
 assert.notEqual(f.run('wallpaper-prepare',digest).status,0);assert.notEqual(f.run('wallpaper-clear',hash(old)).status,0);
 assert.match(f.ok('wallpaper-abort',digest).stdout,/=ABORTED/);
 assert.notEqual(f.run('wallpaper-chunk',digest,{offset:24576,base64:bytes.subarray(24576,49152).toString('base64')}).status,0);
 assert.notEqual(f.run('wallpaper-commit',digest).status,0);assert(!f.exists('.lock-wallpaper.upload'));assert(!f.exists('.lock-wallpaper.chunk'));assert(!f.exists('.lock-wallpaper.pending'));assert(f.read('lock-wallpaper.rgb565').equals(old));
});

test('same image in a new transaction rejects old nonce, duplicates and wrong offsets',t=>{
 const f=fixture(t),bytes=pixels(),digest=hash(bytes),nextNonce='2'.repeat(32);f.ok('wallpaper-prepare',digest);f.ok('wallpaper-abort',digest);f.ok('wallpaper-prepare',digest,{nonce:nextNonce});
 const part=bytes.subarray(0,512).toString('base64');assert.notEqual(f.run('wallpaper-chunk',digest,{offset:0,base64:part}).status,0);assert.notEqual(f.run('wallpaper-abort',digest).status,0);
 f.ok('wallpaper-chunk',digest,{nonce:nextNonce,offset:0,base64:part});assert.equal(f.status().uploadedBytes,512);
 for(const offset of [0,513,'0512',-1,9999999])assert.notEqual(f.run('wallpaper-chunk',digest,{nonce:nextNonce,offset,base64:part}).status,0);
 assert.equal(f.status().uploadedBytes,512);assert.notEqual(f.run('wallpaper-commit',digest).status,0);f.ok('wallpaper-abort',digest,{nonce:nextNonce});
});

test('strict base64 and maximum chunk/total size reject invalid input without replacing wallpaper',t=>{
 const f=fixture(t),bytes=pixels(),digest=hash(bytes);f.ok('wallpaper-prepare',digest);
 for(const base64 of ['', 'AA', 'AAAA\n','AA$A','AAA===','AB==',Buffer.alloc(24577).toString('base64')]){
  const r=f.run('wallpaper-chunk',digest,{offset:0,base64});assert.notEqual(r.status,0,base64.slice(0,10));assert.equal(f.read('.lock-wallpaper.upload').length,0);
  if(f.exists('.lock-wallpaper.chunk')){f.ok('wallpaper-abort',digest);f.ok('wallpaper-prepare',digest);}
 }
 f.put('.lock-wallpaper.upload',bytes);assert.notEqual(f.run('wallpaper-chunk',digest,{offset:307216,base64:'AAAA'}).status,0);assert(f.read('.lock-wallpaper.upload').equals(bytes));f.ok('wallpaper-abort',digest);
});

test('invalid headers, dimensions and hashes never replace the prior wallpaper',t=>{
 for(const mutate of [b=>b.write('INVALID!',0),b=>b.writeUInt16LE(319,8),b=>b.writeUInt16LE(479,10),b=>b.writeUInt32LE(1,12),b=>b[100]^=1]){
  const f=fixture(t),old=pixels(9),next=pixels(10),digest=hash(next);f.put('lock-wallpaper.rgb565',old);f.ok('wallpaper-prepare',digest);mutate(next);f.put('.lock-wallpaper.upload',next);
  assert.notEqual(f.run('wallpaper-commit',digest).status,0);assert(f.read('lock-wallpaper.rgb565').equals(old));f.ok('wallpaper-abort',digest);
 }
});

test('missing confirmation, cross hash, hard link and unknown files are preserved',t=>{
 const bytes=pixels(),digest=hash(bytes),f=fixture(t);assert.notEqual(f.run('wallpaper-prepare',digest,{confirmed:false}).status,0);assert(!f.exists('.lock-wallpaper.pending'));
 f.ok('wallpaper-prepare',digest);f.put('.lock-wallpaper.upload',bytes);assert.notEqual(f.run('wallpaper-abort','b'.repeat(64)).status,0);
 const outside=path.join(f.base,'outside');fs.linkSync(path.join(f.dir,'.lock-wallpaper.upload'),outside);assert.notEqual(f.run('wallpaper-commit',digest).status,0);assert.notEqual(f.run('wallpaper-abort',digest).status,0);assert(fs.existsSync(outside));fs.unlinkSync(outside);f.ok('wallpaper-abort',digest);
 f.put('unknown-wallpaper.bin','keep');assert.notEqual(f.run('validate-tree').status,0);assert(f.exists('unknown-wallpaper.bin'));
 const g=fixture(t);g.put('.lock-wallpaper.upload',bytes);assert.match(g.run('wallpaper-prepare',digest).stdout,/WALLPAPER_UNKNOWN_UPLOAD/);assert(g.read('.lock-wallpaper.upload').equals(bytes));
});

test('invalid old wallpaper is preserved and controller does not use HTTP upload or create directories',t=>{
 const f=fixture(t),digest=hash(pixels());f.put('lock-wallpaper.rgb565','unrecognized');assert.notEqual(f.run('wallpaper-clear',digest).status,0);assert.notEqual(f.run('wallpaper-prepare',digest).status,0);assert.notEqual(f.run('validate-tree').status,0);assert.equal(f.read('lock-wallpaper.rgb565').toString(),'unrecognized');
 f.put('lock-wallpaper.rgb565',pixels());assert.equal(f.run('validate-tree').status,0);
 const body=source.slice(source.indexOf('uninstall_components() {'),source.indexOf('# Plugin-owned boot integration.'));
 assert(body.indexOf('validate_install_tree')<body.indexOf('rm -f "$ROOT/lock-wallpaper.rgb565"'));assert.match(body,/\.lock-wallpaper\.chunk/);
 assert.doesNotMatch(source.slice(source.indexOf('# BEGIN WALLPAPER'),source.indexOf('# END WALLPAPER')),/curl|nohup|kill |sleep |reboot|poweroff|\/etc\/|mkdir|upload_file/);
});

test('owned uninstall removes every bounded asset and rejects late chunks without recreating root',t=>{
 const f=fixture(t),bytes=pixels(),digest=hash(bytes);f.put('lock-wallpaper.rgb565',pixels(4));f.ok('wallpaper-prepare',digest);f.chunk(bytes.subarray(0,200));f.put('.lock-wallpaper.chunk',Buffer.alloc(10));
 assert.match(f.ok('uninstall-owned').stdout,/TOPFLOW_UNINSTALL=COMPONENTS_REMOVED/);assert(!fs.existsSync(f.dir));assert(!fs.existsSync(path.join(f.base,'run')));
 for(const action of ['wallpaper-chunk','wallpaper-commit','wallpaper-prepare'])assert.notEqual(f.run(action,digest,{offset:200,base64:'AAAA'}).status,0);
 assert(!fs.existsSync(f.dir));const g=fixture(t);g.put('lock-wallpaper.rgb565',bytes);g.put('unrecognized.bin','must remain');assert.notEqual(g.run('uninstall-owned').status,0);assert(g.read('lock-wallpaper.rgb565').equals(bytes));assert.equal(g.read('unrecognized.bin').toString(),'must remain');assert(g.exists('component'));
});

test('new boot rejects stale prepare/chunk/commit and allows explicit current-boot abort',t=>{
 const bytes=pixels(),digest=hash(bytes),nextBoot='abcdef01-2345-6789-abcd-ef0123456789\n',f=fixture(t);f.put('lock-wallpaper.rgb565',pixels(7));f.ok('wallpaper-prepare',digest);f.put('.lock-wallpaper.upload',bytes);f.boot(nextBoot);
 const state=f.status();assert.equal(state.previousBoot,true);assert.equal(state.pendingBootId,f.initialBoot);assert.equal(state.bootId,nextBoot.trim());assert.equal(state.uploadValid,true);
 assert.match(f.run('wallpaper-commit',digest).stdout,/WALLPAPER_PREVIOUS_BOOT/);
 for(const action of ['wallpaper-chunk','wallpaper-commit','wallpaper-abort','wallpaper-prepare','wallpaper-clear'])assert.match(f.run(action,digest,{boot:f.initialBoot,offset:0,base64:'AAAA'}).stdout,/WALLPAPER_BOOT_CHANGED/);
 f.ok('wallpaper-abort',digest);assert(!f.exists('.lock-wallpaper.pending'));assert(f.read('lock-wallpaper.rgb565').equals(pixels(7)));
 const g=fixture(t);g.boot(nextBoot);assert.match(g.run('wallpaper-prepare',digest,{boot:g.initialBoot}).stdout,/WALLPAPER_BOOT_CHANGED/);assert(!g.exists('.lock-wallpaper.pending'));
});

test('malformed current/recorded boot IDs never authorize mutation or deletion',t=>{
 const digest=hash(pixels()),f=fixture(t);f.boot('not-a-boot-id\n');assert.match(f.run('wallpaper-status').stdout,/WALLPAPER_BOOT_ID_UNAVAILABLE/);assert(!f.exists('.lock-wallpaper.pending'));
 f.boot(f.initialBoot+'\n');f.ok('wallpaper-prepare',digest);f.boot('abcdef01-2345-6789-abcd-ef0123456789');assert.match(f.run('wallpaper-abort',digest).stdout,/WALLPAPER_BOOT_ID_UNAVAILABLE/);assert(f.exists('.lock-wallpaper.pending'));
 f.boot('abcdef01-2345-6789-abcd-ef0123456789\n');f.put('.lock-wallpaper.pending',f.read('.lock-wallpaper.pending').toString().replace(f.initialBoot,'invalid-previous-boot'));
 assert.match(f.run('wallpaper-abort',digest).stdout,/WALLPAPER_UNKNOWN_UPLOAD/);assert.notEqual(f.run('uninstall-owned').status,0);assert(f.exists('.lock-wallpaper.pending'));
});
