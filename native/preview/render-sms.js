/* Exact native build_sms fixtures; original font, no device requests. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm.js');
const root=path.resolve(__dirname,'..'),font=require('./font.js')(),results=[];
for(let filter=0;filter<4;filter++)for(const theme of ['light','dark']){
 const name=`sms-filter-${filter}-${theme}`,input=path.join(__dirname,name+'.html');
 function render(suffix,scroll,x=-1,y=-1){const ppm=path.join(__dirname,name+suffix+'.ppm');const p=cp.spawnSync(path.join(root,'bin/render-preview.exe'),[input,path.join(root,'ui'),font,ppm,String(x),String(y),String(scroll)],{encoding:'utf8'});if(p.status)throw Error(p.stderr||p.stdout);convert(ppm,ppm.replace('.ppm','.png'));return{height:Number(p.stdout.match(/layout-height=(\d+)/)?.[1]),action:p.stdout.match(/click=(.*)/)?.[1]?.trim()||''};}
 const top=render('',0,[51,124,197,270][filter],177),bottom=render('-bottom',Math.max(0,top.height-480));if(top.action!==`act:smsfilter:${filter}`)throw Error(name+' filter miss '+top.action);results.push({name,top,bottom});
}
fs.writeFileSync(path.join(__dirname,'sms-render-results.json'),JSON.stringify({font,fixtures:true,results},null,2));console.log('PASS: 8 actual C SMS list/filter variants and 8 filter hit-tests with original font');
