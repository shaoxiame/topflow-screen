'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const migration=require('../src/manager-wallpaper-migration.js');
const helper=require('../src/manager-wallpaper.js'),panel=require('../src/manager-wallpaper-ui.js');
const boot='01234567-89ab-cdef-0123-456789abcdef',nonce='1'.repeat(32);
function image(){const bytes=new Uint8Array(307216);bytes.set([84,70,87,80,53,54,53,49,64,1,224,1,0,176,4,0]);for(let i=16;i<bytes.length;i++)bytes[i]=i%251;return bytes;}
function backupContext(bytes,options={}){
 const sha256=bytes?helper.sha256(bytes):null,calls=[];
 return {calls,hash:helper.sha256,async read(expected,offset){calls.push({expected,offset});if(options.failAt===calls.length)throw Error('read failed');if(offset===undefined)return 'TOPFLOW_WALLPAPER_BACKUP='+JSON.stringify({bootId:options.changed&&expected?'11234567-89ab-cdef-0123-456789abcdef':boot,sha256});let chunk=Buffer.from(bytes.subarray(offset,offset+24576)).toString('base64');if(options.corrupt&&offset===24576)chunk='AAAA'+chunk.slice(4);return 'TOPFLOW_WALLPAPER_CHUNK='+chunk;}};
}
function restoreContext(saved,options={}){
 let state={configured:false,pending:false,uploadValid:false,bootId:boot,uploadedBytes:0},received=new Uint8Array(307216),calls=[],fail=options.failOnce;
 return {calls,hash:helper.sha256,parse:panel.parse,nonce:()=>nonce,get state(){return state;},get bytes(){return received;},setState(values){Object.assign(state,values);},async command(action,sha,marker,details){calls.push(action);if(action==='status')return 'TOPFLOW_WALLPAPER='+JSON.stringify(state);if(action==='prepare'){Object.assign(state,{pending:true,pendingSha256:sha,pendingNonce:details.nonce,pendingBootId:details.bootId,uploadedBytes:0,uploadValid:false});}
 else if(action==='chunk'){assert.equal(details.offset,state.uploadedBytes);const bytes=Buffer.from(details.base64,'base64');received.set(bytes,details.offset);state.uploadedBytes+=bytes.length;state.uploadValid=state.uploadedBytes===307216;}
 else if(action==='abort'){state.pending=false;state.uploadValid=false;state.uploadedBytes=0;}
 else if(action==='commit'){assert.equal(helper.sha256(received),sha);Object.assign(state,{configured:true,sha256:sha,pending:false,uploadValid:false,uploadedBytes:0});}
 if(fail===action){fail=null;throw Error('response lost');}return 'TOPFLOW_WALLPAPER='+marker;}};
}
test('migration exports exact bounded bytes, verifies hash/header and rechecks final snapshot before callers can uninstall',async()=>{
 const bytes=image(),context=backupContext(bytes),saved=await migration.backup(context);
 assert.deepEqual(saved.bytes,bytes);assert.equal(context.calls.length,15);assert.equal(saved.sha256,helper.sha256(bytes));
 assert.equal(context.calls.at(-1).expected.sha256,saved.sha256);
 for(const options of [{failAt:1},{failAt:6},{corrupt:true},{changed:true}])await assert.rejects(migration.backup(backupContext(bytes,options)));
 const invalid=image();invalid[0]=0;await assert.rejects(migration.backup(backupContext(invalid)),/格式无效/);
 const empty=backupContext(null);assert.equal((await migration.backup(empty)).bytes,null);assert.equal(empty.calls.length,2);
});
test('memory restore uses only nonce/boot-bound existing chunk protocol and confirms final hash',async()=>{
 const saved=await migration.backup(backupContext(image())),ctx=restoreContext(saved);
 assert.equal(await migration.restore(saved,ctx),true);assert.deepEqual(ctx.bytes,saved.bytes);assert.equal(ctx.calls.filter(x=>x==='chunk').length,13);assert.equal(ctx.calls.filter(x=>x==='commit').length,1);
 const before=ctx.calls.length;assert.equal(await migration.restore(saved,ctx),true);assert.deepEqual(ctx.calls.slice(before),['status']);
});
test('unknown chunk/commit outcomes retain memory, do not auto-retry and can recover on explicit next invocation',async()=>{
 for(const action of ['prepare','chunk','commit']){
  const saved=await migration.backup(backupContext(image())),ctx=restoreContext(saved,{failOnce:action});
  await assert.rejects(migration.restore(saved,ctx),/response lost/);assert.equal(helper.sha256(saved.bytes),saved.sha256);assert.equal(ctx.calls.filter(x=>x===action).length,1);
  assert.equal(await migration.restore(saved,ctx),true);assert.equal(ctx.state.sha256,saved.sha256);assert.equal(ctx.state.pending,false);
 }
});
test('restore refuses changed local backup, unrelated uploads or another already-applied wallpaper',async()=>{
 const saved=await migration.backup(backupContext(image())),ctx=restoreContext(saved);
 saved.bytes[90]^=1;await assert.rejects(migration.restore(saved,ctx),/校验失败/);assert.deepEqual(ctx.calls,[]);saved.bytes[90]^=1;
 ctx.setState({configured:true,sha256:'f'.repeat(64)});await assert.rejects(migration.restore(saved,ctx),/其他壁纸/);assert.deepEqual(ctx.calls,['status']);
 ctx.setState({configured:false,pending:true,pendingSha256:saved.sha256,pendingNonce:'2'.repeat(32),pendingBootId:boot});await assert.rejects(migration.restore(saved,ctx),/其他未完成/);assert.deepEqual(ctx.calls,['status','status']);
});
