'use strict';
// Test host only; this file is never bundled into the device plugin.
let KANO_baseURL='/api';
const common_headers={'x-topflow-preview':'synthetic-only'};
const query=new URLSearchParams(location.search);
if(query.get('theme')==='light')document.documentElement.dataset.theme='light';
if(query.has('clean'))document.documentElement.dataset.previewClean='';
const previewPayload={version:'0.2.3',archiveBase64:'YQ==',archiveSha256:'a'.repeat(64),screenctlSha256:'b'.repeat(64),screenctlSource:'#!/bin/sh\nprintf true\n',hardwareTested:false,directSwitch:true,members:['./','./screenctl.sh','./topflow-screen','./topflow-screen.sha256']};
window.TopFlowPackagePayload=previewPayload;
let state,removed=false,scenario=query.get('state')||'custom';
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
 const ok=body=>({ok:true,status:200,json:async()=>body});
 if(route==='/api/upload_file')return ok({result:'success',path:'/data/plugins/topflow-screen/.payload.tar.gz',name:'.payload.tar.gz',size:1});
 if(route==='/api/get_custom_head')return ok({text:removed?'':'<!-- [KANO_PLUGIN_START] preview-screen.txt --><script>'+window.__previewManagerSource+'</script><!-- [KANO_PLUGIN_END] preview-screen.txt -->'});
 if(route==='/api/plugin/uninstall'){removed=true;return ok({success:true});}
 if(route!=='/api/run_shell')throw Error('Preview route rejected');
 const command=JSON.parse(config.body).cmd;
 let content;
 if(command.includes('autostart-enable --confirmed')||command.includes('autostart-disable --confirmed')){
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
document.querySelector('#theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
document.querySelector('#open').onclick=()=>window.__topflow_screen_plugin?.open();
document.querySelector('#scenario').onchange=async event=>{scenario=event.target.value;resetState();window.__topflow_screen_plugin?.close();await window.__topflow_screen_plugin?.open();};
addEventListener('load',()=>window.__topflow_screen_plugin?.open(),{once:true});
