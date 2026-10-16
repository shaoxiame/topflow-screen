'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ui = require('../src/manager-wallpaper-ui.js');
const plugin = require('../src/ufi-plugin.js');
const HASH = 'a'.repeat(64), OLD_HASH = 'b'.repeat(64), NONCE = '1'.repeat(32);
const BOOT = '12345678-1234-1234-1234-123456789abc', OLD_BOOT = '00000000-1234-1234-1234-123456789abc';
const BYTES = 307216, CHUNK = 24576;
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return {promise,resolve,reject}; };
const initial = () => ({configured:false,pending:false,uploadValid:false,uploadedBytes:0,bootId:BOOT});
const pendingState = extra => ({pending:true,pendingSha256:HASH,pendingNonce:NONCE,pendingBootId:BOOT,uploadValid:true,uploadedBytes:BYTES,...extra});
async function until(predicate) { for(let i=0;i<100&&!predicate();i++)await Promise.resolve();assert(predicate(),'expected asynchronous checkpoint'); }

function harness(options = {}) {
  const elements={},commands=[],confirmations=[],prepared=[];
  let state={...initial(),...options.state},busy=false,disposed=0,denied=!!options.deny,randomCalls=0,panel;
  for(const name of ['preview','image','state','choose','file','apply','clear','abort'])elements[name]={
    disabled:false,hidden:false,textContent:'',value:'',files:[],attributes:{},
    setAttribute(name,value){this.attributes[name]=String(value);},removeAttribute(name){delete this.attributes[name];if(name==='src')this.src='';},
    click(){this.clicks=(this.clicks||0)+1;}
  };
  const host={innerHTML:'',querySelector(selector){const name=selector.match(/^\[data-tf-wallpaper-(.+)\]$/)?.[1];assert(elements[name],selector);return elements[name];}};
  function result(label='selected') {
    const item={bytes:Uint8Array.from({length:BYTES},(_,i)=>i*31&255),previewUrl:'blob:'+label,width:320,height:480,sourceWidth:640,sourceHeight:480,disposeCalls:0,
      dispose(){this.disposeCalls++;disposed++;}};
    prepared.push(item);return item;
  }
  const root={crypto:{getRandomValues(bytes){randomCalls++;bytes.fill(randomCalls);return bytes;}},
    TopFlowManagerWallpaper:{prepare:options.prepare||(async()=>result()),sha256(bytes){assert.equal(bytes.length,BYTES);return HASH;}}};
  for(const name of ['fetch','FormData','XMLHttpRequest','confirm'])Object.defineProperty(root,name,{get(){throw Error('Unexpected browser API '+name);}});
  const context={reviewOnly:!!options.reviewOnly,state:()=>options.deviceState||{installed:true,mode:'custom'},busy:()=>busy,
    async confirm(message){confirmations.push(message);if(options.confirmWait)await options.confirmWait;return !denied;},
    async command(action,sha,marker,details){
      commands.push({action,sha,marker,details});
      if(action==='status')return 'TOPFLOW_WALLPAPER='+JSON.stringify(state);
      if(options.failCommand===action)throw Error('command response unavailable');
      assert.match(details.nonce,/^[a-f0-9]{32}$/);assert.equal(details.bootId,state.bootId);
      if(action==='prepare')state={...state,pending:true,pendingSha256:sha,pendingNonce:details.nonce,pendingBootId:details.bootId,previousBoot:false,uploadValid:false,uploadedBytes:0};
      else if(action==='chunk'){
        assert.equal(details.nonce,state.pendingNonce);assert.equal(details.bootId,state.pendingBootId);assert.equal(details.offset,state.uploadedBytes);
        const decoded=Buffer.from(details.base64,'base64');assert(decoded.length>0&&decoded.length<=CHUNK);assert.equal(decoded.toString('base64'),details.base64);assert.equal(marker,'CHUNKED');
        if(options.chunkWait)await options.chunkWait;
        if(options.failChunkOffset===details.offset&&!options.writeBeforeError)throw Error('chunk response unavailable');
        state={...state,uploadedBytes:state.uploadedBytes+decoded.length};state.uploadValid=state.uploadedBytes===BYTES;
        if(options.failChunkOffset===details.offset&&options.writeBeforeError)throw Error('chunk response unavailable');
      }else if(action==='commit'){
        assert.equal(details.nonce,state.pendingNonce);assert.equal(details.bootId,state.pendingBootId);assert.equal(state.uploadValid,true);
        state={...state,configured:true,sha256:sha,pending:false,uploadValid:false,uploadedBytes:0,...options.commitState};
      }else if(action==='abort'){
        assert.equal(details.nonce,state.pendingNonce);state={...state,pending:false,uploadValid:false,uploadedBytes:0};
      }else if(action==='clear')state={...state,configured:false,pending:false,uploadValid:false,uploadedBytes:0};
      else assert.fail('Unexpected wallpaper action '+action);
      return 'TOPFLOW_WALLPAPER='+marker;
    },
    async run(task){if(busy)return;busy=true;panel.update();try{await task();}finally{busy=false;panel.update();}}
  };
  panel=ui.mount(root,host,context);
  return {root,host,elements,commands,confirmations,prepared,result,context,panel,
    get disposed(){return disposed;},get state(){return state;},get randomCalls(){return randomCalls;},
    setState(next){state={...state,...next};},deny(value){denied=value;},
    async select(file={name:'private-original.jpg',size:4000000}){elements.file.files=[file];await elements.file.onchange();},
    writes(){return commands.filter(command=>command.action!=='status');}};
}
const actions=h=>h.writes().map(c=>c.action);

test('initial refresh is read-only and unavailable installations cannot apply wallpaper',async()=>{
  const h=harness();assert.deepEqual(h.commands,[]);await h.panel.refresh();
  assert.deepEqual(h.commands.map(c=>c.action),['status']);assert.deepEqual(actions(h),[]);assert.equal(h.confirmations.length,0);
  assert.equal(h.elements.apply.disabled,true);assert.equal(h.elements.clear.disabled,true);
  for(const options of [{reviewOnly:true},{deviceState:{installed:false}},{deviceState:{installed:true,partial:true}},{deviceState:{installed:true,versionMismatch:true}}]){
    const unavailable=harness(options);await unavailable.panel.refresh();await unavailable.select();
    assert.deepEqual(unavailable.commands,[]);assert.equal(unavailable.elements.apply.disabled,true);
    await unavailable.elements.apply.onclick();assert.deepEqual(actions(unavailable),[]);
  }
});

test('one confirmed apply sends thirteen guarded chunks then commits and verifies the exact SHA',async()=>{
  const h=harness();await h.panel.refresh();await h.select();const bytes=h.prepared[0].bytes;
  assert.equal(h.elements.image.src,'blob:selected');assert.deepEqual(actions(h),[]);
  await h.elements.apply.onclick();
  assert.deepEqual(actions(h),['prepare',...Array(13).fill('chunk'),'commit']);assert.equal(h.confirmations.length,1);assert.equal(h.randomCalls,1);
  const chunks=h.writes().filter(c=>c.action==='chunk'),transaction=h.writes()[0].details;
  assert.deepEqual(chunks.map(c=>c.details.offset),Array.from({length:13},(_,i)=>i*CHUNK));
  assert.deepEqual(Buffer.concat(chunks.map(c=>Buffer.from(c.details.base64,'base64'))),Buffer.from(bytes));
  assert(h.writes().every(c=>c.sha===HASH&&c.details.nonce===transaction.nonce&&c.details.bootId===BOOT));
  assert.equal(h.state.configured,true);assert.equal(h.state.pending,false);assert.equal(h.state.sha256,HASH);
  assert.match(h.elements.state.textContent,/已应用/);assert.equal(h.disposed,1);assert.equal(h.elements.image.hidden,true);
  assert.equal(h.elements.apply.disabled,true);assert.equal(h.elements.clear.disabled,false);
  await h.elements.apply.onclick();assert.equal(h.writes().length,15);
  const source=fs.readFileSync(require.resolve('../src/manager-wallpaper-ui.js'),'utf8');
  assert.doesNotMatch(source,/upload_file|FormData|root\.confirm|upload-complete/);
});

test('same-image transactions use fresh nonces and missing secure randomness blocks prepare',async()=>{
  const h=harness();await h.panel.refresh();await h.select();await h.elements.apply.onclick();await h.select();await h.elements.apply.onclick();
  const prepares=h.writes().filter(c=>c.action==='prepare');assert.equal(prepares.length,2);assert.notEqual(prepares[0].details.nonce,prepares[1].details.nonce);assert.equal(prepares[0].sha,prepares[1].sha);
  const missing=harness();missing.root.crypto=undefined;await missing.panel.refresh();await missing.select();await missing.elements.apply.onclick();
  assert.deepEqual(actions(missing),[]);assert.match(missing.elements.state.textContent,/安全随机数/);assert.equal(missing.disposed,0);
});

test('async custom confirmation holds the busy guard and cancelling never writes or releases the preview',async()=>{
  const confirmation=deferred(),h=harness({confirmWait:confirmation.promise,deny:true});await h.panel.refresh();await h.select();
  const applying=h.elements.apply.onclick();await until(()=>h.confirmations.length===1);
  assert.deepEqual(actions(h),[]);assert.equal(h.elements.apply.disabled,true);await h.elements.apply.onclick();
  confirmation.resolve();await applying;assert.deepEqual(actions(h),[]);assert.equal(h.disposed,0);assert.equal(h.randomCalls,0);
});

test('unknown chunk results never retransmit or commit; explicit cleanup uses the original nonce',async()=>{
  for(const writeBeforeError of [false,true]){
    const h=harness({failChunkOffset:CHUNK,writeBeforeError,state:{configured:true,sha256:OLD_HASH}});
    await h.panel.refresh();await h.select();await h.elements.apply.onclick();
    assert.deepEqual(actions(h),['prepare','chunk','chunk']);assert.equal(h.state.sha256,OLD_HASH);assert.equal(h.state.pending,true);
    assert.match(h.elements.state.textContent,/未自动重传/);assert.equal(h.elements.apply.disabled,true);assert.equal(h.elements.abort.hidden,false);
    await h.panel.refresh();await h.elements.apply.onclick();assert.deepEqual(actions(h),['prepare','chunk','chunk']);
    const transaction=h.writes()[0].details;await h.elements.abort.onclick();
    assert.deepEqual(actions(h),['prepare','chunk','chunk','abort']);assert.equal(h.writes().at(-1).details.nonce,transaction.nonce);
    assert.equal(h.state.pending,false);assert.equal(h.state.configured,true);assert.equal(h.state.sha256,OLD_HASH);
  }
});

test('a lost final chunk acknowledgement requires a separate confirmation before commit and never resends bytes',async()=>{
  const h=harness({failChunkOffset:12*CHUNK,writeBeforeError:true});await h.panel.refresh();await h.select();await h.elements.apply.onclick();
  assert.deepEqual(actions(h),['prepare',...Array(13).fill('chunk')]);assert.equal(h.state.uploadValid,true);assert.equal(h.elements.apply.disabled,false);
  h.deny(true);await h.elements.apply.onclick();assert.equal(h.writes().length,14);
  h.deny(false);await h.elements.apply.onclick();assert.deepEqual(actions(h),['prepare',...Array(13).fill('chunk'),'commit']);assert.equal(h.randomCalls,1);
});

test('validated same-boot pending transactions can commit without fresh chunks or a new nonce',async()=>{
  const h=harness({state:pendingState(),deny:true});await h.panel.refresh();assert.equal(h.elements.apply.disabled,false);
  await h.elements.apply.onclick();assert.deepEqual(actions(h),[]);h.deny(false);await h.elements.apply.onclick();
  assert.deepEqual(actions(h),['commit']);assert.equal(h.writes()[0].details.nonce,NONCE);assert.equal(h.randomCalls,0);assert.match(h.elements.state.textContent,/已应用/);
});

test('previous-boot uploads never commit and explicit cleanup uses the current boot ID with the old pending nonce',async()=>{
  for(const uploadValid of [false,true]){
    const h=harness({state:{configured:true,sha256:OLD_HASH,...pendingState({pendingBootId:OLD_BOOT,uploadValid})}});
    await h.panel.refresh();assert.match(h.elements.state.textContent,/设备已重启.*可清理旧上传/);
    assert.equal(h.elements.apply.disabled,true);assert.equal(h.elements.abort.hidden,false);assert.equal(h.elements.abort.textContent,'清理旧上传');
    await h.elements.apply.onclick();assert.deepEqual(actions(h),[]);await h.elements.abort.onclick();
    assert.deepEqual(actions(h),['abort']);assert.deepEqual(h.writes()[0].details,{nonce:NONCE,bootId:BOOT});
    assert.equal(h.state.pending,false);assert.equal(h.state.configured,true);assert.equal(h.state.sha256,OLD_HASH);assert.match(h.confirmations[0],/设备已重启/);
  }
});

test('a fresh boot change blocks a previously offered commit and cleanup still requires confirmation',async()=>{
  const h=harness({state:pendingState()});await h.panel.refresh();assert.equal(h.elements.apply.disabled,false);
  h.setState({bootId:OLD_BOOT});await h.elements.apply.onclick();assert.deepEqual(actions(h),[]);assert.equal(h.confirmations.length,0);
  assert.match(h.elements.state.textContent,/设备已重启.*不能继续应用/);await h.panel.refresh();h.deny(true);await h.elements.abort.onclick();
  assert.deepEqual(actions(h),[]);assert.equal(h.state.pending,true);
});

test('clear uses a new nonce and current boot, verifies default state and releases preview only after success',async()=>{
  const h=harness({state:{configured:true,sha256:OLD_HASH}});await h.panel.refresh();await h.select();await h.elements.clear.onclick();
  assert.deepEqual(actions(h),['clear']);assert.equal(h.writes()[0].sha,OLD_HASH);assert.equal(h.writes()[0].details.bootId,BOOT);assert.match(h.writes()[0].details.nonce,/^[a-f0-9]{32}$/);assert.equal(h.randomCalls,1);
  assert.equal(h.state.configured,false);assert.equal(h.disposed,1);assert.match(h.elements.state.textContent,/已恢复默认/);
  const denied=harness({deny:true,state:{configured:true,sha256:OLD_HASH}});await denied.panel.refresh();await denied.elements.clear.onclick();assert.deepEqual(actions(denied),[]);assert.equal(denied.state.configured,true);
});

test('unknown prepare does not advance, and commit with inconsistent readback does not report success or auto-clean',async()=>{
  const prepare=harness({failCommand:'prepare'});await prepare.panel.refresh();await prepare.select();await prepare.elements.apply.onclick();assert.deepEqual(actions(prepare),['prepare']);
  const h=harness({commitState:{sha256:OLD_HASH}});await h.panel.refresh();await h.select();await h.elements.apply.onclick();
  assert.match(h.elements.state.textContent,/回读不一致/);assert.doesNotMatch(h.elements.state.textContent,/壁纸已应用/);
  assert.deepEqual(actions(h),['prepare',...Array(13).fill('chunk'),'commit']);assert.equal(h.disposed,0);
});

test('an in-flight chunk holds the shared busy guard and ignores duplicate apply or cleanup clicks',async()=>{
  const uploading=deferred(),h=harness({chunkWait:uploading.promise});await h.panel.refresh();await h.select();
  const operation=h.elements.apply.onclick();await until(()=>h.writes().some(c=>c.action==='chunk'));
  assert.equal(h.elements.apply.disabled,true);assert.equal(h.elements.file.disabled,true);
  await h.elements.apply.onclick();await h.elements.abort.onclick();await h.elements.clear.onclick();assert.deepEqual(actions(h),['prepare','chunk']);
  uploading.resolve();await operation;assert.deepEqual(actions(h),['prepare',...Array(13).fill('chunk'),'commit']);
});

test('removing a manager during confirmation or transmission never schedules further mutations',async()=>{
  const confirmation=deferred(),h=harness({confirmWait:confirmation.promise});await h.panel.refresh();await h.select();
  const applying=h.elements.apply.onclick();await until(()=>h.confirmations.length===1);h.panel.dispose();confirmation.resolve();await applying;assert.deepEqual(actions(h),[]);assert.equal(h.disposed,1);
  const sending=deferred(),active=harness({chunkWait:sending.promise});await active.panel.refresh();await active.select();
  const operation=active.elements.apply.onclick();await until(()=>active.writes().some(c=>c.action==='chunk'));active.panel.dispose();sending.resolve();await operation;
  assert.deepEqual(actions(active),['prepare','chunk']);assert.equal(active.disposed,1);assert.equal(active.state.pending,true);
});

test('dispose and uninstall reset release selected and late previews while reset keeps the manager reusable',async()=>{
  const h=harness();await h.panel.refresh();await h.select();h.panel.reset();assert.equal(h.disposed,1);assert.equal(h.elements.image.hidden,true);assert.equal(h.elements.apply.disabled,true);
  await h.panel.refresh();await h.select();assert.equal(h.elements.image.hidden,false);assert.equal(h.elements.apply.disabled,false);h.panel.dispose();h.panel.dispose();assert.equal(h.disposed,2);
  for(const method of ['reset','dispose']){
    const preparing=deferred(),p=harness({prepare:()=>preparing.promise});await p.panel.refresh();const selection=p.select();p.panel[method]();
    const result=p.result('late');preparing.resolve(result);await selection;assert.equal(result.disposeCalls,1);assert.equal(p.elements.image.hidden,true);assert.deepEqual(actions(p),[]);
  }
});

test('only the newest concurrent image preparation owns a preview and replacement releases the old object URL',async()=>{
  const one=deferred(),two=deferred(),queue=[one,two],h=harness({prepare:()=>queue.shift().promise});await h.panel.refresh();
  const first=h.select({name:'first'}),second=h.select({name:'second'}),newer=h.result('new'),older=h.result('old');
  two.resolve(newer);await second;one.resolve(older);await first;
  assert.equal(h.elements.image.src,'blob:new');assert.equal(older.disposeCalls,1);assert.equal(newer.disposeCalls,0);assert.deepEqual(actions(h),[]);
  h.root.TopFlowManagerWallpaper.prepare=async()=>h.result('replacement');await h.select();assert.equal(newer.disposeCalls,1);assert.equal(h.elements.image.src,'blob:replacement');h.panel.dispose();
});

test('status parsing rejects malformed transaction identities and impossible completed byte counts',()=>{
  const parse=state=>ui.parse('TOPFLOW_WALLPAPER='+JSON.stringify({...initial(),...state}));
  assert.equal(parse({}).previousBoot,false);assert.equal(parse(pendingState({pendingBootId:OLD_BOOT,previousBoot:false})).previousBoot,true);
  for(const invalid of [{bootId:''},{previousBoot:'true'},{uploadedBytes:-1},{uploadedBytes:BYTES+1},{uploadedBytes:1.5},{uploadValid:true},
    pendingState({pendingNonce:'x'}),pendingState({pendingBootId:'x'}),pendingState({pendingSha256:'x'}),pendingState({uploadedBytes:BYTES-1})])assert.throws(()=>parse(invalid),/格式/);
  assert.throws(()=>ui.parse('TOPFLOW_WALLPAPER={}'),/格式/);
  assert.throws(()=>ui.parse('TOPFLOW_WALLPAPER='+JSON.stringify(initial())+'\nTOPFLOW_WALLPAPER='+JSON.stringify(initial())),/未确认/);
});

test('native command construction rejects unsafe transactions, chunks and release-blocked mutations',()=>{
  const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\n',hardwareTested:false,members:['./','./topflow-screen','./screenctl.sh','./supervisor.sh','./ui/','./ui/index.html','./topflow-screen.sha256']};
  const details={nonce:NONCE,bootId:BOOT},command=plugin.buildWallpaperCommand('commit',payload,HASH,details);
  assert.match(command,/wallpaper-commit --confirmed 'a{64}'/);assert(command.includes(NONCE));assert(command.includes(BOOT));assert.match(command,/sha256sum -c/);assert.match(command,/INSTALLED_VERSION_MISMATCH/);assert.match(command,/INSTALL_INCOMPLETE/);
  assert.throws(()=>plugin.buildWallpaperCommand('commit; reboot',payload,HASH,details),{code:'INVALID_ACTION'});
  assert.throws(()=>plugin.buildWallpaperCommand('commit',payload,'x; rm -rf /',details),{code:'INVALID_HASH'});
  for(const action of ['prepare','commit','abort','clear']){
    for(const invalid of [{},{nonce:'x',bootId:BOOT},{nonce:NONCE,bootId:'x'}])assert.throws(()=>plugin.buildWallpaperCommand(action,payload,HASH,invalid));
  }
  for(const chunk of [{offset:-1,base64:'YQ=='},{offset:0,base64:'!!!!'},{offset:0,base64:'A'.repeat(32772)}])assert.throws(()=>plugin.buildWallpaperCommand('chunk',payload,HASH,{...details,...chunk}));
  assert.throws(()=>plugin.buildWallpaperCommand('clear',{...payload,reviewOnly:true},HASH,details),/发布|审查|阻止/);
  assert.match(plugin.buildWallpaperCommand('status',{...payload,reviewOnly:true}),/wallpaper-status/);
});

test('browser helper exports a UI controller without an independent HTTP upload surface',()=>{
  const sandbox={};vm.runInNewContext(fs.readFileSync(require.resolve('../src/manager-wallpaper-ui.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.TopFlowWallpaperPanel.mount,'function');assert.equal(sandbox.TopFlowWallpaperPanel.upload,undefined);
});
