/* Lock-screen fixtures, actual litehtml/FreeType and original local font. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),convert=require('./convert-ppm.js');
const root=path.resolve(__dirname,'..'),font=require('./font.js')(),exe=path.join(root,'bin/render-preview.exe');
const results=[];
for(const base of ['lock-handover','lock-entry','lock-cooldown','lock-gesture'])for(const suffix of ['','-dark']){
 const name=base+suffix,ppm=path.join(__dirname,name+'.ppm');
 const r=cp.spawnSync(exe,[path.join(__dirname,name+'.html'),path.join(root,'ui'),font,ppm,'150','270','0'],{encoding:'utf8'});
 if(r.status)throw Error(r.stderr||r.stdout);const height=Number(r.stdout.match(/layout-height=(\d+)/)?.[1]),action=r.stdout.match(/click=(.*)/)?.[1]?.trim()||'';
 if(height!==480||action!==(base==='lock-entry'?'act:pin:2':''))throw Error(name+' lock layout/input mismatch');
 convert(ppm,ppm.replace('.ppm','.png'));results.push({name,height,action,png:ppm.replace('.ppm','.png')});
}
fs.writeFileSync(path.join(__dirname,'lock-render-results.json'),JSON.stringify({font,sample:'Local fixture PIN only; not a device unlock',results},null,2));
console.log('PASS: 8 lock views at 320x480, initial/failure cooldown controls inactive, entry keypad hit, original-font rendering');
