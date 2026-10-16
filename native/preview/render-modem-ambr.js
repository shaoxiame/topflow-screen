/* Actual C detail pages, native renderer and device font. Synthetic local values. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const convert=require('./convert-ppm.js');
const base=path.resolve(__dirname,'..'),font=require('./font.js')(),results=[];
for(const card of ['main','card2','card3','disabled'])for(const theme of ['','-dark']){
 const name=`modem-ambr-${card}-019${theme}`,input=path.join(__dirname,name+'.html'),ppm=path.join(__dirname,name+'.ppm');
 const run=cp.spawnSync(path.join(base,'bin/render-preview.exe'),[input,path.join(base,'ui'),font,ppm,'286','48','0'],{encoding:'utf8'});
 if(run.status!==0)throw Error(run.stderr||run.stdout||'Native render failed');
 if(!/click=act:advback/.test(run.stdout))throw Error('Parent navigation hit test failed');
 convert(ppm,ppm.replace(/\.ppm$/,'.png'));results.push({name,renderer:run.stdout.trim(),png:ppm.replace(/\.ppm$/,'.png')});
}
fs.writeFileSync(path.join(__dirname,'modem-ambr-render-results-019.json'),JSON.stringify({sample:'C-generated synthetic local values; no device actions',font,results},null,2));
console.log(JSON.stringify(results,null,2));
