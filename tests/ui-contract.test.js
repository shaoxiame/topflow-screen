'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const device = require('../src/device-api.js');
const source = fs.readFileSync(path.join(__dirname, '../src/screen-ui.js'), 'utf8');

function harness(aoyouState = {}, options = {}) {
  let state = options.state || device.normalize({ modems: [{ id: '5G', net: { type: 'SA', band: 'n78', nr_rsrp: -80, nr_pci: 42, nr_channel: 627264 }, traffic: { rx_speed: 1000, tx_speed: 100 }, wwan: { status: 'connected' } }] });
  let mutations = 0;
  const built = [], executed = [], proxyWrites = [], apnReads = [],simSourceReads=[];
  const api = {
    readState: async () => options.readState ? options.readState() : state,
    readMessages: async () => options.readMessages ? options.readMessages() : options.messages || [],
    readWifi: async () => options.wifi || ({ aps: [], dualBand: false }),
    readForward: async () => options.forward || ({ enabled: false, method: '', config: {} }),
    readBands: async () => state.bands,
    readApn: async modem => {apnReads.push(modem);return options.readApn?options.readApn(modem):options.apn?.[modem] || {readable:false,writable:false,manual:[],automatic:[]};},
    readSimSource: async modem => {simSourceReads.push(modem);return options.readSimSource?options.readSimSource(modem):device.normalizeSimSource(options.simSources?.[modem],modem);},
    readClients: async () => options.clients || {readable:true,aclMode:'deny',items:[],blocked:[]},
    readTraffic: async () => options.traffic || device.normalizeTraffic({}),
    readPower: async () => options.power || device.normalizePower({}),
    readCooling: async () => options.cooling || device.normalizeCooling({}),
    readFactoryState: async () => options.factory || device.normalizeFactoryState({}),
    buildAction: (name, params) => { mutations++; built.push({ name, params }); return options.validateActions ? device.buildAction(name, params) : { effects: [] }; },
    execute: async (name, params, confirmation) => { mutations++; executed.push({ name, params, confirmation }); }
  };
  const aoyou = {
    getState: async () => aoyouState,
    selectProxy: async (...args) => { mutations++; proxyWrites.push(['selectProxy', ...args]); },
    setMode: async (...args) => { mutations++; proxyWrites.push(['setMode', ...args]); }
  };
  const view = { scrollTop: 0 };
  const listeners = new Set();
  const appended = [];
  let html = '', now = Date.now(), renders = 0;
  const timeouts = new Map();let nextTimeout=1;
  const document = {
    createElement() {
      const buttons = { '[data-cancel]': { focus() {} }, '[data-ok]': {} };
      return { className: '', innerHTML: '', textContent: '', setAttribute() {},
        querySelector: selector => buttons[selector] || null,
        remove() { const i = appended.indexOf(this); if (i >= 0) appended.splice(i, 1); }
      };
    }
  };
  const el = {
    classList: { add() {} }, dataset: {},
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; appended.length = 0; renders++; },
    querySelector(selector) {
      if (selector === '.view') return view;
      if (selector === '.dialog-bg' || selector === '.toast') return appended.find(node => '.' + node.className === selector) || null;
      if (selector === '[data-form=cell]') return formFromHtml(html, 'cell');
      if (selector === '[data-forward-fields]') return { set innerHTML(value) { html = html.replace(/(<div data-forward-fields>)[\s\S]*?(<\/div>)/, (_, open, close) => open + value + close); } };
      if (selector === '[data-ok]') return this.querySelector('.dialog-bg')?.querySelector(selector) || null;
      return null;
    },
    append(node) { appended.push(node); },
    addEventListener(type, listener, options) {
      const record = { type, listener };
      listeners.add(record);
      if (options && options.signal) options.signal.addEventListener('abort', () => listeners.delete(record), { once: true });
    },
    removeEventListener(type, listener) { for (const record of listeners) if (record.type === type && record.listener === listener) listeners.delete(record); },
    contains() { return true; }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class FormData {
    constructor(form) { this.values = Object.entries(form.elements).flatMap(([key, value]) => (Array.isArray(value.value) ? value.value : [value.value]).map(v => [key, v])); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
    getAll(key) { return this.values.filter(entry => entry[0] === key).map(entry => entry[1]); }
  }
  const context = {
    TopflowDeviceAPI: device, console, Date: Clock, document, FormData, setTimeout: (fn,delay) => {const id=nextTimeout++;timeouts.set(id,{fn,at:now+delay});return id;}, clearTimeout: id => timeouts.delete(id), AbortController,
    setInterval: () => 0, clearInterval() {},
    fetch: () => { throw new Error('UI must use injected read APIs'); }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const ui = context.TopFlowUI.mount(el, { api, aoyou, state, mode: options.mode, autoload: false, demo: false, live: true, control: options.control === true });
  async function dispatch(type, props = {}) {
    const event = { target: control(), preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const record of [...listeners]) if (record.type === type) await record.listener(event);
    return event;
  }
  return { el, ui, built, executed, proxyWrites, apnReads,simSourceReads, dispatch,
    change: target => dispatch('change', { target }),
    submit: form => dispatch('submit', { target: form }),
    click: target => dispatch('click', { target: control({ button: target }) }),
    form: name => formFromHtml(html, name),
    dialog: () => el.querySelector('.dialog-bg'),
    cancel: () => el.querySelector('.dialog-bg').querySelector('[data-cancel]').onclick(),
    confirm: () => el.querySelector('.dialog-bg').querySelector('[data-ok]').onclick(),
    advance: ms => { now += ms; },
    setReadState: value => {state=value;},
    flushTimeouts: () => {for(const [id,item] of [...timeouts])if(item.at<=now){timeouts.delete(id);item.fn();}},
    timeoutCount: () => timeouts.size,
    mutations: () => mutations, listenerCount: () => listeners.size, renderCount: () => renders };
}

function control(props = {}) {
  const result = { name: '', value: '', checked: false, dataset: {}, attributes: [], ...props };
  result.hasAttribute = name => result.attributes.includes(name);
  result.setAttribute = (name, value) => { result[name] = value; };
  result.closest = selector => selector === 'button' ? result.button || null : selector === 'input,select,textarea' ? result.editable ? result : null : selector === '.view' ? result.inView ? result : null : null;
  return result;
}

test('persistent header and power/settings show actual charging states without font icons',async()=>{
 for(const [chargeStatus,connected,state,label] of [[1,1,'charging','充电中'],[3,1,'plugged','已插电 · 未充电'],[4,1,'full','已充满'],[2,0,'discharging','电池供电'],[undefined,undefined,'unknown','充电状态未知']]){
  const h=harness({}, {state:device.normalize({battery:{percent:100,charging:chargeStatus,charger_connect:connected}})});
  for(const page of ['home','settings','power']){await h.ui.navigate(page);assert.match(h.el.innerHTML,new RegExp('top-power '+state));assert.ok(h.el.innerHTML.includes('title="'+label+'"'));assert.match(h.el.innerHTML,/<span class="charge-bolt"[^>]*><i class="a">/);if(page!=='home')assert.ok(h.el.innerHTML.includes('供电状态'));}
  assert.equal(h.mutations(),0);h.ui.destroy();
 }
});

test('home card identity stays separate from reported radio and every radio label is rendered consistently',async()=>{
  const cases=[['lte','4G'],['LTE-CA','4G+'],['sa','5G SA'],['nr5g_nsa','5G NSA'],['endc','5G NSA'],['NR','5G'],['5g advanced','5G-A'],['WCDMA','3G'],['EDGE','2G']];
  for(const [type,label]of cases){
    const state=device.normalize({factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},modems:['4G2','5G','4G1'].map(id=>({id,sim:{state:'sim ready'},net:{type,band:'B3',operator:'China Unicom'},wwan:{status:'connected'}}))});
    const h=harness({}, {state});await h.ui.refresh();
    assert.match(h.el.innerHTML,/主卡实时速率/);assert.doesNotMatch(h.el.innerHTML,/5G 主卡实时速率/);
    assert.ok(h.el.innerHTML.includes('LIVE · '+label));
    for(const [id,card]of [['5G','卡1'],['4G1','卡2'],['4G2','卡3']]){
      await h.ui.navigate('home');
      const block=h.el.innerHTML.match(new RegExp('<button class="sim [^"]*" data-modem="'+id+'">([\\s\\S]*?)</button>'))?.[1];
      assert.ok(block,id+' keeps its API target');
      assert.ok(block.includes('<span class="sim-icon">'+card+'</span>'));
      assert.ok(block.includes('<span class="sim-title">中国联通<span>'+label+'</span>'));
      assert.doesNotMatch(block,/>B3</,'small badge is the reported radio rather than a band');
      await h.click(control({dataset:{modem:id}}));
      assert.ok(h.el.innerHTML.includes('<span>网络</span><b>'+label+' · B3</b>'));
    }
    await h.ui.navigate('network');assert.ok(h.el.innerHTML.includes('网络参数<small>'+label+'</small>'));
    assert.equal(h.mutations(),0);h.ui.destroy();
  }
});

test('unusable card states suppress cached radio in home and details while ready disconnected remains distinct',async()=>{
  const cases=[
    ['sim ready','off','disconnected','5G-A','未联网'],
    ['sim undetected','off','disconnected','—','未插卡'],
    ['wait pin','off','disconnected','—','待输入 PIN'],
    ['wait puk','off','disconnected','—','待输入 PUK'],
    ['sim lock','off','disconnected','—','SIM 卡已锁'],
    ['sim error','off','disconnected','—','SIM 异常'],
    ['','off','disconnected','—','未联网'],
    ['sim undetected','off','connected','—','状态冲突'],
    ['sim ready','on','disconnected','—','未启用'],
    ['sim ready','on','connected','—','状态冲突'],
    ['sim ready',undefined,'connected','—','已联网']
  ];
  for(const id of ['5G','4G1','4G2'])for(const [simState,flight,connection,label,status]of cases){
    if(id==='5G'&&flight!=='off')continue;
    const state=device.normalize({factory:{modems:{[id]:{flight}}},modems:[{id,sim:{state:simState},net:{type:'5GA',band:'n78'},wwan:{status:connection}}]});
    const h=harness({}, {state});await h.ui.refresh();
    const block=h.el.innerHTML.match(new RegExp('<button class="sim [^"]*" data-modem="'+id+'">([\\s\\S]*?)</button>'))?.[1];
    assert.ok(block.includes('<span>'+label+'</span></span>'),[id,simState,flight,connection].join('/'));
    assert.ok(block.includes(status));
    if(id==='5G')assert.ok(h.el.innerHTML.includes('LIVE · '+label));
    await h.click(control({dataset:{modem:id}}));
    assert.ok(h.el.innerHTML.includes('<span>网络</span><b>'+label+' · '+(label==='—'?'—':'n78')+'</b>'));
    assert.ok(h.el.innerHTML.includes(status));
    if(label==='—')assert.doesNotMatch(h.el.innerHTML,/5G-A|n78/);
    if(id==='5G'){await h.ui.navigate('network');assert.ok(h.el.innerHTML.includes('网络参数<small>'+label+'</small>'));}
    assert.equal(h.mutations(),0);h.ui.destroy();
  }
});

test('aggregation and carrier details do not advertise 5G-A without an explicit radio report',async()=>{
  const state=device.normalize({net:{nrca:'0,42,0,78,627264,100,0,-80,0,20,0;1,43,0,1,428000,20,0,-85,0,15,0'},aggregation:{enabled:true,online:true},
    factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},modems:['5G','4G1','4G2'].map(id=>({id,sim:{state:'sim ready'},net:{type:'SA'},wwan:{status:'connected'}}))});
  const h=harness({}, {state});await h.ui.refresh();
  assert.match(h.el.innerHTML,/聚合模式/);assert.match(h.el.innerHTML,/5G SA/);assert.doesNotMatch(h.el.innerHTML,/5G-A|5GA/);
  await h.ui.navigate('network');assert.match(h.el.innerHTML,/NR 2 路载波/);assert.doesNotMatch(h.el.innerHTML,/5G-A|5GA/);
  assert.equal(h.mutations(),0);h.ui.destroy();
});

test('unknown raw types never enter UI and normalized display strings are HTML escaped',async()=>{
  const attack='<img src=x onerror=TF_RADIO_BAD>',state=device.normalize({modems:[{id:'5G',sim:{state:'sim ready'},net:{type:attack},wwan:{status:'connected'}}]});
  const h=harness({}, {state});
  for(const page of ['home','network','modem']){await h.ui.navigate(page);assert.doesNotMatch(h.el.innerHTML,/TF_RADIO_BAD|<img/);}
  assert.equal(h.mutations(),0);h.ui.destroy();
  // Also verify the renderer's boundary independently of the normalizer.
  state.modems[0].radioLabel=attack;
  const escaped=harness({}, {state});
  for(const page of ['home','network','modem']){await escaped.ui.navigate(page);assert.doesNotMatch(escaped.el.innerHTML,/<img/);assert.ok(escaped.el.innerHTML.includes('&lt;img src=x onerror=TF_RADIO_BAD&gt;'));}
  assert.equal(escaped.mutations(),0);escaped.ui.destroy();
});

test('clicking each card opens live rates, QCI and contract rates first in the requested order',async()=>{
  const raw={factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},modems:[
    {id:'4G2',sim:{state:'sim ready'},wwan:{status:'disconnected'},traffic:{tx_speed:125000,rx_speed:250000},qos:{qci:9,ambr_ul:'75.500',ambr_dl:'150.125'}},
    {id:'5G',sim:{state:'sim ready'},wwan:{status:'connected'},traffic:{tx_speed:250000,rx_speed:500000},qos:{qci:6,ambr_ul:'200.000',ambr_dl:'2000.000'}},
    {id:'4G1',sim:{state:'sim ready'},wwan:{status:'connected'},traffic:{tx_speed:375000,rx_speed:750000},qos:{qci:7,ambr_ul:'50.000',ambr_dl:'100.000'}}
  ]};
  const h=harness({}, {state:device.normalize(raw)});
  for(const [id,up,down,qci,contractUp,contractDown] of [['5G','2.00','4.00',6,'200','2000'],['4G1','3.00','6.00',7,'50','100'],['4G2','1.00','2.00',9,'75.5','150.125']]){
    await h.ui.navigate('home');await h.click(control({dataset:{modem:id}}));
    assert.equal(h.ui.getState().page,'modem');assert.match(h.el.innerHTML,new RegExp(id+' ·'));
    const block=h.el.innerHTML.match(/<div class="card"><div class="card-title">速率与签约<\/div>([\s\S]*?)<\/p><\/div>/)?.[1];
    assert.ok(block,'contract details appear in the first detail card');
    const labels=['实时上行','实时下行','QCI 等级','签约上行','签约下行'];
    const values=[up+' Mbps',down+' Mbps',String(qci),contractUp+' Mbps',contractDown+' Mbps'];
    let previous=-1;
    for(let i=0;i<labels.length;i++){
      const position=block.indexOf('<span>'+labels[i]+'</span><b>'+values[i]+'</b>');
      assert.ok(position>previous,labels[i]+' appears in order with its own card value');previous=position;
      assert.equal(h.el.innerHTML.split(labels[i]).length-1,1,'detail label is not duplicated');
    }
    assert.ok(h.el.innerHTML.indexOf('速率与签约')<h.el.innerHTML.indexOf('卡片与连接'));
    assert.match(block,/网络最近下发的速率上限，非实时测速/);
  }
  assert.equal(h.mutations(),0);h.ui.destroy();
});

test('card detail contract rates show unavailable markers instead of stale or fabricated zero values',async()=>{
  for(const [state,enabled] of [['sim ready',false],['sim undetected',true],['wait pin',true],['',true]]){
    const h=harness({}, {state:device.normalize({factory:{modems:{'4G1':{flight:enabled?'off':'on'}}},modems:[{id:'4G1',sim:{state},wwan:{status:'disconnected'},qos:{qci:6,ambr_ul:'200',ambr_dl:'2000'}}]})});
    await h.click(control({dataset:{modem:'4G1'}}));
    for(const label of ['QCI 等级','签约上行','签约下行'])assert.ok(h.el.innerHTML.includes('<span>'+label+'</span><b>—</b>'));
    assert.doesNotMatch(h.el.innerHTML,/2000 Mbps|200 Mbps/);assert.equal(h.mutations(),0);h.ui.destroy();
  }
});

test('card source labels use raw factory sources and never expose provision-slot controls',async()=>{
  const h=harness({}, {simSources:{'5G':{st_slot:'0'},'4G1':{v3t_2_st_slot:'1'},'4G2':{v3t_1_st_slot:''}}});
  for(const [modem,label]of [['5G','插拔卡'],['4G1','内置卡'],['4G2','尚未确认']]){
    await h.click(control({dataset:{modem}}));
    assert.ok(h.el.innerHTML.includes('<span>SIM 卡源</span><b>'+label+'</b>'));
    assert.doesNotMatch(h.el.innerHTML,/data-form="simslot"|主基带卡槽|卡槽 1|卡槽 2|实体 SIM|eSIM/);
  }
  assert.deepEqual(h.simSourceReads,['5G','4G1','4G2']);await h.ui.refresh();assert.equal(h.simSourceReads.length,3,'periodic state refresh does not read SIM source');
  await h.click(control({attributes:['data-sim-source-read']}));assert.deepEqual(h.simSourceReads,['5G','4G1','4G2','4G2']);
  assert.equal(h.mutations(),0);h.ui.destroy();
});

test('late source data for a previous card cannot overwrite the current card',async()=>{
  let resolveFirst;
  const h=harness({}, {readSimSource:async modem=>modem==='5G'?new Promise(resolve=>{resolveFirst=resolve;}):device.normalizeSimSource({v3t_2_st_slot:'1'},modem)});
  const first=h.click(control({dataset:{modem:'5G'}}));
  await h.click(control({dataset:{modem:'4G1'}}));
  resolveFirst(device.normalizeSimSource({st_slot:'0'},'5G'));await first;
  assert.match(h.el.innerHTML,/4G1 ·/);assert.ok(h.el.innerHTML.includes('<span>SIM 卡源</span><b>内置卡</b>'));
  assert.equal(h.mutations(),0);h.ui.destroy();
});

function form(name, values) {
  return { dataset: { form: name }, elements: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) };
}

// Parse the actual rendered field values; event handlers still execute unmodified
// in the VM. The small DOM double never runs browser/network APIs.
function formFromHtml(html, name) {
  const body = html.match(new RegExp('<form data-form="' + name + '"[\\s\\S]*?</form>'))?.[0];
  assert(body, 'rendered form ' + name + ' exists');
  const values = {};
  for (const match of body.matchAll(/<input\b([^>]+)>/g)) {
    const attrs = match[1], key = attrs.match(/\bname="([^"]+)"/)?.[1];
    if (key && !/type="checkbox"/.test(attrs)) values[key] = attrs.match(/\bvalue="([^"]*)"/)?.[1] || '';
  }
  for (const match of body.matchAll(/<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...match[2].matchAll(/<option value="([^"]*)"([^>]*)>/g)];
    values[match[1]] = (options.find(option => /\bselected\b/.test(option[2])) || options[0])?.[1] || '';
  }
  return form(name, values);
}

test('mounting, navigating every page and refreshing never perform hidden writes', async () => {
  const h = harness({ running: true, version: 'v1', mode: 'rule', modeLabel: '规则分流', groups: [] });
  for (const page of ['home', 'network', 'apps', 'settings', 'cell', 'bands', 'modem', 'sms', 'compose', 'forward', 'wifi', 'aoyou', 'theme']) await h.ui.navigate(page);
  await h.ui.refresh();
  assert.equal(h.mutations(), 0);
  h.ui.destroy();
});

test('three main screens expose each common function once and return through the actual entry hierarchy', async () => {
  const h = harness({}, { control: true });
  const clickPage = async page => {
    assert.ok(h.el.innerHTML.includes('data-page="'+page+'"'), 'visible entry for '+page);
    await h.click(control({ dataset: { page } }));
    assert.equal(h.ui.getState().page, page);
  };
  const back = async expected => { await h.click(control({ attributes: ['data-back'] }));assert.equal(h.ui.getState().page,expected); };
  await h.ui.navigate('apps');
  assert.deepEqual([...h.el.innerHTML.matchAll(/data-page="([^"]+)"/g)].map(x=>x[1]), ['wifi','sms','aoyou','settings']);
  await clickPage('wifi');await back('apps');
  await clickPage('sms');await clickPage('compose');await back('sms');await clickPage('forward');await back('sms');await back('apps');
  await clickPage('aoyou');await back('apps');
  await clickPage('settings');assert.doesNotMatch(h.el.innerHTML,/data-page="wifi"/);
  assert.deepEqual([...h.el.innerHTML.matchAll(/data-page="([^"]+)"/g)].map(x=>x[1]), ['theme','power','traffic','clients']);
  assert.match(h.el.innerHTML,/风扇 \/ 液冷 \/ 工作模式 \/ 休眠/);
  await clickPage('power');await back('settings');await back('apps');
  await h.ui.navigate('network');assert.equal((h.el.innerHTML.match(/data-page=/g)||[]).length,1);
  await clickPage('networkcontrol');await clickPage('bands');await back('networkcontrol');await clickPage('cell');await back('networkcontrol');await back('network');
  assert.equal(h.mutations(),0);h.ui.destroy();
});

test('native settings expose four distinct groups and WPS is discoverable in Wi-Fi only', () => {
  const settings=fs.readFileSync(path.join(__dirname,'../native/ui/settings.html'),'utf8');
  const entries=[...settings.matchAll(/class="linkcard" href="act:([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(entries,['display','power','traffic','clients']);
  assert.doesNotMatch(settings,/act:(?:more|wps|wifi-dual|guest)/);
  assert.match(settings,/工作模式/);
  const controls=fs.readFileSync(path.join(__dirname,'../native/advanced_controls.h'),'utf8');
  const overview=controls.slice(controls.indexOf('static void wifi_overview_render(void)'),controls.indexOf('static char*advanced_render(void)'));
  assert.equal((overview.match(/href='act:wps'/g)||[]).length,1);
});

test('global day/night button replaces page numbers, preserves parent navigation and changes no device state', async () => {
  const h=harness({}, {control:true});
  for(const page of ['home','network','apps','settings','sms','compose','forward','theme']) {
    await h.ui.navigate(page);
    assert.equal((h.el.innerHTML.match(/data-theme=/g)||[]).length,1);
    assert.doesNotMatch(h.el.innerHTML,/page-index|0[1-4] \/ 0[1-4]/);
    const renders=h.renderCount(),button=control({dataset:{theme:'dark'}});
    await h.click(button);assert.equal(h.el.dataset.theme,'dark');assert.equal(button['aria-label'],'切换浅色');assert.equal(button.dataset.theme,'light');
    assert.equal(h.ui.getState().page,page);
    await h.click(button);assert.equal(h.el.dataset.theme,'light');assert.equal(button['aria-label'],'切换深色');
    assert.equal(h.renderCount(),renders,'theme change preserves form DOM, draft text, cursor and scroll');
  }
  assert.equal(h.mutations(),0);h.ui.destroy();
});

test('editable SMS flow validates the real API contract and sends only after the final recipient/content confirmation', async () => {
  const h=harness({}, {control:true,validateActions:true});
  await h.ui.navigate('apps');await h.click(control({dataset:{page:'sms'}}));await h.click(control({dataset:{page:'compose'}}));
  const message=form('sms',{number:'+8613800000000',message:'本地协议测试 <内容>，不会连接设备'});
  await h.submit(message);
  assert.equal(h.executed.length,0);assert.equal(h.built.at(-1).name,'sms.send');
  assert.match(h.dialog().innerHTML,/\+8613800000000/);assert.match(h.dialog().innerHTML,/&lt;内容&gt;/);
  h.cancel();assert.equal(h.executed.length,0);
  await h.submit(message);await h.confirm();
  assert.equal(h.executed.length,1);assert.equal(h.executed[0].params.sender,'5G');
  assert.equal(h.executed[0].params.content,message.elements.message.value);
  assert.equal(h.executed[0].confirmation.confirmed,true);assert.equal(h.executed[0].confirmation.allowExternalEffects,true);
  assert.equal(h.ui.getState().page,'sms');assert.match(h.el.innerHTML,/class="on" data-mailtab="sent"/);
  await h.click(control({attributes:['data-back']}));assert.equal(h.ui.getState().page,'apps');h.ui.destroy();
});

test('acknowledged SMS does not become a send failure when status or inbox refresh is unavailable', async () => {
  const h=harness({}, {control:true,validateActions:true,readState:async()=>{throw Error('status unavailable');},readMessages:async()=>{throw Error('inbox unavailable');}});
  await h.ui.navigate('sms');await h.click(control({dataset:{page:'compose'}}));
  await h.submit(form('sms',{number:'10010',message:'local test'}));await h.confirm();
  assert.equal(h.executed.length,1);assert.equal(h.ui.getState().page,'sms');
  assert.match(h.el.innerHTML,/发送请求已接受，短信列表暂未刷新/);
  assert.equal(h.built.length,1,'refresh failure does not repeat the send');h.ui.destroy();
});

test('untrusted node and group names remain text in rendered UI', async () => {
  const marker = '<img src=x onerror=globalThis.EXECUTED=true>';
  const h = harness({ running: true, version: 'v1', mode: 'rule', groups: [{ name: marker, type: 'Selector', selected: marker, selectable: true, nodes: [{ name: marker, delayMs: 10 }] }] });
  await h.ui.navigate('aoyou');
  assert.equal(h.el.innerHTML.includes(marker), false);
  assert(h.el.innerHTML.includes('&lt;img'));
  h.ui.destroy();
});

test('unreadable engine status is not presented as a stopped engine or doubled version prefix', async () => {
  const h = harness({ running: null, version: 'v1.19.32-ayw.1', mode: null, groups: [], errors: ['内核状态暂不可读'] });
  await h.ui.navigate('aoyou');
  assert.doesNotMatch(h.el.innerHTML, /<strong>未运行<\/strong>/);
  assert.match(h.el.innerHTML, /不可读|未知|暂不可用|未连接/);
  assert.doesNotMatch(h.el.innerHTML, /vv1\.19/);
  h.ui.destroy();
});

test('destroy removes action handlers so remounting read-only cannot retain old control authority', () => {
  const h = harness();
  assert(h.listenerCount() >= 3);
  h.ui.destroy();
  assert.equal(h.listenerCount(), 0);
});

test('changing Wi-Fi section retains its values and submits only edited fields, including unknown existing encryption', async () => {
  const h = harness({}, { control: true, wifi: { dualBand: false, aps: [
    { section: 'main_2g', ssid: 'HOME-24', encryption: 'psk2+tkip+ccmp', enabled: true },
    { section: 'main_5g', ssid: 'HOME-5', encryption: 'sae', enabled: true }
  ] } });
  await h.ui.navigate('wifi');
  for (const [section, ssid, encryption] of [['main_5g', 'HOME-5', 'sae'], ['main_2g', 'HOME-24', 'psk2+tkip+ccmp'], ['main_5g', 'HOME-5', 'sae']]) {
    await h.change(control({ name: 'section', value: section }));
    const f = h.form('wifi');
    assert.equal(f.elements.section.value, section);
    assert.equal(f.elements.ssid.value, ssid);
    assert.equal(f.elements.encryption.value, encryption);
    const before = h.executed.length;
    const descriptorsBefore = h.built.length;
    await h.submit(f);
    assert.equal(h.dialog(), null, 'unchanged Wi-Fi form needs no confirmation or write');
    assert.equal(h.built.length, descriptorsBefore);
    assert.equal(h.executed.length, before);
    f.elements.ssid.value = ssid + '-renamed';
    await h.submit(f);
    assert.equal(h.executed.length, before, 'no write before confirmation');
    await h.confirm();
    const action = h.executed.at(-1);
    assert.equal(action.name, 'wifi.configure');
    assert.deepEqual({ ...action.params }, { section, ssid: ssid + '-renamed' });
    assert.equal(Object.hasOwn(action.params, 'key'), false, 'blank password must retain saved credential');
    assert.doesNotThrow(() => device.buildAction(action.name, action.params), 'unknown unchanged encryption must not block a name-only edit');

    const encryptionForm = h.form('wifi');
    encryptionForm.elements.encryption.value = 'sae-mixed';
    await h.submit(encryptionForm);
    await h.confirm();
    assert.deepEqual({ ...h.executed.at(-1).params }, { section, encryption: 'sae-mixed' });
    assert.doesNotThrow(() => device.buildAction(h.executed.at(-1).name, h.executed.at(-1).params));
  }
  h.ui.destroy();
});

test('LTE and NR serving cell selection keeps PCI, channel and band in their own radio family', async () => {
  const h = harness({}, { control: true });
  const state = h.ui.getState().data;
  state.modems[0].serving = {
    nr: { pci: 42, arfcn: 627264, band: 78 },
    lte: { pci: 7, arfcn: 1650, band: 3 }
  };
  h.ui.setState(state);
  await h.ui.navigate('cell');
  let f = h.form('cell');
  assert.equal(f.elements.pci.value, '42');
  assert.equal(f.elements.arfcn.value, '627264');
  assert.equal(f.elements.band.value, '78');
  await h.submit(f);
  await h.confirm();
  assert.equal(h.executed.at(-1).name, 'cell.lock_nr');
  assert.deepEqual({ ...h.executed.at(-1).params }, { pci: 42, arfcn: 627264, band: 78 });

  await h.change(control({ name: 'rat', value: 'lte' }));
  f = h.form('cell');
  assert.equal(f.elements.pci.value, '7');
  assert.equal(f.elements.arfcn.value, '1650');
  assert.equal(f.elements.band, undefined);
  await h.submit(f);
  await h.confirm();
  assert.equal(h.executed.at(-1).name, 'cell.lock_lte');
  assert.deepEqual({ ...h.executed.at(-1).params }, { pci: 7, earfcn: 1650 });

  state.modems[0].serving.nr = { pci: null, arfcn: null, band: null };
  h.ui.setState(state);
  await h.change(control({ name: 'rat', value: 'nr' }));
  f = h.form('cell');
  assert.equal(f.elements.pci.value, '');
  assert.equal(f.elements.arfcn.value, '');
  assert.match(h.el.innerHTML, /data-current-cell disabled/);
  h.ui.destroy();
});

test('horizontal swipes cycle only main pages and reject vertical, edited, cancelled or mismatched gestures', async () => {
  const h = harness({}, { messages: [{ id: 'fixture-message', number: '10010', text: '本地消息内容', direction: 'incoming' }] });
  const content = control({ inView: true });
  async function swipe(dx, dy = 0, target = content, pointerUpId = 1) {
    await h.dispatch('pointerdown', { target, clientX: 160, clientY: 200, pointerId: 1 });
    await h.dispatch('pointerup', { target, clientX: 160 + dx, clientY: 200 + dy, pointerId: pointerUpId });
    h.advance(400);
  }
  const position = () => [h.ui.getState().page, h.ui.getState().viewMode];
  for (const expected of [['network', 'normal'], ['apps', 'normal'], ['home', 'normal']]) {
    await swipe(-100);
    assert.deepEqual(position(), expected);
  }
  await swipe(100);
  assert.deepEqual(position(), ['apps', 'normal']);
  for (const args of [[-15, 0], [-60, 100], [-100, 0, control({ inView: true, editable: true })], [-100, 0, content, 2]]) {
    await swipe(...args);
    assert.deepEqual(position(), ['apps', 'normal']);
    await h.dispatch('pointercancel');
  }
  await h.dispatch('pointerdown', { target: content, clientX: 160, clientY: 200, pointerId: 1 });
  await h.dispatch('pointercancel');
  await h.dispatch('pointerup', { target: content, clientX: 60, clientY: 200, pointerId: 1 });
  assert.deepEqual(position(), ['apps', 'normal']);
  for (const subpage of ['settings', 'networkcontrol', 'cell', 'bands', 'modem', 'sms', 'compose', 'forward', 'wifi', 'aoyou', 'theme']) {
    await h.ui.navigate(subpage);
    await swipe(-100);
    await h.dispatch('keydown', { key: 'ArrowRight', target: content });
    assert.equal(h.ui.getState().page, subpage, 'subpage cannot swipe into main-page sequence');
  }
  await h.ui.navigate('sms');
  await h.click(control({ dataset: { message: 'fixture-message' } }));
  assert(h.dialog());
  await swipe(-100);
  await h.dispatch('keydown', { key: 'ArrowLeft', target: content });
  assert.deepEqual(position(), ['sms', 'normal'], 'message dialog does not let swipes or keys change pages');
  h.cancel();
  assert.equal(h.mutations(), 0);
  h.ui.destroy();
});

test('home hides back navigation, detail headers return one level and no screen page exposes factory controls', async () => {
  const h = harness({}, {state:device.normalize({aggregation:{enabled:true,online:false}})});
  const header = () => h.el.innerHTML.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] || '';
  const back = () => h.click(control({ attributes: ['data-back'] }));
  assert.doesNotMatch(header(), /data-back|返回上一层/);
  await h.ui.refresh();
  assert.equal(h.ui.getState().viewMode, 'aggregate');
  assert.doesNotMatch(header(), /data-back|返回上一层/);
  await h.ui.navigate('network');
  await h.ui.navigate('cell');
  assert.match(header(), /data-back[^>]*aria-label="返回上一层"/);
  assert.doesNotMatch(h.el.innerHTML.match(/<div class="page-title">[\s\S]*?<\/div>/)?.[0] || '', /<button/);
  await back();
  assert.equal(h.ui.getState().page, 'network');
  await back();
  assert.equal(h.ui.getState().page, 'home');
  assert.equal(h.ui.getState().viewMode, 'aggregate', 'returning home follows the current device mode');
  assert.doesNotMatch(header(), /data-back/);
  await h.ui.navigate('apps');
  await h.ui.navigate('sms');
  await h.ui.navigate('compose');
  await back();
  assert.equal(h.ui.getState().page, 'sms');
  await back();
  assert.equal(h.ui.getState().page, 'apps');
  for (const page of ['home', 'network', 'apps', 'settings', 'cell', 'bands', 'modem', 'sms', 'compose', 'forward', 'wifi', 'aoyou', 'theme']) {
    await h.ui.navigate(page);
    assert.doesNotMatch(h.el.innerHTML, /data-factory|act:factory|切回原厂|恢复原厂|启用实体屏/);
    assert.equal((header().match(/data-back/g) || []).length, ['home','network','apps'].includes(page) ? 0 : 1, 'only the header has the single parent navigation control');
    assert.equal((h.el.innerHTML.match(/aria-label="返回上一层"/g) || []).length, ['home','network','apps'].includes(page) ? 0 : 1);
  }
  assert.equal(h.mutations(), 0);
  h.ui.destroy();
});

const aggregationState=(enabled,online=false)=>device.normalize(enabled===undefined?{}:{aggregation:{enabled,online}});

test('device aggregation replaces the single home and three-page navigation never changes network mode',async()=>{
 const h=harness({}, {state:aggregationState(true),mode:'aggregate',control:true});
 assert.equal(h.ui.getState().viewMode,'normal','live mount options and a cached state do not confirm the physical mode');
 assert.doesNotMatch(h.el.innerHTML,/data-mode=|data-aggregation|蜂窝链路合计/);
 assert.match(h.el.innerHTML,/普通模式/);assert.match(h.el.innerHTML,/data-theme="dark"/);assert.doesNotMatch(h.el.innerHTML,/page-index/);
 await h.ui.refresh();
 assert.equal(h.ui.getState().viewMode,'aggregate');assert.match(h.el.innerHTML,/聚合模式/);assert.match(h.el.innerHTML,/蜂窝链路合计/);assert.match(h.el.innerHTML,/聚合已开启/);assert.match(h.el.innerHTML,/当前接口未提供隧道连接状态/);assert.doesNotMatch(h.el.innerHTML,/等待上线/);
 assert.doesNotMatch(h.el.innerHTML,/data-mode=|data-aggregation|普通模式/);
 await h.click(control({dataset:{mode:'normal'}}));assert.equal(h.ui.getState().viewMode,'aggregate','removed layout controls cannot override the device state');
 const content=control({inView:true});
 for(const [page,mode] of [['network','normal'],['apps','normal'],['home','aggregate']]){
  await h.dispatch('keydown',{key:'ArrowRight',target:content});assert.equal(h.ui.getState().page,page);assert.equal(h.ui.getState().viewMode,mode);assert.doesNotMatch(h.el.innerHTML,/page-index/);
 }
 await h.ui.navigate('settings');assert.match(h.el.innerHTML,/通过设备实体拨钮切换/);assert.doesNotMatch(h.el.innerHTML,/data-aggregation/);
 await h.change(control({attributes:['data-aggregation'],checked:false}));
 assert.equal(h.mutations(),0,'even an obsolete aggregation UI event cannot build or execute a write');h.ui.destroy();
});

test('disabled or unknown aggregation returns home to normal independently of tunnel online state',async()=>{
 const h=harness({}, {control:true});
 for(const [next,mode] of [[aggregationState(false),'normal'],[aggregationState(true,false),'aggregate'],[aggregationState(true,true),'aggregate'],[aggregationState(false,true),'normal'],[aggregationState(undefined),'normal'],[aggregationState(true),'aggregate'],[aggregationState(null,true),'normal']]){
  h.setReadState(next);await h.ui.refresh();assert.equal(h.ui.getState().page,'home');assert.equal(h.ui.getState().viewMode,mode);
  assert.equal(h.el.innerHTML.includes('蜂窝链路合计'),mode==='aggregate');assert.doesNotMatch(h.el.innerHTML,/data-mode=|data-aggregation/);
 }
 const malformed=aggregationState(true);malformed.aggregation.enabled='true';h.ui.setState(malformed);assert.equal(h.ui.getState().viewMode,'normal','only normalized boolean true is confirmed');
 assert.equal(h.mutations(),0);h.ui.destroy();
});

test('aggregation home expires after five seconds and read failure immediately returns to normal',async()=>{
 let failure=false;const h=harness({}, {state:aggregationState(true),readState:async()=>{if(failure)throw new Error('offline');return aggregationState(true);}});
 await h.ui.refresh();assert.equal(h.ui.getState().viewMode,'aggregate');assert.equal(h.timeoutCount(),1);
 h.advance(5000);h.flushTimeouts();assert.equal(h.ui.getState().viewMode,'aggregate');
 h.advance(1);h.flushTimeouts();assert.equal(h.ui.getState().viewMode,'normal');assert.equal(h.el.dataset.stale,'true');
 await h.ui.refresh();assert.equal(h.ui.getState().viewMode,'aggregate');assert.equal(h.el.dataset.stale,'false');
 failure=true;await h.ui.refresh();assert.equal(h.ui.getState().viewMode,'normal');assert.equal(h.el.dataset.stale,'true');
 assert.equal(h.mutations(),0);h.ui.destroy();h.advance(10000);h.flushTimeouts();assert.equal(h.el.innerHTML,'');assert.equal(h.timeoutCount(),0);
});

test('a mode change during a swipe cancels that gesture while a normal refresh preserves it',async()=>{
 let release;const h=harness({}, {control:true,readState:()=>new Promise(resolve=>{release=resolve;})}),content=control({inView:true});
 h.ui.setState(aggregationState(true));
 await h.dispatch('pointerdown',{target:content,clientX:200,clientY:200,pointerId:1});
 const changed=h.ui.refresh();release(aggregationState(false));await changed;
 await h.dispatch('pointerup',{target:content,clientX:80,clientY:200,pointerId:1});assert.equal(h.ui.getState().page,'home');assert.equal(h.ui.getState().viewMode,'normal');
 await h.click(control({dataset:{modem:'5G'}}));assert.equal(h.ui.getState().page,'home','cancelled swipe must not become a click on the replacement layout');
 h.advance(400);await h.dispatch('pointerdown',{target:content,clientX:200,clientY:200,pointerId:2});
 const oldHtml=h.el.innerHTML,unchanged=h.ui.refresh();release(aggregationState(false));await unchanged;assert.equal(h.el.innerHTML,oldHtml,'background refresh does not replace the touch target');
 await h.dispatch('pointerup',{target:content,clientX:80,clientY:200,pointerId:2});assert.equal(h.ui.getState().page,'network');
 assert.equal(h.mutations(),0);h.ui.destroy();
});

test('device mode updates do not navigate away from detail forms and back uses the latest home mode',async()=>{
 const h=harness({}, {state:aggregationState(true),control:true});await h.ui.refresh();await h.ui.navigate('apps');await h.ui.navigate('sms');await h.ui.navigate('compose');
 const formHtml=h.el.innerHTML;h.setReadState(aggregationState(false));await h.ui.refresh();assert.equal(h.ui.getState().page,'compose');assert.equal(h.el.innerHTML,formHtml);
 for(const expected of ['sms','apps','home']){await h.click(control({attributes:['data-back']}));assert.equal(h.ui.getState().page,expected);}
 assert.equal(h.ui.getState().viewMode,'normal');h.setReadState(aggregationState(true));await h.ui.refresh();assert.equal(h.ui.getState().viewMode,'aggregate');
 assert.equal(h.mutations(),0);h.ui.destroy();
});

test('a late read cannot recreate mode-expiry timers after the screen is destroyed',async()=>{
 let release;const h=harness({}, {readState:()=>new Promise(resolve=>{release=resolve;})});
 const pending=h.ui.refresh();h.ui.destroy();release(aggregationState(true));await pending;
 assert.equal(h.timeoutCount(),0);assert.equal(h.el.innerHTML,'');assert.equal(h.mutations(),0);
});

test('cancelling a proxy node or mode choice restores current value without calling the proxy API', async () => {
  const h = harness({ running: true, mode: 'rule', groups: [{ name: 'PROXY', type: 'Selector', selected: 'NODE-A', nodes: [{ name: 'NODE-A' }, { name: 'NODE-B' }] }] }, { control: true });
  await h.ui.navigate('aoyou');
  const select = control({ value: 'NODE-B', dataset: { proxyGroup: 'PROXY' } });
  await h.change(select);
  assert.equal(select.value, 'NODE-A', 'native select immediately rolls back until confirmed');
  assert(h.dialog());
  h.cancel();
  assert.equal(select.value, 'NODE-A');
  assert.match(h.el.innerHTML, /value="NODE-A" selected/);
  await h.click(control({ dataset: { proxyMode: 'global' } }));
  assert(h.dialog());
  h.cancel();
  assert.match(h.el.innerHTML, /data-proxy-mode="rule" class="on"/);
  assert.equal(h.proxyWrites.length, 0);
  assert.equal(h.mutations(), 0);
  h.ui.destroy();
});

test('SMTP saved-password flags normalize exact true forms and never cross forwarding channels', async () => {
  const savedConfig = { smtp_host: 'smtp.example.test', smtp_port: '2525', smtp_username: 'fixture', smtp_to: 'to@example.test' };
  for (const flag of [true, 1, '1', false, '0', undefined]) {
    const expected = [true, 1, '1'].includes(flag);
    const h = harness({}, { control: true, validateActions: true, forward: { enabled: false, method: 'smtp', config: { ...savedConfig, password_saved: flag } } });
    await h.ui.navigate('forward');
    const passwordTag = h.el.innerHTML.match(/<input name="password"[^>]*>/)?.[0];
    assert(passwordTag);
    assert.equal(/\brequired\b/.test(passwordTag), !expected, 'password requirement follows the normalized saved flag');
    assert.equal(h.el.innerHTML.includes('密码（已保存，留空保留）'), expected);
    const f = h.form('forward');
    assert.equal(f.elements.password.value, '');
    await h.submit(f);
    assert.equal(h.built.at(-1).params.passwordSaved, expected);
    assert.equal(h.executed.length, 0, 'no write before explicit confirmation');
    if (expected) {
      assert(h.dialog());
      await h.confirm();
      assert.equal(h.executed.length, 1);
      assert.equal(device.buildAction(h.executed[0].name, h.executed[0].params).body.smtp_password, '');
    } else {
      assert.equal(h.dialog(), null, 'missing stored-password evidence must reject a blank password');
      assert.equal(h.executed.length, 0);
    }
    h.ui.destroy();
  }

  const h = harness({}, { control: true, validateActions: true, forward: { enabled: false, method: 'smtp', config: { ...savedConfig, password_saved: true } } });
  await h.ui.navigate('forward');
  await h.change(control({ name: 'method', value: 'dingtalk' }));
  assert.doesNotMatch(h.el.innerHTML, /密码（已保存，留空保留）/);
  await h.submit(form('forward', { method: 'dingtalk', webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=fixture', secret: '' }));
  assert.equal(h.built.at(-1).params.passwordSaved, false, 'SMTP saved flag is never attached to DingTalk');
  h.cancel();
  h.ui.destroy();

  const other = harness({}, { control: true, validateActions: true, forward: { enabled: false, method: 'dingtalk', config: { password_saved: true } } });
  await other.ui.navigate('forward');
  await other.change(control({ name: 'method', value: 'smtp' }));
  assert.doesNotMatch(other.el.innerHTML, /密码（已保存，留空保留）/);
  await other.submit(form('forward', { method: 'smtp', host: 'smtp.example.test', port: '2525', username: 'fixture', to: 'to@example.test', password: '' }));
  assert.equal(other.built.at(-1).params.passwordSaved, false, 'another channel cannot supply SMTP saved-password evidence');
  assert.equal(other.dialog(), null);
  assert.equal(other.executed.length, 0);
  other.ui.destroy();
});

test('read-only form submissions and toggles never build, execute or send an API action', async () => {
  const h = harness({ running: true, mode: 'rule', groups: [{ name: 'PROXY', selected: 'NODE-A', nodes: [{ name: 'NODE-A' }, { name: 'NODE-B' }] }] });
  const submissions = [
    ['cell', { rat: 'nr', pci: '42', arfcn: '627264', band: '78' }],
    ['cell', { rat: 'lte', pci: '7', arfcn: '1650' }],
    ['wifi', { section: 'main_2g', ssid: 'LOCAL', encryption: 'sae', key: '' }],
    ['sms', { number: '10010', message: 'Local test only' }],
    ['forward', { method: 'smtp', host: 'mail.example.test', port: '465', username: 'test', to: 'to@example.test' }],
    ['bands', { radio: 'nrSa', bands: ['78'], selection: 'manual' }],
    ['networkmode', { mode: 'Only_LTE' }]
  ];
  for (const [name, values] of submissions) {
    await h.submit(form(name, values));
    assert.equal(h.dialog(), null, name + ' must stop before confirmation and descriptor creation');
  }
  for (const attrs of [['data-dual'], ['data-forward']]) {
    const toggle = control({ attributes: attrs, checked: true });
    await h.change(toggle);
    assert.equal(toggle.checked, false, 'readonly toggle restores the original value');
  }
  const radio = control({ dataset: { radio: '5g' }, checked: true });
  await h.change(radio);
  assert.equal(radio.checked, false);
  await h.click(control({ attributes: ['data-unlock'] }));
  await h.ui.navigate('aoyou');
  const proxy = control({ dataset: { proxyGroup: 'PROXY' }, value: 'NODE-B' });
  await h.change(proxy);
  await h.click(control({ dataset: { proxyMode: 'direct' } }));
  assert.equal(proxy.value, 'NODE-A');
  assert.equal(h.mutations(), 0);
  assert.equal(h.built.length, 0);
  assert.equal(h.executed.length, 0);
  assert.equal(h.proxyWrites.length, 0);
  h.ui.destroy();
});

test('per-card APN pages retain the target, parent navigation and exact protocol numbers', async () => {
  const apn=Object.fromEntries(['5G','4G1','4G2'].map((id,index)=>[id,{readable:true,writable:true,mode:0,enabledId:'other',manual:[{id:'profile-'+id,name:'Profile '+id,apn:'internet-'+id,authMode:index,pdpType:index+1}],automatic:[]}]));
  const h=harness({}, {control:true,validateActions:true,apn});
  for(const id of ['5G','4G1','4G2']){
    await h.ui.navigate('home');await h.click(control({dataset:{modem:id}}));await h.ui.navigate('apn');
    assert.equal(h.apnReads.at(-1),id);const f=h.form('apnedit');
    assert.equal(f.elements.apn.value,'internet-'+id);assert.equal(f.elements.profileId.value,'profile-'+id);
    const pdp=[...h.el.innerHTML.matchAll(/<option value="([123])"[^>]*>(IPv4|IPv6|IPv4 \/ IPv6)<\/option>/g)];
    assert.deepEqual(pdp.map(match=>[match[1],match[2]]),[['1','IPv4'],['2','IPv6'],['3','IPv4 / IPv6']]);
    f.elements.apn.value+='-new';await h.submit(f);assert.equal(h.executed.length,h.built.length-1,'pending confirmation cannot execute');await h.confirm();
    const action=h.executed.at(-1);assert.equal(action.name,'apn.modify');assert.equal(action.params.modem,id);assert.equal(action.params.profileId,'profile-'+id);
    assert.equal(Object.hasOwn(action.params,'username'),false);assert.equal(Object.hasOwn(action.params,'password'),false);
    assert.equal(device.buildAction(action.name,action.params).body.params.slot_id,{'5G':1,'4G1':201,'4G2':101}[id]);
    await h.click(control({attributes:['data-back']}));assert.equal(h.ui.getState().page,'modem');assert.match(h.el.innerHTML,new RegExp(id+' ·'));
  }
  h.ui.destroy();
});

test('APN readonly capability and readonly session both stop before a write descriptor', async () => {
  for(const [controlEnabled,writable]of [[true,false],[false,true]]){
    const h=harness({}, {control:controlEnabled,apn:{'4G1':{readable:true,writable,mode:0,enabledId:'old',manual:[{id:'p',name:'Name',apn:'internet',pdpType:3,authMode:0}],automatic:[]}}});
    await h.click(control({dataset:{modem:'4G1'}}));await h.ui.navigate('apn');
    const f=h.form('apnedit');f.elements.apn.value='changed';await h.submit(f);
    await h.submit(form('apnmode',{mode:'1'}));await h.click(control({dataset:{apnEnable:'p'}}));
    assert.equal(h.mutations(),0);assert.equal(h.dialog(),null);h.ui.destroy();
  }
});

test('a late APN response cannot replace the currently selected card configuration', async () => {
  let resolveOld;const old=new Promise(resolve=>{resolveOld=resolve;});
  const config=id=>({readable:true,writable:true,mode:0,enabledId:'p-'+id,manual:[{id:'p-'+id,name:id,apn:'apn-'+id,authMode:null,pdpType:null}],automatic:[]});
  const h=harness({}, {control:true,validateActions:true,readApn:id=>id==='4G1'?old:Promise.resolve(config(id))});
  await h.click(control({dataset:{modem:'4G1'}}));const pending=h.ui.navigate('apn');
  await h.ui.navigate('home');await h.click(control({dataset:{modem:'4G2'}}));await h.ui.navigate('apn');
  resolveOld(config('4G1'));await pending;
  // Force a normal rerender to reveal any stale data hidden by the request guard.
  await h.click(control({dataset:{apnProfile:'p-4G2'}}));
  const f=h.form('apnedit');assert.equal(f.elements.profileId.value,'p-4G2');assert.equal(f.elements.apn.value,'apn-4G2');
  assert.equal(f.elements.pdpType.value,'');f.elements.name.value='New';await h.submit(f);await h.confirm();
  assert.equal(h.executed.at(-1).params.modem,'4G2');assert.equal(Object.hasOwn(h.executed.at(-1).params,'pdpType'),false,'unknown PDP must be preserved by omission');assert.equal(Object.hasOwn(h.executed.at(-1).params,'authMode'),false);
  h.ui.destroy();
});

test('guest Wi-Fi switch targets only its own guest band and waits for confirmation', async () => {
  const h=harness({}, {control:true,validateActions:true,wifi:{dualBand:false,aps:[{section:'main_2g',band:'2g',ssid:'Main',enabled:true},{section:'guest_2g',band:'2g',ssid:'Guest',enabled:false}]}});
  await h.ui.navigate('wifi');assert.match(h.el.innerHTML,/data-guest="2g"/);
  const toggle=control({dataset:{guest:'2g'},checked:true});await h.change(toggle);
  assert.equal(toggle.checked,false);assert.equal(h.executed.length,0);await h.confirm();
  const action=h.executed[0];assert.equal(action.name,'wifi.guest.set');assert.deepEqual(JSON.parse(JSON.stringify(action.params)),{bands:{'2g':true}});
  h.ui.destroy();
});

test('new settings pages preserve unknown states and all readonly actions stay local', async () => {
  const h=harness({}, {power:{directSupply:{supported:true,enabled:true},sleep:{supported:true,seconds:300}},factory:{settings:{qosMode:'Game_mode',quickBoot:false,powerSaver:null}},traffic:{limit:{type:2,valueBytes:1234},clearDay:{day:15,enabled:true}},clients:{readable:true,aclMode:'deny',items:[{mac:'aa:bb:cc:dd:ee:ff',name:'Local',ip:'192.0.2.1',band:'2g'}],blocked:['aa:bb:cc:dd:ee:00']}});
  for(const page of ['power','traffic','clients']){await h.ui.navigate(page);assert.equal(h.ui.getState().page,page);assert.match(h.el.innerHTML,/data-back/);}
  await h.click(control({dataset:{clientBlock:'aa:bb:cc:dd:ee:ff'}}));await h.click(control({dataset:{clientUnblock:'aa:bb:cc:dd:ee:00'}}));
  await h.ui.navigate('power');for(const attr of ['data-direct-power','data-quick-boot'])await h.change(control({attributes:[attr],checked:true}));
  for(const [name,values]of [['sleep',{seconds:'600'}],['workmode',{mode:'Nomal_mode'}],['trafficday',{enabled:'1',day:'16'}],['trafficcalibrate',{gib:'1'}]])await h.submit(form(name,values));
  assert.equal(h.mutations(),0);assert.equal(h.dialog(),null);assert.doesNotMatch(h.el.innerHTML,/data-power-saver/);h.ui.destroy();
});

test('cooling page treats always-on independently and readonly or unknown toggles never create writes', async () => {
  const cooling=device.normalizeCooling({cooling:{fan:{always_on:false,enabled:false,mode:'custom',speed_percent:12},liquid:{always_on:false,enabled:true,mode:'automatic',active:false}}});
  for(const options of [{cooling},{control:true,cooling:device.normalizeCooling({})}]){
    const h=harness({},options);await h.ui.navigate('power');
    const toggles=[...h.el.innerHTML.matchAll(/<input[^>]+data-cooling="(fan|liquid)"[^>]*>/g)];
    assert.equal(toggles.length,2);for(const match of toggles)assert.doesNotMatch(match[0],/\bchecked\b/,'legacy liquid enabled does not check always-on');
    for(const target of ['fan','liquid']){const toggle=control({dataset:{cooling:target},checked:true});await h.change(toggle);assert.equal(toggle.checked,false);}
    assert.equal(h.mutations(),0);assert.equal(h.dialog(),null);h.ui.destroy();
  }
});

test('cooling switches keep their target and do not execute before confirmation or after cancellation', async () => {
  const cooling=device.normalizeCooling({cooling:{fan:{always_on:false,mode:'custom'},liquid:{always_on:true,mode:'high'}}});
  const h=harness({}, {control:true,validateActions:true,cooling});await h.ui.navigate('power');
  for(const [target,enabled]of [['fan',true],['liquid',false]]){
    const toggle=control({dataset:{cooling:target},checked:enabled});await h.change(toggle);assert.equal(toggle.checked,!enabled);
    assert(h.dialog());const before=h.executed.length;h.cancel();assert.equal(h.executed.length,before);
    toggle.checked=enabled;await h.change(toggle);assert.equal(h.executed.length,before);await h.confirm();
    const action=h.executed.at(-1);assert.equal(action.name,'cooling.'+target+'.set_enabled');assert.equal(action.params.enabled,enabled);assert.equal(action.confirmation.confirmed,true);
    assert.deepEqual(device.buildAction(action.name,action.params).body,{action:action.name,params:{enabled}});
  }
  h.ui.destroy();
});

test('aggregation quota, physical port and second-page carrier details use normalized API values without writes',async()=>{
 const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/network-018/observed-state.json'),'utf8'));
 raw.aggregation.enabled=true;raw.aggregation.mode='SMULTIWAN';
 raw.net.nrca='0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;';
 const h=harness({}, {state:device.normalize(raw,{ethernetCarrier:1,ethernetSpeedMbps:1000})});
 await h.ui.refresh();assert.match(h.el.innerHTML,/剩余 10\.00 GB · 今日 100\.0 KB/);assert.match(h.el.innerHTML,/聚合已开启/);assert.match(h.el.innerHTML,/网口 · 已插网线/);
 await h.ui.navigate('network');assert.match(h.el.innerHTML,/当前主载波/);assert.match(h.el.innerHTML,/100\.0 MHz/);assert.match(h.el.innerHTML,/NR 1 路载波/);assert.match(h.el.innerHTML,/273 \/ 504990/);assert.match(h.el.innerHTML,/1000 Mbps/);assert.match(h.el.innerHTML,/不能单独说明外网是否可用/);
 assert.equal(h.mutations(),0);h.ui.destroy();
});
