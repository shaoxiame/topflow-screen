/* Actual native C-generated form fixtures. Local renderer only. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm.js');
const root=path.resolve(__dirname,'..'),exe=path.join(root,'bin/render-preview.exe'),font=require('./font.js')();
const names=['advanced-modem-main','advanced-modem-external','form-sms','form-wifi','keyboard','keyboard-pinyin','keyboard-symbols','apn','form-apn','power','power-cooling','clients','traffic','form-traffic','guest','form-guest','more','advanced-modem-external-disabled','display-settings','wireless-dual','wireless-mode','wifi-overview'];
const results=[];
for(const base of names)for(const theme of ['','-dark']){
 const name=base+theme,input=path.join(__dirname,name+'.html');if(!fs.existsSync(input))continue;
 function render(suffix,scroll,x=-1,y=-1){const ppm=path.join(__dirname,name+suffix+'.ppm');const r=cp.spawnSync(exe,[input,path.join(root,'ui'),font,ppm,String(x),String(y),String(scroll)],{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);convert(ppm,ppm.replace('.ppm','.png'));return{height:Number(r.stdout.match(/layout-height=(\d+)/)?.[1]),action:r.stdout.match(/click=(.*)/)?.[1]?.trim()||'',png:ppm.replace('.ppm','.png')};}
 const top=render('',0,286,48),bottom=render('-bottom',Math.max(0,top.height-480));const expected=base.startsWith('keyboard')?'act:edit-done':'act:advback';if(top.action!==expected)throw Error(name+' header mismatch '+top.action);const hits=[];
 const checks=base==='keyboard-pinyin'?[[27,266,'act:key:113'],[34,227,'act:py:0'],[160,428,'act:edit-done']]:base==='wifi-overview'?[[160,145,'act:wifi-edit:2g'],[160,206,'act:wifi-edit:5g'],[160,267,'act:wifi-dual'],[160,328,'act:guest']]:base==='form-sms'?[[270,14,'act:controls'],[160,157,'act:edit:0'],[160,225,'act:edit:1'],[160,317,'act:form-apply']]:[];
 for(const[x,y,wanted]of checks){const got=render('-click',0,x,y).action;if(got!==wanted)throw Error(name+' target mismatch '+got+' expected '+wanted);hits.push({x,y,wanted});}if(base.startsWith('keyboard')&&top.height>480)throw Error(name+' keyboard needs scrolling');results.push({name,top,bottom,hits});
}
fs.writeFileSync(path.join(__dirname,'forms-render-results.json'),JSON.stringify({font,sample:'local C-generated fixtures; no device actions',results},null,2));console.log(JSON.stringify(results.map(x=>({name:x.name,height:x.top.height,back:x.top.action})),null,2));
