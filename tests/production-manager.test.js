'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {managerOnly} = require('../tools/production-manager.cjs');
const original = fs.readFileSync(path.join(__dirname, '../src/ufi-plugin.js'), 'utf8');
const source = managerOnly(original);
const payload = {archiveBase64:'YQ==', archiveSha256:'a'.repeat(64), screenctlSha256:'b'.repeat(64), screenctlSource:'#!/bin/sh\nprintf \'{"mode":"factory"}\\n\'\n', hardwareTested:false, members:['./','./topflow-screen','./screenctl.sh','./supervisor.sh','./ui/','./ui/index.html','./topflow-screen.sha256']};
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(options = {}) {
  const requests = [], writes = [], confirmations = [], elements = {};
  let state = {installed:!!options.installed, mode:options.mode || 'factory', ...options.initialState}, entry, panel, removed = false, started = false, statusReads = 0;
  for (const name of ['close','cancel','toggle','status','uninstall','message','version','update','state-card','mode','state-label','state-hint','autostart','autostart-state']) elements['[data-tf-'+name+']'] = {disabled:false,textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name];}};
  const root = {URL, Uint8Array, Blob, FormData, atob,
    TopFlowPackagePayload:{...payload,version:'0.1.8',reviewOnly:!!options.reviewOnly,directSwitch:!!options.directSwitch},
    location:{href:'http://localhost/host',origin:'http://localhost'},
    crypto:{getRandomValues(bytes){bytes.fill(19);}}, setTimeout(resolve,ms){if(ms<15000)resolve();},clearTimeout(){},
    confirm(message){confirmations.push(message);return !options.deny;},
    document:{currentScript:{textContent:source},querySelector(){return null;},
      body:{append(node){if(node.className==='tf-package-entry')entry=node;else panel=node;}},
      createElement(){return {className:'',isConnected:true,innerHTML:'',querySelector(selector){assert(Object.hasOwn(elements,selector),'Unexpected browser business UI: '+selector);return elements[selector];},remove(){this.isConnected=false;}};}},
    fetch:async(url,config)=>{
      const route = new URL(url).pathname; requests.push({route,config});
      assert.equal(config.credentials,'same-origin');
      if (route==='/api/get_custom_head') return {ok:true,json:async()=>({text:removed?'':'<!-- [KANO_PLUGIN_START] own screen.txt --><script>'+source+'</script><!-- [KANO_PLUGIN_END] own screen.txt -->'})};
      if (route==='/api/plugin/uninstall') {assert.deepEqual(JSON.parse(config.body),{name:'own screen.txt'});writes.push('record');removed=true;return {ok:true,json:async()=>({success:true})};}
      if (route==='/api/upload_file') {writes.push('upload');if(options.uploadUnknown)throw Error('disconnected');return {ok:true,json:async()=>({result:'success',path:'/data/plugins/topflow-screen/.payload.tar.gz',name:'.payload.tar.gz',size:1})};}
      assert.equal(route,'/api/run_shell');
      const command = JSON.parse(config.body).cmd; let content;
      if (/screenctl\.sh" autostart-(enable|disable) --confirmed/.test(command)) {
        const enable=command.includes('autostart-enable --confirmed');writes.push(enable?'autostart-enable':'autostart-disable');
        if(options.beforeAutostart)await options.beforeAutostart();
        if(options.autostartThrows)throw Error('disconnected');
        state=options.autostartResultState || {...state,autostart:{enabled:enable,hook:enable?'present':'absent',state:enable?'enabled':'disabled',reason:'NONE'}};
        content=options.autostartContent === undefined ? 'TOPFLOW_AUTOSTART='+(enable?'ENABLED':'DISABLED') : options.autostartContent;
      }
      else if (command.includes('set -- uninstall --confirmed')) {writes.push('uninstall');if(options.beforeUninstall)await options.beforeUninstall();if(options.cleanupFails)content='TOPFLOW_ERROR=FACTORY_RESTORE_UNCONFIRMED';else {state=options.cleanupState || {installed:false,mode:'factory'};content='TOPFLOW_UNINSTALL=COMPONENTS_REMOVED';}}
      else if (command.includes('screenctl.sh" start --confirmed')) {writes.push('start');started=true;state=options.startState || {installed:true,mode:'custom',pid:234,ready:true,supervised:true,heartbeatAge:1};content=options.startContent || 'TOPFLOW_SWITCH=SUBMITTED';}
      else if (command.includes('set -- restore --confirmed')) {writes.push('restore');state={installed:true,mode:'factory'};content=options.restoreFails?'Factory stability not confirmed':'TOPFLOW_SWITCH=SUBMITTED';}
      else if (command.includes('TOPFLOW_INSTALL=UPLOAD_FINISHED')) {writes.push('upload-finished');state.uploadActive=false;content='TOPFLOW_INSTALL=UPLOAD_FINISHED';}
      else if (command.includes('tar -xzf')) {writes.push('finish');state.installed=true;state.partial=false;content='TOPFLOW_INSTALL=INSTALLED_NOT_STARTED';}
      else if (command.includes('mkdir "$TF_ROOT"')) {writes.push('install');state={installed:true,partial:true,uploadActive:true,mode:'factory'};content='TOPFLOW_INSTALL=READY';}
      else {assert(command.includes('TOPFLOW_SCREEN='));const result=options.readStatus && await options.readStatus({read:++statusReads,state,started});if(result instanceof Error)throw result;content=typeof result==='string'?result:'TOPFLOW_SCREEN='+JSON.stringify(result || state);}
      return {ok:true,json:async()=>({success:true,content})};
    }};
  if (options.center) { root.TopFlowPluginCenter = options.center; root.TopFlowScreenTelemetrySDK = { marker: 'private-sdk' }; }
  vm.createContext(root);
  // Production runs within the same lexical UFI authentication environment.
  vm.runInContext('let KANO_baseURL="/api";const common_headers={"x-test-auth":"existing-session"};',root);
  vm.runInContext(source,root);
  return {root,requests,writes,confirmations,elements,entry:()=>entry,async open(){root.__topflow_screen_plugin.open();await flush();return panel;}};
}

test('production manager retains lifecycle/auth helpers verbatim and contains no preview adapters or simulation API',()=>{
  assert.equal(source.slice(0,source.indexOf('  function readBridges(root)')),original.slice(0,original.indexOf('  function readBridges(root, control)')));
  for (const signature of ['    async function shell(', '    async function screenStatus()', '    async function installNative()', '    async function switchScreen(']) {
    const begin = original.indexOf(signature), end = original.indexOf('\n    async function ',begin+signature.length);
    assert(begin>0&&end>begin);assert(source.includes(original.slice(begin,end)),signature+' must remain exact');
  }
  assert.doesNotMatch(source,/TopflowDeviceAPI|TopFlowAoyou|TopFlowUI|demoSnapshot|setSnapshot|TF_FIXTURES|data-tf-(advanced|controls|screen)|TOPFLOW-2\.4G|演示节点/);
  assert.match(original,/TopFlowUI\.mount/,'PC preview source stays available');
  assert.throws(()=>managerOnly(original.replace('function stopWebScreen()','function changedPreview()')),/anchor changed/);
  assert.throws(()=>managerOnly(original+'\nTopFlowUI.mount(fake);'),/simulation dependency/);
});

test('production TXT manager needs no browser API modules, loads with zero calls and opens with exactly one read',async()=>{
  const h=harness();assert.equal(h.requests.length,0);assert.equal(h.entry().textContent,'TopFlow 屏幕 · 管理');
  const panel=await h.open();assert.equal(h.requests.length,1);assert.deepEqual(h.writes,[]);assert.doesNotMatch(panel.innerHTML,/预览|data-tf-advanced|data-tf-controls/);
  assert.equal(h.requests[0].config.headers['x-test-auth'],'existing-session');
  h.root.__topflow_screen_plugin.close();assert.equal(panel.isConnected,false);
});

test('manager ignores legacy store globals and performs no remote startup or telemetry work',async()=>{
  const calls=[];
  const center={create(){calls.push('create');throw Error('Legacy store must never initialize');}};
  const h=harness({center,installed:true});await flush();const panel=await h.open();
  assert.deepEqual(calls,[]);
  assert.doesNotMatch(source,/TopFlowPluginCenter|TopFlowScreenTelemetrySDK|plugin\.shaneyun\.com|data-tf-center|checkCenter|updateCenter/);
  assert.doesNotMatch(panel.innerHTML,/检查在线版本|插件中心连接|匿名 UUID|每 60 秒/);
  assert.match(panel.innerHTML,/https:\/\/tapan\.top\/UFITOOLS-U60Pro\//);
  assert.match(panel.innerHTML,/UFI 官方文档/);
  assert.deepEqual(h.requests.map(x=>x.route),['/api/run_shell']);
  await h.elements['[data-tf-uninstall]'].onclick();
  assert.deepEqual(calls,[]);assert.deepEqual(h.writes,['uninstall','record']);
});

test('state card reports observed screen state and does not present stale failures as success',async()=>{
  for(const [state,label,tone,hint] of [
    [{installed:false,mode:'factory'},'原厂屏幕','ready',/原厂屏幕正在运行/],
    [{installed:true,mode:'custom'},'插件屏幕','ready',/画面与触摸请在设备上确认/],
    [{installed:true,mode:'unknown'},'屏幕状态未确认','pending',/请刷新状态/],
    [{installed:true,mode:'factory',failure:'RENDERER_EXITED'},'原厂屏幕','pending',/需要检查/],
    [{installed:true,mode:'factory',partial:true},'原厂屏幕','pending',/未完成安装/]
  ]){
    const h=harness({initialState:state});await h.open();
    assert.equal(h.elements['[data-tf-mode]'].textContent,label);
    assert.equal(h.elements['[data-tf-state-card]'].attributes['data-tone'],tone);
    assert.equal(h.elements['[data-tf-state-card]'].attributes['aria-busy'],'false');
    assert.match(h.elements['[data-tf-state-hint]'].textContent,hint);
  }
});

test('manager Escape closes the modal only when there is no active operation',async()=>{
  const h=harness();const panel=await h.open();let prevented=0;
  panel.onkeydown({key:'Escape',preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.equal(panel.isConnected,false);assert.deepEqual(h.writes,[]);
  let release;const held=new Promise(resolve=>{release=resolve;});
  const active=harness({initialState:{installed:true,mode:'custom',versionMismatch:true},beforeUninstall:()=>held});
  const livePanel=await active.open(),work=active.elements['[data-tf-update]'].onclick();await flush();
  assert.equal(active.elements['[data-tf-state-card]'].attributes['aria-busy'],'true');
  livePanel.onkeydown({key:'Escape',preventDefault(){}});assert.equal(livePanel.isConnected,true);
  release();await work;assert.equal(active.elements['[data-tf-state-card]'].attributes['aria-busy'],'false');
});

test('manager has locally styled accessible controls and fixed actions around its scrollable content',async()=>{
  const css=fs.readFileSync(path.join(__dirname,'../src/manager.css'),'utf8');
  assert.doesNotMatch(css,/@import|url\(|@font-face/);
  assert.match(css,/prefers-reduced-motion/);assert.match(css,/focus-visible/);
  for(const size of css.matchAll(/font-size:\s*(\d+)px/g))assert(Number(size[1])>=12,'manager text must be at least 12px');
  const h=harness();const panel=await h.open();
  assert.match(panel.innerHTML,/class="tf-package-scroll" role="region" aria-label="屏幕与组件管理" tabindex="0"/);
  assert(panel.innerHTML.indexOf('data-tf-close')<panel.innerHTML.indexOf('tf-package-scroll'));
  assert(panel.innerHTML.indexOf('data-tf-message')<panel.innerHTML.indexOf('tf-package-footer'));
  assert.match(panel.innerHTML,/<\/div><footer class="tf-package-footer">/);
  assert.match(panel.innerHTML,/data-tf-autostart[^>]*role="switch"[^>]*aria-label="开机自动启用插件屏幕"/);
});

test('production install and restore keep explicit confirmation and verified real control sequence',async()=>{
  const cancelled=harness({deny:true});await cancelled.open();await cancelled.elements['[data-tf-toggle]'].onclick();assert.deepEqual(cancelled.writes,[]);
  const h=harness();await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(h.confirmations.length,1);assert.deepEqual(h.writes,['install','upload','upload-finished','finish','start']);
  assert.match(h.elements['[data-tf-message]'].textContent,/连续三次/);
  await h.elements['[data-tf-toggle]'].onclick();assert.equal(h.confirmations.length,2);assert.equal(h.writes.at(-1),'restore');
});

test('version panel compares only the imported TXT with components and never checks an invented remote release',async()=>{
  for (const [initialState, expected, offered] of [
    [{installed:false,mode:'factory'}, /尚未安装/, false],
    [{installed:true,mode:'custom'}, /与本 TXT 一致 · v0\.1\.8/, false],
    [{installed:true,mode:'custom',versionMismatch:true}, /可更新的旧版/, true],
    [{installed:true,mode:'factory',partial:true}, /安装未完成/, false]
  ]) {
    const h=harness({initialState});const panel=await h.open();
    assert.match(panel.innerHTML,/本 TXT · v0\.1\.8/);
    assert.match(panel.innerHTML,/检测已导入 TXT 与设备组件；新版需先导入 UFI/);
    assert.match(h.elements['[data-tf-version]'].textContent,expected);
    assert.equal(h.elements['[data-tf-update]'].hidden,!offered);
    assert.equal(h.elements['[data-tf-update]'].disabled,!offered);
    assert.deepEqual(h.requests.map(x=>x.route),['/api/run_shell']);assert.deepEqual(h.writes,[]);
  }
});

test('update from a running old screen restores and replaces components in one confirmation and preserves the UFI record',async()=>{
  const h=harness({initialState:{installed:true,mode:'custom',versionMismatch:true}});await h.open();
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换回原厂屏幕');
  assert.equal(h.elements['[data-tf-update]'].textContent,'更新到 v0.1.8');
  await h.elements['[data-tf-update]'].onclick();
  assert.equal(h.confirmations.length,1);assert.match(h.confirmations[0],/自动恢复.*安装新版后启动插件屏幕/);
  assert.deepEqual(h.writes,['uninstall','install','upload','upload-finished','finish','start']);
  assert(!h.requests.some(x=>/plugin\/uninstall|get_custom_head|set_custom_head/.test(x.route)));
  assert.match(h.elements['[data-tf-message]'].textContent,/连续三次/);
  assert.equal(h.elements['[data-tf-update]'].hidden,true);
  assert.match(h.elements['[data-tf-version]'].textContent,/与本 TXT 一致/);
});

test('update preserves review, upload, wait, changed-version and failed-read barriers',async()=>{
  const old={installed:true,mode:'custom',versionMismatch:true};
  for(const options of [
    {reviewOnly:true,initialState:old},
    {initialState:{...old,uploadActive:true}},
    {initialState:{...old,waiting:'FACTORY_AUTOSLEEP_LOCK_ACTIVE'}},
    {initialState:old,readStatus({read,state}){return read>1?{...state,versionMismatch:false}:state;}},
    {initialState:old,readStatus({read,state}){return read>1?{...state,uploadActive:true}:state;}},
    {initialState:old,readStatus({read,state}){return read>1?Error('connection unavailable'):state;}}
  ]) {
    const h=harness(options);await h.open();await h.elements['[data-tf-update]'].onclick();
    assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
    assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/连续三次/);
  }
  const denied=harness({initialState:old,deny:true});await denied.open();await denied.elements['[data-tf-update]'].onclick();
  assert.deepEqual(denied.writes,[]);assert.equal(denied.confirmations.length,1);
});

test('update cannot install after failed factory recovery or unconfirmed cleanup and cannot claim a failed new start succeeded',async()=>{
  const old={installed:true,mode:'custom',versionMismatch:true};
  for(const options of [
    {initialState:old,cleanupFails:true},
    {initialState:old,cleanupState:{installed:true,mode:'factory'}},
    {initialState:old,cleanupState:{installed:false,mode:'unknown'}}
  ]) {
    const h=harness(options);await h.open();await h.elements['[data-tf-update]'].onclick();
    assert.deepEqual(h.writes,['uninstall']);assert.equal(h.confirmations.length,1);
    assert.match(h.elements['[data-tf-message]'].textContent,/未确认|未能稳定确认/);
    assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/连续三次/);
  }
  const fail=harness({initialState:old,startState:{installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7}});
  await fail.open();await fail.elements['[data-tf-update]'].onclick();
  assert.deepEqual(fail.writes,['uninstall','install','upload','upload-finished','finish','start']);
  assert.match(fail.elements['[data-tf-message]'].textContent,/ADOPT_SENSOR_STATE/);
  assert.doesNotMatch(fail.elements['[data-tf-message]'].textContent,/连续三次/);
});

test('update readiness cannot accept a healthy process belonging to a replaced old or incomplete component set',async()=>{
  for(const extra of [{versionMismatch:true},{partial:true},{uploadActive:true},{installed:false}]) {
    const h=harness({initialState:{installed:true,mode:'custom',versionMismatch:true},startState:{installed:true,mode:'custom',pid:234,ready:true,supervised:true,heartbeatAge:1,...extra}});
    await h.open();await h.elements['[data-tf-update]'].onclick();
    assert.deepEqual(h.writes,['uninstall','install','upload','upload-finished','finish','start']);
    assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/已连续三次/);
    assert.match(h.elements['[data-tf-message]'].textContent,/切换未确认/);
  }
});

test('update holds one busy lock across cleanup, upload and start and suppresses duplicate clicks and refresh',async()=>{
  let release;const held=new Promise(resolve=>{release=resolve;});
  const h=harness({initialState:{installed:true,mode:'custom',versionMismatch:true},beforeUninstall:()=>held});await h.open();
  const updating=h.elements['[data-tf-update]'].onclick();await flush();
  assert.deepEqual(h.writes,['uninstall']);
  for(const name of ['update','toggle','status','uninstall','close'])assert.equal(h.elements['[data-tf-'+name+']'].disabled,true,name);
  const before=h.requests.length;
  await h.elements['[data-tf-update]'].onclick();await h.elements['[data-tf-toggle]'].onclick();await h.elements['[data-tf-status]'].onclick();await h.elements['[data-tf-uninstall]'].onclick();
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,1);
  release();await updating;
  assert.deepEqual(h.writes,['uninstall','install','upload','upload-finished','finish','start']);
  assert.equal(h.elements['[data-tf-status]'].disabled,false);
});

test('manual version refresh serializes reads and invalidates a stale update offer when detection fails',async()=>{
  let release;const held=new Promise(resolve=>{release=resolve;});
  const h=harness({initialState:{installed:true,mode:'custom',versionMismatch:true},async readStatus({read,state}){if(read>1){await held;throw Error('unavailable');}return state;}});await h.open();
  const reading=h.elements['[data-tf-status]'].onclick();await flush();
  const before=h.requests.length;
  assert.equal(h.elements['[data-tf-update]'].disabled,true);
  await h.elements['[data-tf-status]'].onclick();await h.elements['[data-tf-update]'].onclick();assert.equal(h.requests.length,before);
  release();await reading;
  assert.equal(h.elements['[data-tf-update]'].hidden,true);assert.equal(h.elements['[data-tf-update]'].disabled,true);
  assert.match(h.elements['[data-tf-version]'].textContent,/尚未确认/);assert.deepEqual(h.writes,[]);
});

test('production failures preserve upload lock, failed recovery and review-only barriers',async()=>{
  const failed=harness({uploadUnknown:true});await failed.open();await failed.elements['[data-tf-toggle]'].onclick();
  assert.deepEqual(failed.writes,['install','upload']);assert.equal(failed.elements['[data-tf-uninstall]'].disabled,true);
  const restore=harness({installed:true,mode:'custom',restoreFails:true});await restore.open();await restore.elements['[data-tf-toggle]'].onclick();
  assert.doesNotMatch(restore.elements['[data-tf-message]'].textContent,/连续三次/);assert.match(restore.elements['[data-tf-message]'].textContent,/未确认/);
  const review=harness({reviewOnly:true});await review.open();await review.elements['[data-tf-toggle]'].onclick();assert.deepEqual(review.writes,[]);assert.equal(review.confirmations.length,0);
});

test('failure arriving on the final refresh preserves the native phase instead of the generic switch timeout',async()=>{
  let polls=0;
  const h=harness({installed:true,startState:{installed:true,mode:'factory'},readStatus({started,state}){
    return started && ++polls===11 ? {...state,failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7} : state;
  }});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.equal(polls,11);assert.match(message,/ADOPT_SENSOR_STATE/);assert.match(message,/退出状态：7/);assert.match(message,/原厂屏幕进程已回读确认/);
  assert.doesNotMatch(message,/未观察到目标屏幕进程/);assert.deepEqual(h.writes,['start']);
});

test('direct switching permits bounded slow handover and still requires three fresh healthy observations',async()=>{
  let polls=0;
  const h=harness({installed:true,directSwitch:true,readStatus({started,state}){
    return started && ++polls<=14 ? {installed:true,mode:'factory'} : state;
  }});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(polls,17);assert.match(h.elements['[data-tf-message]'].textContent,/已连续三次/);assert.deepEqual(h.writes,['start']);
});

test('direct-switch polling exits early with a late native failure after the old ten-read budget',async()=>{
  let polls=0;
  const h=harness({installed:true,directSwitch:true,readStatus({started,state}){
    if(!started)return state;
    return ++polls<15 ? {installed:true,mode:'factory'} : {installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_READ',rendererExitStatus:7};
  }});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(polls,16);assert.match(h.elements['[data-tf-message]'].textContent,/ADOPT_SENSOR_READ/);assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/未观察到目标屏幕进程/);assert.deepEqual(h.writes,['start']);
});

test('direct-switch confirmation remains bounded when no target or failure is observed',async()=>{
  let polls=0;
  const h=harness({installed:true,directSwitch:true,startState:{installed:true,mode:'factory'},readStatus({started,state}){if(started)polls++;return state;}});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(polls,31,'30 action-bound observations and one final status read');assert.match(h.elements['[data-tf-message]'].textContent,/未观察到目标屏幕进程/);
  assert.equal(h.elements['[data-tf-status]'].disabled,false);assert.deepEqual(h.writes,['start']);
});

test('a rejected start cannot attribute its error to the unchanged previous failure record',async()=>{
  const previous={installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7};
  const h=harness({installed:true,initialState:previous,startState:previous,startContent:'TOPFLOW_ERROR=CONTROL_BUSY'});
  await h.open();assert.match(h.elements['[data-tf-message]'].textContent,/ADOPT_SENSOR_STATE/);
  await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.match(message,/CONTROL_BUSY/);assert.doesNotMatch(message,/ADOPT_SENSOR_STATE|RENDERER_EXITED/);assert.deepEqual(h.writes,['start']);
});

test('a new failure on a rejected start is read back with its current native phase',async()=>{
  const h=harness({installed:true,initialState:{failure:'RENDERER_EXITED',rendererFailure:'DRM_INIT',rendererExitStatus:5},
    startContent:'Supervisor startup not confirmed',startState:{installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7}});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.match(message,/ADOPT_SENSOR_STATE/);assert.match(message,/退出状态：7/);assert.match(message,/屏幕操作未确认.*最新失败记录/);assert.doesNotMatch(message,/DRM_INIT/);
});

test('consecutive status read failures stop polling and report only bounded transport diagnostics',async()=>{
  let polls=0;
  const h=harness({installed:true,readStatus({started,state}){if(started){polls++;return Error('private-token https://private.invalid/secret');}return state;}});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.equal(polls,4,'three bounded retries and one recovery read');
  assert.match(message,/连续读取失败 3 次/);assert.match(message,/STATUS_NETWORK_ERROR/);assert.match(message,/随后刷新状态也失败/);
  assert.doesNotMatch(message,/private-token|private\.invalid|未观察到目标屏幕进程|已连续三次/);
  assert.equal(h.elements['[data-tf-status]'].disabled,false);assert.deepEqual(h.writes,['start']);
});

test('final recovery read exposes the latest native error without erasing repeated status-read failures',async()=>{
  let polls=0;
  const h=harness({installed:true,readStatus({started,state}){
    if(!started)return state;
    return ++polls<=3 ? 'invalid status envelope' : {installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7};
  }});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.equal(polls,4);assert.match(message,/ADOPT_SENSOR_STATE/);assert.match(message,/连续读取失败 3 次/);assert.match(message,/STATUS_UNCONFIRMED/);
  assert.doesNotMatch(message,/未观察到目标屏幕进程/);
});

test('a transient status read failure still permits three fresh healthy observations',async()=>{
  let polls=0;
  const h=harness({installed:true,readStatus({started,state}){return started && ++polls<=2 ? Error('temporary connection loss') : state;}});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  assert.equal(polls,5);assert.match(h.elements['[data-tf-message]'].textContent,/已连续三次/);assert.deepEqual(h.writes,['start']);
});

test('a refreshed newer failure supersedes the earlier poll phase and updates the recovery action',async()=>{
  let polls=0;
  const h=harness({installed:true,readStatus({started,state}){
    if(!started)return state;
    return ++polls===1 ? {installed:true,mode:'factory',failure:'RENDERER_EXITED',rendererFailure:'ADOPT_SENSOR_STATE',rendererExitStatus:7}
      : {installed:true,mode:'unknown',failure:'FACTORY_RESTORE_UNCONFIRMED',rendererFailure:'ADOPT_SENSOR_LUX',rendererExitStatus:8};
  }});
  await h.open();await h.elements['[data-tf-toggle]'].onclick();
  const message=h.elements['[data-tf-message]'].textContent;
  assert.equal(polls,2);assert.match(message,/FACTORY_RESTORE_UNCONFIRMED/);assert.match(message,/ADOPT_SENSOR_LUX/);assert.doesNotMatch(message,/ADOPT_SENSOR_STATE|原厂屏幕进程已回读确认/);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换回原厂屏幕');
});

test('production uninstall removes only native components and the uniquely verified UFI record',async()=>{
  const h=harness({installed:true});await h.open();await h.elements['[data-tf-uninstall]'].onclick();
  assert.deepEqual(h.writes,['uninstall','record']);assert.equal(h.confirmations.length,1);
  assert(!h.requests.some(request=>request.route==='/api/set_custom_head'));
  assert.match(h.elements['[data-tf-message]'].textContent,/卸载已回读确认/);
});

test('entry remains outside the actual UFI collapse observer clipping region in both menu states',{skip: !fs.existsSync(path.join(__dirname,'../analysis/evidence/ufi-utils.js')) && 'Private UFI WebUI source intentionally not distributed'},()=>{
  const utils=fs.readFileSync(path.join(__dirname,'../analysis/evidence/ufi-utils.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../analysis/evidence/ufi-index.html'),'utf8');
  assert.match(html,/class="functions-container actions collapse collapse_menu"/);
  const start=utils.indexOf('const createCollapseObserver ='),end=utils.indexOf('const collapseGen =',start);
  assert(start>0&&end>start);
  const callbacks=[];let mode='open',entry,requests=0,timers=0;
  const outer={children:[],append(node){node.parentElement=this;this.children.push(node);}};
  const inner={getBoundingClientRect(){return {height:85.333};}};
  const menu={style:{},parentElement:outer,querySelector(sel){assert.equal(sel,'.collapse_box');return inner;},getAttribute(){return mode;},
    append(node){node.parentElement=this;},insertAdjacentElement(where,node){assert.equal(where,'afterend');entry=node;outer.append(node);}};
  const root={TopFlowPackagePayload:payload,document:{currentScript:{textContent:source},body:outer,
    querySelector(sel){return sel==='.functions-container'?menu:sel==='.container'?outer:null;},createElement(){return {};}} ,
    fetch(){requests++;throw Error('No load-time network');},setTimeout(){timers++;throw Error('No startup timers');},
    ResizeObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb();}},
    MutationObserver:class{constructor(cb){callbacks.push(cb);}observe(){}},console};
  vm.createContext(root);vm.runInContext(utils.slice(start,end)+';globalThis.bindMenu=createCollapseObserver;',root);
  root.bindMenu(menu);
  assert.equal(menu.style.height,'85.333px');
  vm.runInContext(source,root);
  assert.equal(entry.parentElement,outer,'entry must not be appended to height-clipped functions-container');
  for(const value of ['close','open']){mode=value;callbacks[0]([{type:'attributes',attributeName:'data-name'}]);assert.equal(menu.style.overflow,'hidden');assert.equal(menu.style.height,value==='close'?'0':'85.333px');assert.equal(entry.parentElement,outer);}
  assert.equal(requests,0);assert.equal(timers,0);assert.equal(callbacks.length,1,'manager has no observer before it is opened');
  root.TopFlowUfiPlugin.register(root);assert.equal(outer.children.length,1,'duplicate registration creates no repeated entry');
});


test('manager caches only its validated private snapshot; later public payload mutation cannot change lifecycle commands',async()=>{
 const h=harness();
 h.root.TopFlowPackagePayload.archiveSha256='f'.repeat(64);
 h.root.TopFlowPackagePayload.members=['../../outside'];
 h.root.TopFlowPackagePayload.archiveBase64='not base64';
 await h.open();
 assert.equal(h.requests.length,1);
 const command=JSON.parse(h.requests[0].config.body).cmd;
 assert(command.includes('a'.repeat(64)));assert(!command.includes('f'.repeat(64)));assert(!command.includes('../../outside'));
 assert.deepEqual(h.writes,[]);
});

const bootOff={enabled:false,hook:'absent',state:'disabled',reason:'NONE'};
const bootOn={enabled:true,hook:'present',state:'enabled',reason:'NONE'};
const bootState=(autostart=bootOff,extra={})=>({installed:true,mode:'factory',autostart,...extra});

test('autostart opens with one read, remains off by default and never installs or switches merely from opening',async()=>{
  const h=harness({initialState:bootState()});const panel=await h.open();
  assert.match(panel.innerHTML,/开机自动启用插件屏幕/);assert.match(panel.innerHTML,/role="switch"/);
  assert.equal(h.elements['[data-tf-autostart]'].disabled,false);
  assert.equal(h.elements['[data-tf-autostart]'].getAttribute('aria-checked'),'false');
  assert.match(h.elements['[data-tf-autostart-state]'].textContent,/已关闭/);
  assert.equal(h.requests.length,1);assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
});

test('autostart enable requires a fresh complete current installation, safe hook state and confirmation',async()=>{
  const blocked=[
    bootState(bootOff,{installed:false}),bootState(bootOff,{versionMismatch:true}),
    bootState(bootOff,{partial:true}),bootState(bootOff,{uploadActive:true}),
    {installed:true,mode:'factory'},bootState({...bootOff,hook:'conflict'}),bootState({...bootOff,hook:'unknown'})
  ];
  for(const initialState of blocked){
    const h=harness({initialState});await h.open();assert.equal(h.elements['[data-tf-autostart]'].disabled,true,JSON.stringify(initialState));
    await h.elements['[data-tf-autostart]'].onclick();assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
  }
  const denied=harness({initialState:bootState(),deny:true});await denied.open();await denied.elements['[data-tf-autostart]'].onclick();
  assert.equal(denied.confirmations.length,1);assert.deepEqual(denied.writes,[]);
  for(const changed of blocked){
    const h=harness({initialState:bootState(),readStatus({read,state}){return read>1?changed:state;}});await h.open();
    await h.elements['[data-tf-autostart]'].onclick();assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
  }
  const failed=harness({initialState:bootState(),readStatus({read,state}){return read>1?Error('status unavailable'):state;}});await failed.open();
  await failed.elements['[data-tf-autostart]'].onclick();assert.deepEqual(failed.writes,[]);assert.equal(failed.confirmations.length,0);
  assert.equal(failed.elements['[data-tf-autostart]'].disabled,true);
});

test('autostart enable changes only the official boot preference and requires accurate readback',async()=>{
  const h=harness({initialState:bootState()});await h.open();await h.elements['[data-tf-autostart]'].onclick();
  assert.equal(h.confirmations.length,1);assert.deepEqual(h.writes,['autostart-enable']);
  assert.equal(h.elements['[data-tf-autostart]'].getAttribute('aria-checked'),'true');
  assert.match(h.elements['[data-tf-autostart-state]'].textContent,/已开启/);
  assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换到插件屏幕');
  assert(h.requests.every(request=>request.route==='/api/run_shell'));
  const command=JSON.parse(h.requests.find(request=>JSON.parse(request.config.body).cmd.includes('autostart-enable --confirmed')).config.body).cmd;
  assert.match(command,/screenctl\.sh" autostart-enable --confirmed/);
  assert.doesNotMatch(command,/screenctl\.sh" start --confirmed|set -- restore --confirmed|rc\.local/);
});

test('autostart fresh state selects disable instead of repeating a stale enable request',async()=>{
  const h=harness({initialState:bootState(),readStatus({read,state}){return read===2?bootState(bootOn):state;}});await h.open();
  await h.elements['[data-tf-autostart]'].onclick();assert.deepEqual(h.writes,['autostart-disable']);
  assert.equal(h.confirmations.length,1);assert.match(h.confirmations[0],/关闭/);
  assert.equal(h.elements['[data-tf-autostart]'].getAttribute('aria-checked'),'false');
});

test('autostart disable can cancel pending startup without restoring or stopping the current screen',async()=>{
  for(const state of ['enabled','waiting','starting','started']){
    const h=harness({initialState:bootState({...bootOn,state},{mode:'custom'})});await h.open();
    assert.equal(h.elements['[data-tf-autostart]'].disabled,false);
    await h.elements['[data-tf-autostart]'].onclick();assert.deepEqual(h.writes,['autostart-disable']);
    assert.equal(h.elements['[data-tf-toggle]'].textContent,'切换回原厂屏幕');
    assert.equal(h.elements['[data-tf-autostart]'].getAttribute('aria-checked'),'false');
  }
  for(const hook of ['conflict','unknown']){
    const h=harness({initialState:bootState({...bootOn,hook})});await h.open();
    assert.equal(h.elements['[data-tf-autostart]'].disabled,false);await h.elements['[data-tf-autostart]'].onclick();
    assert.deepEqual(h.writes,['autostart-disable']);
  }
});

test('review-only boot enable is blocked while disabling an existing preference remains available',async()=>{
  const off=harness({initialState:bootState(),reviewOnly:true});await off.open();await off.elements['[data-tf-autostart]'].onclick();
  assert.equal(off.elements['[data-tf-autostart]'].disabled,true);assert.deepEqual(off.writes,[]);assert.equal(off.confirmations.length,0);
  const on=harness({initialState:bootState(bootOn),reviewOnly:true});await on.open();await on.elements['[data-tf-autostart]'].onclick();
  assert.deepEqual(on.writes,['autostart-disable']);
});

test('autostart unknown response or mismatched readback never retries or claims success',async()=>{
  for(const options of [
    {autostartThrows:true}, {autostartContent:'TOPFLOW_ERROR=AUTOSTART_HOOK_CONFLICT'},
    {autostartContent:'unconfirmed'}, {autostartResultState:bootState()},
    {autostartResultState:bootState({...bootOn,hook:'absent'})},
    {autostartResultState:bootState(bootOn,{versionMismatch:true})},
    {autostartResultState:bootState(bootOn,{uploadActive:true})},
    {readStatus({read,state}){return read>2?Error('lost readback'):state;}}
  ]){
    const h=harness({initialState:bootState(),...options});await h.open();await h.elements['[data-tf-autostart]'].onclick();
    assert.deepEqual(h.writes,['autostart-enable']);assert.equal(h.confirmations.length,1);
    assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/已开启开机自动|开机自启动已开启|开机自动启用已开启/);
    assert.match(h.elements['[data-tf-message]'].textContent,/未确认|未通过|失败|冲突|不一致|disconnected|lost readback/);
  }
});

test('autostart disable cannot claim pending work was cancelled if readback is still waiting or starting',async()=>{
  for(const state of ['waiting','starting']){
    const h=harness({initialState:bootState({...bootOn,state}),autostartResultState:bootState({...bootOff,state})});
    await h.open();await h.elements['[data-tf-autostart]'].onclick();
    assert.deepEqual(h.writes,['autostart-disable']);
    assert.match(h.elements['[data-tf-message]'].textContent,/未确认|不一致/);
    assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/已确认关闭/);
  }
});

test('autostart failure and integrity status stay visible without claiming a successful boot or configuration',async()=>{
  for(const [autostart,expected] of [
    [{...bootOn,state:'failed',reason:'START_FAILED'},/失败.*接管未确认/],
    [{...bootOff,hook:'present',state:'failed',reason:'INTEGRITY_FAILED'},/失败.*校验未通过/],
    [{...bootOff,hook:'present',state:'failed',reason:'CONFIG_INVALID'},/失败.*配置未确认/],
    [{...bootOff,hook:'conflict',state:'failed',reason:'HOOK_CONFLICT'},/状态异常/]
  ]){
    const h=harness({initialState:bootState(autostart)});await h.open();
    assert.match(h.elements['[data-tf-autostart-state]'].textContent,expected);
    assert.doesNotMatch(h.elements['[data-tf-autostart-state]'].textContent,/本次开机已启动|已开启.*生效/);
    assert.equal(h.elements['[data-tf-autostart]'].getAttribute('aria-checked'),String(autostart.enabled));
    assert.deepEqual(h.writes,[]);assert.equal(h.confirmations.length,0);
  }
  const h=harness({initialState:bootState(),autostartResultState:bootState({...bootOff,hook:'present',state:'failed',reason:'INTEGRITY_FAILED'})});
  await h.open();await h.elements['[data-tf-autostart]'].onclick();
  assert.deepEqual(h.writes,['autostart-enable']);assert.match(h.elements['[data-tf-message]'].textContent,/未确认|不一致/);
  assert.doesNotMatch(h.elements['[data-tf-message]'].textContent,/已确认开启/);
});

test('autostart shares the lifecycle busy lock through preference write and readback',async()=>{
  let release;const held=new Promise(resolve=>{release=resolve;});
  const h=harness({initialState:bootState(),beforeAutostart:()=>held});await h.open();
  const changing=h.elements['[data-tf-autostart]'].onclick();await flush();assert.deepEqual(h.writes,['autostart-enable']);
  for(const name of ['autostart','toggle','status','uninstall','close','update'])assert.equal(h.elements['[data-tf-'+name+']'].disabled,true,name);
  const before=h.requests.length;
  for(const name of ['autostart','toggle','status','uninstall','update'])await h.elements['[data-tf-'+name+']'].onclick();
  assert.equal(h.requests.length,before);assert.equal(h.confirmations.length,1);
  release();await changing;assert.deepEqual(h.writes,['autostart-enable']);assert.equal(h.elements['[data-tf-autostart]'].disabled,false);
});
