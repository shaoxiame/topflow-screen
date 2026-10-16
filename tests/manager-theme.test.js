'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const theme = require('../src/manager-theme.js');

function fixture({ host = false, darkOS = false } = {}) {
  const node = () => ({ className: '', attrs: {}, getAttribute(name) { return this.attrs[name] || null; } });
  const doc = { body: node(), documentElement: node() };
  const style = () => ({ backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', tokens: {}, getPropertyValue(name) { return this.tokens[name] || ''; } });
  const body = style(), html = style(), observers = [], listeners = new Set();
  let mediaQueries = 0;
  if (host) body.tokens['--dark-bg-color'] = 'hsl(211 32% 17%)';
  const preference = { matches: darkOS };
  preference.addEventListener = (name, listener) => { assert.equal(name, 'change'); listeners.add(listener); };
  preference.removeEventListener = (name, listener) => { assert.equal(name, 'change'); listeners.delete(listener); };
  const root = {
    document: doc,
    getComputedStyle(element) { return element === doc.body ? body : html; },
    matchMedia() { mediaQueries++; return preference; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
      observe(target, options) { this.targets.push({ target, options }); }
      disconnect() { this.disconnected = true; }
    }
  };
  for (const name of ['localStorage', 'sessionStorage', 'fetch', 'setInterval']) {
    Object.defineProperty(root, name, { get() { throw new Error('Theme helper must not access ' + name); } });
  }
  function mutate(target, name) {
    for (const observer of observers) {
      if (!observer.disconnected && observer.targets.some(item => item.target === target && item.options.attributeFilter.includes(name))) {
        observer.callback([{ target, attributeName: name, type: 'attributes' }]);
      }
    }
  }
  function system(matches) { preference.matches = matches; for (const listener of [...listeners]) listener({ matches }); }
  return { root, doc, body, html, observers, listeners, mutate, system, get mediaQueries() { return mediaQueries; } };
}

test('UFI computed surface defines appearance regardless of unrelated markers or OS changes', () => {
  const f = fixture({ host: true });
  f.body.backgroundColor = 'rgb(25, 42, 57)';
  f.body.color = 'rgb(238, 238, 238)';
  f.doc.body.attrs['data-theme'] = 'light';
  assert.equal(theme.read(f.root, f.doc), 'dark');
  f.system(true);
  f.body.tokens['--dark-bg-color'] = '#f3f6fb';
  f.body.backgroundColor = 'rgb(243, 246, 251)';
  f.body.color = 'rgb(28, 42, 63)';
  f.doc.body.attrs['data-theme'] = 'dark';
  assert.equal(theme.read(f.root, f.doc), 'light');
  assert.equal(f.mediaQueries, 0);
});

test('translucent backgrounds composite against an opaque root, otherwise resolved foreground decides', () => {
  const f = fixture({ host: true });
  f.body.backgroundColor = 'rgba(0, 0, 0, 0.2)';
  f.html.backgroundColor = 'rgb(255, 255, 255)';
  f.body.color = 'rgb(240, 240, 240)';
  assert.equal(theme.read(f.root, f.doc), 'light');
  f.html.backgroundColor = 'rgba(0, 0, 0, 0)';
  assert.equal(theme.read(f.root, f.doc), 'dark');
  f.body.backgroundColor = 'rgba(0, 0, 0, 0)';
  assert.equal(theme.read(f.root, f.doc), 'dark');
  f.body.color = 'rgb(10% 10% 10% / 100%)';
  f.system(true);
  assert.equal(theme.read(f.root, f.doc), 'light');
  f.body.backgroundColor = 'rgb(8 15 24 / 100%)';
  assert.equal(theme.read(f.root, f.doc), 'dark');
});

test('root UFI tokens also enable host detection when body only exposes resolved inherited colors', () => {
  const f = fixture();
  f.html.tokens['--dark-text-color'] = '#eee';
  f.body.backgroundColor = 'rgb(25, 42, 57)';
  f.body.color = 'rgb(238, 238, 238)';
  assert.equal(theme.read(f.root, f.doc), 'dark');
});

test('without UFI tokens explicit host markers take precedence and OS changes have no effect', () => {
  const f = fixture({ darkOS: true });
  f.doc.documentElement.attrs['data-bs-theme'] = 'light';
  assert.equal(theme.read(f.root, f.doc), 'light');
  f.doc.body.className = 'something dark-mode another';
  f.system(false);
  assert.equal(theme.read(f.root, f.doc), 'dark');
  f.doc.body.attrs['data-theme'] = 'light';
  assert.equal(theme.read(f.root, f.doc), 'light');
  f.doc.body.attrs = {}; f.doc.body.className = ''; f.doc.documentElement.attrs = {};
  assert.equal(theme.read(f.root, f.doc), 'light');
  f.system(true);
  assert.equal(theme.read(f.root, f.doc), 'light');
  assert.equal(f.mediaQueries, 0);
});

test('without tokens or markers resolved host surface and text still determine readable appearance', () => {
  const f=fixture();f.body.backgroundColor='rgb(20, 32, 45)';
  assert.equal(theme.read(f.root,f.doc),'dark');
  f.body.backgroundColor='rgba(0, 0, 0, 0)';f.html.backgroundColor='rgb(250, 250, 250)';
  assert.equal(theme.read(f.root,f.doc),'light');
  f.html.backgroundColor='rgba(0, 0, 0, 0)';f.body.color='rgb(240, 240, 240)';
  assert.equal(theme.read(f.root,f.doc),'dark');assert.equal(f.mediaQueries,0);
});

test('watch immediately delivers, follows bounded host style changes, and completely disposes', () => {
  const f = fixture({ host: true }), received = [];
  f.body.backgroundColor = 'rgb(25, 42, 57)';
  const dispose = theme.watch(f.root, f.doc, value => received.push(value));
  assert.deepEqual(received, ['dark']);
  assert.equal(f.observers.length, 1);
  assert.equal(f.observers[0].targets.length, 2);
  for (const { options } of f.observers[0].targets) {
    assert.equal(options.attributes, true);
    assert.equal(options.subtree, undefined);
    assert.equal(options.childList, undefined);
    assert.deepEqual(options.attributeFilter, ['class', 'style', 'data-theme', 'data-bs-theme']);
  }
  f.body.backgroundColor = 'rgb(250, 250, 250)';
  f.mutate(f.doc.body, 'style');
  f.mutate(f.doc.body, 'style'); // Same visual theme need not repaint the manager.
  f.system(true); // UFI still owns the visible theme.
  assert.deepEqual(received, ['dark', 'light']);
  dispose(); dispose();
  assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.listeners.size, 0);
  f.body.backgroundColor = 'rgb(0, 0, 0)';
  f.mutate(f.doc.body, 'style'); f.system(false);
  assert.deepEqual(received, ['dark', 'light']);
});

test('watch never reads or subscribes to OS theme, and only host changes trigger appearance updates', () => {
  const f = fixture(), received = [];
  const dispose = theme.watch(f.root, f.doc, value => received.push(value));
  f.system(true);
  assert.deepEqual(received, ['light']);assert.equal(f.mediaQueries,0);assert.equal(f.listeners.size,0);
  f.body.backgroundColor='rgb(20, 32, 45)';f.mutate(f.doc.body,'style');
  assert.deepEqual(received,['light','dark']);
  dispose();
  assert.equal(f.listeners.size, 0);
  f.system(false);
  assert.deepEqual(received, ['light', 'dark']);
  assert.equal(f.mediaQueries,0);
  const source=fs.readFileSync(require.resolve('../src/manager-theme.js'),'utf8');
  assert.doesNotMatch(source,/matchMedia|prefers-color-scheme|localStorage|sessionStorage/);
});

test('browser UMD helper is independent and safe without optional browser capabilities', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/manager-theme.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.TopFlowManagerTheme.read, 'function');
  assert.equal(sandbox.TopFlowManagerTheme.read({}, {}), 'light');
  const received = [], dispose = sandbox.TopFlowManagerTheme.watch({}, {}, value => received.push(value));
  assert.deepEqual(received, ['light']);
  dispose();
});
