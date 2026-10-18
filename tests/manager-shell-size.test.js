'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const plugin=require('../src/ufi-plugin.js');
const root=path.resolve(__dirname,'..'),limit=96*1024;
const original=fs.readFileSync(path.join(root,'releases/topflow-screen-0.2.6.txt'),'utf8');
const context={};vm.createContext(context);
vm.runInContext(original.match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1],context);
const historical=context.TopFlowPackagePayload;
const released027={};vm.createContext(released027);
vm.runInContext(fs.readFileSync(path.join(root,'releases/topflow-screen-0.2.7.txt'),'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1],released027);
const released0210={};vm.createContext(released0210);
vm.runInContext(fs.readFileSync(path.join(root,'releases/topflow-screen-0.2.10.txt'),'utf8').match(/<script[^>]*>([\s\S]*?)<\/script>/i)[1],released0210);
const controller=fs.readFileSync(path.join(root,'native/screenctl.sh'),'utf8');
const current={...historical,version:require('../package.json').version,screenctlSource:controller,screenctlSha256:crypto.createHash('sha256').update(controller).digest('hex')};
const sha='c'.repeat(64),bootId='01234567-89ab-cdef-0123-456789abcdef';
function commands(payload){
 const result={};
 for(const action of ['status','start','restore','uninstall','autostart-enable','autostart-disable'])result[action]=plugin.buildScreenCommand(action,payload,true);
 result['uninstall-with-wallpaper']=plugin.buildScreenCommand('uninstall',payload,true,{sha256:sha,bootId});
 result['install-start']=plugin.buildInstallStart('d'.repeat(32),payload);
 result['install-finish']=plugin.buildInstallFinish('d'.repeat(32),payload);
 result['upload-finish']=plugin.buildUploadComplete('d'.repeat(32),payload);
 result['wallpaper-backup']=plugin.buildWallpaperBackupCommand(payload);
 result['wallpaper-backup-chunk']=plugin.buildWallpaperBackupCommand(payload,{sha256:sha,bootId},24576);
 for(const migration of [false,true])for(const action of ['status','prepare','chunk','commit','abort','clear']){
  result['wallpaper-'+action+'-'+migration]=plugin.buildWallpaperCommand(action,payload,sha,{nonce:'d'.repeat(32),bootId,migration,offset:245760,base64:Buffer.alloc(24576,123).toString('base64')});
 }
 return result;
}
test('UTF-8 byte guard counts actual bytes and rejects before the sh -c argument limit',()=>{
 for(const value of ['','ascii','中文','🛰️','x\ud800y','\udc00','汉'.repeat(32768)])assert.equal(plugin.shellCommandBytes(value),Buffer.byteLength(value));
 assert.equal(plugin.validateShellCommand('a'.repeat(limit-1)).length,limit-1);
 for(const value of ['a'.repeat(limit),'汉'.repeat(32768)])assert.throws(()=>plugin.validateShellCommand(value),{code:'SHELL_COMMAND_TOO_LARGE'});
});
test('released full controller and current source generate every action below 96 KiB, including 24 KiB wallpaper migration chunks',()=>{
 assert(Buffer.byteLength(controller)>50000,'Use the actual complete recovery controller');
 const oldBytes=Buffer.byteLength(context.TopFlowUfiPlugin.buildScreenCommand('status',historical));
 assert(oldBytes>=131072,'Preserve the exact released regression that crossed Linux sh -c limits');
 let maximum={name:'',bytes:0};
 for(const [label,payload] of [['released026',historical],['released027',released027.TopFlowPackagePayload],['released0210',released0210.TopFlowPackagePayload],['current',current]])for(const [name,command]of Object.entries(commands(payload))){
  const bytes=Buffer.byteLength(command);assert(bytes<limit,`${label}/${name}: ${bytes} bytes`);
  assert.equal(plugin.validateShellCommand(command),command);
  if(bytes>maximum.bytes)maximum={name:label+'/'+name,bytes};
 }
 console.log('Largest complete UFI command: '+maximum.name+' = '+maximum.bytes+' UTF-8 bytes');
});

test('ownership member constants reuse only identical bytes and every release still selects its exact digest and list',()=>{
 const payload=released0210.TopFlowPackagePayload,command=plugin.buildScreenCommand('status',payload);
 const declarations=[...command.matchAll(/^TF_MEMBERS_(\d+)='([^']*)'$/gm)];
 const lists=new Map(declarations.map(m=>[m[1],m[2]]));
 assert.equal(new Set(lists.values()).size,lists.size,'Only exactly identical complete lists can share storage');
 const uses=[...command.matchAll(/tf_verify_owned '([a-f0-9]{64})' "\$TF_MEMBERS_(\d+)"/g)];
 assert(uses.length>lists.size,'Shared historical lists should be encoded once');
 for(const use of uses){assert(lists.has(use[2]));assert(command.includes("TOPFLOW_SCREEN_INSTALL_V1\\n%s' '"+use[1]+"'"),'Every lookup retains its exact archive marker');}
 const selected=uses.filter(m=>m[1]===payload.archiveSha256);
 assert(selected.length>=1);
 for(const use of selected)assert.equal(lists.get(use[2]),payload.members.map(n=>n.replace(/^\.\//,'').replace(/\/$/,'')).filter(Boolean).join('\n'));
 assert.match(command,/tf_verify_legacy_cleaning/);assert.match(command,/stat -c %h/);assert.match(command,/sha256sum -c/);
});
test('wallpaper operations retain current installation guards without embedding forbidden legacy execution paths',()=>{
 const command=plugin.buildWallpaperCommand('chunk',current,sha,{nonce:'d'.repeat(32),bootId,migration:true,offset:0,base64:'YQ=='});
 assert.match(command,/tf_verify_install\(\)/);assert.match(command,/TF_VERSION_MISMATCH.*false/);
 assert.match(command,/UNVERIFIED_OWNERSHIP/);assert.match(command,/UNVERIFIED_MANIFEST/);
 assert.match(command,/WALLPAPER_RESTORE_CONFLICT/);assert.match(command,/set -- wallpaper-chunk --confirmed/);
 assert(!command.includes('0702ffaf6ff94b0974bf617926e5232dcabc27f7d8770b87b4038c0eb885bc1c'));
});
