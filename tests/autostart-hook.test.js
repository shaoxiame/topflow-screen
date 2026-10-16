'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../native/boot-hook.sh'),'utf8').replace(/\r/g,'');
const dash=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
const unix=p=>p.replace(/\\/g,'/').replace(/^([A-Za-z]):/,(_,d)=>'/'+d.toLowerCase());
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const line='sh /data/plugins/topflow-screen/screenctl.sh autostart-run >/dev/null 2>&1 & # TOPFLOW_SCREEN_AUTOSTART_V1';
function fixture(t){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'topflow-boot-test-')),root=path.join(base,'root'),boot=path.join(base,'ufi_tools_boot.sh');
  fs.mkdirSync(root);
  t.after(()=>{assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));assert(path.basename(base).startsWith('topflow-boot-test-'));fs.rmSync(base,{recursive:true,force:true});});
  const script=source.replace('ROOT=/data/plugins/topflow-screen','ROOT='+quote(unix(root))).replace('BOOT=/data/plugins/ufi_tools_boot.sh','BOOT='+quote(unix(boot)));
  const py=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3';
  const util=path.join(base,'util.py');
  fs.writeFileSync(util,`import os,sys,hashlib\nsys.stdout.reconfigure(newline=chr(10))\ncmd,p=sys.argv[1],sys.argv[-1]\nif cmd=='hash': print(hashlib.sha256(open(p,'rb').read()).hexdigest()+'  '+p)\nelif cmd=='chmod': os.chmod(p,int(sys.argv[2],8))\nelse:\n s=os.stat(p); f=sys.argv[2]\n vals={'%u':'0','%g':'0','%h':str(s.st_nlink),'%a':oct(s.st_mode&0o777)[2:],'%d:%i:%u:%g:%h:%a:%s:%Y:%Z':str((s.st_dev,s.st_ino,0,0,s.st_nlink,s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns))}\n print(vals[f])\n`);
  const pycall=quote(unix(py))+' '+quote(unix(util));
  // Windows' bundled POSIX shell omits stat/hash/chmod/flock; the shim computes
  // real local content, inode/link count and timestamps. Only uid/gid and flock
  // are fixture-owned simulations; no device path is reachable from this test.
  const prelude=`PATH=${quote(unix(path.dirname(dash)))}:$PATH\nexport PATH\nflock() { [ ! -f ${quote(unix(path.join(base,'busy')))} ]; }\nstat() { if [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; else ${pycall} stat "$2" "$3"; fi; }\nsha256sum() { ${pycall} hash "$1"; }\nchmod() { ${pycall} chmod "$1" "$2"; }\nchgrp() { :; }\n`;
  function run(action,{inject=''}={}){
    const file=path.join(base,'helper.sh');fs.writeFileSync(file,'#!/bin/sh\n'+prelude+inject+'\n'+script.replace(/^#![^\n]+\n/,''));
    return spawnSync(dash,[unix(file),action],{encoding:'utf8',timeout:10000,env:{...process.env,LC_ALL:'C'}});
  }
  const write=(text)=>fs.writeFileSync(boot,text);
  const content=()=>fs.existsSync(boot)?fs.readFileSync(boot,'utf8'):null;
  const clean=()=>assert(!fs.existsSync(path.join(root,'.autostart-hook-work')),'transaction work must be cleaned');
  return {base,root,boot,run,write,content,clean};
}
function success(r,which){assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,new RegExp('TOPFLOW_AUTOSTART_HOOK='+which));}
test('documented UFI hook is inserted before early exit, remains idempotent and preserves unrelated bytes',t=>{
  const f=fixture(t),original='#!/bin/sh\n# another plugin\n\nexit 0\nsh /data/plugins/aoyou-world/boot.sh & # OTHER\n';f.write(original);
  success(f.run('enable'),'enabled');assert.equal(f.content(),'#!/bin/sh\n'+line+'\n'+original.slice(10));f.clean();
  const before=fs.statSync(f.boot);success(f.run('enable'),'enabled');assert.equal(fs.statSync(f.boot).ino,before.ino,'idempotent enable must not rewrite the shared script');
  success(f.run('status'),'enabled');success(f.run('disable'),'disabled');assert.equal(f.content(),original);f.clean();
});
test('status is read-only and disable on absent shared script does not create it',t=>{
  const f=fixture(t);success(f.run('status'),'disabled');assert.deepEqual(fs.readdirSync(f.root),[]);
  success(f.run('disable'),'disabled');assert.equal(f.content(),null);f.clean();
});
test('own newly created hook is removed completely but later foreign contents survive',t=>{
  const f=fixture(t);success(f.run('enable'),'enabled');assert(fs.existsSync(path.join(f.root,'autostart-boot-created')));
  success(f.run('disable'),'disabled');assert.equal(f.content(),null);assert(!fs.existsSync(path.join(f.root,'autostart-boot-created')));
  success(f.run('enable'),'enabled');fs.appendFileSync(f.boot,'# other plugin\n');success(f.run('disable'),'disabled');assert.equal(f.content(),'#!/bin/sh\n# other plugin\n');f.clean();
});
test('conflicting markers, path commands, invalid shell, binary text and unsupported formats remain untouched',t=>{
  for(const original of ['#!/bin/sh\nfalse # TOPFLOW_SCREEN_AUTOSTART_V1\n','#!/bin/sh\nsh /data/plugins/topflow-screen/other.sh &\n','#!/bin/sh\nif then\n','#!/bin/sh\n# invalid\0text\n','#!/bin/sh\r\n# CRLF\r\n','#!/bin/sh\n# missing final break','#!/bin/bash\nexit 0\n']){
    const f=fixture(t);f.write(original);for(const op of ['enable','disable','status']){const r=f.run(op);assert.notEqual(r.status,0,original);assert.equal(f.content(),original);}
    assert.deepEqual(fs.readdirSync(f.root),[]);
  }
});
test('shared hard links and unknown transaction contents are rejected without deletion',t=>{
  const f=fixture(t);f.write('#!/bin/sh\n# keep\n');fs.linkSync(f.boot,path.join(f.base,'linked'));
  assert.notEqual(f.run('enable').status,0);assert.equal(f.content(),'#!/bin/sh\n# keep\n');
  fs.unlinkSync(path.join(f.base,'linked'));
  const w=path.join(f.root,'.autostart-hook-work');fs.mkdirSync(w);fs.writeFileSync(path.join(w,'owner'),'TOPFLOW_SCREEN_BOOT_WORK_V1\n');fs.writeFileSync(path.join(w,'user-file'),'untouched');
  assert.notEqual(f.run('enable').status,0);assert.equal(fs.readFileSync(path.join(w,'user-file'),'utf8'),'untouched');
});
test('recognized interrupted work is collected and an interrupted creation receipt is removed',t=>{
  const f=fixture(t),w=path.join(f.root,'.autostart-hook-work');fs.mkdirSync(w);fs.writeFileSync(path.join(w,'owner'),'TOPFLOW_SCREEN_BOOT_WORK_V1\n');fs.writeFileSync(path.join(w,'after'),'partial');fs.writeFileSync(path.join(f.root,'autostart-boot-created'),'TOPFLOW_SCREEN_BOOT_CREATED_V1\n0:1\n');
  success(f.run('disable'),'disabled');assert.equal(f.content(),null);assert(!fs.existsSync(path.join(f.root,'autostart-boot-created')));f.clean();
});
test('a concurrent foreign edit is detected before replacement and its contents survive',t=>{
  const f=fixture(t);f.write('#!/bin/sh\n# original\n');
  const inject=`chmod() { printf '# concurrent plugin\\n' >> ${quote(unix(f.boot))}; return 0; }\n`;
  const r=f.run('enable',{inject});assert.notEqual(r.status,0,r.stderr+r.stdout);assert.equal(f.content(),'#!/bin/sh\n# original\n# concurrent plugin\n');f.clean();
});
test('busy editor and unknown ownership receipt never alter the shared script',t=>{
  const f=fixture(t);f.write('#!/bin/sh\n# keep\n');fs.writeFileSync(path.join(f.base,'busy'),'');assert.notEqual(f.run('enable').status,0);assert.equal(f.content(),'#!/bin/sh\n# keep\n');
  fs.unlinkSync(path.join(f.base,'busy'));fs.writeFileSync(path.join(f.root,'autostart-boot-created'),'not our receipt\n');assert.notEqual(f.run('disable').status,0);assert.equal(f.content(),'#!/bin/sh\n# keep\n');
});
test('duplicate or moved hook lines and lookalike heredoc contents are never deleted',t=>{
  for(const original of ['#!/bin/sh\n'+line+'\n# other\n'+line+'\n','#!/bin/sh\n# other\n'+line+'\n',"#!/bin/sh\ncat <<'EOF'\n"+line+'\nEOF\n']){
    const f=fixture(t);f.write(original);for(const op of ['status','enable','disable'])assert.notEqual(f.run(op).status,0);assert.equal(f.content(),original);
  }
});
test('an interrupted creation receipt cannot delete another plugin empty boot file',t=>{
  const f=fixture(t);f.write('#!/bin/sh\n');fs.writeFileSync(path.join(f.root,'autostart-boot-created'),'TOPFLOW_SCREEN_BOOT_CREATED_V1\n0:1\n');success(f.run('disable'),'disabled');assert.equal(f.content(),'#!/bin/sh\n');assert(!fs.existsSync(path.join(f.root,'autostart-boot-created')));f.clean();
});
test('a foreign file created between the ownership receipt and boot commit survives both enable failure and disable',t=>{
  const f=fixture(t),inject=`mv() { command mv "$@" || return $?; if [ "$2" = "$CREATED" ]; then printf '#!/bin/sh\\n' > "$BOOT"; fi; }\n`;
  const r=f.run('enable',{inject});assert.notEqual(r.status,0);assert.equal(f.content(),'#!/bin/sh\n');assert(fs.existsSync(path.join(f.root,'autostart-boot-created')));f.clean();
  success(f.run('disable'),'disabled');assert.equal(f.content(),'#!/bin/sh\n');assert(!fs.existsSync(path.join(f.root,'autostart-boot-created')));f.clean();
});
test('shared symbolic links never follow or modify their target',t=>{
  const f=fixture(t),target=path.join(f.base,'foreign');fs.writeFileSync(target,'#!/bin/sh\n# foreign\n');
  try{fs.symlinkSync(target,f.boot);}catch(e){if(e.code==='EPERM'){t.skip('Host does not permit test symlinks');return;}throw e;}
  for(const op of ['status','enable','disable'])assert.notEqual(f.run(op).status,0);
  assert.equal(fs.readFileSync(target,'utf8'),'#!/bin/sh\n# foreign\n');assert(fs.lstatSync(f.boot).isSymbolicLink());
});
test('existing group and permission are forwarded unchanged when publishing a hook edit',t=>{
  const f=fixture(t);f.write('#!/bin/sh\n# original\n');
  const perms=path.join(f.base,'permissions');const inject=`stat() { if [ "$2" = %a ]; then printf '640\\n'; elif [ "$2" = %g ]; then printf '123\\n'; elif [ "$1" = -L ]; then command ls -Ldi "$4" | awk '{print "0:"$1}'; elif [ "$2" = %d:%i ]; then command ls -di "$3" | awk '{print "0:"$1}'; else ${quote(unix(process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'):'python3'))} ${quote(unix(path.join(f.base,'util.py')))} stat "$2" "$3"; fi; }\nchmod() { printf 'mode:%s\\n' "$1" >> ${quote(unix(perms))}; }\nchgrp() { printf 'group:%s\\n' "$1" >> ${quote(unix(perms))}; }\n`;
  success(f.run('enable',{inject}),'enabled');assert.equal(fs.readFileSync(perms,'utf8'),'mode:640\ngroup:123\n');f.clean();
});


