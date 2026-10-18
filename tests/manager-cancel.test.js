'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {managerOnly} = require('../tools/production-manager.cjs');
const source = managerOnly(fs.readFileSync(path.join(__dirname, '../src/ufi-plugin.js'), 'utf8'));
const payload = {archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\nprintf \'{"mode":"factory"}\\n\'\n',hardwareTested:false,members:['./','./topflow-screen','./screenctl.sh','./supervisor.sh','./ui/','./ui/index.html','./topflow-screen.sha256']};
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;}); return {promise,resolve,reject}; }
function observe(promise) { const result={done:false,error:null}; result.promise=Promise.resolve(promise).then(value=>{result.done=true;result.value=value;},error=>{result.done=true;result.error=error;}); return result; }
function envelope(content, success=true) { return {ok:true,status:200,json:async()=>({success,content})}; }

// All UFI requests end at this local deferred fixture. No shell is executed.
// Use the actual stripped production manager and its authentication bridge.
function harness({alreadyWaiting=false,holdAfterConfirmedRestoration=false,holdStatusReads=[],holdPoll=2}={}) {
  const writes=[], requests=[], elements={}, timers=new Map();
  let nextTimer=0, now=0, state={installed:true,mode:'factory'}, started=false, polls=0, statusReads=0, heldStatus=false, removed=false, restored=false, restoredReads=0,panel;
  const pendingStatus=deferred(), restore=deferred(), uninstall=deferred();
  if(alreadyWaiting) state={...state,waiting:'FACTORY_AUTOSLEEP_LOCK_ACTIVE',waitingRemaining:300};
  for(const name of ['toggle','cancel','close','status','uninstall','message','version','update','state-card','mode','state-label','state-hint','autostart','autostart-state','wallpaper-retry']) elements[name]={disabled:false,hidden:false,textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];}};
  const root={URL,Uint8Array,Blob,FormData,atob,AbortController,
    TopFlowPackagePayload:payload,
    location:{href:'http://localhost/ufi',origin:'http://localhost'},
    Date:class extends Date { static now(){return now;} },
    performance:{now:()=>now},
    setTimeout(fn,ms=0){const id=++nextTimer;timers.set(id,{fn,ms,at:now+ms});return id;},
    clearTimeout(id){timers.delete(id);},
    confirm(){return true;},
    document:{currentScript:{textContent:source},querySelector(){return null;},body:{append(node){panel=node;node.parentNode=this;}},
      createElement(){return {className:'',isConnected:true,innerHTML:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];},querySelector(selector){const key=selector.match(/^\[data-tf-(.+)\]$/)?.[1];assert(Object.hasOwn(elements,key),'Unexpected production UI '+selector);return elements[key];},remove(){this.isConnected=false;}};}},
    fetch:async(url,options)=>{
      const route=new URL(url).pathname;requests.push({route,options});
      assert.equal(options.credentials,'same-origin');assert.equal(options.headers['x-existing-auth'],'panel-session');
      if(route==='/api/get_custom_head') return {ok:true,json:async()=>({text:removed?'':'<!-- [KANO_PLUGIN_START] own.txt --><script>'+source+'</script><!-- [KANO_PLUGIN_END] own.txt -->'})};
      if(route==='/api/plugin/uninstall'){writes.push('record');removed=true;return {ok:true,json:async()=>({success:true})};}
      assert.equal(route,'/api/run_shell');const command=JSON.parse(options.body).cmd;
      if(command.includes('set -- restore --confirmed')) {
        writes.push('restore');const success=await restore.promise;
        if(success) {state={installed:true,mode:'factory'};restored=true;}
        return envelope(success?'TOPFLOW_SWITCH=SUBMITTED':'Factory PID and service methods not stable',success);
      }
      if(command.includes('set -- uninstall --confirmed')) {
        writes.push('uninstall');await uninstall.promise;state={installed:false,mode:'factory'};
        return envelope('TOPFLOW_UNINSTALL=COMPONENTS_REMOVED');
      }
      if(command.includes('screenctl.sh" start --confirmed')) {
        writes.push('start');started=true;state={installed:true,mode:'factory',waiting:'FACTORY_AUTOSLEEP_LOCK_ACTIVE',waitingRemaining:300};
        return envelope('TOPFLOW_SWITCH=SUBMITTED');
      }
      assert(command.includes('TOPFLOW_SCREEN='));
      statusReads++;
      if(holdStatusReads.includes(statusReads)) {heldStatus=true;return pendingStatus.promise;}
      if(restored && ++restoredReads>1 && holdAfterConfirmedRestoration) return new Promise(()=>{});
      if(started && ++polls===holdPoll) {heldStatus=true;return pendingStatus.promise;}
      return envelope('TOPFLOW_SCREEN='+JSON.stringify(state));
    }};
  root.TopFlowManagerConfirm={create(context){return {ask:async message=>context.confirm(message),dispose(){}};}};
  vm.createContext(root);vm.runInContext('let KANO_baseURL="/api";const common_headers={"x-existing-auth":"panel-session"};',root);vm.runInContext(source,root);
  async function settle(){for(let i=0;i<5;i++)await flush();}
  async function spinUntil(predicate, {runTimers=false}={}) {
    for(let i=0;i<60;i++) {
      await settle();if(predicate())return;
      if(runTimers) {
        // Trigger ordinary 1s/5s polling, not network deadline timers.
        const next=[...timers].filter(([,timer])=>timer.ms<=5000).sort((a,b)=>a[1].at-b[1].at)[0];
        if(next){timers.delete(next[0]);now=Math.max(now,next[1].at);next[1].fn();}
      }
    }
    assert.fail('Deferred production manager condition did not settle');
  }
  return {root,elements,writes,requests,pendingStatus,restore,uninstall,settle,spinUntil,timers,
    get heldStatus(){return heldStatus;},
    fireStatusDeadline(){const entry=[...timers].find(([,timer])=>timer.ms===15000);assert(entry,'A pending status must have a bounded local deadline');timers.delete(entry[0]);now=Math.max(now,entry[1].at);entry[1].fn();},
    async open(){root.__topflow_screen_plugin.open();await settle();return panel;},
    async beginHeldStatus(){await this.open();const operation=observe(elements.toggle.onclick());await spinUntil(()=>heldStatus,{runTimers:true});assert.equal(elements.cancel.hidden,false);return operation;},
    lateCustom(){pendingStatus.resolve(envelope('TOPFLOW_SCREEN='+JSON.stringify({installed:true,mode:'custom',pid:1234,ready:true,supervised:true,heartbeatAge:1})));}
  };
}

test('status rejection during cancellation keeps all control blocked until restore really finishes',async()=>{
  const h=harness(), operation=await h.beginHeldStatus();
  const cancel=observe(h.elements.cancel.onclick());await h.spinUntil(()=>h.writes.includes('restore'));
  h.pendingStatus.reject(Error('status connection dropped'));await h.settle();
  assert.equal(operation.done,false,'a rejected status must not clear busy while recovery is pending');
  assert.equal(h.elements.toggle.disabled,true);assert.equal(h.elements.uninstall.disabled,true);
  await h.elements.toggle.onclick();await h.elements.uninstall.onclick();assert.deepEqual(h.writes,['start','restore']);
  h.restore.resolve(true);await h.spinUntil(()=>operation.done&&cancel.done);
  assert.equal(operation.error,null);assert.equal(cancel.error,null);assert.equal(h.elements.toggle.disabled,false);
  assert.match(h.elements.message.textContent,/取消/);assert.doesNotMatch(h.elements.message.textContent,/插件屏幕进程.*已连续三次/);
});

test('a never-returning status is cancellable and a later custom response cannot overwrite confirmed cancellation',async()=>{
  const h=harness(), operation=await h.beginHeldStatus();
  const cancel=observe(h.elements.cancel.onclick());await h.spinUntil(()=>h.writes.includes('restore'));
  h.restore.resolve(true);await h.spinUntil(()=>operation.done&&cancel.done);
  assert.equal(h.elements.toggle.disabled,false);assert.match(h.elements.message.textContent,/取消/);
  const message=h.elements.message.textContent, label=h.elements.toggle.textContent, requestCount=h.requests.length;
  h.lateCustom();await h.settle();
  assert.equal(h.elements.message.textContent,message);assert.equal(h.elements.toggle.textContent,label);
  assert.equal(h.requests.length,requestCount,'late status must not restart polling');assert.deepEqual(h.writes,['start','restore']);
});

test('failed restoration cannot be reported as successfully cancelled even when factory PID is visible',async()=>{
  const h=harness(), operation=await h.beginHeldStatus();
  const cancel=observe(h.elements.cancel.onclick());await h.spinUntil(()=>h.writes.includes('restore'));
  h.restore.resolve(false);await h.spinUntil(()=>operation.done&&cancel.done);
  assert.doesNotMatch(h.elements.message.textContent,/已取消等待.*(?:回读确认|原厂屏幕运行中)/);
  assert.match(h.elements.message.textContent,/未确认|失败/);assert.deepEqual(h.writes,['start','restore']);
  h.lateCustom();await h.settle();assert.doesNotMatch(h.elements.message.textContent,/已连续三次/);
});

test('confirmed cancellation finishes without a redundant read trapping the manager in busy state',async()=>{
  const h=harness({holdAfterConfirmedRestoration:true}), operation=await h.beginHeldStatus();
  const cancel=observe(h.elements.cancel.onclick());await h.spinUntil(()=>h.writes.includes('restore'));
  h.restore.resolve(true);await h.spinUntil(()=>operation.done&&cancel.done);
  assert.equal(h.elements.toggle.disabled,false);assert.match(h.elements.message.textContent,/取消/);
  assert.deepEqual(h.writes,['start','restore']);
});

test('uninstalling a waiting installation disables cancellation and the handler cannot send a parallel restore',async()=>{
  const h=harness({alreadyWaiting:true});await h.open();
  const removal=observe(h.elements.uninstall.onclick());await h.spinUntil(()=>h.writes.includes('uninstall'));
  assert.equal(h.elements.cancel.disabled,true,'cancel must be disabled during a different destructive lifecycle action');
  await h.elements.cancel.onclick();assert.deepEqual(h.writes,['uninstall']);
  h.uninstall.resolve();await h.spinUntil(()=>removal.done);
  assert.deepEqual(h.writes,['uninstall','record']);assert.match(h.elements.message.textContent,/卸载已回读确认/);
});

test('an initial status that never returns times out locally and its late response cannot change the panel',async()=>{
  const h=harness({holdStatusReads:[1],holdPoll:0});assert.equal(h.requests.length,1);const panel=await h.open();
  assert.equal(await h.open(),panel);assert.equal(h.requests.length,1,'repeated open must not duplicate an in-flight initial read');
  assert.equal(h.heldStatus,true);assert.deepEqual(h.writes,[]);
  h.root.__topflow_screen_plugin.close();assert.equal(panel.attributes['data-collapsed'],'false','pending read keeps the operation visible');
  h.fireStatusDeadline();await h.spinUntil(()=>/读取超时/.test(h.elements.message.textContent));
  const message=h.elements.message.textContent,label=h.elements.toggle.textContent,requestCount=h.requests.length;
  assert.equal(h.elements.status.disabled,false);assert.equal(h.elements.close.disabled,false);assert.equal(h.timers.size,0);
  h.root.__topflow_screen_plugin.close();assert.equal(panel.isConnected,true);assert.equal(panel.attributes['data-collapsed'],'true');
  await h.open();assert.equal(panel.attributes['data-collapsed'],'false');assert.equal(h.requests.length,requestCount,'expanding does not silently retry timed-out reads');
  h.lateCustom();await h.settle();
  assert.equal(h.elements.message.textContent,message);assert.equal(h.elements.toggle.textContent,label);
  assert.equal(h.requests.length,requestCount);assert.deepEqual(h.writes,[]);
});

test('a timed-out pre-switch status releases busy without submitting an action or retaining its deadline',async()=>{
  const h=harness({holdStatusReads:[2],holdPoll:0});await h.open();
  assert.equal(h.timers.size,0,'completed initial status must clear its deadline');
  const operation=observe(h.elements.toggle.onclick());await h.spinUntil(()=>h.heldStatus);
  assert.equal(h.elements.toggle.disabled,true);h.fireStatusDeadline();await h.spinUntil(()=>operation.done);
  assert.deepEqual(h.writes,[]);assert.equal(h.elements.toggle.disabled,false);assert.match(h.elements.message.textContent,/读取超时/);assert.equal(h.timers.size,0);
  const message=h.elements.message.textContent,label=h.elements.toggle.textContent;
  h.lateCustom();await h.settle();assert.equal(h.elements.message.textContent,message);assert.equal(h.elements.toggle.textContent,label);
});

test('the first post-start status is bounded before waiting UI is known and late custom state cannot report success',async()=>{
  const h=harness({holdStatusReads:[3],holdPoll:0});await h.open();
  const operation=observe(h.elements.toggle.onclick());await h.spinUntil(()=>h.heldStatus,{runTimers:true});
  assert.deepEqual(h.writes,['start']);assert.equal(h.elements.cancel.hidden,true);
  h.fireStatusDeadline();await h.spinUntil(()=>operation.done);
  assert.equal(h.elements.status.disabled,false);assert.equal(h.elements.close.disabled,false);assert.equal(h.timers.size,0);
  assert.match(h.elements.message.textContent,/读取超时/);assert.doesNotMatch(h.elements.message.textContent,/已连续三次/);
  const message=h.elements.message.textContent,label=h.elements.toggle.textContent,requestCount=h.requests.length;
  h.lateCustom();await h.settle();
  assert.equal(h.elements.message.textContent,message);assert.equal(h.elements.toggle.textContent,label);assert.equal(h.requests.length,requestCount);
  assert.deepEqual(h.writes,['start']);
});
