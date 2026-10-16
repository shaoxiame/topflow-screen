'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const confirmUI = require('../src/manager-confirm.js');

function fixture() {
  const observers = [], events = new Map();
  const doc = {
    activeElement: null,
    addEventListener(name, callback, capture) { assert.equal(capture, true); if (!events.has(name)) events.set(name, new Set()); events.get(name).add(callback); },
    removeEventListener(name, callback, capture) { assert.equal(capture, true); events.get(name)?.delete(callback); },
    createElement(tag) {
      const listeners = new Map(), attrs = new Map(), tokens = new Map();
      return {
        tagName: tag.toUpperCase(), children: [], parentNode: null, className: '', textContent: '',
        style: { setProperty(name, value) { tokens.set(name, value); }, removeProperty(name) { tokens.delete(name); }, getPropertyValue(name) { return tokens.get(name) || ''; } },
        appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
        setAttribute(name, value) { attrs.set(name, value); }, getAttribute(name) { return attrs.get(name) || null; },
        addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
        removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
        click() { for (const callback of [...(listeners.get('click') || [])]) callback({ target: this }); },
        focus() { doc.activeElement = this; doc.dispatch('focusin', { target: this }); },
        contains(target) { return this === target || this.children.some(child => child.contains(target)); },
        set innerHTML(_) { throw Error('Confirmation must not parse message as HTML'); }
      };
    },
    dispatch(name, properties = {}) {
      const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...properties };
      for (const callback of [...(events.get(name) || [])]) callback(event);
      return event;
    }
  };
  doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body'); doc.documentElement.appendChild(doc.body);
  const panel = doc.createElement('section'), trigger = doc.createElement('button');
  panel.setAttribute('data-tf-theme', 'dark'); panel.style.setProperty('--tf-text', '#eee');
  panel.appendChild(trigger); doc.body.appendChild(panel); trigger.focus();
  const root = {
    document: doc, getComputedStyle(element) { return element.style; },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; }
      disconnect() { this.disconnected = true; }
    }
  };
  for (const name of ['confirm', 'alert', 'fetch', 'localStorage', 'setInterval']) Object.defineProperty(root, name, { get() { throw Error('Confirmation must not access ' + name); } });
  function parts() {
    const overlay = doc.body.children.find(child => child.className.includes('tf-confirm-overlay'));
    if (!overlay) return {};
    const card = overlay.children[0], [eyebrow, title, message, actions] = card.children;
    return { overlay, card, eyebrow, title, message, cancel: actions.children[0], accept: actions.children[1] };
  }
  return { root, doc, panel, trigger, observers, events, parts, ui: confirmUI.create(root, panel) };
}

test('confirmation mounts outside the UFI component, escapes messages and resolves only its selected action', async () => {
  const f = fixture(), prompt = '<img src=x onerror=alert(1)>\n确认操作？', answer = f.ui.ask(prompt), p = f.parts();
  assert.equal(p.overlay.parentNode, f.doc.body); assert.equal(f.panel.contains(p.overlay), false);
  assert.equal(p.card.getAttribute('role'), 'dialog'); assert.equal(p.card.getAttribute('aria-modal'), 'true');
  assert.equal(p.card.getAttribute('aria-labelledby'), p.title.id); assert.equal(p.card.getAttribute('aria-describedby'), p.message.id);
  assert.equal(p.message.textContent, prompt); assert.equal(p.message.children.length, 0);
  assert.equal(f.doc.activeElement, p.cancel);
  assert.equal(await f.ui.ask('A second operation'), false);
  assert.equal(f.doc.body.children.filter(child => child.className.includes('tf-confirm-overlay')).length, 1);
  p.accept.click(); assert.equal(await answer, true); assert.equal(f.parts().overlay, undefined);
  assert.equal(f.doc.activeElement, f.trigger); assert.equal(f.observers[0].disconnected, true);
  for (const listeners of f.events.values()) assert.equal(listeners.size, 0);
  p.cancel.click(); // Detached buttons no longer invoke an action.
});

test('Tab is constrained in either direction, outside focus returns to cancel, and Escape cancels', async () => {
  const f = fixture(), answer = f.ui.ask('测试'), p = f.parts();
  let event = f.doc.dispatch('keydown', { key: 'Tab' });
  assert.equal(event.prevented, true); assert.equal(event.stopped, true); assert.equal(f.doc.activeElement, p.accept);
  f.doc.dispatch('keydown', { key: 'Tab' }); assert.equal(f.doc.activeElement, p.cancel);
  f.doc.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(f.doc.activeElement, p.accept);
  f.doc.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(f.doc.activeElement, p.cancel);
  f.trigger.focus(); assert.equal(f.doc.activeElement, p.cancel);
  event = f.doc.dispatch('keydown', { key: 'Escape' });
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  assert.equal(await answer, false); assert.equal(f.doc.activeElement, f.trigger);
});

test('open confirmation follows only the source panel theme and releases its observer after cancel', async () => {
  const f = fixture(), answer = f.ui.ask('主题'), p = f.parts(), observer = f.observers[0];
  assert.equal(p.overlay.getAttribute('data-tf-theme'), 'dark'); assert.equal(p.overlay.style.getPropertyValue('--tf-text'), '#eee');
  assert.equal(observer.target, f.panel); assert.deepEqual(observer.options, { attributes: true, attributeFilter: ['data-tf-theme', 'class', 'style'] });
  f.panel.setAttribute('data-tf-theme', 'light'); f.panel.style.setProperty('--tf-text', '#123'); observer.callback();
  assert.equal(p.overlay.getAttribute('data-tf-theme'), 'light'); assert.equal(p.overlay.style.getPropertyValue('--tf-text'), '#123');
  f.panel.style.removeProperty('--tf-text'); observer.callback(); assert.equal(p.overlay.style.getPropertyValue('--tf-text'), '');
  p.cancel.click(); assert.equal(await answer, false); assert.equal(observer.disconnected, true);
});

test('dispose cancels pending action, cleans listeners, ignores later asks and tolerates a removed focus target', async () => {
  const f = fixture(), answer = f.ui.ask('退出'), p = f.parts();
  f.panel.removeChild(f.trigger); f.ui.dispose(); f.ui.dispose();
  assert.equal(await answer, false); assert.equal(await f.ui.ask('再试'), false);
  assert.equal(f.parts().overlay, undefined); assert.equal(f.observers[0].disconnected, true);
  for (const listeners of f.events.values()) assert.equal(listeners.size, 0);
  p.accept.click();
});

test('a new confirmation after cancellation works and unavailable DOM fails closed without a native dialog', async () => {
  const f = fixture(), first = f.ui.ask('第一次'); f.parts().cancel.click(); assert.equal(await first, false);
  const second = f.ui.ask('第二次'); f.parts().accept.click(); assert.equal(await second, true);
  assert.equal(await confirmUI.create({}, null).ask('缺少页面'), false);
  const sandbox = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../src/manager-confirm.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.TopFlowManagerConfirm.create, 'function');
  assert.equal(await sandbox.TopFlowManagerConfirm.create({}, null).ask('缺少页面'), false);
});
