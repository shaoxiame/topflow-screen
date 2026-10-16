/* Render actual C-generated forwarding fixtures; local-only, synthetic values. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm.js');
const base=path.resolve(__dirname,'..'),font=require('./font.js')(),exe=path.join(base,'bin/render-preview.exe');
const names=['forward-overview',...Array.from({length:5},(_,i)=>'forward-channel-'+i),'forward-keyboard'],results=[];
for(const name of names)for(const theme of ['','-dark']){
 const stem=name+theme,input=path.join(__dirname,stem+'.html');if(!fs.existsSync(input))continue;
 function render(suffix,y,x=-1,clickY=-1){const ppm=path.join(__dirname,stem+suffix+'.ppm'),run=cp.spawnSync(exe,[input,path.join(base,'ui'),font,ppm,String(x),String(clickY),String(y)],{encoding:'utf8'});if(run.status)throw Error(run.stderr||run.stdout);convert(ppm,ppm.replace('.ppm','.png'));return{height:Number(run.stdout.match(/layout-height=(\d+)/)?.[1]),action:run.stdout.match(/click=(.*)/)?.[1]?.trim()||'',png:ppm.replace('.ppm','.png')};}
 const top=render('',0,286,48);if(top.action!=='act:advback')throw Error(stem+' back target '+top.action);const bottom=render('-bottom',Math.max(0,top.height-480));const hits=[];
 if(name==='forward-keyboard')for(const[x,y,wanted]of [[26,205,'act:sf-key:113'],[268,362,'act:sf-done']]){const got=render('-click',0,x,y).action;if(got!==wanted)throw Error(stem+' keyboard '+got);hits.push({x,y,wanted});}
 if(name==='forward-channel-0'){const got=render('-click',Math.max(0,top.height-480),150,450).action;if(got!=='act:sf-save')throw Error(stem+' apply target '+got);hits.push({x:150,y:450,wanted:got});}
 results.push({name:stem,top,bottom,hits});
}
fs.writeFileSync(path.join(__dirname,'forward-render-results.json'),JSON.stringify({font,source:'native C fixtures, synthetic credentials only',results},null,2));console.log(JSON.stringify(results.map(r=>({name:r.name,height:r.top.height,back:r.top.action})),null,2));
