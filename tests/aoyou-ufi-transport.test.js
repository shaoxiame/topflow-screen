'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../src/aoyou-ufi-transport.js');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('read-only command finds the active config and uses only existing tools', () => {
  const command = bridge.buildCommand({ method: 'GET', path: '/proxies' });
  assert.match(command, /pidof mihomo/);
  assert.match(command, /\/proc\/\$TF_PID\/cmdline/);
  assert.match(command, /\/data\/plugins\/aoyou-world\/generations\/\*\/runtime\.json/);
  assert.match(command, /UNSUPPORTED_JSONFILTER/);
  assert.match(command, /UNSUPPORTED_LUA_JSONC/);
  assert.match(command, /UNSUPPORTED_CURL/);
  assert.match(command, /readlink -f/);
  assert.match(command, /--config -/);
  assert.match(command, /--noproxy/);
  assert.doesNotMatch(command, /\bjq\b/);
  assert.doesNotMatch(command, /\b(?:touch|mkdir|wget|install|rm|mv|cp|tee|eval|source)\b|service\.sh|prepare\(/);
  assert.doesNotMatch(command, /\|\s*(?:bash|sh)\b/);
});

test('runtime whitelist allows exactly the two verified filename shapes and 24 hexadecimal generation', () => {
  const command=bridge.buildCommand({method:'GET',path:'/version'});
  const begin=command.indexOf('case "$TF_CONFIG" in');
  const end=command.indexOf('[ -f "$TF_CONFIG" ]',begin);
  const snippet='tf_fail() { exit 42; }\n'+command.slice(begin,end)+'\nprintf OK\n';
  const shell=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/usr/bin/dash.exe'):'/bin/sh';
  const prefix='/data/plugins/aoyou-world/generations/';
  for(const filename of ['runtime.json','runtime.self.json']) {
    const r=spawnSync(shell,['-c',snippet],{encoding:'utf8',env:{...process.env,TF_CONFIG:prefix+'a'.repeat(24)+'/'+filename}});
    assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'OK');
  }
  for(const candidate of [prefix+'a'.repeat(23)+'/runtime.json',prefix+'A'.repeat(24)+'/runtime.json',prefix+'a'.repeat(24)+'/../runtime.json',prefix+'a'.repeat(24)+'/runtime.other.json','/tmp/runtime.json']) {
    const r=spawnSync(shell,['-c',snippet],{encoding:'utf8',env:{...process.env,TF_CONFIG:candidate}});assert.equal(r.status,42,candidate);
  }
});

test('default bridge rejects writes, arbitrary routes, body-bearing reads and malformed paths', () => {
  for (const request of [
    { method: 'PATCH', path: '/configs', body: { mode: 'rule' } },
    { method: 'PUT', path: '/proxies/test', body: { name: 'node' } },
    { method: 'POST', path: '/restart' },
    { method: 'GET', path: '/connections' },
    { method: 'GET', path: '/configs?secret=true' },
    { method: 'GET', path: '/version', body: {} },
    { method: 'GET', path: '/proxies/%ZZ' },
    { method: 'GET', path: '/proxies/%2E%2E%2Fconfigs' },
    { method: 'GET', path: '/proxies/a%0Ab' }
  ]) assert.throws(() => bridge.buildCommand(request));
});

test('writes require a narrow body and all dynamic names are Base64, not shell source', () => {
  const group = "节点 / ' $(touch /tmp/injection) `whoami`";
  const node = "香港 ' $(touch /tmp/injection) `whoami`";
  const command = bridge.buildCommand({ method: 'PUT', path: '/proxies/' + encodeURIComponent(group), body: { name: node } }, { allowWrites: true });
  assert.doesNotMatch(command, /touch \/tmp\/injection|`whoami`|香港|节点/);
  assert(command.includes(Buffer.from(JSON.stringify(JSON.stringify({ name: node }))).toString('base64')));
  assert.throws(() => bridge.buildCommand({ method: 'PATCH', path: '/configs', body: { mode: 'rule', secret: 'bad' } }, { allowWrites: true }));
  assert.throws(() => bridge.buildCommand({ method: 'PUT', path: '/proxies/test', body: { name: 'node', server: 'bad' } }, { allowWrites: true }));
});

test('snapshot command contains only the three audited read operations', () => {
  const command = bridge.buildSnapshotCommand();
  const calls = command.split('\n').filter(line => line.startsWith('tf_request '));
  assert.equal(calls.length, 3);
  assert(calls.every(line => line.startsWith("tf_request 'GET'")));
  assert.match(calls.join('\n'), /get-version/);
  assert.match(calls.join('\n'), /get-configs/);
  assert.match(calls.join('\n'), /get-proxies/);
});

test('snapshot parsing produces the sanitized adapter input and rejects incomplete snapshots', () => {
  const records = [
    { ok: true, operation: 'get-version', data: { version: '1.2.3' } },
    { ok: true, operation: 'get-configs', data: { mode: 'rule' } },
    { ok: true, operation: 'get-proxies', data: { proxies: { DIRECT: { type: 'Direct' } } } }
  ];
  const output = records.map(record => 'TOPFLOW_AOYOU_V1=' + JSON.stringify(record)).join('\n');
  assert.deepEqual(bridge.parseSnapshotOutput(output), { installed: true, running: true, version: '1.2.3', mode: 'rule', proxies: { DIRECT: { type: 'Direct' } } });
  assert.throws(() => bridge.parseSnapshotOutput(output.split('\n')[0]), { code: 'INVALID_RESPONSE' });
});

test('parser rejects mismatched/ambiguous output and suppresses raw diagnostics', () => {
  assert.deepEqual(bridge.parseOutput('noise\nTOPFLOW_AOYOU_V1={"ok":true,"operation":"get-configs","data":{"mode":"rule"}}\n', 'get-configs'), { mode: 'rule' });
  assert.throws(() => bridge.parseOutput('TOPFLOW_AOYOU_V1={"ok":true,"operation":"get-version","data":{}}', 'get-configs'), { code: 'INVALID_RESPONSE' });
  assert.throws(() => bridge.parseOutput('TOPFLOW_AOYOU_V1={"ok":false,"code":"UNSUPPORTED_LUA_JSONC","secret":"MUST_NOT_EXPORT"}'), error => error.code === 'UNSUPPORTED_LUA_JSONC' && !error.message.includes('MUST_NOT_EXPORT'));
  assert.throws(() => bridge.parseOutput('password=MUST_NOT_EXPORT'), error => !error.message.includes('MUST_NOT_EXPORT'));
});

test('transport uses only the provided runner, preserves default read-only boundary and parses result', async () => {
  const calls = [];
  const transport = bridge.createTransport({ runShellWithRoot: async (command, timeout) => {
    calls.push({ command, timeout });
    return { success: true, content: 'TOPFLOW_AOYOU_V1={"ok":true,"operation":"get-version","data":{"version":"1.2.3"}}' };
  } });
  assert.deepEqual(await transport({ method: 'GET', path: '/version' }), { version: '1.2.3' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timeout, 12000);
  await assert.rejects(transport({ method: 'PATCH', path: '/configs', body: { mode: 'global' } }), { code: 'READ_ONLY' });
  assert.equal(calls.length, 1);
});
