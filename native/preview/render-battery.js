/* Synthetic battery states through the production templates + native engine.
 * Local visual regression only: no network or device access. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm');
const API=require('../../src/device-api'),base=path.resolve(__dirname,'..'),ui=path.join(base,'ui');
const cases=[['charging',1,1,100],['full',4,1,85],['plugged',3,1,80],['unknown',null,null,null]];
const results=[];
function paint(name,html,scroll,back){
 const file=path.join(__dirname,name+'.html'),ppm=path.join(__dirname,name+'.ppm');fs.writeFileSync(file,html);
 const run=cp.spawnSync(path.join(base,'bin/render-preview.exe'),[file,ui,require('./font.js')(),ppm,'292','47',String(scroll)],{encoding:'utf8'});
 if(run.status!==0||!run.stdout.includes('click='+back))throw Error(run.stderr||run.stdout||'Native render failed');
 convert(ppm,ppm.replace(/ppm$/,'png'));results.push({name,scroll,back,report:run.stdout.trim(),png:ppm.replace(/ppm$/,'png')});
}
for(const [name,status,connected,percent]of cases)for(const theme of ['light','dark']){
 const b=API.normalize({battery:{charging:status,charger_connect:connected,percent}}).battery;
 const v={THEME:theme,TIME:'14:36',DATASTATE:'本地演示',BAT_CLASS:b.state,BAT_MARK:b.stateMark,BAT_STATE:b.stateLabel,BAT:b.percent??'—',BAT_FILL:b.percent==null?0:Math.round(b.percent/10),CONTROLSTATE:'仅查看',BATTEMP:34,CPUTEMP:45,CPUUSAGE:28,CPU_PCT:28,MEM:35,MEM_PCT:35,AGG_LIVE:'聚合未启用',AGG_CLASS:'',WIFI_CLIENTS:2,THEMELABEL:theme==='dark'?'深色':'浅色',TOAST:''};
 const html=fs.readFileSync(path.join(ui,'settings.html'),'utf8').replace(/\{\{([^}]+)\}\}/g,(_,key)=>v[key]??'—');
 paint('battery-'+name+'-'+theme,html,0,'act:page:apps.html');
 if(name==='charging')paint('battery-'+name+'-'+theme+'-scrolled',html,260,'act:page:apps.html');
}
for(const theme of ['light','dark']){
 const html=fs.readFileSync(path.join(__dirname,'advanced-network'+(theme==='dark'?'-dark':'')+'.html'),'utf8').replace("top-power unknown","top-power charging").replace("title='充电状态未知'","title='充电中'").replace("<span class='charge-mark'>?</span>—%","<span class='charge-mark'></span>100%").replace("width:0px","width:10px");
 paint('battery-advanced-'+theme,html,180,'act:advback');
}
fs.writeFileSync(path.join(__dirname,'battery-render-results.json'),JSON.stringify({source:'synthetic local battery states; actual production template/native renderer',results},null,2));
console.log('PASS: '+results.length+' actual native battery renders; light/dark, charging/full/plugged/unknown, pinned header/back after scroll.');
