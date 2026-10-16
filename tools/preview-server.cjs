'use strict';
// Static allowlist only. No proxy, shell, device connector, or telemetry SDK.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = new Map([
  ['/','tools/preview.html'], ['/preview.js','tools/preview.js'],
  ['/screen.css','src/screen.css'], ['/screen-ui.js','src/screen-ui.js'],
  ['/device-api.js','src/device-api.js'], ['/fixtures.js','src/fixtures.js']
]);
const port = Number(process.env.TF_PREVIEW_PORT || 8877);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid TF_PREVIEW_PORT');
http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!files.has(route)) {res.writeHead(404);res.end('Not found');return;}
  const file = path.join(root,files.get(route));
  const type = route.endsWith('.js') ? 'text/javascript' : route.endsWith('.css') ? 'text/css' : 'text/html';
  res.writeHead(200, {'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log('Synthetic preview only: http://127.0.0.1:'+port+' (no device requests; Ctrl+C to stop)'));
