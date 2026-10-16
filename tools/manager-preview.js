'use strict';
// Test host only; this file is never bundled into the device plugin.
let KANO_baseURL='/api';
const common_headers={'x-topflow-preview':'synthetic-only'};
const query=new URLSearchParams(location.search);
if(query.get('theme')==='light')document.documentElement.dataset.theme='light';
if(query.has('mobile'))document.documentElement.dataset.previewMobile='';
if(query.has('clean'))document.documentElement.dataset.previewClean='';
const previewPayload={version:'0.2.4',archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\nprintf true\n',hardwareTested:false,directSwitch:true,members:['./','./screenctl.sh','./topflow-screen','./topflow-screen.sha256']};
window.TopFlowPackagePayload=previewPayload;
let state,removed=false,scenario=query.get('state')||'custom';
const previewBoot='12345678-1234-1234-1234-123456789abc';
const emptyUpload={pending:false,pendingSha256:'',pendingNonce:'',pendingBootId:'',previousBoot:false,uploadedBytes:0,uploadValid:false};
let wallpaper={configured:false,sha256:'',bootId:previewBoot,...emptyUpload}, wallpaperBytes=new Uint8Array(307216);
function resetState(){
 state={installed:true,mode:scenario==='factory'?'factory':'custom',pid:234,ready:true,supervised:true,heartbeatAge:1,autostart:{enabled:false,hook:'absent',state:'disabled',reason:'NONE'}};
 if(scenario==='new')state={installed:false,mode:'factory'};
 if(scenario==='update')state.versionMismatch=true;
 if(scenario==='failure')state={...state,mode:'factory',failure:'FACTORY_RESTORE_UNCONFIRMED'};
 removed=false;
}
resetState();document.querySelector('#scenario').value=scenario;
window.fetch=async function(url,config){
 const parsed=new URL(url,location.href);
 if(parsed.origin!==location.origin)throw Error('Preview blocks external requests');
 const route=parsed.pathname;
 await new Promise(resolve=>setTimeout(resolve,180));
 if(scenario==='offline')throw Error('本地模拟：连接暂不可用');
 const ok=body=>({ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)});
 if(route==='/api/upload_file'){
  if(config.body.get('file').name!=='.payload.tar.gz')throw Error('Preview generic upload accepts only the existing native archive');
  return ok({result:'success',path:'/data/plugins/topflow-screen/.payload.tar.gz',name:'.payload.tar.gz',size:1});
 }
 if(route==='/api/get_custom_head')return ok({text:removed?'':'<!-- [KANO_PLUGIN_START] preview-screen.txt --><script>'+window.__previewManagerSource+'</script><!-- [KANO_PLUGIN_END] preview-screen.txt -->'});
 if(route==='/api/plugin/uninstall'){removed=true;return ok({success:true});}
 if(route!=='/api/run_shell')throw Error('Preview route rejected');
 const command=JSON.parse(config.body).cmd;
 let content;
 const wallpaperAction=command.match(/screenctl\.sh" wallpaper-([a-z-]+)(?: --confirmed '([a-f0-9]{64})' '([a-f0-9]{32})' '([a-f0-9-]{36})'(?: (\d+) '([A-Za-z0-9+/=]+)')?)?/);
 if(wallpaperAction){
  const [,action,sha,nonce,boot,offset,encoded]=wallpaperAction;
  if(action!=='status'&&boot!==previewBoot)throw Error('Preview boot mismatch');
  if(action==='prepare'){if(wallpaper.pending)throw Error('Preview pending upload');wallpaper={...wallpaper,pending:true,pendingSha256:sha,pendingNonce:nonce,pendingBootId:boot,uploadedBytes:0,uploadValid:false};content='TOPFLOW_WALLPAPER=PREPARED';}
  else if(action==='chunk'){
   if(!wallpaper.pending||nonce!==wallpaper.pendingNonce||sha!==wallpaper.pendingSha256||Number(offset)!==wallpaper.uploadedBytes)throw Error('Preview transaction mismatch');
   const chunk=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));wallpaperBytes.set(chunk,Number(offset));wallpaper.uploadedBytes+=chunk.length;
   wallpaper.uploadValid=wallpaper.uploadedBytes===307216&&window.TopFlowManagerWallpaper.sha256(wallpaperBytes)===sha;content='TOPFLOW_WALLPAPER=CHUNKED';
  }
  else if(action==='commit'){if(!wallpaper.uploadValid||nonce!==wallpaper.pendingNonce)throw Error('Preview image invalid');wallpaper={...wallpaper,configured:true,sha256:sha,...emptyUpload};content='TOPFLOW_WALLPAPER=COMMITTED';}
  else if(action==='clear'||action==='abort'){wallpaper={...wallpaper,configured:action==='clear'?false:wallpaper.configured,...emptyUpload};content='TOPFLOW_WALLPAPER='+(action==='clear'?'CLEARED':'ABORTED');}
  else content='TOPFLOW_WALLPAPER='+JSON.stringify(wallpaper);
 }else if(command.includes('autostart-enable --confirmed')||command.includes('autostart-disable --confirmed')){
  const enabled=command.includes('autostart-enable --confirmed');state.autostart={enabled,hook:enabled?'present':'absent',state:enabled?'enabled':'disabled',reason:'NONE'};content='TOPFLOW_AUTOSTART='+(enabled?'ENABLED':'DISABLED');
 }else if(command.includes('set -- uninstall --confirmed')){state={installed:false,mode:'factory'};content='TOPFLOW_UNINSTALL=COMPONENTS_REMOVED';}
 else if(command.includes('screenctl.sh" start --confirmed')){state={...state,installed:true,partial:false,uploadActive:false,versionMismatch:false,mode:'custom',pid:234,ready:true,supervised:true,heartbeatAge:1};content='TOPFLOW_SWITCH=SUBMITTED';}
 else if(command.includes('set -- restore --confirmed')){state={...state,mode:'factory'};content='TOPFLOW_SWITCH=SUBMITTED';}
 else if(command.includes('TOPFLOW_INSTALL=UPLOAD_FINISHED')){state.uploadActive=false;content='TOPFLOW_INSTALL=UPLOAD_FINISHED';}
 else if(command.includes('tar -xzf')){state={...state,installed:true,partial:false,versionMismatch:false};content='TOPFLOW_INSTALL=INSTALLED_NOT_STARTED';}
 else if(command.includes('mkdir "$TF_ROOT"')){state={installed:true,partial:true,uploadActive:true,mode:'factory'};content='TOPFLOW_INSTALL=READY';}
 else content='TOPFLOW_SCREEN='+JSON.stringify(state);
 document.querySelector('#receipt').textContent='本地内存响应 · '+(content.startsWith('TOPFLOW_SCREEN=')?'状态读取':content)+' · 没有设备请求';
 return ok({success:true,content});
};
document.querySelector('#open').onclick=()=>window.__topflow_screen_plugin?.open();
document.querySelector('#scenario').onchange=event=>{const url=new URL(location.href);url.searchParams.set('state',event.target.value);location.href=url;};
addEventListener('load',()=>window.__topflow_screen_plugin?.open(),{once:true});
