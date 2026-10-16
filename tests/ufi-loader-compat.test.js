'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const panelSource=fs.readFileSync(path.join(ROOT,'analysis/evidence/ufi-main.js'),'utf8');
const bundle=fs.readFileSync(path.join(ROOT,'dist/topflow-screen-0.2.2.txt'),'utf8');

// Execute the actual downloaded UFI file-import routine, with only its DOM,
// storage-ledger and toast dependencies replaced. No network or device shell.
function importer(initial=[]) {
  const start=panelSource.indexOf('    const handlePluginFileUpload = (event, opts = {}) => {');
  const end=panelSource.indexOf('    //插件导出',start);
  assert(start>0&&end>start);
  const text={value:''},toasts=[],saves=[];
  const context={plugins:initial,document:{querySelector:selector=>selector==='#custom_head'?text:null},
    FileReader:class {readAsText(file){queueMicrotask(()=>this.onload({target:{result:file.content}}));}},
    createToast:message=>toasts.push(message),t:key=>key,console:{log(){}},
    dedupePluginBlocksLastWins:items=>items,parsePluginBlocks:source=>Array.from(source.matchAll(/<!--\s*\[KANO_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[KANO_PLUGIN_END\]\s*\1\s*-->/g),m=>({name:m[1],content:m[2]})),
    syncLedgerWithBlocks(){},localBlockVersion(){return null;},recordInstalledPlugin(){},renderPluginList(){},
    initRequestData:async()=>true,enqueuePluginMutation:task=>task(),setCustomHead:async value=>{saves.push(value);return {result:'success'};},closeModal(){},setTimeout(){},location:{reload(){}}};
  vm.createContext(context);
  const metaStart=panelSource.indexOf('    const META_LINE_RE = '),metaEnd=panelSource.indexOf('    // 从 custom_head 文本中删除指定块名',metaStart);
  assert(metaStart>0&&metaEnd>metaStart);
  vm.runInContext(panelSource.slice(metaStart,metaEnd)+';globalThis.realParseBlocks=parsePluginBlocks;globalThis.realSerializeMeta=buildMetaLine;',context);
  text.value=initial.map(item=>'<!-- [KANO_PLUGIN_START] '+item.name+' -->\n'+context.realSerializeMeta(item.meta)+item.content+'\n<!-- [KANO_PLUGIN_END] '+item.name+' -->\n\n\n\n').join('');
  vm.runInContext(panelSource.slice(start,end)+';globalThis.importFile=handlePluginFileUpload;',context);
  const saveStart=panelSource.indexOf('    const savePluginSetting = async (e) => {');
  const saveEnd=panelSource.indexOf('    let cellularSpeedFlag',saveStart);
  assert(saveStart>0&&saveEnd>saveStart);
  vm.runInContext(panelSource.slice(saveStart,saveEnd)+';globalThis.saveSettings=savePluginSetting;',context);
  return {text,toasts,saves,blocks:()=>context.realParseBlocks(text.value),save:()=>context.saveSettings(),async load(content=bundle,name='topflow-screen.txt'){return context.importFile({target:{files:[{name,size:Buffer.byteLength(content),content}]}});}};
}

test('saved UFI manual importer accepts raw source and preserves the AoYou-style public header without internal store metadata',async()=>{
  const reference=fs.readFileSync(path.join(ROOT,'开发文档/遨游世界插件.txt'),'utf8');
  for(const key of ['name','version','build']){
    const pattern=new RegExp('^// @'+key+' (.+)$','m');assert(pattern.test(reference));assert(pattern.test(bundle));
  }
  assert.equal(bundle.match(/^\/\/ @version (.+)$/m)[1],'0.2.2');
  assert.match(bundle,/^<script id="topflow-screen-plugin-source">/);
  assert.doesNotMatch(bundle,/\[KANO_META\]/,'current UFI rejects this internal tag in a raw upload');
  assert.doesNotMatch(bundle,/<!--\s*\[KANO_(?:PLUGIN_START|PLUGIN_END)\]/);
  const host=importer();await host.load();
  const blocks=host.blocks();assert.equal(blocks.length,1);assert.equal(blocks[0].meta.ver,'');
  assert.equal(blocks[0].meta.sid,'');assert.equal(blocks[0].meta.no,0);assert.equal(blocks[0].meta.pub,'');
  assert.equal(blocks[0].content.match(/^\/\/ @version (.+)$/m)[1],'0.2.2','own source version remains available without claiming a store ledger version');
  assert.equal((host.text.value.match(/<!-- \[KANO_PLUGIN_START\]/g)||[]).length,1);
  assert(host.text.value.includes(bundle));
  assert(host.toasts.includes('toast_add_success_save_to_submit'));
  assert(Buffer.byteLength(bundle)<=4*1024*1024);
  assert.equal(host.saves.length,0,'file import only changes the editor, not persisted settings');
  await host.save();
  assert.equal(host.saves.length,1);assert(host.saves[0].includes(bundle));
  assert.equal(host.blocks()[0].meta.ver,'');
  assert(host.toasts.includes('save_plugin_success_refresh'));
});

test('actual UFI importer documents that manual same-filename imports are skipped, not upgraded',async()=>{
  const host=importer([{name:'topflow-screen.txt',content:'old'}]),before=host.text.value;await host.load();
  assert.equal(host.text.value,before);assert(host.toasts.includes('same_plugin'));
});

test('raw TopFlow import preserves other installed plugin blocks and their host-owned metadata',async()=>{
  const host=importer([{name:'existing-aoyou.txt',content:'<script>/* existing plugin */</script>',meta:{sid:'existing-store-id',ver:'2.10.0'}}]);
  const before=host.text.value;await host.load();await host.save();
  assert.equal(host.blocks().length,2);assert.equal(host.text.value.slice(0,before.length),before);
  assert.equal(host.saves[0].slice(0,before.length),before);
  assert.equal(host.blocks()[0].meta.ver,'2.10.0');assert.equal(host.blocks()[1].meta.ver,'');
});

test('the actual generated script registers from a UFI-style head injection with lexical API globals and zero device requests',()=>{
  const scripts=Array.from(bundle.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/gi));
  assert.equal(scripts.length,1);let requests=0,entries=[];
  const document={currentScript:{textContent:scripts[0][1]},body:{append:el=>entries.push(el)},querySelector:()=>null,
    createElement:()=>({}),addEventListener(){throw Error('Unexpected delayed mounting');}};
  const context={document,URL,TextEncoder,TextDecoder,Uint8Array,Blob,FormData,atob,AbortController,
    location:{href:'http://192.168.0.1:2333/',origin:'http://192.168.0.1:2333'},
    fetch(){requests++;throw Error('Device requests forbidden in loader test');}};
  vm.createContext(context);
  vm.runInContext('let KANO_baseURL="/api";const common_headers={authorization:null};',context);
  vm.runInContext(scripts[0][1],context);
  assert.equal(requests,0);assert.equal(entries.length,1);
  assert.equal(entries[0].textContent,'TopFlow 屏幕 · 管理');
  assert.equal(typeof context.__topflow_screen_plugin.open,'function');
  assert.equal(context.TopFlowPackagePayload.hardwareTested,false);
  assert.equal(context.TopFlowPackagePayload.diagnosticCandidate,false);
  assert.equal(context.TopFlowPackagePayload.unresolvedStartupFailure,undefined);
  assert.equal(context.TopFlowPackagePayload.version,'0.2.2');
});
