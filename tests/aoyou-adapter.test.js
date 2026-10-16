'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const aoyou = require('../src/aoyou-adapter.js');

const proxies = {
  '出口 / A': { type: 'Selector', now: '节点一', all: ['节点一', '节点二'] },
  自动: { type: 'URLTest', now: '节点一', all: ['节点一', '节点二'] },
  节点一: { type: 'Shadowsocks', alive: true, history: [{ delay: 29 }], password: 'MUST_NOT_EXPORT' },
  节点二: { type: 'Trojan', alive: false, history: [{ delay: 0 }] }
};

test('inventory parser inspects source without executing scripts and last duplicate wins', () => {
  global.__aoyouExecuted = false;
  const source = '<!-- [KANO_PLUGIN_START] 遨游世界 -->' +
    '<!-- [KANO_META] v=2.9.0;sid=hidden -->' +
    '<script>global.__aoyouExecuted=true;throw new Error("do not execute")</script>' +
    '<!-- [KANO_PLUGIN_END] 遨游世界 -->' +
    '<!-- [KANO_PLUGIN_START] 遨游世界 --><!-- [KANO_META] v=2.9.1 -->' +
    '<!-- [kano_disabled] --><!-- [KANO_PLUGIN_END] 遨游世界 -->';
  assert.deepEqual(aoyou.parsePluginInventory(source), [{ name: '遨游世界', version: '2.9.1', disabled: true }]);
  assert.equal(global.__aoyouExecuted, false);
  delete global.__aoyouExecuted;
});

test('snapshot output retains only visible state, never secrets or subscriptions', async () => {
  const adapter = aoyou.createAdapter({ snapshot: {
    running: true, mode: 'rule', version: 'v1.19.32', proxies,
    secret: 'MUST_NOT_EXPORT', subscription: 'MUST_NOT_EXPORT',
    settings: { password: 'MUST_NOT_EXPORT' }
  } });
  const state = await adapter.getState();
  assert.equal(state.source, 'snapshot');
  assert.equal(state.running, true);
  assert.equal(state.groups[0].nodes[0].delayMs, 29);
  assert.equal(state.groups[0].nodes[1].delayMs, null);
  assert.equal(JSON.stringify(state).includes('MUST_NOT_EXPORT'), false);
});

test('default mode permits only three GET reads and rejects all mutations', async () => {
  const calls = [];
  const adapter = aoyou.createAdapter({ transport: async (request) => {
    calls.push(request);
    return request.path === '/version' ? { version: '1.0' } : request.path === '/configs' ? { mode: 'rule' } : { proxies };
  } });
  await adapter.getState();
  assert.deepEqual(calls.map(x => [x.method, x.path]), [['GET', '/version'], ['GET', '/configs'], ['GET', '/proxies']]);
  await assert.rejects(adapter.selectProxy('出口 / A', '节点二', { userInitiated: true }), { code: 'READ_ONLY' });
  await assert.rejects(adapter.setMode('global', { userInitiated: true }), { code: 'READ_ONLY' });
  assert.equal(calls.length, 3);
});

test('demo interaction changes local state and cannot call a device transport', async () => {
  const adapter = aoyou.createAdapter({ mode: 'demo', snapshot: { mode: 'rule', proxies }, transport: () => { throw new Error('network must not run'); } });
  await adapter.getState();
  await adapter.selectProxy('出口 / A', '节点二', { userInitiated: true });
  await adapter.setMode('global', { userInitiated: true });
  const state = await adapter.getState();
  assert.equal(state.demo, true);
  assert.equal(state.mode, 'global');
  assert.equal(state.groups[0].selected, '节点二');
});

test('control requires an explicit user action and validates a known selector member', async () => {
  const calls = [];
  const adapter = aoyou.createAdapter({ mode: 'control', snapshot: { proxies }, transport: async request => { calls.push(request); } });
  await assert.rejects(adapter.selectProxy('出口 / A', '节点二'), { code: 'USER_ACTION_REQUIRED' });
  await assert.rejects(adapter.selectProxy('出口 / A', 'unknown', { userInitiated: true }), { code: 'UNKNOWN_NODE' });
  await assert.rejects(adapter.selectProxy('自动', '节点二', { userInitiated: true }), { code: 'AUTOMATIC_GROUP' });
  await assert.rejects(adapter.setMode('unrecognized', { userInitiated: true }), { code: 'INVALID_MODE' });
  assert.deepEqual(calls, []);
});

test('control URI-encodes group names and confirms node selection from a fresh GET', async () => {
  const calls = [];
  const adapter = aoyou.createAdapter({ mode: 'control', snapshot: { proxies }, transport: async request => {
    calls.push(request);
    return request.method === 'GET' ? { now: '节点二' } : null;
  } });
  assert.deepEqual(await adapter.selectProxy('出口 / A', '节点二', { userInitiated: true }), {
    confirmed: true, demo: false, group: '出口 / A', selected: '节点二'
  });
  assert.equal(calls[0].path, '/proxies/' + encodeURIComponent('出口 / A'));
  assert.deepEqual(calls[0].body, { name: '节点二' });
  assert.equal(calls[1].method, 'GET');
});

test('a mutation is not reported successful when the engine has not confirmed it', async () => {
  const adapter = aoyou.createAdapter({ mode: 'control', snapshot: { proxies, mode: 'rule' }, transport: async () => ({ now: '节点一', mode: 'rule' }) });
  await assert.rejects(adapter.selectProxy('出口 / A', '节点二', { userInitiated: true }), { code: 'NOT_CONFIRMED' });
  await assert.rejects(adapter.setMode('global', { userInitiated: true }), { code: 'NOT_CONFIRMED' });
});

test('mode control uses PATCH, verifies state and declares that it is not persisted', async () => {
  const calls = [];
  const adapter = aoyou.createAdapter({ mode: 'control', transport: async request => { calls.push(request); return { mode: 'direct' }; } });
  assert.deepEqual(await adapter.setMode('direct', { userInitiated: true }), { confirmed: true, demo: false, mode: 'direct', persistent: false });
  assert.deepEqual(calls, [{ method: 'PATCH', path: '/configs', body: { mode: 'direct' } }, { method: 'GET', path: '/configs' }]);
});

test('transport failure is unknown state, never a false stopped status or leaked error', async () => {
  const adapter = aoyou.createAdapter({ snapshot: { running: true }, transport: async () => { throw new Error('password=MUST_NOT_EXPORT'); } });
  const state = await adapter.getState();
  assert.equal(state.running, null);
  assert.equal(state.errors.length, 3);
  assert.equal(JSON.stringify(state).includes('MUST_NOT_EXPORT'), false);
  assert.equal(adapter.managementEntry().available, false);
});
