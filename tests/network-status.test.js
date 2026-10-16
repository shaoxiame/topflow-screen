'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const API=require('../src/device-api.js');
test('synthetic factory-shaped quota and port counters do not invent a cable or CA',()=>{
  const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/network-018/observed-state.json'),'utf8'));
  const state=API.normalize(raw);
  assert.equal(state.aggregation.remainingBytes,10000000000);
  assert.equal(state.aggregation.todayUsedBytes,100000);
  assert.equal(state.ethernet.rxBps,0);assert.equal(state.ethernet.carrier,null);
  assert.equal(state.carrierAggregation.primary.band,78);
  assert.equal(state.carrierAggregation.primary.bandwidthMHz,100);
  assert.equal(state.carrierAggregation.summary,'当前未报告附加载波');
  assert.equal(API.normalize(raw,{ethernetCarrier:0}).ethernet.carrier,false);
});
test('legacy false is unobserved while fresh custom telemetry is actionable',()=>{
  for(const running of [undefined,false,true]){
    const s=API.normalize({aggregation:{enabled:true,online:false,tcp_tunnel_count:0,controller:{icg_process_running:running}}});
    assert.equal(s.aggregation.online,null);assert.equal(s.aggregation.statusLabel,'聚合已开启');
  }
  assert.equal(API.normalize({aggregation:{enabled:true,online:true}}).aggregation.online,true);
  assert.equal(API.normalize({aggregation:{enabled:false,online:true}}).aggregation.online,false);
  const agg={enabled:true,online:true,source:'icg-v3',telemetry_fresh:false,quic_tunnel_count:3};
  assert.equal(API.normalize({aggregation:agg}).aggregation.online,null);
  assert.equal(API.normalize({aggregation:{...agg,telemetry_fresh:true}}).aggregation.online,true);
  assert.equal(API.normalize({aggregation:{...agg,telemetry_fresh:true,online:false,quic_tunnel_count:0}}).aggregation.online,false);
  assert.equal(API.normalize({aggregation:{enabled:true,traffic:{remaining_bytes:-1,today_used_bytes:null}}}).aggregation.remainingBytes,null);
});
test('official CA descriptors expose bounded numeric data and tolerate absent or invalid reports',()=>{
  const descriptor='0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;';
  let s=API.normalize({net:{nrca:descriptor+descriptor,lteca:'0,0,1,1,100,20,0,-99,-10,10,-60;'}}).carrierAggregation;
  assert.equal(s.nrCount,1);assert.equal(s.lteCount,1);assert.equal(s.carriers[0].pci,273);assert.equal(s.carriers[0].bandwidthMHz,100);assert.equal(s.carriers[1].pci,0);
  s=API.normalize({net:{nrca:'<script>;',lteca:''}}).carrierAggregation;
  assert.equal(s.carriers.length,0);assert.equal(s.summary,'载波数据无法解析');
  const nine=Array.from({length:9},(_,i)=>`${i},${i},1,78,627264,100,0,-99,-10,10,-60;`).join('');
  s=API.normalize({net:{nrca:nine,lteca:''}}).carrierAggregation;assert.equal(s.carriers.length,8);assert.equal(s.nrCount,9);
});
test('radio CA and aggregation networking remain independent in both directions',()=>{
  const net={nrca:'0,273,1,41,504990,100,0,-140.0,-43.0,-23.0,-120.0;1,194,1,78,627264,100,0,-90,-10,18,-60;',lteca:''};
  const caOnly=API.normalize({net});assert.equal(caOnly.carrierAggregation.nrCount,2);assert.equal(caOnly.aggregation.enabled,null);assert.equal(caOnly.aggregation.online,null);
  const networkOnly=API.normalize({aggregation:{enabled:true,online:true},net:{nrca:'',lteca:''}});assert.equal(networkOnly.carrierAggregation.nrCount,0);assert.equal(networkOnly.aggregation.online,true);
  const separate=API.normalize({net,aggregation:{enabled:false,online:false}});assert.equal(separate.carrierAggregation.nrCount,2);assert.equal(separate.aggregation.enabled,false);assert.equal(separate.aggregation.online,false);
});
