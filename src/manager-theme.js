(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowManagerTheme = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var attributes = ['class', 'style', 'data-theme', 'data-bs-theme'];

  function computed(root, element) {
    if (!element || !root || typeof root.getComputedStyle !== 'function') return null;
    try { return root.getComputedStyle(element); } catch (_) { return null; }
  }

  function property(style, name) {
    if (!style || typeof style.getPropertyValue !== 'function') return '';
    return String(style.getPropertyValue(name) || '').trim();
  }

  // Browser-computed colors resolve UFI's hex/HSL/custom-property declarations.
  // Do not interpret the name "dark" in a host token as a theme selection.
  function color(value) {
    var match = /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i.exec(String(value || '').trim());
    if (!match) return null;
    var rgb = [1, 3, 5].map(function (index) {
      return Math.max(0, Math.min(255, Number(match[index]) * (match[index + 1] ? 2.55 : 1)));
    });
    rgb.push(match[7] == null ? 1 : Math.max(0, Math.min(1, Number(match[7]) / (match[8] ? 100 : 1))));
    return rgb;
  }

  function luminance(rgb) {
    var linear = rgb.slice(0, 3).map(function (channel) {
      var value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }

  function surface(background, behind) {
    if (background && background[3] >= 0.999) return background;
    if (!behind || behind[3] < 0.999) return null;
    if (!background) return behind;
    return background.slice(0, 3).map(function (channel, index) {
      return channel * background[3] + behind[index] * (1 - background[3]);
    }).concat(1);
  }

  function explicit(element) {
    if (!element) return '';
    var names = ['data-theme', 'data-bs-theme'];
    if (typeof element.getAttribute === 'function') {
      for (var i = 0; i < names.length; i++) {
        var value = String(element.getAttribute(names[i]) || '').toLowerCase();
        if (value === 'dark' || value === 'light') return value;
      }
    }
    var classes = ' ' + String(element.className || '').replace(/\s+/g, ' ') + ' ';
    if (/ (?:dark|dark-mode) /.test(classes)) return 'dark';
    if (/ (?:light|light-mode) /.test(classes)) return 'light';
    return '';
  }

  function appearance(body, html) {
    var background = surface(color(body && body.backgroundColor), color(html && html.backgroundColor));
    if (background) return luminance(background) < 0.179 ? 'dark' : 'light';
    // A transparent host may sit over wallpaper. Use the host's resolved text
    // color as its readability choice, without introducing a separate theme.
    var foreground = color(body && body.color) || color(html && html.color);
    return foreground && foreground[3] > 0 ? (luminance(foreground) >= 0.179 ? 'dark' : 'light') : '';
  }

  function read(root, doc) {
    doc = doc || root && root.document || {};
    var body = computed(root, doc.body), html = computed(root, doc.documentElement);
    var host = property(body, '--dark-bg-color') || property(body, '--dark-text-color') ||
      property(html, '--dark-bg-color') || property(html, '--dark-text-color');
    var resolved = appearance(body, html);
    if (host && resolved) return resolved;
    var selected = explicit(doc.body) || explicit(doc.documentElement);
    if (selected) return selected;
    return resolved || 'light';
  }

  function watch(root, doc, callback) {
    doc = doc || root && root.document || {};
    var disposed = false, last = '', observer = null;
    function update() {
      if (disposed) return;
      var next = read(root, doc);
      if (next !== last) { last = next; callback(next); }
    }
    if (root && typeof root.MutationObserver === 'function') {
      observer = new root.MutationObserver(update);
      if (doc.documentElement) observer.observe(doc.documentElement, { attributes: true, attributeFilter: attributes.slice() });
      if (doc.body && doc.body !== doc.documentElement) observer.observe(doc.body, { attributes: true, attributeFilter: attributes.slice() });
    }
    update();
    return function () {
      if (disposed) return;
      disposed = true;
      if (observer) observer.disconnect();
    };
  }

  return { read: read, watch: watch };
});
