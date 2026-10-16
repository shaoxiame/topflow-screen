/* Real litehtml hit tests against C-generated forms; never executes actions. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'bin/render-preview.exe'),font=require('./font.js')();
const cases=[
 ['keyboard',28,227,'act:key:113'],['keyboard',140,339,'act:key-symbols'],['keyboard',160,377,'act:edit-done'],
 ['keyboard-pinyin',33,187,'act:py:0'],['keyboard-pinyin',282,187,'act:py-next'],['keyboard-pinyin',43,339,'act:key-language'],
 ['form-sms',150,180,'act:edit:0'],['form-sms',150,260,'act:edit:1'],['form-sms',150,370,'act:form-apply'],
 ['power-cooling',150,192,'act:cooling-fan'],['power-cooling',150,320,'act:cooling-liquid'],
 ['more',150,157,'act:power'],['more',150,201,'act:guest'],['more',150,247,'act:clients'],['more',150,291,'act:traffic'],
 ['clients',150,277,'act:client-block:02:00:00:00:00:01'],['clients',150,367,'act:client-unblock:02:00:00:00:00:02'],
];
const results=[];
for(const [base,x,y,expected] of cases)for(const theme of ['','-dark']){
 const name=base+theme;const r=cp.spawnSync(exe,[path.join(__dirname,name+'.html'),path.join(root,'ui'),font,path.join(__dirname,'form-click-test.ppm'),String(x),String(y)],{encoding:'utf8'});
 const actual=r.stdout.match(/click=(.*)/)?.[1]?.trim()||'',pass=r.status===0&&actual===expected;
 results.push({name,x,y,expected,actual,pass});if(!pass)process.exitCode=1;
}
fs.writeFileSync(path.join(__dirname,'form-click-results.json'),JSON.stringify({font,results},null,2));console.log(JSON.stringify(results,null,2));
