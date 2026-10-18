'use strict';
// Independent migration race regression. Production-generated shell commands
// run only against synthetic PC files, never a device or historical archive.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {spawnSync,spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..');
const dash=process.env.TF_SHELL||(process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh');
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const controller=fs.readFileSync(path.join(project,'native/screenctl.sh'),'utf8');
const plugin=require('../src/ufi-plugin.js');
const migration=require('../src/manager-wallpaper-migration.js');
const shared=fs.readFileSync(path.join(__dirname,'native-supervisor.test.js'),'utf8');
const start=shared.indexOf('function fixture(t){'),end=shared.indexOf("test('native scripts parse",start);
assert(start>0&&end>start);
const fixture=vm.runInNewContext(shared.slice(start,end)+'\nfixture;',{fs,os,path,assert,dash,unix,quote,spawnSync,spawn,process,project});
const boot='01234567-89ab-cdef-0123-456789abcdef',nonce='1'.repeat(32);
const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:hash(controller),screenctlSource:controller,hardwareTested:false,members:['./','./topflow-screen.sha256','./ui/','./ui/index.html','./screenctl.sh']};
function image(value){const bytes=Buffer.alloc(307216,value);bytes.write('TFWP5651',0,'ascii');bytes.writeUInt16LE(320,8);bytes.writeUInt16LE(480,10);bytes.writeUInt32LE(307200,12);return bytes;}
function local(t){
 const f=fixture(t);f.put('root/screenctl.sh',controller);f.put('root/.topflow-files',payload.members.map(v=>v.replace(/^\.\//,'').replace(/\/$/,'')).filter(Boolean).join('\n')+'\n');
 fs.mkdirSync(path.join(f.proc,'sys/kernel/random'),{recursive:true});f.put('proc/sys/kernel/random/boot_id',boot+'\n');f.put('factory');
 const helper=path.join(f.base,'files.cjs');
 fs.writeFileSync(helper,`const fs=require('fs'),c=require('crypto');const a=process.argv.slice(2),native=p=>p.replace(/^\\/([a-z])\\//,(_,d)=>d+':/'),file=native(a.at(-1));const digest=p=>c.createHash('sha256').update(fs.readFileSync(native(p))).digest('hex');if(a[0]==='stat'){const s=fs.statSync(file),map={'%u':0,'%a':700,'%h':s.nlink,'%d:%i:%s:%Y:%Z':[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':')};if(!(a[2] in map))throw Error('Unsupported stat: '+a[2]);process.stdout.write(map[a[2]]+'\\n');}else if(a[0]==='sha256sum'){if(a[1]==='-c'){for(const line of fs.readFileSync(a[2]==='-'?0:native(a[2]),'utf8').trim().split(/\\n/)){const m=line.match(/^([a-f0-9]{64})  (.+)$/);if(!m||digest(m[2])!==m[1])process.exit(1);}}else process.stdout.write(digest(file)+'  '+file+'\\n');}else if(a[0]==='od')process.stdout.write(fs.readFileSync(file).subarray(0,16).toString('hex')+'\\n');else if(a[0]==='base64')process.stdout.write(a[1]==='-d'?Buffer.from(fs.readFileSync(0,'utf8'),'base64'):fs.readFileSync(a[1]?file:0).toString('base64'));else throw Error('Unexpected file operation');`);
 const tool=quote(unix(process.execPath))+' '+quote(unix(helper));
 const overrides=`\nstat() { if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; else ${tool} stat "$@"; fi; }\nsha256sum() { ${tool} sha256sum "$@"; }\nod() { ${tool} od "$@"; }\nbase64() { ${tool} base64 "$@"; }\nflock() { log "audit-lock $*"; if [ "$2" = 7 ] && [ -f "$TF_FIX/inject-at-lock" ]; then cp "$TF_FIX/inject-at-lock" "$TF_FIX/root/lock-wallpaper.rgb565"; rm -f "$TF_FIX/inject-at-lock"; log audit-injected; fi; return 0; }\n`;
 // Git for Windows does not bundle dd; emulate only its read-only chunk form.
 const ddTool=quote(unix(process.execPath))+' -e '+quote("const fs=require('fs');const a=Object.fromEntries(process.argv.slice(1).map(v=>v.split('=')));const p=a.if.replace(/^\\/([a-z])\\//,(_,d)=>d+':/');const bytes=fs.readFileSync(p),start=Number(a.bs)*Number(a.skip);process.stdout.write(bytes.subarray(start,start+Number(a.bs)*Number(a.count))); ")+ ' --';
 function execute(command){return f.execute(command.replace('set -eu',()=> 'set -eu'+overrides+'dd() { '+ddTool+' "$@"; }\n'),[]);}
 function prepare(bytes){f.put('root/.lock-wallpaper.pending','TOPFLOW_SCREEN_WALLPAPER_V2\n'+hash(bytes)+'\n'+payload.archiveSha256+'\n'+nonce+'\n'+boot+'\n');f.put('root/.lock-wallpaper.upload',bytes);}
 function action(name,bytes,details={}){return execute(plugin.buildWallpaperCommand(name,payload,hash(bytes),{nonce,bootId:boot,migration:true,...details}));}
 return {...f,execute,prepare,action,read:name=>fs.readFileSync(path.join(f.root,name)),has:name=>fs.existsSync(path.join(f.root,name)),inject:bytes=>f.put('inject-at-lock',bytes)};
}

test('restore prepare rechecks a newly applied wallpaper after acquiring its lifecycle lock',t=>{
 const f=local(t),backup=image(1),newer=image(2);f.inject(newer);
 const result=f.action('prepare',backup);assert.notEqual(result.status,0,result.stdout+result.stderr);assert.match(result.events,/audit-injected/);assert.match(result.stdout,/WALLPAPER_RESTORE_CONFLICT/);
 assert.deepEqual(f.read('lock-wallpaper.rgb565'),newer);assert(!f.has('.lock-wallpaper.pending'));assert(!f.has('.lock-wallpaper.upload'));
});

test('restore commit rechecks a new wallpaper under lock and keeps its own upload retryable',t=>{
 const f=local(t),backup=image(3),newer=image(4);f.prepare(backup);f.inject(newer);
 const result=f.action('commit',backup);assert.notEqual(result.status,0,result.stdout+result.stderr);assert.match(result.events,/audit-injected/);assert.match(result.stdout,/WALLPAPER_RESTORE_CONFLICT/);
 assert.deepEqual(f.read('lock-wallpaper.rgb565'),newer);assert.deepEqual(f.read('.lock-wallpaper.upload'),backup);assert(f.has('.lock-wallpaper.pending'));
});

test('migration abort can clear only its transaction without deleting another applied wallpaper',t=>{
 const f=local(t),backup=image(5),newer=image(6);f.prepare(backup);f.put('root/lock-wallpaper.rgb565',newer);
 const result=f.action('abort',backup);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/TOPFLOW_WALLPAPER=ABORTED/);assert.deepEqual(f.read('lock-wallpaper.rgb565'),newer);
 for(const name of ['.lock-wallpaper.pending','.lock-wallpaper.upload','.lock-wallpaper.chunk'])assert(!f.has(name));
});

test('an unchanged restore commits atomically with no wallpaper files outside the plugin',t=>{
 const f=local(t),backup=image(7);f.prepare(backup);const outerBefore=fs.readdirSync(f.base).sort();
 const result=f.action('commit',backup);assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/TOPFLOW_WALLPAPER=COMMITTED/);assert.deepEqual(f.read('lock-wallpaper.rgb565'),backup);
 for(const name of ['.lock-wallpaper.pending','.lock-wallpaper.upload','.lock-wallpaper.chunk'])assert(!f.has(name));
 assert.deepEqual(fs.readdirSync(f.base).filter(name=>!['test.sh','events'].includes(name)).sort(),outerBefore);
});

test('a backup-to-uninstall change at lifecycle lock stops removal and factory handover',t=>{
 for(const previous of [null,image(8)]){
  const f=local(t),newer=image(9);if(previous)f.put('root/lock-wallpaper.rgb565',previous);f.inject(newer);
  const snapshot={sha256:previous?hash(previous):null,bootId:boot};
  const result=f.execute(plugin.buildScreenCommand('uninstall',payload,true,snapshot));assert.notEqual(result.status,0,result.stdout+result.stderr);assert.match(result.events,/audit-injected/);assert.match(result.stdout,/WALLPAPER_BACKUP_CHANGED/);
  assert.deepEqual(f.read('lock-wallpaper.rgb565'),newer);assert(f.has('screenctl.sh'));assert(f.has('.topflow-install'));assert(!f.has('.uninstalling'));assert.doesNotMatch(result.events,/kill |service delete|factory-start/);
 }
});

test('backup command returns exact local bytes and does not create staging files',t=>{
 const f=local(t),backup=image(10);f.put('root/lock-wallpaper.rgb565',backup);const before=fs.readdirSync(f.root).sort();
 const result=f.execute(plugin.buildWallpaperBackupCommand(payload));assert.equal(result.status,0,result.stdout+result.stderr);const saved=migration.snapshot(result.stdout);assert.equal(saved.sha256,hash(backup));assert.equal(saved.bootId,boot);
 const chunk=f.execute(plugin.buildWallpaperBackupCommand(payload,saved,294912));assert.equal(chunk.status,0,chunk.stdout+chunk.stderr);const prefix='TOPFLOW_WALLPAPER_CHUNK=',encoded=chunk.stdout.split(/\r?\n/).find(line=>line.startsWith(prefix)).slice(prefix.length);
 assert.equal(encoded.length,Math.ceil((307216-294912)/3)*4,chunk.stdout.slice(0,200)+chunk.stderr);assert(Buffer.from(encoded,'base64').equals(backup.subarray(294912)));assert.deepEqual(fs.readdirSync(f.root).sort(),before);
});
