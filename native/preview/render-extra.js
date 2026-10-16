/* Actual compiled C fixture output, original device font, synthetic values only. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm');
const base=path.resolve(__dirname,'..'),font=require('./font.js')(),exe=path.join(base,'bin/render-preview.exe'),results=[];
for(const name of ['factory-sim-pin','factory-sim-puk','factory-sim-keypad','factory-wps','factory-operators'])for(const theme of ['','-dark']){
 const stem=name+theme,input=path.join(__dirname,stem+'.html');
 function render(suffix,scroll=0,x=286,y=48){const ppm=path.join(__dirname,stem+suffix+'.ppm'),r=cp.spawnSync(exe,[input,path.join(base,'ui'),font,ppm,String(x),String(y),String(scroll)],{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);convert(ppm,ppm.replace('.ppm','.png'));return{height:Number(r.stdout.match(/layout-height=(\d+)/)?.[1]),action:r.stdout.match(/click=(.*)/)?.[1]?.trim()||'',png:ppm.replace('.ppm','.png')};}
 const top=render('');if(top.action!=='act:advback')throw Error(stem+' back action '+top.action);const bottom=render('-bottom',Math.max(0,top.height-480),-1,-1),hits=[];
 if(name==='factory-sim-keypad')for(const [x,y,wanted]of [[63,213,'act:fx-digit:1'],[160,213,'act:fx-digit:2'],[257,213,'act:fx-digit:3'],[160,360,'act:fx-digit:0'],[257,360,'act:fx-done']]){const got=render('-click',0,x,y).action;if(got!==wanted)throw Error(stem+' keypad '+got+' expected '+wanted);hits.push({x,y,wanted});}
 if(name==='factory-wps'){const got=render('-click',0,160,260).action;if(got!=='act:fx-wps:0')throw Error(stem+' WPS '+got);hits.push({x:160,y:260,wanted:'act:fx-wps:0'});if(fs.readFileSync(input,'utf8').includes('href=\'act:fx-wps:1\''))throw Error(stem+' busy WPS still has a start action');const busy=render('-click',0,160,370).action;if(busy==='act:fx-wps:1')throw Error(stem+' busy WPS click submits');hits.push({x:160,y:370,forbidden:'act:fx-wps:1'});}
 if(name==='factory-operators')for(const [y,wanted]of [[278,'act:fx-net-scan'],[400,'act:fx-net-select:0']]){const got=render('-click',0,160,y).action;if(got!==wanted)throw Error(stem+' operator '+got+' expected '+wanted);hits.push({x:160,y,wanted});}
 results.push({name:stem,top,bottom,hits});
}
fs.writeFileSync(path.join(__dirname,'extra-render-results.json'),JSON.stringify({font,source:'native C fixtures, no device operation',results},null,2));console.log(JSON.stringify(results.map(x=>({name:x.name,height:x.top.height,back:x.top.action})),null,2));
