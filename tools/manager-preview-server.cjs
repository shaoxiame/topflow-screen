'use strict';
// Local UI inspection only. No device bridge, proxy, writes or remote network.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {managerOnly}=require('./production-manager.cjs');
const root=path.resolve(__dirname,'..');
const routes=new Map([['/','tools/manager-preview.html'],['/host.js','tools/manager-preview.js'],['/manager.css','src/manager.css']]);
const port=Number(process.env.TF_MANAGER_PORT||8882);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const route=new URL(req.url,'http://127.0.0.1').pathname;
  if(!routes.has(route)&&route!=='/manager-plugin.js'){res.writeHead(404);res.end();return;}
  try{
    const source=route==='/manager-plugin.js'?managerOnly(fs.readFileSync(path.join(root,'src/ufi-plugin.js'),'utf8')):null;
    const body=source?'window.__previewManagerSource='+JSON.stringify(source)+';document.currentScript.textContent=window.__previewManagerSource;\n'+source:fs.readFileSync(path.join(root,routes.get(route)));
    res.writeHead(200,{'Content-Type':(route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':'text/html')+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:body);
  }catch(e){res.writeHead(500);res.end('Preview unavailable: '+e.message);}
}).listen(port,'127.0.0.1',()=>console.log('Local synthetic management preview: http://127.0.0.1:'+port+' (no device requests)'));
