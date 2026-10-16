/* Render C-generated local fixtures using the device font when available. */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const convert = require('./convert-ppm.js');
const base = path.resolve(__dirname, '..'), ui = path.join(base, 'ui'), exe = path.join(base, 'bin/render-preview.exe');
const deviceFont = require('./font.js')();
const font = deviceFont;
const results = [];
for (const page of ['network', 'bands', 'aoyou', 'nodes', 'network-dark', 'bands-dark', 'aoyou-dark', 'nodes-dark']) {
  const name = 'advanced-' + page, input = path.join(__dirname, name + '.html');
  const html = fs.readFileSync(input, 'utf8');
  if (/act:factory|切回原厂|恢复原厂/.test(html)) throw new Error('Unexpected screen ownership control: ' + page);
  if ((html.match(/href='act:advback'/g) || []).length !== 1) throw new Error('Exactly one parent navigation control required: ' + page);
  function render(suffix, scroll, x = -1, y = -1) {
    const ppm = path.join(__dirname, name + suffix + '.ppm');
    const run = cp.spawnSync(exe, [input, ui, font, ppm, String(x), String(y), String(scroll)], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(run.stderr || run.stdout);
    convert(ppm, ppm.replace(/\.ppm$/, '.png'));
    return { height: Number(run.stdout.match(/layout-height=(\d+)/)?.[1]), action: run.stdout.match(/click=(.*)/)?.[1].trim() || '', png: ppm.replace(/\.ppm$/, '.png') };
  }
  const top = render('', 0, 286, 48);
  if (top.action !== 'act:advback') throw new Error('Header back hit test failed: ' + page);
  const scroll = Math.max(0, top.height - 480);
  const bottom = render('-bottom', scroll);
  results.push({ page, top, bottom, bottomScroll: scroll, headerBackPassed: true });
}
fs.writeFileSync(path.join(__dirname, 'advanced-render-results.json'), JSON.stringify({ font, fontSupplied: true, sample: 'local C-generated fixtures; no device actions', results }, null, 2));
console.log(JSON.stringify(results, null, 2));
