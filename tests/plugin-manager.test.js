'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const plugin=require('../src/ufi-plugin.js');
const source=fs.readFileSync(path.join(__dirname,'../src/ufi-plugin.js'),'utf8');
const payload={archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\nprintf \'{"mode":"factory"}\\n\'\n',hardwareTested:false,members:['./','./topflow-screen','./screenctl.sh','./supervisor.sh','./ui/','./ui/index.html','./topflow-screen.sha256']};
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('documented UFI failed-shell envelopes preserve bounded protection codes and HTTP diagnostics without echoing credentials',()=>{
  assert.equal(plugin.shellFailure({ok:true,status:200},{success:false,content:'TOPFLOW_ERROR=UNSAFE_PARENT\n'}).code,'UNSAFE_PARENT');
  assert.match(plugin.shellFailure({ok:false,status:403},{success:false,error:'blocked'}).message,/HTTP 403/);
  assert.match(plugin.shellFailure({ok:true,status:200},{success:false,content:'sh: command not found\n'}).message,/命令或文件不存在/);
  assert.doesNotMatch(plugin.shellFailure({ok:true,status:200},{success:false,content:'secret-fixture-token https://private.invalid/subscription'}).message,/secret-fixture|private\.invalid/);
});

function harness(options={}) {
  const requests=[],writes=[],confirmations=[],mounts=[];
  let state={installed:options.installed===true,mode:options.mode||'factory',versionMismatch:!!options.versionMismatch,...options.initialState}, panel, entry, denied=options.deny===true, destroyed=0, recordRemoved=false;
  const elements={};
  for(const name of ['close','cancel','toggle','status','uninstall','controls','advanced','screen','message','version','update','state-card','mode','state-label','state-hint','autostart','autostart-state','wallpaper'])elements['[data-tf-'+name+']']={disabled:false,checked:false,open:false,textContent:'',replaceChildren(){},attributes:{},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];}};
  const doc={currentScript:{textContent:source},body:{append(node){node.parentNode=this;if(node.className==='tf-package-entry')entry=node;else panel=node;}},querySelector:()=>null,
    createElement(tag){return {tag,className:'',innerHTML:'',isConnected:true,attributes:{},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];},querySelector(selector){return elements[selector];},remove(){this.isConnected=false;}};}};
  const root={document:doc,TopFlowPackagePayload:{...payload,reviewOnly:options.reviewOnly===true,version:options.version,directSwitch:options.directSwitch===true},URL,Uint8Array,Blob,FormData,atob,
    location:{href:'http://localhost/host',origin:'http://localhost'},crypto:{getRandomValues(bytes){bytes.fill(17);}},setTimeout(resolve,ms){if(ms<15000)resolve();},clearTimeout(){},
    confirm(message){confirmations.push(message);return !denied;},
    TopflowDeviceAPI:{createUfiTransport:(bridge,options)=>({bridge,allowWrites:options.allowWrites}),create:x=>x,normalize:x=>x},
    TopFlowAoyouUfiTransport:{createTransport:()=>()=>{}},TopFlowAoyou:{createAdapter:x=>x},
    TopFlowUI:{mount(screen,opts){mounts.push(opts);return {destroy(){destroyed++;}};}},
    fetch:async(url,config)=>{
      const route=new URL(url).pathname;requests.push({route,config});
      if(route==='/api/get_custom_head')return {ok:true,json:async()=>({text:recordRemoved?'':'<!-- [KANO_PLUGIN_START] Renamed TopFlow.txt -->\n<script>'+source+'</script>\n<!-- [KANO_PLUGIN_END] Renamed TopFlow.txt -->'})};
      if(route==='/api/plugin/uninstall'){assert.deepEqual(JSON.parse(config.body),{name:'Renamed TopFlow.txt'});writes.push('record-uninstall');recordRemoved=!options.recordFails;return {ok:!options.recordFails,json:async()=>options.recordFails?{}:{success:true}};}
      if(route==='/api/upload_file'){
        writes.push('upload');if(options.uploadThrows)throw Error('connection lost');if(options.uploadFails)return {ok:false,json:async()=>({})};
        return {ok:true,json:async()=>({result:'success',path:'/data/plugins/topflow-screen/.payload.tar.gz',name:'.payload.tar.gz',size:1})};
      }
      assert.equal(route,'/api/run_shell');const command=JSON.parse(config.body).cmd;
      let content;
      if(command.includes('set -- uninstall --confirmed')){writes.push('uninstall');if(options.cleanupFails)content='cleanup rejected';else {state={installed:false,mode:'factory'};content='TOPFLOW_UNINSTALL=COMPONENTS_REMOVED';}}
      else if(command.includes('screenctl.sh" start --confirmed')){writes.push('start');state=options.startFailure?{installed:true,mode:'factory',failure:options.startFailure,...options.startDetails}:{installed:true,mode:'custom',pid:234,ready:true,supervised:true,heartbeatAge:1};content='TOPFLOW_SWITCH=SUBMITTED';}
      else if(command.includes('set -- restore --confirmed')){writes.push('restore');state={installed:true,mode:'factory'};content=options.restoreFails?'Factory PID and service methods not stable':'TOPFLOW_SWITCH=SUBMITTED';}
      else if(command.includes('TOPFLOW_INSTALL=UPLOAD_FINISHED')){writes.push('upload-finished');state.uploadActive=false;content='TOPFLOW_INSTALL=UPLOAD_FINISHED';}
      else if(command.includes('tar -xzf')){writes.push('finish');state.installed=true;state.partial=false;content='TOPFLOW_INSTALL=INSTALLED_NOT_STARTED';}
      else if(command.includes('mkdir "$TF_ROOT"')){writes.push('install');state={installed:true,partial:true,uploadActive:true,mode:'factory'};content='TOPFLOW_INSTALL=READY';}
      else {assert(command.includes('TOPFLOW_SCREEN='));content='TOPFLOW_SCREEN='+JSON.stringify(state);}
      return {ok:true,json:async()=>({success:true,content})};
    }
  };
  if(!options.noConfirm)root.TopFlowManagerConfirm={create(context){return {ask:async message=>context.confirm(message),dispose(){}};}};
  if(options.MutationObserver)root.MutationObserver=options.MutationObserver;
  if(options.theme)root.TopFlowManagerTheme=options.theme;
  if(options.wallpaper){root.TopFlowManagerWallpaper={};root.TopFlowWallpaperPanel=options.wallpaper;}
  vm.createContext(root);vm.runInContext(source,root);
  return {root,elements,requests,writes,confirmations,mounts,get destroyed(){return destroyed;},setDenied(value){denied=value;},
    async open(){root.__topflow_screen_plugin.open();await flush();return panel;},entry:()=>entry};
}

test('homepage manager performs one initial read; repeated open keeps advanced polling unmounted',async()=>{
  const h=harness();assert.equal(h.requests.length,1);assert.equal(h.entry(),undefined);
  const panel=await h.open();assert.equal(await h.open(),panel);assert.equal(h.requests.length,1);assert.equal(h.mounts.length,0);assert.deepEqual(h.writes,[]);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'安装并切换到插件屏幕');
});

test('missing custom confirmation UI never falls back to a browser dialog or submits a write',async()=>{
  const h=harness({noConfirm:true});await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(h.confirmations,[]);assert.deepEqual(h.writes,[]);
  assert.match(h.elements['[data-tf-message]'].textContent,/确认界面未加载/);
});

test('review manager blocks installation and activation while preserving explicit recovery and cleanup',async()=>{
  for(const installed of [false,true]) {
    const h=harness({reviewOnly:true,installed});await h.open();
    assert.equal(h.elements['[data-tf-toggle]'].disabled,true);
    assert.match(h.elements['[data-tf-toggle]'].textContent,/发布已阻止/);
    assert.match(h.elements['[data-tf-message]'].textContent,/安装与启用已阻止/);
    await h.elements['[data-tf-toggle]'].onclick();
    assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
  }
  const restoring=harness({reviewOnly:true,installed:true,mode:'custom'});await restoring.open();
  assert.equal(restoring.elements['[data-tf-toggle]'].disabled,false);
  await restoring.elements['[data-tf-toggle]'].onclick();assert.deepEqual(restoring.writes,['restore']);
  const uninstalling=harness({reviewOnly:true,installed:true});await uninstalling.open();
  assert.equal(uninstalling.elements['[data-tf-uninstall]'].disabled,false);
  await uninstalling.elements['[data-tf-uninstall]'].onclick();assert.deepEqual(uninstalling.writes,['uninstall','record-uninstall']);
});

test('factory PID after a failed restore cannot masquerade as a successful service recovery',async()=>{
  const h=harness({installed:true,mode:'custom',restoreFails:true});await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(h.writes,['restore']);assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/已连续三次/);
  assert.match(h.elements['[data-tf-message]'].textContent,/未确认/);
});

test('first switch requires one confirmation then installs, uploads, verifies and starts',async()=>{
  const h=harness();await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(h.confirmations.length,1);assert.deepEqual(h.writes,['install','upload','upload-finished','finish','start']);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换回原厂屏幕');
  assert.match(h.elements['[data-tf-message]'].textContent,/连续三次/);
  await h.elements['[data-tf-toggle]'].onclick();assert.equal(h.confirmations.length,2);assert.equal(h.writes.at(-1),'restore');
});

test('cancelled switch and failed upload never start the screen',async()=>{
  const cancelled=harness({deny:true});await cancelled.open();await cancelled.elements['[data-tf-toggle]'].onclick();assert.deepEqual(cancelled.writes,[]);
  const failed=harness({uploadFails:true});await failed.open();await failed.elements['[data-tf-toggle]'].onclick();assert.deepEqual(failed.writes,['install','upload','upload-finished']);
  assert.doesNotMatch(failed.elements['[data-tf-message]'].textContent,/已连续三次/);
  assert.equal(failed.elements['[data-tf-toggle]'].textContent,'清理未完成安装');
  await failed.elements['[data-tf-toggle]'].onclick();
  assert.equal(failed.confirmations.length,2);assert.deepEqual(failed.writes,['install','upload','upload-finished','uninstall','record-uninstall']);
});

test('explicit UFI control entry is editable by default without an extra gate, and folding revokes old bridge authority',async()=>{
  const h=harness();const panel=await h.open(), advanced=h.elements['[data-tf-advanced]'];
  assert.equal(h.mounts.length,0);assert.doesNotMatch(panel.innerHTML,/data-tf-controls|默认只读/);
  advanced.open=true;advanced.ontoggle({target:advanced});const first=h.mounts.at(-1);
  assert.equal(first.control,true);assert.equal(first.api.mode,'live');assert.equal(first.api.transport.allowWrites,true);
  assert.equal(h.confirmations.length,0);assert.deepEqual(h.writes,[]);
  advanced.open=false;advanced.ontoggle({target:advanced});assert.equal(h.destroyed,1);
  assert.throws(()=>first.api.transport.bridge.postData({},{}),/READ_ONLY|只读|控制/);
  advanced.open=true;advanced.ontoggle({target:advanced});assert.equal(h.mounts.at(-1).control,true);
  h.root.__topflow_screen_plugin.close();assert.equal(h.destroyed,2);assert.deepEqual(h.writes,[]);
});

test('uninstall clears native components and the double-read unique record via documented single-record API',async()=>{
  const h=harness({installed:true});await h.open();await h.elements['[data-tf-uninstall]'].onclick();
  assert.equal(h.confirmations.length,1);assert.deepEqual(h.writes,['uninstall','record-uninstall']);
  assert(h.requests.some(r=>r.route==='/api/get_custom_head'&&r.config.method==='GET'));
  assert(!h.requests.some(r=>r.route==='/api/set_custom_head'));
  assert.match(h.elements['[data-tf-message]'].textContent,/卸载已回读确认/);
});

test('unknown upload outcome keeps cleanup disabled and never signals a record or component deletion',async()=>{
  const h=harness({uploadThrows:true});await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(h.writes,['install','upload']);
  assert.equal(h.elements['[data-tf-uninstall]'].disabled,true);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'等待上传结束确认');
  await h.elements['[data-tf-uninstall]'].onclick();assert.deepEqual(h.writes,['install','upload']);
});

test('unknown single-record response falls back explicitly without whole-table writes or false success',async()=>{
  const h=harness({installed:true,recordFails:true});await h.open();await h.elements['[data-tf-uninstall]'].onclick();
  assert.match(h.elements['[data-tf-message]'].textContent,/记录清理尚未确认/);
  assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/卸载已回读确认/);
  assert(!h.requests.some(r=>r.route==='/api/set_custom_head'));
});

test('record identification rejects ambiguous or combined plugin blocks without executing source',()=>{
  const script='window.TopFlowPackagePayload='+JSON.stringify(payload)+';';
  const block=name=>'<!-- [KANO_PLUGIN_START] '+name+' --><script>'+script+'</script><!-- [KANO_PLUGIN_END] '+name+' -->';
  assert.equal(plugin.findInstalledBlockName(block('mine.txt'),script),'mine.txt');
  assert.equal(plugin.findInstalledBlockName(block('mine.txt')+block('another.txt'),script),null);
  assert.equal(plugin.findInstalledBlockName(block('mine.txt')+block('mine.txt').replace(script,'otherPlugin()'),script),null);
  assert.equal(plugin.findInstalledBlockName(block('mine.txt').replace('</script>','</script><script>unrelated()</script>'),script),null);
});

test('record deletion refuses list changes and verifies other records are preserved',async()=>{
  const script='window.TopFlowPackagePayload='+JSON.stringify(payload)+';', own='<!-- [KANO_PLUGIN_START] mine.txt --><script>'+script+'</script><!-- [KANO_PLUGIN_END] mine.txt -->';
  const other='<!-- [KANO_PLUGIN_START] other.txt --><script>otherPlugin()</script><!-- [KANO_PLUGIN_END] other.txt -->';
  for(const scenario of ['changed-before','changed-after','unsupported']) {
    let gets=0;const routes=[];
    const root={location:{href:'http://localhost/host',origin:'http://localhost'},fetch:async(url,config)=>{
      const route=new URL(url).pathname;routes.push(route);
      if(route==='/api/plugin/uninstall')return {ok:scenario!=='unsupported',json:async()=>scenario==='unsupported'?null:{success:true}};
      gets++;return {ok:true,json:async()=>({text:gets===1?own+other:gets===2?(scenario==='changed-before'?own+other+'changed':own+other):''})};
    }};
    await assert.rejects(plugin.removeInstalledRecord(root,script),{code:scenario==='changed-before'?'RECORD_CHANGED':scenario==='changed-after'?'RECORD_REMOVE_UNCONFIRMED':'RECORD_API_UNCONFIRMED'});
    assert(!routes.includes('/api/set_custom_head'));
    if(scenario==='changed-before')assert(!routes.includes('/api/plugin/uninstall'));
  }
});


test('an exact supported old install updates under one confirmation without deleting the current UFI record',async()=>{
  const h=harness({installed:true,versionMismatch:true});await h.open();
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'更新并切换到插件屏幕');
  await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(h.confirmations.length,1);assert.deepEqual(h.writes,['uninstall','install','upload','upload-finished','finish','start']);
  assert(!h.requests.some(request=>request.route==='/api/plugin/uninstall'));
  const rejected=harness({installed:true,versionMismatch:true,cleanupFails:true});await rejected.open();await rejected.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(rejected.writes,['uninstall']);assert.doesNotMatch(rejected.elements['[data-tf-message]'].textContent,/已连续三次/);
});

test('specific preflight failure returns immediately without generic polling or falsely calling a complete install partial',async()=>{
  const h=harness({installed:true,startFailure:'SLEEP_PROVIDER_UNAVAILABLE'});await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(h.writes,['start']);assert(h.requests.length<=5,'failure should not poll ten times');
  assert.match(h.elements['[data-tf-message]'].textContent,/休眠服务不可读.*SLEEP_PROVIDER_UNAVAILABLE/);
  assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/清理未完成安装|未观察到目标/);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换到插件屏幕');
});

test('manager exposes only whitelisted native phases and bounded numerical exit status',async()=>{
  const h=harness({installed:true,startFailure:'RENDERER_EXITED',startDetails:{rendererFailure:'DRM_INIT',rendererExitStatus:139}});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.match(message,/显示设备初始化（DRM_INIT）/);assert.match(message,/退出状态：139/);
  assert.match(message,/不能确定原因/);assert.match(message,/原厂屏幕进程已回读确认/);
  assert.doesNotMatch(message,/正在恢复原厂|未观察到目标/);
  const parse=state=>plugin.parseScreenStatus('TOPFLOW_SCREEN='+JSON.stringify({mode:'factory',failure:'RENDERER_EXITED',...state}));
  for(const rendererFailure of ['SECRET_TOKEN','__proto__','constructor','DRM_INIT\nPRIVATE'])assert.equal(parse({rendererFailure}).rendererFailure,undefined);
  for(const rendererExitStatus of [-1,256,7.5,'7'])assert.equal(parse({rendererExitStatus}).rendererExitStatus,undefined);
  assert.equal(parse({rendererExitStatus:0}).rendererExitStatus,0);
  assert.equal(plugin.parseScreenStatus('TOPFLOW_SCREEN='+JSON.stringify({mode:'factory',rendererFailure:'DRM_INIT',rendererExitStatus:7})).rendererFailure,undefined);
});

test('wait countdown explicitly describes the maximum budget rather than a completion estimate',async()=>{
  const h=harness({installed:true,initialState:{waiting:'FACTORY_AUTOSLEEP_LOCK_ACTIVE',waitingRemaining:123}});
  await h.open();assert.match(h.elements['[data-tf-message]'].textContent,/最多还等待 123 秒/);
  assert.match(h.elements['[data-tf-message]'].textContent,/不是预计完成时间/);
  assert.deepEqual(h.writes,[]);
});

test('direct-switch management uses the payload version and explains immediate lighting with the original PIN policy',async()=>{
  const h=harness({installed:true,version:'0.1.3',directSwitch:true});const panel=await h.open();
  assert.match(panel.innerHTML,/本 TXT · v0\.1\.3/);
  assert.match(h.elements['[data-tf-message]'].textContent,/直接点亮插件屏幕.*PIN.*无需等待自然熄屏/);
  assert.match(h.elements['[data-tf-message]'].textContent,/尚未实机验证/);assert.deepEqual(h.writes,[]);
  await h.elements['[data-tf-toggle]'].onclick();assert.deepEqual(h.writes,['start']);assert.equal(h.confirmations.length,1);
  assert.match(h.confirmations[0],/直接点亮.*PIN.*无需等待自然熄屏/);assert.doesNotMatch(h.confirmations[0],/3分钟|6分钟|诊断自测版/);
});

test('version display cannot inject HTML and a legacy waiting state remains cancellable in a direct-switch manager',async()=>{
  const h=harness({installed:true,version:'<img src=x onerror=evil()>',directSwitch:true,initialState:{waiting:'FACTORY_AUTOSLEEP_LOCK_ACTIVE',waitingRemaining:123}});
  const panel=await h.open();assert.doesNotMatch(panel.innerHTML,/<img|onerror|evil/);assert.match(panel.innerHTML,/本 TXT · 开发版/);
  assert.match(h.elements['[data-tf-message]'].textContent,/最多还等待 123 秒/);assert.equal(h.elements['[data-tf-cancel]'].hidden,false);
  await h.elements['[data-tf-cancel]'].onclick();assert.deepEqual(h.writes,['restore']);assert.match(h.elements['[data-tf-message]'].textContent,/已取消等待/);
});

test('homepage collapse retains its DOM and theme/wallpaper resources; actual removal disposes all subscriptions',async()=>{
  const observations=[],instances=[];let disconnected=0,themeDisposed=0,wallpaperDisposed=0,wallpaperMounted=0,wallpaperRefreshed=0;
  class Observer {constructor(callback){this.callback=callback;instances.push(this);}observe(target,options){observations.push(options);}disconnect(){disconnected++;}}
  const h=harness({MutationObserver:Observer,theme:{watch(root,doc,callback){callback('dark');return()=>themeDisposed++;}},
    wallpaper:{mount(){wallpaperMounted++;return{update(){},async refresh(){wallpaperRefreshed++;},dispose(){wallpaperDisposed++;}};}}});
  const panel=await h.open();
  assert.equal(observations.length,1);assert.equal(observations[0].childList,true);assert.equal(observations[0].subtree,undefined);
  assert.equal(panel.attributes['data-tf-theme'],'dark');assert.equal(wallpaperMounted,1);assert.equal(wallpaperRefreshed,1);
  await h.elements['[data-tf-close]'].onclick();
  assert.equal(panel.isConnected,true);assert.equal(panel.attributes['data-collapsed'],'true');assert.equal(disconnected,0);assert.equal(themeDisposed,0);assert.equal(wallpaperDisposed,0);
  await h.open();assert.equal(panel.attributes['data-collapsed'],'false');assert.equal(h.requests.length,1);
  assert.equal(wallpaperMounted,1);assert.equal(wallpaperRefreshed,1);
  panel.remove();instances[0].callback();instances[0].callback();
  assert.equal(disconnected,1);assert.equal(themeDisposed,1);assert.equal(wallpaperDisposed,1);assert.deepEqual(h.writes,[]);
});

test('wallpaper selection resets only after native uninstall is confirmed, while the embedded UI remains usable',async()=>{
  for(const cleanupFails of [false,true]){
    let resets=0,disposals=0;
    const h=harness({installed:true,cleanupFails,wallpaper:{mount(){return{update(){},async refresh(){},reset(){resets++;},dispose(){disposals++;}};}}});
    const panel=await h.open();await h.elements['[data-tf-uninstall]'].onclick();
    assert.equal(resets,cleanupFails?0:1);assert.equal(disposals,0);assert.equal(panel.isConnected,true);
    assert.deepEqual(h.writes,cleanupFails?['uninstall']:['uninstall','record-uninstall']);
    if(cleanupFails)assert.match(h.elements['[data-tf-message]'].textContent,/未完全确认/);
  }
});

test('successful first install or old-version update refreshes wallpaper availability after switching; failed starts do not',async()=>{
  for(const options of [{},{installed:true,versionMismatch:true}]){
    const snapshots=[];
    const h=harness({...options,wallpaper:{mount(root,host,context){return{update(){},async refresh(){snapshots.push({...context.state()});},reset(){},dispose(){}};}}});
    await h.open();assert.equal(snapshots.length,1);assert(snapshots[0].installed===false||snapshots[0].versionMismatch===true);
    await h.elements['[data-tf-toggle]'].onclick();assert.equal(snapshots.length,2,'successful switch must re-read wallpaper availability without manual refresh');
    assert.equal(snapshots[1].installed,true);assert.equal(snapshots[1].mode,'custom');assert.notEqual(snapshots[1].versionMismatch,true);
    assert.match(h.elements['[data-tf-message]'].textContent,/连续三次/);
  }
  let refreshed=0;
  const failed=harness({installed:true,startFailure:'RENDERER_EXITED',wallpaper:{mount(){return{update(){},async refresh(){refreshed++;},reset(){},dispose(){}};}}});
  await failed.open();await failed.elements['[data-tf-toggle]'].onclick();
  assert.equal(refreshed,1);assert.deepEqual(failed.writes,['start']);assert.doesNotMatch(failed.elements['[data-tf-message]'].textContent,/已连续三次/);
});

test('direct-switch fixed failure codes stay bounded and expose the policy, sensor or ownership check that failed',async()=>{
  const details=['ADOPT_POLICY_READ','ADOPT_POLICY_INVALID','ADOPT_POLICY_CHANGED','ADOPT_BRIGHTNESS','ADOPT_SENSOR_ID','ADOPT_SENSOR_READ','ADOPT_SENSOR_STATE','ADOPT_SENSOR_INIT','ADOPT_SENSOR_ENABLE','ADOPT_SENSOR_LUX','ADOPT_GUARD_ACTIVE'];
  for(const rendererFailure of details){
    const h=harness({installed:true,version:'0.1.3',directSwitch:true,startFailure:'RENDERER_EXITED',startDetails:{rendererFailure,rendererExitStatus:7}});
    await h.open();await h.elements['[data-tf-toggle]'].onclick();assert(h.elements['[data-tf-message]'].textContent.includes('（'+rendererFailure+'）'));assert.deepEqual(h.writes,['start']);
  }
  for(const failure of ['FACTORY_ENVIRONMENT_CONFLICT','FACTORY_IDENTITY_CHANGED','FACTORY_LOCK_OWNER_CONFLICT','FACTORY_LOCK_HANDOVER_FAILED']){
    const h=harness({installed:true,version:'0.1.3',directSwitch:true,startFailure:failure});await h.open();await h.elements['[data-tf-toggle]'].onclick();
    assert(h.elements['[data-tf-message]'].textContent.includes('（'+failure+'）'));assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/保护检查未通过|未观察到目标/);
  }
});
