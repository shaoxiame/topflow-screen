/* Hit-test the actual litehtml renderer locally. This does not execute actions. */
const fs=require('fs'),path=require('path'),cp=require('child_process');
const base=path.resolve(__dirname,'..'),ui=path.join(base,'ui'),exe=path.join(base,'bin/render-preview.exe');
const deviceFont=require('./font.js')(),font=deviceFont;
const cases=[
  ['index',285,43,''],['aggregate',285,43,''],['index',223,87,'act:page:aggregate.html'],
  ['network',285,43,'act:page:index.html'],['apps',285,43,'act:page:index.html'],['settings',285,43,'act:page:index.html'],
  ['aggregate',81,87,'act:page:index.html'],['apps',150,257,'act:sub:sms.html'],
  ['apps',150,169,'act:aoyou'],['apps',150,320,'act:sms-forward'],['apps',150,383,'act:wifi'],
  ['network',155,402,'act:network'],['network',155,465,'act:network'],['settings',277,141,'act:controls'],
  ['settings',275,371,'act:aggregate'],['settings',150,450,'act:wifi'],
  ['settings-more',155,156,'act:clients',360],['settings-more',155,218,'act:traffic',360],['settings-more',155,282,'act:power',360],['settings-more',155,345,'act:display',360],['settings-more',155,409,'act:more',360],['settings-more',155,461,'act:theme',360],
  ['sms',285,43,'act:page:apps.html'],['sms',22,86,''],['sms',145,195,'act:sms:1'],['sms',100,128,'act:sms-compose'],['sms',250,128,'act:sms-forward'],
  ['index',140,280,'act:modem:5G'],['index',140,346,'act:modem:4G1'],['index',140,412,'act:modem:4G2'],['index',280,459,'act:page:settings.html'],
  ['aggregate',140,280,'act:modem:5G'],['aggregate',140,346,'act:modem:4G1'],['aggregate',140,412,'act:modem:4G2'],
];
const results=[];
cases.push(...cases.map(([page,x,y,expected,scroll=0])=>[page+'-dark',x,y,expected,scroll]));
for(const page of ['index','aggregate','network','apps','settings','sms']){
  const html=fs.readFileSync(path.join(__dirname,page+'-filled.html'),'utf8');
  if(/class=["'](?:nav|navitem)\b/.test(html))throw Error('Unexpected bottom navigation in '+page);
  if(/act:factory|切回原厂|恢复原厂|原厂屏幕/.test(html))throw Error('Screen ownership must only be managed in UFI: '+page);
  const count=(html.match(/class="header-back"/g)||[]).length;
  if(count!==(['index','aggregate'].includes(page)?0:1))throw Error('Unexpected header back buttons: '+page);
}
for(const[page,x,y,expected,scroll=0]of cases){const run=cp.spawnSync(exe,[path.join(__dirname,page+'-filled.html'),ui,font,path.join(__dirname,'click-test.ppm'),String(x),String(y),String(scroll)],{encoding:'utf8'});const actual=(run.stdout.match(/click=(.*)/)||[])[1]?.trim();const pass=run.status===0&&actual===expected;results.push({page,x,y,scroll,font,expected,actual,pass});if(!pass)process.exitCode=1;}
fs.writeFileSync(path.join(__dirname,'click-results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
