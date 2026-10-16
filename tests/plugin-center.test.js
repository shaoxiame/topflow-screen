'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const center = require('../src/plugin-center.js');
const URL = 'https://plugin.shaneyun.com/api/public/plugins';
const ID = 'cb3019be62c69ff3127098cb728c1d35';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  let clock = 1000000;
  const requests = [], states = [], instances = [], factories = [], docListeners = new Map(), rootListeners = new Map();
  function events(map) {
    return {
      addEventListener(name, callback) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback); },
      removeEventListener(name, callback) { map.get(name)?.delete(callback); },
    };
  }
  const document = { visibilityState: options.hidden ? 'hidden' : 'visible', ...events(docListeners) };
  const root = {
    document,
    location: { href: options.url || 'http://192.168.0.1:2333/' },
    Date: { now: () => clock },
    common_headers: { authorization: 'SYNTHETIC-LOCAL-AUTH' },
    fetch() { throw new Error('Public integration must not use host fetch'); },
    localStorage: { getItem() { throw new Error('No token or storage access'); }, setItem() { throw new Error('No storage writes'); } },
    ...events(rootListeners),
  };
  class XHR {
    constructor() { this.headers = {}; requests.push(this); }
    open(method, url, async) { Object.assign(this, { method, url, async }); }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; this.onabort?.(); }
    getResponseHeader(name) { return name === 'Retry-After' ? this.retryAfter || null : null; }
    respond(data, status = 200) { this.status = status; this.responseText = typeof data === 'string' ? data : JSON.stringify(data); this.onload(); }
  }
  root.XMLHttpRequest = XHR;
  const sdk = options.sdk === undefined ? { create(config) {
    factories.push(config);
    const instance = { starts: 0, stops: 0, start() { this.starts++; return Promise.resolve(null); }, stop() { this.stops++; } };
    instances.push(instance);
    return instance;
  } } : options.sdk;
  const adapter = center.create(root, {
    version: options.version || '0.1.9', sdk,
    enabled: options.enabled === undefined ? true : options.enabled,
    onChange(state) { states.push(state); if (options.onChange) options.onChange(state); if (options.throwOnChange) throw new Error('UI exception'); },
  });
  function respond(version = '0.1.9', extras = {}) { requests.at(-1).respond({ ok: true, plugins: [{ id: ID, version, ...extras }] }); }
  function emit(map, name) { for (const callback of [...(map.get(name) || [])]) callback({}); }
  return {
    adapter, root, requests, states, instances, factories, docListeners, rootListeners, respond,
    advance(ms) { clock += ms; },
    hide() { document.visibilityState = 'hidden'; emit(docListeners, 'visibilitychange'); },
    show() { document.visibilityState = 'visible'; emit(docListeners, 'visibilitychange'); },
    pagehide() { emit(rootListeners, 'pagehide'); },
    pageshow() { emit(rootListeners, 'pageshow'); },
  };
}
test('public catalog uses only fixed anonymous HTTPS XHR; exact version starts private SDK', async () => {
  const h = harness();
  const pending = h.adapter.start();
  assert.equal(h.adapter.getState().status, 'checking');
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].method, 'GET');
  assert.equal(h.requests[0].url, URL);
  assert.equal(h.requests[0].withCredentials, false);
  assert.equal(h.requests[0].timeout, 10000);
  assert.deepEqual(h.requests[0].headers, { Accept: 'application/json' });
  assert.equal(h.requests[0].body, null);
  assert.equal(h.instances.length, 0);
  h.respond();
  const result = await pending;
  assert.equal(result.status, 'current');
  assert.equal(result.telemetryActive, true);
  assert.deepEqual(h.factories, [{ baseUrl: 'https://plugin.shaneyun.com', pluginId: ID, pluginVersion: '0.1.9' }]);
  assert.equal(h.instances[0].starts, 1);
  h.adapter.stop();
});
test('initialization and concurrent checks are merged without directory polling', async () => {
  const h = harness();
  const a = h.adapter.start(), b = h.adapter.check(), c = h.adapter.start();
  assert.equal(a, b); assert.equal(b, c);
  h.respond(); await a; await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.instances[0].starts, 1);
  await h.adapter.start();
  assert.equal(h.requests.length, 1);
  h.adapter.stop();
});
test('newer catalog versions are advertised without starting wrong-version telemetry', async () => {
  const h = harness(); const pending = h.adapter.start(); h.respond('0.1.10');
  const state = await pending;
  assert.equal(state.status, 'update-available');
  assert.equal(state.publishedVersion, '0.1.10');
  assert.equal(state.telemetryActive, false);
  assert.equal(h.instances.length, 0);
  h.adapter.stop();
});
test('older published version does not downgrade or impersonate current build', async () => {
  const h = harness(); const pending = h.adapter.start(); h.respond('0.1.8');
  const state = await pending;
  assert.equal(state.status, 'unpublished');
  assert.equal(state.currentVersion, '0.1.9');
  assert.equal(state.publishedVersion, '0.1.8');
  assert.equal(h.instances.length, 0);
  const retry = h.adapter.check(); h.respond('0.1.9'); await retry;
  assert.equal(h.instances[0].starts, 1);
  h.adapter.stop();
});
test('missing plugin is unpublished and waits for explicit check', async () => {
  const h = harness(); const pending = h.adapter.start();
  h.requests[0].respond({ ok: true, plugins: [{ id: 'a'.repeat(32), version: '0.1.9' }] });
  assert.equal((await pending).status, 'unpublished');
  assert.equal(h.adapter.getState().publishedVersion, null);
  await flush(); assert.equal(h.requests.length, 1);
  h.adapter.stop();
});
test('all localhost and file previews skip public/device requests even if enabled', async () => {
  for (const url of ['http://localhost:8877/', 'http://preview.localhost/', 'http://localhost.:8877/', 'http://127.0.0.1:8877/', 'http://127.2.3.4/', 'http://[::1]:8877/', 'file:///C:/preview.html', 'http://0.0.0.0/']) {
    const h = harness({ url }); const state = await h.adapter.start();
    assert.equal(state.reason, 'preview', url);
    assert.equal(h.requests.length, 0, url);
    assert.equal(h.instances.length, 0, url);
    assert.equal(h.rootListeners.size, 0, url);
    assert.equal((await h.adapter.check()).reason, 'preview', url);
    h.adapter.stop();
  }
});
test('disabled adapter and invalid local release version never request', async () => {
  for (const options of [{ enabled: false }, { version: '<script>' }, { version: '0.01.9' }, { version: 'v0.1.9' }, { version: '0.1.9-beta.01' }]) {
    const h = harness(options); await h.adapter.start();
    assert.equal(h.requests.length, 0);
    assert.equal(h.instances.length, 0);
    assert.equal(h.adapter.getState().status, 'unavailable');
    h.adapter.stop();
  }
});
test('remote version cannot inject arbitrary labels or HTML', async () => {
  const h = harness(); const pending = h.adapter.start(); h.respond('<img src=x onerror=alert(1)>', { name: '<script>', description: 'malicious text' });
  const state = await pending;
  assert.equal(state.status, 'unavailable'); assert.equal(state.reason, 'response');
  assert.equal(state.publishedVersion, null);
  assert.doesNotMatch(JSON.stringify(h.states), /<script>|<img|malicious/);
  h.adapter.stop();
});
test('duplicate own ID, invalid catalog and excessive list length are rejected', async () => {
  const cases = [
    { ok: true, plugins: [{ id: ID, version: '0.1.9' }, { id: ID, version: '0.1.10' }] },
    { ok: false, plugins: [{ id: ID, version: '0.1.9' }] },
    { ok: true, plugins: {} },
    { ok: true, plugins: Array(1025).fill({ id: 'a'.repeat(32), version: '0.1.9' }) },
    'not json',
  ];
  for (const body of cases) {
    const h = harness(); const pending = h.adapter.start(); h.requests[0].respond(body);
    assert.equal((await pending).reason, 'response'); assert.equal(h.instances.length, 0); h.adapter.stop();
  }
});
test('oversized, redirected and timed-out responses stop safely', async () => {
  for (const fail of [
    xhr => xhr.respond('x'.repeat(262145)),
    xhr => xhr.respond(JSON.stringify({ text: '中'.repeat(100000) })),
    xhr => xhr.onprogress({ loaded: 262145 }),
    xhr => { xhr.responseURL = 'https://other.invalid/api/public/plugins'; xhr.respond({ ok: true, plugins: [] }); },
    xhr => xhr.ontimeout(),
  ]) {
    const h = harness(); const pending = h.adapter.start(); fail(h.requests[0]);
    assert.equal((await pending).status, 'unavailable'); assert.equal(h.instances.length, 0); h.adapter.stop();
  }
});
test('hidden initial page waits; visibility resumes one catalog read', async () => {
  const h = harness({ hidden: true });
  assert.equal((await h.adapter.start()).reason, 'hidden');
  await h.adapter.check(); assert.equal(h.requests.length, 0);
  h.show(); assert.equal(h.requests.length, 1); h.respond(); await flush();
  assert.equal(h.instances[0].starts, 1);
  h.hide(); assert.equal(h.instances[0].stops, 1);
  h.show(); assert.equal(h.instances[0].starts, 2);
  assert.equal(h.requests.length, 1);
  h.adapter.stop();
});
test('hiding cancels in-flight catalog and discards late response', async () => {
  const h = harness(); const pending = h.adapter.start(); h.hide();
  assert.equal(h.requests[0].aborted, true);
  h.respond(); await pending;
  assert.equal(h.instances.length, 0);
  assert.equal(h.adapter.getState().reason, 'hidden');
  h.show(); assert.equal(h.requests.length, 2); h.respond(); await flush();
  assert.equal(h.instances[0].starts, 1); h.adapter.stop();
});
test('pagehide suspends SDK and pageshow restores without extra catalog polling', async () => {
  const h = harness(); const pending = h.adapter.start(); h.respond(); await pending;
  h.pagehide(); assert.equal(h.instances[0].stops, 1);
  await h.adapter.check(); assert.equal(h.requests.length, 1);
  h.pageshow(); assert.equal(h.instances[0].starts, 2);
  assert.equal(h.requests.length, 1); h.adapter.stop();
});
test('stop aborts pending directory, removes all listeners and check cannot restart', async () => {
  const h = harness(); const pending = h.adapter.start(); h.adapter.stop(); await pending;
  assert.equal(h.requests[0].aborted, true);
  for (const map of [h.docListeners, h.rootListeners]) for (const callbacks of map.values()) assert.equal(callbacks.size, 0);
  await h.adapter.check(); h.show(); h.pageshow();
  assert.equal(h.requests.length, 1);
  assert.equal(h.adapter.getState().reason, 'stopped');
  const restart = h.adapter.start(); assert.equal(h.requests.length, 2); h.respond(); await restart; h.adapter.stop();
});
test('UI disposal during checking callback prevents the pending network request', async () => {
  let adapter;
  const h = harness({ onChange(state) { if (state.status === 'checking') adapter.stop(); } });
  adapter = h.adapter;
  assert.equal((await adapter.start()).reason, 'stopped');
  assert.equal(h.requests.length, 0);
  assert.equal(h.instances.length, 0);
});
test('stop terminates SDK and all handlers; late callbacks cannot reactivate it', async () => {
  const h = harness(); const pending = h.adapter.start(); h.respond(); await pending;
  h.adapter.stop(); assert.equal(h.instances[0].stops, 1);
  h.show(); h.pageshow(); await h.adapter.check();
  assert.equal(h.instances[0].starts, 1);
  assert.equal(h.adapter.getState().telemetryActive, false);
  for (const map of [h.docListeners, h.rootListeners]) for (const callbacks of map.values()) assert.equal(callbacks.size, 0);
});
test('network failures use bounded backoff and never schedule automatic retries', async () => {
  const h = harness(); let pending = h.adapter.start();
  for (let i = 0; i < 9; i++) {
    if (i) pending = h.adapter.check();
    h.requests.at(-1).onerror(); await pending;
    const before = h.requests.length;
    assert.equal((await h.adapter.check()).reason, 'backoff');
    assert.equal(h.requests.length, before);
    h.advance(60001); await flush(); assert.equal(h.requests.length, before);
  }
  pending = h.adapter.check(); h.respond(); await pending;
  assert.equal(h.adapter.getState().status, 'current'); h.adapter.stop();
});
test('429 respects Retry-After and imposes an upper bound without timers', async () => {
  const h = harness(); const pending = h.adapter.start();
  h.requests[0].retryAfter = '300'; h.requests[0].respond({}, 429); await pending;
  h.advance(299000); await h.adapter.check(); assert.equal(h.requests.length, 1);
  h.advance(1001); const retry = h.adapter.check(); assert.equal(h.requests.length, 2);
  h.requests[1].retryAfter = '999999999999'; h.requests[1].respond({}, 429); await retry;
  h.advance(3600001); const next = h.adapter.check(); assert.equal(h.requests.length, 3);
  h.respond(); await next; h.adapter.stop();
});
test('previously started telemetry stops when explicit recheck reports a new release', async () => {
  const h = harness(); const first = h.adapter.start(); h.respond(); await first;
  const check = h.adapter.check(); h.respond('0.2.0'); await check;
  assert.equal(h.instances[0].stops, 1);
  assert.equal(h.adapter.getState().telemetryActive, false);
  assert.equal(h.adapter.getState().status, 'update-available'); h.adapter.stop();
});
test('semver release ordering handles prerelease numerically and never treats metadata as exact', async () => {
  for (const [local, remote, expected] of [
    ['0.1.9-beta.2', '0.1.9-beta.10', 'update-available'],
    ['0.1.9', '0.1.9-beta.10', 'unpublished'],
    ['0.1.9-beta.2', '0.1.9', 'update-available'],
    ['0.1.9+one', '0.1.9+two', 'unpublished'],
    ['0.1.9-alpha', '0.1.9-alpha.1', 'update-available'],
  ]) {
    const h = harness({ version: local }); const pending = h.adapter.start(); h.respond(remote);
    assert.equal((await pending).status, expected, local + ' / ' + remote);
    assert.equal(h.instances.length, 0); h.adapter.stop();
  }
});
test('callback and SDK exceptions cannot escape into screen initialization', async () => {
  for (const sdk of [null, { create() { throw new Error('failure'); } }, { create() { return { start() { return Promise.reject(new Error('failure')); }, stop() {} }; } }]) {
    const h = harness({ sdk, throwOnChange: true }); const pending = h.adapter.start(); h.respond(); await pending; await flush();
    assert.equal(h.adapter.getState().telemetryActive, false);
    assert.equal(h.adapter.getState().status, 'current'); h.adapter.stop();
  }
});
test('vendored official SDK bytes and provenance pin the audited version', {skip: !fs.existsSync(path.join(__dirname, '../vendor/ufi-device-sdk-2.0.0.js')) && 'SDK is an explicit, hash-checked download; not an open-source dependency'}, () => {
  const vendor = fs.readFileSync(path.join(__dirname, '../vendor/ufi-device-sdk-2.0.0.js'));
  const provenance = JSON.parse(fs.readFileSync(path.join(__dirname, '../vendor/ufi-device-sdk-provenance.json'), 'utf8'));
  assert.equal(crypto.createHash('sha256').update(vendor).digest('hex'), '50d461aa76f1d35efba50f2b598c08f9b5ba518ae59799546a5862bfac82fc7d');
  assert.equal(provenance.sha256, '50d461aa76f1d35efba50f2b598c08f9b5ba518ae59799546a5862bfac82fc7d');
  assert.equal(provenance.version, '2.0.0');
  assert.equal(provenance.source, 'https://plugin.shaneyun.com/assets/device-sdk.js');
  assert.equal(provenance.modified, false);
});
