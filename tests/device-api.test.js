'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const API = require('../src/device-api.js');

test('battery charge_status is distinct from charger presence and percentage',()=>{
 const cases=[
  [{percent:100,charging:1,charger_connect:1},'charging',true,'充电中'],
  [{percent:40,charging:4,charger_connect:1},'full',false,'已充满'],
  [{percent:80,charging:3,charger_connect:1},'plugged',false,'已插电 · 未充电'],
  [{percent:80,charging:2,charger_connect:1},'plugged',false,'已插电 · 电池供电'],
  [{percent:80,charging:2,charger_connect:0},'discharging',false,'电池供电'],
  [{percent:100,charger_connect:1},'plugged',null,'已插电 · 充电状态未知'],
  [{percent:100},'unknown',null,'充电状态未知'],
  [{charging:1,charger_connect:0},'unknown',null,'充电状态待确认'],
 ];
 for(const [battery,state,charging,label]of cases){const actual=API.normalize({battery}).battery;assert.equal(actual.state,state);assert.equal(actual.charging,charging);assert.equal(actual.stateLabel,label);assert.equal(actual.chargerConnected,battery.charger_connect==null?null:!!battery.charger_connect);}
 for(const battery of [{},{percent:null,charging:null},{percent:101,charging:5},{percent:'x',charging:'1x'}]){const b=API.normalize({battery}).battery;assert.equal(b.percent,null);assert.equal(b.chargeStatus,null);assert.equal(b.state,'unknown');}
 assert.equal(API.normalize({battery:{charging:0}}).battery.charging,null);
 assert.equal(API.normalize({battery:{percent:0,charging:'1',charger_connect:'1'}}).battery.charging,true);
});

const sample = {
  ts: 1792090111, datad: {version: '0.10.79'},
  modems: [
    {id: '5G', sim: {state: 'sim ready', slot: 1, iccid: 'private'}, net: {type: 'SA', operator: 'China Unicom', band: 'n78', nr_rsrp: -100, nr_pci: 0, nr_channel: 627264}, wwan: {status: 'ipv4_ipv6_connected'}, traffic: {rx_speed: 103939, tx_speed: 9688}, qos: {qci: 6, ambr_dl: '2000.000', ambr_ul: '200.000'}},
    {id: '4G1', sim: {state: ''}, wwan: {status: 'disconnected'}, traffic: {rx_speed: 0, tx_speed: 0}, qos: {qci: 0, ambr_dl: '', ambr_ul: ''}},
    {id: '4G2', sim: {state: ''}, wwan: {status: 'disconnected'}, traffic: {rx_speed: 0, tx_speed: 0}, qos: {qci: 0}},
  ],
  battery: {percent: 0, temp: 34, charger_connect: 0},
  system: {cpu_temp: 50, cpu_usage: 64, mem_avail: 1078415360, mem_total: 1668501504, mem_used_pct: 35},
  wlan: {enabled: 0, ssid: 'sample', bands: [{band: '5g', enabled: 0, enc: 'sae-mixed', ssid: 'sample'}]},
  clients: {wifi: 0}, aggregation: {enabled: false, online: false, mode: 'MULTIWAN'},
};

test('normalizes byte rates, QoS, zero values and unknown secondary SIMs without identifiers', () => {
  const n = API.normalize(sample);
  assert.equal(n.modems[0].connected, true);
  assert.equal(n.modems[0].rxBps, 103939);
  assert.equal(n.modems[0].operator, '中国联通');
  assert.equal(n.modems[0].qci, 6);
  assert.equal(n.modems[0].ambrDownMbps, 2000);
  assert.equal(n.modems[0].pci, 0);
  assert.equal(n.modems[1].statusLabel, '未联网');
  assert.equal(n.modems[1].qci, null);
  assert.equal(n.modems[1].ambrDownMbps, null);
  assert.equal(n.modems[1].rxBps, null);
  assert.equal(n.battery.percent, 0);
  assert.equal(n.battery.charging, false);
  assert.equal(n.wifi.enabled, false);
  assert.equal(n.wifi.clients, 0);
  assert.equal(n.aggregation.enabled, false);
  assert.equal(n.total.rxBps, null,'unknown external enable state makes the combined rate unavailable');
  assert.equal(n.cpu.usagePct, 64);
  assert.equal(JSON.stringify(n).includes('private'), false);
});

test('missing data stays unknown; valid zero is not conflated with unavailable', () => {
  const n = API.normalize({});
  assert.equal(n.cpu.usagePct, null);
  assert.equal(n.battery.percent, null);
  assert.equal(n.total.rxBps, null);
  assert.equal(n.modems[0].rxBps, null);
  assert.equal(n.modems[1].connected, null);
  assert.equal(n.modems[1].statusLabel, '状态未知');
  assert.equal(n.aggregation.supported, false);
  assert.deepEqual(API.formatRate(null), {value: '—', unit: 'B/s'});
  assert.deepEqual(API.formatRate(1000000), {value: '1.00', unit: 'MB/s'});
  assert.deepEqual(API.formatRate(0), {value: '0', unit: 'B/s'});
  assert.equal(API.normalize({runtime: {cpu_usage_tenths: 637}}).cpu.usagePct, 63.7);
});

test('reported radio types map to native display labels without replacing their raw values', () => {
  const cases = [
    ['5GA','5G-A'],['5G-A','5G-A'],['5g advanced','5G-A'],['5g_advanced','5G-A'],
    ['NSA','5G NSA'],['5g nsa','5G NSA'],['NR5G-NSA','5G NSA'],['endc','5G NSA'],
    ['SA','5G SA'],['5G_SA','5G SA'],['nr5g-sa','5G SA'],[' \tsa\r\n','5G SA'],
    ['5g','5G'],['NR','5G'],['nr5g','5G'],
    ['4g+','4G+'],['lte+','4G+'],['LTE_CA','4G+'],['lte-a','4G+'],['4G','4G'],['lte','4G'],
    ['3G','3G'],['WCDMA','3G'],['umts','3G'],['hspa','3G'],['HSDPA','3G'],['hsupa','3G'],
    ['hspa+','3G+'],['3g+','3G+'],['2G','2G'],['gsm','2G'],['GPRS','2G'],['edge','2G'],
    ['', '—'],[null,'—'],[undefined,'—'],['unknown','—'],['Only_5G','—'],['4G_AND_5G','—'],
    ['5G CA','—'],['SA+NSA','—'],['<img src=x onerror=alert(1)>','—'],['ſa','—'],['ＳＡ','—'],
    ['SA\u00a0','—'],['a'.repeat(64),'—'],[['SA'],'—'],[true,'—'],[{},'—']
  ];
  for (const [type,label] of cases) {
    const m=API.normalize({modems:[{id:'5G',sim:{state:'sim ready'},net:{type},wwan:{status:'connected'}}]}).modems[0];
    assert.equal(m.radioLabel,label,String(type));
    assert.equal(m.rat,type==null?null:String(type)||null,'raw rat remains compatible');
    assert.equal(m.reportedRat,m.rat,'explicit raw report remains separate from the label');
  }
});

test('each card hides cached radio and band for unusable or unconfirmed state but preserves ready disconnected reports', () => {
  // Expected radio visibility is independent from the data session label.
  const cases = [
    ['sim ready','off','connected','5G SA','已联网'],
    ['sim ready','off','disconnected','5G SA','未联网'],
    ['modem_init_complete','off','connecting','5G SA','连接中'],
    ['sim ready','off','','5G SA','状态未知'],
    ['sim undetected','off','disconnected','—','未插卡'],
    ['modem_sim_undetected','off','disconnected','—','未插卡'],
    ['wait pin','off','disconnected','—','待输入 PIN'],
    ['modem_waitpuk','off','disconnected','—','待输入 PUK'],
    ['modem_imsi_waitnck','off','disconnected','—','SIM 卡已锁'],
    ['sim error','off','disconnected','—','SIM 异常'],
    ['modem_sim_destroy','off','disconnected','—','SIM 异常'],
    ['','off','disconnected','—','未联网'],
    ['sim undetected','off','connected','—','状态冲突'],
    ['wait pin','off','connected','—','状态冲突'],
    ['sim error','off','connected','—','状态冲突'],
    ['sim ready','on','disconnected','—','未启用'],
    ['sim ready','on','connected','—','状态冲突'],
    ['sim ready',undefined,'connected','—','已联网'],
    ['sim ready',undefined,'disconnected','—','未联网']
  ];
  for (const id of ['5G','4G1','4G2']) for (const [state,flight,connection,label,status] of cases) {
    if(id==='5G'&&flight!=='off')continue; // Only external modems expose enable state.
    const raw={factory:{modems:{[id]:{flight}}},modems:[{id,sim:{state},net:{type:'sa',band:'n78'},wwan:{status:connection}}]};
    const m=API.normalize(raw).modems.find(m=>m.id===id),context=[id,state,flight,connection].join('/');
    assert.equal(m.radioLabel,label,context);assert.equal(m.statusLabel,status,context);
    assert.equal(m.band,label==='—'?null:'n78',context);
    assert.equal(m.reportedRat,'sa',context);assert.equal(m.rat,'sa',context);
  }
  const mixed=API.normalize({factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},modems:[
    {id:'4G2',sim:{state:'sim ready'},net:{type:'LTE',band:'B3'},wwan:{status:'disconnected'}},
    {id:'5G',sim:{state:'sim ready'},net:{type:'SA',band:'n78'},wwan:{status:'connected'}},
    {id:'4G1',sim:{state:'sim undetected'},net:{type:'5GA',band:'n1'},wwan:{status:'disconnected'}}
  ]});
  assert.deepEqual(mixed.modems.map(m=>[m.id,m.radioLabel,m.band]),[['5G','5G SA','n78'],['4G1','—',null],['4G2','4G','B3']]);
});

test('carrier aggregation and multi-modem aggregation never imply 5G-A', () => {
  for (const [type,label] of [['SA','5G SA'],['NR5G_NSA','5G NSA'],['LTE','4G'],['LTE_CA','4G+'],['5GA','5G-A']]) {
    const n=API.normalize({net:{nrca:'0,42,0,78,627264,100,0,-80,0,20,0;1,43,0,1,428000,20,0,-85,0,15,0'},
      aggregation:{enabled:true,online:true},factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},
      modems:['5G','4G1','4G2'].map(id=>({id,sim:{state:'sim ready'},net:{type},wwan:{status:'connected'}}))});
    assert.equal(n.carrierAggregation.nrCount,2);assert.equal(n.aggregation.online,true);
    assert.deepEqual(n.modems.map(m=>m.radioLabel),[label,label,label],type);
  }
});

test('primary carrier family accepts only normalized NR reports and rejects partial token matches', () => {
  for (const type of ['SA','sa','NSA','nsa','NR5G_SA','nr5g_nsa','ENDC','endc','5g']) {
    const state=API.normalize({net:{type,nr_band:'n78',band:'B3',nr_bw:100},modems:[{id:'5G',sim:{state:'sim ready'},wwan:{status:'connected'}}]});
    assert.deepEqual(state.carrierAggregation.primary,{radio:'nr',band:78,bandwidthMHz:100},type);
  }
  for (const type of ['LTE','lte','4g','lte_ca']) {
    const state=API.normalize({net:{type,nr_band:'n78',band:'B3',nr_bw:100},modems:[{id:'5G',sim:{state:'sim ready'},wwan:{status:'connected'}}]});
    assert.deepEqual(state.carrierAggregation.primary,{radio:'lte',band:3,bandwidthMHz:null},type);
  }
  for (const type of ['not-SA','UNKNOWN_5G','ENDSCA','NR-invalid','Only_5G','<b>SA</b>','WCDMA','3G','2G',null]) {
    const state=API.normalize({net:{type,nr_band:'n78',band:'B3',nr_bw:100,nrca:'0,42,0,78,627264,100,0,-80,0,20,0'},modems:[{id:'5G',sim:{state:'sim ready'},wwan:{status:'connected'}}]});
    assert.deepEqual(state.carrierAggregation.primary,{radio:null,band:null,bandwidthMHz:null},String(type));
    assert.equal(state.carrierAggregation.nrCount,1,'actual carrier records remain independently available');
  }
});

test('external live rates require a confirmed enabled modem without affecting primary rates', () => {
  for(const flight of ['off','on',undefined,'unknown']) {
    const state=API.normalize({factory:{modems:{'4G1':{flight},'4G2':{flight}}},modems:['5G','4G1','4G2'].map(id=>({id,sim:{state:'sim ready'},wwan:{status:'connected'},traffic:{rx_speed:0,tx_speed:125000}}))});
    assert.deepEqual([state.modems[0].rxBps,state.modems[0].txBps],[0,125000]);
    for(const modem of state.modems.slice(1))assert.deepEqual([modem.rxBps,modem.txBps],flight==='off'?[0,125000]:[null,null],modem.id+'/'+flight);
  }
});

test('per-card contract rates preserve Mbps and card identity, including ready disconnected cards', () => {
  const make = (id, dl, ul, qci) => ({id, sim:{state:'sim ready'}, wwan:{status:'disconnected'}, usb:{present:false}, qos:{ambr_dl:dl,ambr_ul:ul,qci,sampled_at:0}});
  const raw = {qos:{ambr_dl:'9999',ambr_ul:'999',qci:8}, factory:{modems:{'4G1':{flight:'off'},'4G2':{flight:'off'}}},
    modems:[make('4G2','150.125','75.500',9),make('5G','2000.000','200.000',6),make('4G1','100.000','50.000',7)]};
  const modems = API.normalize(raw).modems;
  assert.deepEqual(modems.map(m=>[m.id,m.ambrUpMbps,m.ambrDownMbps,m.qci]),[['5G',200,2000,6],['4G1',50,100,7],['4G2',75.5,150.125,9]]);
  assert.equal(modems[1].dataConnection,'disconnected');
  assert.equal(modems[1].availability,'unavailable','USB state does not invalidate a ready SIM bearer cache');
  delete raw.modems[0].qos;
  assert.equal(API.normalize(raw).modems[2].ambrDownMbps,null,'external card never falls back to primary QoS');
});

test('contract rates reject malformed or unavailable values independently for each direction', () => {
  const invalid = [undefined,null,'',' ',0,'0.000',-1,'-1',NaN,Infinity,'Infinity','NaN','200Mbps','0x20','+200','.5',' 200','200 ',true,[],[200],{}];
  for (const value of invalid) {
    const modem = API.normalize({modems:[{id:'5G',sim:{state:'sim ready'},qos:{ambr_dl:value,ambr_ul:'0.512',qci:6}}]}).modems[0];
    assert.equal(modem.ambrDownMbps,null,String(value));
    assert.equal(modem.ambrUpMbps,0.512,'missing downlink must not hide valid uplink');
  }
  for (const value of [6.5,0,256,'6x','6e0','6.0','+6',' 6','6 ',true,[6]]) {
    const modem = API.normalize({modems:[{id:'5G',sim:{state:'sim ready'},qos:{qci:value,ambr_dl:'100',ambr_ul:''}}]}).modems[0];
    assert.equal(modem.qci,null,String(value));assert.equal(modem.ambrDownMbps,100);assert.equal(modem.ambrUpMbps,null);
  }
});

test('unusable or unconfirmed cards never expose cached contract rates or QCI', () => {
  for (const [state,enabled,connection] of [
    ['sim ready',false,'disconnected'],['sim undetected',true,'disconnected'],['modem_sim_undetected',true,'disconnected'],
    ['wait pin',true,'disconnected'],['wait puk',true,'disconnected'],['sim lock',true,'disconnected'],
    ['sim error',true,'disconnected'],['sim destroy',true,'disconnected'],['',true,'disconnected'],
    ['sim undetected',true,'connected'],['sim ready',false,'connected'],['wait pin',true,'connected']
  ]) {
    const modem = API.normalize({factory:{modems:{'4G1':{flight:enabled?'off':'on'}}},modems:[{id:'4G1',sim:{state},wwan:{status:connection},qos:{qci:6,ambr_dl:'2000',ambr_ul:'200'}}]}).modems[1];
    assert.deepEqual([modem.qci,modem.ambrUpMbps,modem.ambrDownMbps],[null,null,null],[state,enabled,connection].join('/'));
  }
  const unknownEnable=API.normalize({modems:[{id:'4G1',sim:{state:'sim ready'},wwan:{status:'connected'},qos:{qci:6,ambr_dl:'2000',ambr_ul:'200'}}]}).modems[1];
  assert.equal(unknownEnable.enabled,null);assert.deepEqual([unknownEnable.qci,unknownEnable.ambrUpMbps,unknownEnable.ambrDownMbps],[null,null,null]);
});

test('separates SIM presence, locking, data session and USB availability without assuming disabled', () => {
  const n=API.normalize({...sample,interfaces:{cellular:{enable:0,connect_status:'ipv4_ipv6_connected',roam_enable:0}},sim:{state:'sim ready',modem_state:'modem_init_complete',dual_sim:0},modems:[sample.modems[0],{...sample.modems[1],sim:{state:'',slot:0},usb:{present:false},subid:5},sample.modems[2]]});
  assert.equal(n.modems[0].enabled,null);assert.equal(n.modems[0].dataConnection,'connected');assert.equal(n.modems[0].cardPresence,'present');assert.equal(n.modems[0].roamingAllowed,false);
  assert.equal(n.modems[1].cardPresence,'unknown');assert.equal(n.modems[1].enabled,null);assert.equal(n.modems[1].availability,'unavailable');assert.equal(n.modems[1].simSlot,null);assert.equal(n.modems[1].reportedSlot,0);
  for(const [state,presence,lock,code]of [['sim undetected','absent','unknown','no_sim'],['modem_sim_undetected','absent','unknown','no_sim'],['wait pin','present','pin','locked'],['modem_waitpuk','present','puk','locked'],['modem_imsi_waitnck','present','network','locked'],['sim error','unknown','unknown','sim_error']]){
    const m=API.normalize({modems:[{id:'4G1',sim:{state,slot:0},wwan:{status:'disconnected'},traffic:{rx_speed:0,tx_speed:0}}]}).modems[1];
    assert.equal(m.cardPresence,presence,state);assert.equal(m.lockState,lock,state);assert.equal(m.statusCode,code,state);assert.equal(m.rxBps,null,state);
  }
  const conflict=API.normalize({modems:[{...sample.modems[0],sim:{state:'sim undetected'}}]}).modems[0];
  assert.equal(conflict.statusCode,'conflict');assert.equal(conflict.connected,null);assert.equal(conflict.dataConnection,'conflict');assert.equal(conflict.rxBps,null);assert.equal(conflict.serving.nr.available,false);
  const connecting=API.normalize({modems:[{id:'5G',wwan:{status:'connecting'}}]}).modems[0];assert.equal(connecting.connected,null);assert.equal(connecting.dataConnection,'connecting');
});

test('primary cellular controls cannot silently target an external modem or overwrite unrelated fields', () => {
  assert.deepEqual(API.buildAction('cellular.set',{modem:'5G',roaming:1}).body,{action:'cellular.set',params:{roaming:1}});
  assert.deepEqual(API.buildAction('cellular.disconnect',{modem:'5G'}).body,{action:'cellular.disconnect',params:{}});
  assert.deepEqual(API.buildAction('sim.set_slot',{modem:'5G',slot:2}).body,{action:'sim.set_slot',params:{slot:2}});
  for(const name of ['cellular.connect','cellular.disconnect','cellular.set','sim.set_slot','traffic.set_limit','network.set_mode','cell.unlock_all'])assert.throws(()=>API.buildAction(name,{modem:'4G1',roaming:1,enabled:1,slot:2}),{code:'UNSUPPORTED'});
  assert.throws(()=>API.buildAction('cellular.connect',{modem:'5G',subid:5}),{code:'UNSUPPORTED'});
  assert.throws(()=>API.buildAction('sim.set_slot',{slot:0}),{code:'INVALID_PARAMETER'});
  assert.throws(()=>API.buildAction('traffic.set_limit',{enabled:1,value:'0',type:2}),{code:'INVALID_PARAMETER'});
  assert.deepEqual(API.buildAction('traffic.set_limit',{enabled:1,value:'1073741824',type:2,ratio:90}).body.params,{enabled:1,value:'1073741824',type:2,ratio:90});
});

test('APN targets are vendor namespaces and preserve omitted credentials', async () => {
  assert.deepEqual(API.buildAction('apn.modify',{modem:'4G1',profileId:'profile-1',name:'Name',apn:'internet'}).body,{action:'apn.modify',params:{slot_id:201,profile_id:'profile-1',name:'Name',apn:'internet'}});
  assert.deepEqual(API.buildAction('apn.set_mode',{modem:'4G2',mode:0}).body,{action:'apn.set_mode',params:{slot_id:101,mode:0}});
  assert.equal(API.buildAction('apn.modify',{modem:'5G',profileId:'p',name:'n',apn:'a',password:''}).body.params.password,'');
  for(const name of ['apn.add','apn.delete'])assert.throws(()=>API.buildAction(name,{modem:'4G2'}),{code:'UNSUPPORTED'});
  assert.throws(()=>API.buildAction('apn.modify',{modem:'4G1',profileId:'p'}),{code:'INVALID_PARAMETER'});
  assert.throws(()=>API.buildAction('apn.enable',{modem:'201',profileId:'p'}),{code:'INVALID_PARAMETER'});
  const requests=[],api=API.create({mode:'readonly',transport:async d=>{requests.push(d);return {success:true,data:{apn_mode:{apn_mode:1},single_profile:true,enabled_id:{profileId:'p'},manu_apn_list:{apnListArray:[{profileId:'p',profilename:'n',wanapn:'a',username:'private',password:'secret',pdpType:3,pppAuthMode:0}]}}};}});
  const result=await api.readApn('4G1');assert.equal(requests[0].path,'/api/apn/all?slotId=201');assert.equal(requests[0].method,'GET');assert.equal(result.mode,1);assert.equal(result.singleProfile,true);assert.equal(JSON.stringify(result).includes('secret'),false);assert.equal(JSON.stringify(result).includes('private'),false);
  await assert.rejects(()=>api.execute('apn.set_mode',{modem:'4G1',mode:0},{confirmed:true}),{code:'READ_ONLY'});assert.equal(requests.length,1);
  const mock=API.create({mode:'mock'});await mock.execute('apn.modify',{modem:'4G1',profileId:'demo',name:'演示修改',apn:'new'});assert.equal((await mock.readApn('4G1')).manual[0].apn,'new');assert.equal((await mock.readApn('4G2')).manual[0].apn,'internet');
  const writes=[],bridge=API.createUfiTransport({request:async(path,options)=>{writes.push({path,options});return {ok:true};}});await bridge(API.buildAction('apn.modify',{modem:'4G1',profileId:'p',name:'n',apn:'a'}));assert.equal(writes[0].path,'/datad/hardware');assert.equal(writes[0].options.body.params.slot_id,201);
});

test('downloaded exact-version snapshot can be normalized without network calls', {skip: !fs.existsSync(path.join(__dirname, '../analysis/evidence/datad-state-second.txt')) && 'Private historical device snapshot intentionally not distributed'}, () => {
  const file = path.join(__dirname, '../analysis/evidence/datad-state-second.txt');
  if (!fs.existsSync(file)) return;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').split('STDERR:')[0].trim());
  const n = API.normalize(raw);
  assert.equal(n.version, '0.10.79');
  assert.deepEqual(n.modems.map(m => m.id), ['5G', '4G1', '4G2']);
  assert.equal(n.modems[0].rxBps, raw.modems.find(m => m.id === '5G').traffic.rx_speed);
  assert.equal(n.battery.tempC, raw.battery.temp);
  assert.equal(n.cpu.tempC, raw.thermal.cpu_celsius);
  assert.equal(n.modems[1].statusLabel, '未联网');
});

test('APN protocol enums follow the vendor contract and unreadable targets never become writable', async () => {
  const full={apn_mode:{apn_mode:1},auto_apn_list:{apnListArray:[]},manu_apn_list:{apnListArray:[]},enabled_id:{profileId:''}};
  assert.equal(API.normalizeApn(full,'4G1').writable,true);
  assert.equal(API.normalizeApn({apn_mode:{apn_mode:1}},'4G1').readable,true);
  assert.equal(API.normalizeApn({apn_mode:{apn_mode:1}},'4G1').writable,false);
  const panel={config:{writable:false,mode:0,enabled_id:'',automatic:[],manual:[]}};
  assert.equal(API.normalizeApn(panel,'4G2').writable,false);
  for(const pdpType of [1,2,3])assert.equal(API.buildAction('apn.modify',{modem:'5G',profileId:'p',name:'n',apn:'a',pdpType}).body.params.pdp_type,pdpType);
  assert.throws(()=>API.buildAction('apn.modify',{modem:'5G',profileId:'p',name:'n',apn:'a',pdpType:0}),{code:'INVALID_PARAMETER'});
  const calls=[],api=API.create({mode:'live',allowWrites:true,transport:async d=>{calls.push(d);return panel;}});
  await assert.rejects(()=>api.execute('apn.set_mode',{modem:'4G2',mode:1},{confirmed:true}),{code:'APN_READ_ONLY'});
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/apn/all?slotId=101');assert.equal(calls[0].writesDevice,false);
});

test('factory supplement distinguishes disabled cards from absence and expires through a single cached read', async () => {
  const factory=API.normalizeFactoryState({'4G1':'on','4G2':'off'}),n=API.normalize(sample,{factory});
  assert.equal(n.modems[1].enabled,false);assert.equal(n.modems[1].statusLabel,'未启用');assert.equal(n.modems[1].cardPresence,'unknown');assert.equal(n.modems[1].rxBps,null);
  assert.equal(n.modems[2].enabled,true);assert.equal(n.modems[2].cardPresence,'unknown');assert.equal(n.modems[2].capabilities.modemEnable,true);
  assert.equal(n.total.rxBps,sample.modems[0].traffic.rx_speed,'explicitly disabled card contributes zero, not unknown');
  const absent=API.normalize({modems:[sample.modems[0],{id:'4G1',sim:{state:'sim undetected'}},{id:'4G2',sim:{state:'sim undetected'}}]});assert.equal(absent.total.rxBps,sample.modems[0].traffic.rx_speed);
  const missing=API.normalize({modems:[sample.modems[0],{id:'4G1',sim:{state:'sim undetected'}}]});assert.equal(missing.total.rxBps,null);
  assert.equal(API.normalizeFactoryState({'4G1':'false'}).modems['4G1'].enabled,null);
  const conflicting=API.normalize({modems:[{...sample.modems[0],id:'4G1'}]},{factory}).modems[1];assert.equal(conflicting.statusCode,'conflict');assert.equal(conflicting.rxBps,null);
  let now=1000,calls=0,fail=false;const api=API.create({now:()=>now,transport:async d=>{assert.equal(d.writesDevice,false);calls++;if(fail)throw Error('offline');return {'4G1':'on','4G2':'on'};}});
  await Promise.all([api.readFactoryState(),api.readFactoryState()]);assert.equal(calls,1);
  now+=9999;await api.readFactoryState();assert.equal(calls,1);
  now+=1;fail=true;assert.equal((await api.readFactoryState()).modems['4G1'].enabled,null);assert.equal(calls,2);
});

test('factory bridge permits only exact vendor reads and confirmed targeted writes with readback', async () => {
  const commands=[],bridges={runShellWithRoot:async command=>{commands.push(command);return {success:true,content:'TOPFLOW_FACTORY_V1={"4G1":"off","4G2":"on"}\n'};}};
  const bridge=API.createUfiTransport(bridges),read={method:'GET',kind:'factory',operation:'read',writesDevice:false};
  assert.deepEqual(await bridge(read),{'4G1':'off','4G2':'on'});assert.equal(commands.length,1);
  assert.equal(commands[0].includes('uci -q get zwrt_zte_mc.mc_status.V3E2_lpr_flight_status'),true);assert.equal(/device_tsp_lpr_flight_mode_set|set_device_info|uci (set|commit)|touch |mkdir/.test(commands[0]),false);
  const action=API.buildAction('factory.modem.enabled',{modem:'4G1',enabled:true});
  await assert.rejects(()=>bridge(action),{code:'READ_ONLY'});assert.equal(commands.length,1);
  assert.throws(()=>API.buildAction('factory.modem.enabled',{modem:'5G',enabled:true}),{code:'UNSUPPORTED'});
  assert.throws(()=>API.buildAction('factory.modem.enabled',{modem:'4G1; touch /tmp/x',enabled:true}),{code:'UNSUPPORTED'});
  const live=API.create({mode:'live',allowWrites:true,transport:API.createUfiTransport(bridges,{allowWrites:true})});
  await assert.rejects(()=>live.execute(action.name,{modem:'4G1',enabled:true}),{code:'CONFIRM_REQUIRED'});
  const result=await live.execute(action.name,{modem:'4G1',enabled:true},{confirmed:true});assert.equal(result.result.verified,true);
  assert.equal(commands.length,2);assert.equal((commands[1].match(/device_tsp_lpr_flight_mode_set/g)||[]).length,1);
  assert.equal(commands[1].includes('"moduleName":"zte_topsw_devui","action":"off","parameter":"V3E2"'),true);
  await assert.rejects(()=>live.execute(action.name,{modem:'4G2',enabled:true},{confirmed:true}),{code:'UNCONFIRMED'});
  assert.equal(commands.length,3);
});

test('factory work and boot settings use fixed original interfaces and refuse unknown readback', async () => {
  const commands=[],bridge=API.createUfiTransport({runShellWithRoot:async command=>{commands.push(command);return {success:true,content:'TOPFLOW_FACTORY_V1={"settings":{"qosMode":"Game_mode","quickBoot":"1","powerSaver":""}}'};}},{allowWrites:true});
  assert.equal(API.normalizeFactoryState({settings:{quickBoot:'0',powerSaver:'',qosMode:'turbo'}}).settings.powerSaver,null);
  assert.equal(API.normalizeFactoryState({settings:{quickBoot:'0'}}).settings.quickBoot,false);
  await bridge(API.buildAction('factory.qos.set',{mode:'Game_mode'}));
  assert.match(commands[0],/zwrt_smart_mng\.api zte_smart_mng_set_qos_mode '\{"qos_mode":"Game_mode","source_module":"zte_topsw_devui"\}'/);
  await bridge(API.buildAction('factory.quick_boot.set',{enabled:true}));
  assert.match(commands[1],/set_device_info '\{"moduleName":"zte_topsw_devui","deviceInfoList":\{"quicken_power_on":"1"\}\}'/);
  assert.throws(()=>API.buildAction('factory.qos.set',{mode:"Game_mode'; touch /tmp/file"}),{code:'INVALID_PARAMETER'});
  await assert.rejects(()=>bridge(API.buildAction('factory.power_saver.set',{enabled:false})),{code:'UNCONFIRMED'});
  assert.match(commands[2],/case "\$tf_current" in 0\|1\)/,'missing vendor value refuses before mutation in the fixed shell');
});

test('guest, client, traffic and power actions keep vendor types and sparse target semantics', async () => {
  assert.deepEqual(API.buildAction('wifi.guest.set',{bands:{'2g':true},activeTime:120,managementAccess:false}).body.params,{bands:{'2g':true},active_time:120,management_access:false});
  assert.throws(()=>API.buildAction('wifi.guest.set',{bands:{main_2g:true}}),{code:'INVALID_PARAMETER'});
  assert.throws(()=>API.buildAction('wifi.guest.set',{activeTime:1}),{code:'INVALID_PARAMETER'});
  assert.equal(API.buildAction('client.block',{mac:'AA:BB:CC:DD:EE:FF'}).body.params.mac,'aa:bb:cc:dd:ee:ff');
  assert.throws(()=>API.buildAction('client.unblock',{mac:'invalid'}),{code:'INVALID_PARAMETER'});
  assert.deepEqual(API.buildAction('traffic.set_clear_day',{day:31,enabled:0}).body.params,{day:31,enabled:0});
  assert.equal(API.buildAction('traffic.calibrate',{value:'0'}).body.params.value,'0');
  assert.throws(()=>API.buildAction('traffic.calibrate',{modem:'4G2',value:'10'}),{code:'UNSUPPORTED'});
  assert.throws(()=>API.buildAction('traffic.calibrate',{value:'109951162777601'}),{code:'INVALID_PARAMETER'});
  assert.deepEqual(API.buildAction('power.direct_supply.set',{enabled:true}).body.params,{enabled:true});
  assert.equal(API.buildAction('sleep.set',{seconds:300}).body.params.seconds,'300','control.rs mapped_call requires a string');
  assert.throws(()=>API.buildAction('sleep.set',{seconds:60}),{code:'INVALID_PARAMETER'});
  const mock=API.create({mode:'mock',snapshot:{clients:{list:[{mac:'aa:bb:cc:dd:ee:ff',name:'Local'}],blocked:[],acl_mode:'deny'},power:{direct_supply:{supported:true,enabled:false}},sleep:{supported:true,minutes:-1}},wifi:{aps:[{section:'main_2g',band:'2g',enabled:false},{section:'guest_2g',band:'2g',enabled:false}]}});
  await mock.execute('wifi.guest.set',{bands:{'2g':true}});assert.equal((await mock.readWifi()).aps[0].enabled,false);assert.equal((await mock.readWifi()).aps[1].enabled,true);
  await mock.execute('client.block',{mac:'aa:bb:cc:dd:ee:ff'});await mock.execute('client.rename',{mac:'aa:bb:cc:dd:ee:ff',hostname:'Renamed'});assert.equal((await mock.readClients()).blocked.length,1);
  await mock.execute('power.direct_supply.set',{enabled:true});assert.equal((await mock.readPower()).directSupply.enabled,true);
  await mock.execute('sleep.set',{seconds:300});assert.equal((await mock.readPower()).sleep.minutes,5);
  await mock.execute('traffic.set_clear_day',{day:15,enabled:1});assert.equal((await mock.readTraffic()).clearDay.day,15);
  const calls=[],live=API.create({mode:'live',allowWrites:true,transport:async d=>{calls.push(d);return d.writesDevice?{ok:true,result:{verified:true}}:{power:{direct_supply:{supported:true,enabled:true,mode:'enable'}}};}});
  const result=await live.execute('power.direct_supply.set',{enabled:true},{confirmed:true});assert.equal(calls.length,2);assert.equal(calls[1].writesDevice,false);assert.equal(result.verified,true);assert.equal(result.readback.directSupply.enabled,true);
});

const coolingSample = {cooling:{
  fan:{always_on:false,enabled:false,mode:'custom',pwm:30,speed_percent:12,temperature_celsius:47,thermal_enabled:true,policy:{applied:true,error:''}},
  liquid:{always_on:false,enabled:true,active:false,driver_playing:false,mode:'automatic',thermal_enabled:true},vendor_sync_error:null,
}};

test('cooling normalization preserves always-on independently from legacy enabled and instantaneous activity', () => {
  const cooling=API.normalizeCooling(coolingSample);
  assert.equal(cooling.supported,true);assert.equal(cooling.source,'datad');
  assert.equal(cooling.fan.alwaysOn,false);assert.equal(cooling.fan.speedPct,12);assert.equal(cooling.fan.pwm,30);assert.equal(cooling.fan.tempC,47);
  assert.equal(cooling.liquid.alwaysOn,false);assert.equal(cooling.liquid.active,false);assert.equal(cooling.liquid.thermalEnabled,true);
  assert.deepEqual(API.normalize(coolingSample).cooling,cooling);
  const absent=API.normalizeCooling({});assert.equal(absent.supported,false);assert.equal(absent.fan.alwaysOn,null);
  const incomplete=API.normalizeCooling({cooling:{fan:{enabled:true,pwm:999,temperature_celsius:999},liquid:{enabled:true,active:true}}});
  assert.equal(incomplete.fan.alwaysOn,null);assert.equal(incomplete.liquid.alwaysOn,null);assert.equal(incomplete.fan.pwm,null);assert.equal(incomplete.fan.tempC,null);
});

test('cooling actions are exact boolean policies; readonly and unconfirmed control issue zero requests', async () => {
  const requests=[],transport=async descriptor=>{requests.push(descriptor);return coolingSample;};
  for(const target of ['fan','liquid']) {
    const action=API.buildAction('cooling.'+target+'.set_enabled',{enabled:false});
    assert.equal(action.path,'/api/datad/hardware');assert.deepEqual(action.body,{action:'cooling.'+target+'.set_enabled',params:{enabled:false}});
    assert.throws(()=>API.buildAction(action.name,{enabled:0}),{code:'INVALID_PARAMETER'});
    await assert.rejects(()=>API.create({transport}).execute(action.name,{enabled:true},{confirmed:true}),{code:'READ_ONLY'});
    await assert.rejects(()=>API.create({mode:'live',allowWrites:true,transport}).execute(action.name,{enabled:true}),{code:'CONFIRM_REQUIRED'});
  }
  assert.equal(requests.length,0);
  const value=await API.create({transport}).readCooling();assert.equal(value.fan.mode,'custom');
  assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');assert.equal(requests[0].query.cmd,'cooling');assert.equal(requests[0].writesDevice,false);
  const noCapability=API.create({mode:'live',allowWrites:true,transport:async d=>{assert.equal(d.writesDevice,false);return {};}});
  await assert.rejects(()=>noCapability.execute('cooling.fan.set_enabled',{enabled:true},{confirmed:true}),{code:'UNSUPPORTED'});
});

test('cooling mock changes only local policies and returns to the documented thermal strategies', async () => {
  const mock=API.create({mode:'mock',snapshot:coolingSample,transport:()=>{throw new Error('mock must never use transport');}});
  const on=await mock.execute('cooling.fan.set_enabled',{enabled:true});assert.equal(on.demo,true);assert.equal(on.verified,false);assert.equal(on.readback.fan.mode,'always_on');
  await mock.execute('cooling.fan.set_enabled',{enabled:false});assert.equal((await mock.readCooling()).fan.mode,'custom');
  await mock.execute('cooling.liquid.set_enabled',{enabled:true});assert.equal((await mock.readCooling()).liquid.mode,'high');
  await mock.execute('cooling.liquid.set_enabled',{enabled:false});assert.equal((await mock.readCooling()).liquid.mode,'automatic');
  assert.equal(coolingSample.cooling.liquid.always_on,false,'source fixture is not mutated');
});

test('cooling live writes once and waits for matching independent policy readback', async () => {
  for(const target of ['fan','liquid'])for(const enabled of [true,false]) {
    const calls=[],sleeps=[];let wrote=false,readsAfterWrite=0;
    const api=API.create({mode:'live',allowWrites:true,sleep:async ms=>sleeps.push(ms),transport:async descriptor=>{
      calls.push(descriptor);
      if(descriptor.writesDevice){wrote=true;return {success:true};}
      const raw=structuredClone(coolingSample);
      if(wrote&&++readsAfterWrite>1){raw.cooling[target].always_on=enabled;raw.cooling[target].mode=target==='fan'?(enabled?'always_on':'custom'):(enabled?'high':'automatic');raw.cooling[target].driver_playing=enabled;}
      else if(wrote){raw.cooling[target].always_on=!enabled;}
      return raw;
    }});
    const result=await api.execute('cooling.'+target+'.set_enabled',{enabled},{confirmed:true});
    assert.equal(result.verified,true);assert.equal(result.verification,'configured-policy');assert.equal(result.readback[target].alwaysOn,enabled);
    assert.equal(calls.filter(d=>d.writesDevice).length,1);assert.equal(calls.filter(d=>!d.writesDevice).length,3);assert.deepEqual(sleeps,[1000]);
  }
});

test('cooling stale cache, hardware policy failure and stopped liquid waveform never report verified success', async () => {
  for(const failure of ['stale','policy','driver','vendor']) {
    let writes=0,reads=0;const api=API.create({mode:'live',allowWrites:true,sleep:async()=>{},transport:async descriptor=>{
      if(descriptor.writesDevice){writes++;return {ok:true};}
      reads++;const raw=structuredClone(coolingSample);
      if(writes&&failure!=='stale') {
        raw.cooling.fan.always_on=true;raw.cooling.fan.mode='always_on';raw.cooling.liquid.always_on=true;raw.cooling.liquid.mode='high';
        if(failure==='policy'){raw.cooling.fan.policy={applied:false,error:'PWM readback mismatch'};}
        if(failure==='vendor')raw.cooling.vendor_sync_error='commit failed';
      }
      return raw;
    }});
    await assert.rejects(()=>api.execute('cooling.'+(failure==='driver'?'liquid':'fan')+'.set_enabled',{enabled:true},{confirmed:true}),{code:'UNCONFIRMED',requiresReadback:true});
    assert.equal(writes,1);assert.equal(reads,7,'one preflight and six bounded rereads across the maximum 5s cache interval');
  }
});

test('builds exact UFI aggregation and cell payloads, rejects unsupported modem selection', () => {
  const agg = API.buildAction('aggregation.set', {enabled: true});
  assert.equal(agg.path, '/api/datad/hardware');
  assert.deepEqual(agg.body, {action: 'aggregation.set', params: {enabled: true}});
  assert.deepEqual(API.buildAction('cell.lock_nr', {pci: 0, arfcn: 627264, band: 78}).body,
    {goformId: 'CELL_LOCK', rat: '16', pci: '0', earfcn: '627264', band: '78'});
  assert.deepEqual(API.buildAction('cell.lock_lte', {pci: 194, earfcn: 1650}).body,
    {goformId: 'CELL_LOCK', rat: '12', pci: '194', earfcn: '1650'});
  assert.throws(() => API.buildAction('aggregation.set', {enabled: 'false'}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('cell.lock_nr', {modem: '4G1', pci: 2, arfcn: 1, band: 78}), {code: 'UNSUPPORTED'});
  assert.throws(() => API.buildAction('cell.lock_lte', {pci: 504, earfcn: 1650}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('screen.restore'), {code: 'NOT_VERIFIED'});
});

test('Wi-Fi edits encode passwords and omit unedited fields', () => {
  const req = API.buildAction('wifi.configure', {section: 'main_5g', ssid: 'TopFlow', encryption: 'sae-mixed', key: 'test-pass', hidden: false});
  assert.equal(req.body.goformId, 'setAccessPointInfo');
  assert.equal(req.body.ChipIndex, 1);
  assert.equal(req.body.Password, Buffer.from('test-pass').toString('base64'));
  assert.equal(req.body.ApBroadcastDisabled, '0');
  assert.equal('ApIsolate' in req.body, false);
  assert.throws(() => API.buildAction('wifi.configure', {section: 'main_6g', ssid: 'x'}), {code: 'UNSUPPORTED'});
  assert.throws(() => API.buildAction('wifi.configure', {section: 'main_5g', ssid: '中'.repeat(11)}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('wifi.configure', {section: 'main_5g', key: '123'}), {code: 'INVALID_PARAMETER'});
});

test('SMS UTF-16 encoding preserves Chinese and surrogate pairs and restricts sender', () => {
  const req = API.buildAction('sms.send', {number: '+8613800000000', content: '你好😀', sender: '5G'});
  assert.equal(req.body.MessageBody, '4f60597dd83dde00');
  assert.equal(req.body.sms_sender, '5g');
  assert.equal(req.effects.includes('send-sms'), true);
  assert.throws(() => API.buildAction('sms.send', {number: '10010', content: 'a', sender: '4G1'}), {code: 'UNSUPPORTED'});
  const list = API.normalizeMessages({messages: [{id: 1, number: '10010', tag: '1', content: Buffer.from('中文短信').toString('base64'), date: '2026,10,16,10,30,00,+8'}]});
  assert.equal(list[0].text, '中文短信');
  assert.equal(list[0].unread, true);
  assert.deepEqual(API.normalizeMessages(undefined), []);
});

test('read-only gate prevents all write transports, including a caller-supplied transport', async () => {
  let calls = 0;
  const api = API.create({transport: async () => {calls++; return {success: true};}});
  await assert.rejects(api.execute('aggregation.set', {enabled: true}, {confirmed: true}), {code: 'READ_ONLY'});
  await assert.rejects(api.execute('sms.send', {number: '10010', content: 'a'}, {confirmed: true, allowExternalEffects: true}), {code: 'READ_ONLY'});
  assert.equal(calls, 0);
});

test('reading SMS / Wi-Fi / forward configuration issues only observed GET requests', async () => {
  const requests = [];
  const api = API.create({transport: async req => {
    requests.push(req);
    if (req.path.endsWith('sms_forward_method')) return {sms_forward_method: 'SMTP'};
    if (req.path.endsWith('sms_forward_enabled')) return {enabled: '0'};
    if (req.path.endsWith('sms_forward_mail')) return {smtp_host: 'smtp.example.test'};
    if (req.query.cmd === 'sms_data_total') return {messages: []};
    return {};
  }});
  await api.readMessages(); await api.readWifi(); await api.readForward();
  assert.equal(requests.every(req => req.method === 'GET' && req.writesDevice === false), true);
  assert.equal(requests.some(req => req.path.includes('restore')), false);
  assert.equal(requests.some(req => req.body), false);
});

test('explicit live mode still requires confirmation and separately confirms external effects', async () => {
  let calls = 0;
  const api = API.create({mode: 'live', allowWrites: true, transport: async () => {calls++; return {result: 'success'};}});
  await assert.rejects(api.execute('sms.send', {number: '10010', content: 'x'}), {code: 'CONFIRM_REQUIRED'});
  await assert.rejects(api.execute('sms.send', {number: '10010', content: 'x'}, {confirmed: true}), {code: 'EXTERNAL_CONFIRM_REQUIRED'});
  assert.equal(calls, 0);
  const result = await api.execute('sms.send', {number: '10010', content: 'x'}, {confirmed: true, allowExternalEffects: true});
  assert.equal(calls, 1);
  assert.equal(result.verified, false);
});

test('mock actions are local, change readable state, and cannot mutate supplied input', async () => {
  const input = structuredClone(sample);
  const mock = API.create({mode: 'mock', snapshot: input, transport: () => {throw Error('network must never run');}});
  await mock.execute('aggregation.set', {enabled: true});
  assert.equal((await mock.readState()).aggregation.enabled, true);
  assert.equal(input.aggregation.enabled, false);
  await mock.execute('cell.lock_nr', {pci: 194, arfcn: 627264, band: 78});
  assert.equal((await mock.readState()).locks.nr, '194,627264,78');
  await mock.execute('cell.unlock_all', {});
  assert.equal((await mock.readState()).locks.nr, '');
  await mock.execute('wifi.configure', {section: 'main_5g', ssid: 'Local Preview'});
  assert.equal((await mock.readWifi()).aps[1].ssid, 'Local Preview');
  await mock.execute('sms.send', {number: '10010', content: '纯本地演示'});
  assert.equal((await mock.readMessages())[0].demo, true);
  await mock.execute('sms.forward.configure', {method: 'sms', to: '10010'});
  await mock.execute('sms.forward.enabled', {enabled: true});
  assert.equal((await mock.readForward()).enabled, true);
});

test('forward saves follow documented ports and conditional saved-password semantics', () => {
  const smtp = {method: 'smtp', host: 'smtp.example.test', port: 465, username: 'user', to: 'user@example.test', password: 'fixture-password'};
  const req = API.buildAction('sms.forward.configure', smtp);
  assert.equal(req.path, '/api/sms_forward_mail');
  assert.equal(req.body.smtp_password, 'fixture-password');
  assert.equal(req.effects.includes('send-test-message'), true);
  for (const port of [25, 465, 587, 2525, 65535]) assert.equal(API.buildAction('sms.forward.configure', {...smtp, port}).body.smtp_port, String(port));
  assert.equal(API.buildAction('sms.forward.configure', {...smtp, port: undefined}).body.smtp_port, '465');
  for (const port of [0, -1, 65536, 1.5]) assert.throws(() => API.buildAction('sms.forward.configure', {...smtp, port}), {code: 'INVALID_PARAMETER'});
  for (const password of [undefined, '', '   ']) assert.throws(() => API.buildAction('sms.forward.configure', {...smtp, password}), {code: 'INVALID_PARAMETER'});
  const retain = API.buildAction('sms.forward.configure', {...smtp, password: '', passwordSaved: true});
  assert.equal(retain.body.smtp_password, '');
  assert.equal('passwordSaved' in retain.body, false);
  assert.throws(() => API.buildAction('sms.forward.configure', {...smtp, password: '', passwordSaved: 'true'}), {code: 'INVALID_PARAMETER'});
  const dingtalk = {method: 'dingtalk', webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=fixture'};
  assert.equal(API.buildAction('sms.forward.configure', dingtalk).body.secret, '');
  assert.equal(API.buildAction('sms.forward.configure', {...dingtalk, secret: ' fixture-signature '}).body.secret, 'fixture-signature');
});

test('documented forwarding accepts newline targets and requires the SMS body CURL placeholder', () => {
  const sms = API.buildAction('sms.forward.configure', {method: 'sms', to: ' 10010\r\n+8613800000000\n', forwardDeviceInfo: true});
  assert.deepEqual(sms.body, {sms_to_phone: '10010\n+8613800000000', forward_dev_info: '1'});
  for (const to of ['', '10010,10086', '10010\nnot-a-number']) assert.throws(() => API.buildAction('sms.forward.configure', {method: 'sms', to}), {code: 'INVALID_PARAMETER'});
  const curlText = 'curl -d "{{sms-body}}" https://notify.example.test/';
  assert.equal(API.buildAction('sms.forward.configure', {method: 'curl', curlText}).body.curl_text, curlText);
  assert.throws(() => API.buildAction('sms.forward.configure', {method: 'curl', curlText: 'curl https://notify.example.test/'}), {code: 'INVALID_PARAMETER'});
});

test('saved-but-test-failed forwarding responses preserve saved state without automatic retries', async () => {
  let calls = 0;
  const api = API.create({mode: 'live', allowWrites: true, transport: async () => {calls++; return {result: 'failed', saved: true, error_code: 'sms_forward_test_deferred', error: 'temporarily unavailable'};}});
  await assert.rejects(api.execute('sms.forward.configure', {method: 'sms', to: '10010'}, {confirmed: true, allowExternalEffects: true}), error => {
    assert.equal(error.code, 'sms_forward_test_deferred');
    assert.equal(error.saved, true);
    assert.equal(error.requiresReadback, true);
    assert.match(error.message, /配置已保存/);
    return true;
  });
  assert.equal(calls, 1);
});

test('device errors and ambiguous success remain failures with no retry', async () => {
  let calls = 0;
  const api = API.create({mode: 'live', allowWrites: true, transport: async () => {calls++; return {};}});
  await assert.rejects(api.execute('aggregation.set', {enabled: true}, {confirmed: true}), {code: 'UNCONFIRMED'});
  assert.equal(calls, 1);
});

test('SMS submission requires the vendor result and never retries transport-only acknowledgements',async()=>{
  const responses=[{success:true},{ok:true},{result:0},{result:'success',error:0},{result:'success',error:false},{result:'success',error:{}},{result:'success',error:'failed'}];
  for(const response of responses){
    let calls=0;const api=API.create({mode:'live',allowWrites:true,transport:async()=>{calls++;return response;}});
    await assert.rejects(api.execute('sms.send',{number:'10010',content:'local test'},{confirmed:true,allowExternalEffects:true}));
    assert.equal(calls,1,'an ambiguous send must never trigger retry or fallback');
  }
  for(const response of [{result:'success'},{result:'success',error:''},{result:'success',error:null}]){
    let calls=0;const api=API.create({mode:'live',allowWrites:true,transport:async()=>{calls++;return response;}});
    await api.execute('sms.send',{number:'10010',content:'local test'},{confirmed:true,allowExternalEffects:true});assert.equal(calls,1);
  }
});

test('physical SIM source uses exact raw fields and never provision slots or normalized defaults',()=>{
  for(const [modem,key] of [['5G','st_slot'],['4G1','v3t_2_st_slot'],['4G2','v3t_1_st_slot']]){
    for(const [value,source,label]of [[0,0,'插拔卡'],['0',0,'插拔卡'],[1,1,'内置卡'],['1',1,'内置卡']])assert.deepEqual(API.normalizeSimSource({[key]:value},modem),{modem,source,label});
    for(const value of ['',null,undefined,true,false,2,-1,'0x0','+1',' 1','1.0',[],[0]])assert.equal(API.normalizeSimSource({[key]:value,current_sim_slot:1,slot:0},modem).source,null);
    assert.equal(API.normalizeSimSource({current_sim_slot:1,slot:0,st_slot:'0'},modem).source,modem==='5G'?0:null);
  }
});

test('SIM source reads are demand-only and the UFI bridge has no source write operation',async()=>{
  const calls=[],transport=API.createUfiTransport({runShellWithRoot:async(command,timeout)=>{
    calls.push({command,timeout});
    const key=command.includes('@.v3t_2_st_slot')?'v3t_2_st_slot':command.includes('@.v3t_1_st_slot')?'v3t_1_st_slot':'st_slot';
    return {success:true,content:'TOPFLOW_SIM_SOURCE_V1='+JSON.stringify({[key]:'1'})};
  }});
  const api=API.create({transport});
  assert.equal(calls.length,0);
  for(const [modem,key]of [['5G','st_slot'],['4G1','v3t_2_st_slot'],['4G2','v3t_1_st_slot']]){
    assert.equal((await api.readSimSource(modem)).source,1);
    const {command,timeout}=calls.at(-1);assert.equal(timeout,4000);assert.ok(command.includes("jsonfilter -e '@."+key+"'"));
    assert.match(command,new RegExp('ubus -t 1 call zwrt_zte_mdm\\.api '+(modem==='5G'?'get_sim_info':'get_v3t_sim_info')));
    assert.doesNotMatch(command,/sim_switch_slot|sub_modem_switch_slot|current_sim_slot|sim_iccid|sim_imsi|\/tmp|\bsleep\b/);
  }
  assert.equal(calls.length,3);
  await assert.rejects(transport({method:'POST',kind:'sim-source',operation:'write',modem:'5G',body:{slot:1}}),{code:'UNSUPPORTED'});
  await assert.rejects(api.readSimSource("5G'; invalid"),{code:'INVALID_PARAMETER'});assert.equal(calls.length,3);
  const demo=API.create({mode:'mock',simSources:{'5G':{st_slot:'0'},'4G1':{v3t_2_st_slot:'1'}}});
  assert.equal((await demo.readSimSource('5G')).source,0);assert.equal((await demo.readSimSource('4G1')).source,1);assert.equal((await demo.readSimSource('4G2')).source,null);
});

test('repeated SIM source entry coalesces reads and failed refresh never preserves old source',async()=>{
  let calls=0,now=0,fail=false;
  const api=API.create({now:()=>now,transport:async descriptor=>{assert.equal(descriptor.kind,'sim-source');calls++;if(fail)throw Error('unavailable');return {st_slot:'0'};}});
  const values=await Promise.all([api.readSimSource('5G'),api.readSimSource('5G')]);
  assert.equal(calls,1);assert.equal(values[0].source,0);values[0].source=1;assert.equal(values[1].source,0);
  now=2999;assert.equal((await api.readSimSource('5G')).source,0);assert.equal(calls,1);
  now=3000;fail=true;await assert.rejects(api.readSimSource('5G'));assert.equal(calls,2);
  fail=false;assert.equal((await api.readSimSource('5G')).source,0);assert.equal(calls,3);
});

test('UFI bridge preserves authenticated postData and does not log in', async () => {
  const calls = [];
  const transport = API.createUfiTransport({
    getData: async query => {calls.push(['get', query.get('cmd')]); return {};},
    postData: async (cookie, body) => {calls.push(['post', cookie, body.goformId]); return {ok: true, json: async () => ({result: 'success'})};},
    sessionCookie: () => 'existing-session',
    request: async (path, options) => {calls.push(['json', path, options]); return {success: true};},
  });
  await transport({kind: 'getData', method: 'GET', query: {cmd: 'net'}});
  await transport(API.buildAction('cell.unlock_all', {}));
  await transport(API.buildAction('aggregation.set', {enabled: true}));
  assert.deepEqual(calls[0], ['get', 'net']);
  assert.deepEqual(calls[1], ['post', 'existing-session', 'UNLOCK_ALL_CELL']);
  assert.equal(calls[2][1], '/datad/hardware');
});

test('serving cell data drops sentinels and disconnected placeholders while retaining valid zero PCI/SINR', () => {
  const raw = structuredClone(sample);
  Object.assign(raw.modems[0].net, {nr_pci: 65535, nr_cell_id: 4294967295, nr_tac: 16777215, nr_rsrq: -14, nr_snr: '0', nr_rssi: -87});
  let n = API.normalize(raw);
  assert.equal(n.modems[0].pci, null);
  assert.equal(n.modems[0].cellId, null);
  assert.equal(n.modems[0].tac, null);
  assert.equal(n.modems[0].rsrq, -14);
  assert.equal(n.modems[0].sinr, 0);
  assert.equal(n.modems[0].rssi, -87);
  assert.equal(n.modems[1].rsrp, null);
  assert.equal(n.modems[1].sinr, null);
  assert.equal(n.modems[1].serving.lte.available, false);
  Object.assign(raw.modems[0].net, {nr_pci: 0, nr_cell_id: 6736736259, nr_tac: 1640704});
  n = API.normalize(raw);
  assert.equal(n.modems[0].pci, 0);
  assert.equal(n.modems[0].cellId, 6736736259);
  assert.deepEqual(API.currentCellAction(n, 'nr'), {name: 'cell.lock_nr', params: {pci: 0, arfcn: 627264, band: 78}});
  assert.throws(() => API.currentCellAction(n, 'lte'), {code: 'NO_SERVING_CELL'});
});

test('frequency capabilities are read independently, extended LTE list outranks bitmask', () => {
  const b = API.normalizeBands({lte_supported_bands: '1,3,66', lte_band: '1,3,66', lte_band_lock: '0x5', nr_sa_supported_bands: 'n28,n78', nr_band_lock: '78', lock_nr_cell: '0,627264,78', net_select: 'Only_5G'});
  assert.deepEqual(b.supported.lte, [1, 3, 66]);
  assert.deepEqual(b.selected.lte, [1, 3, 66]);
  assert.equal(b.automatic.lte, true);
  assert.equal(b.automatic.nrSa, false);
  assert.equal(b.automatic.nrNsa, null);
  assert.equal(b.networkMode, 'Only_5G');
  assert.equal(b.modeOptions.length, 6);
  assert.deepEqual(b.lockedCells, [{radio: 'nr', pci: 0, arfcn: 627264, band: 78}]);
  assert.deepEqual(API.parseBands('0x5'), [1, 3]);
  assert.deepEqual(API.normalizeBands({lte_band: '1,3'}).supported.lte, []);
});

test('automatic frequency restore uses the complete nonempty reported list, never empty string', () => {
  const req = API.buildAction('band.set_nr_sa', {automatic: true, supported: [1, 28, 78]});
  assert.deepEqual(req.body, {goformId: 'NR_BAND_LOCK', nr_band_lock: '1,28,78'});
  assert.deepEqual(API.buildAction('band.set_lte', {bands: [66, 3], supported: [1, 3, 66]}).body, {goformId: 'LTE_BAND_LOCK', lte_band_lock: '3,66'});
  assert.throws(() => API.buildAction('band.set_lte', {automatic: true, supported: []}), {code: 'CAPABILITIES_REQUIRED'});
  assert.throws(() => API.buildAction('band.set_lte', {bands: [], supported: [1, 3]}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('band.set_lte', {bands: [78], supported: [1, 3]}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('band.set_lte', {bands: [3, 'bad'], supported: [1, 3]}), {code: 'INVALID_PARAMETER'});
  assert.throws(() => API.buildAction('band.set_lte', {bands: [3], supported: [1, 3, 'bad']}), {code: 'INVALID_PARAMETER'});
});

test('band/mode reading never invokes cell collection; mock changes remain observable', async () => {
  const calls = [];
  const live = API.create({transport: async req => {calls.push(req); return {lte_supported_bands: '1,3', lte_band: '1,3'};}});
  const bands = await live.readBands();
  assert.equal(bands.automatic.lte, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].query.cmd.includes('neighbor'), false);
  assert.throws(() => API.buildAction('neighbor.set', {enabled: true}), {code: 'UNSUPPORTED'});
  assert.deepEqual(API.buildAction('network.set_mode', {mode: 'Only_LTE'}).body, {goformId: 'SET_BEARER_PREFERENCE', BearerPreference: 'Only_LTE'});
  assert.throws(() => API.buildAction('network.set_mode', {mode: 'invented'}), {code: 'INVALID_PARAMETER'});
  const mock = API.create({mode: 'mock', snapshot: {net: {lte_supported_bands: '1,3', lte_bands: '1,3'}}});
  await mock.execute('band.set_lte', {bands: [3], supported: [1, 3]});
  assert.deepEqual((await mock.readBands()).selected.lte, [3]);
  await mock.execute('network.set_mode', {mode: 'Only_LTE'});
  assert.equal((await mock.readBands()).networkMode, 'Only_LTE');
});

test('current 4G_AND_5G is preserved for display without guessing a writable mapping', () => {
  const bands = API.normalizeBands({net_select: '4G_AND_5G'});
  assert.equal(bands.networkMode, '4G_AND_5G');
  assert.equal(bands.networkModeLabel, '当前模式：4G / 5G');
  assert.equal(bands.networkModeSupported, false);
  assert.deepEqual(bands.modeOptions[0], {value: '4G_AND_5G', label: '当前模式：4G / 5G', readOnly: true});
  assert.throws(() => API.buildAction('network.set_mode', {mode: '4G_AND_5G'}), {code: 'INVALID_PARAMETER'});
  assert.equal(bands.modeOptions.find(m => m.value === 'WL_AND_5G').label, '自动 5G / 4G / 3G');
});
