(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TopFlowPluginCenter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BASE = 'https://plugin.shaneyun.com';
  var PLUGIN_ID = 'cb3019be62c69ff3127098cb728c1d35';
  var CATALOG = BASE + '/api/public/plugins';
  var MAX_BYTES = 262144;
  var LABELS = {
    checking: '正在检查插件中心版本',
    current: '插件中心已公开本版本',
    'update-available': '插件中心有新版本，请通过 UFI 插件商店更新',
    unpublished: '本版本尚未在插件中心公开，统计暂不启动',
    unavailable: '插件中心暂不可用，屏幕功能不受影响'
  };
  function semver(value) {
    if (typeof value !== 'string' || value.length > 100) return null;
    var match = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
    if (!match) return null;
    var prerelease = match[4] ? match[4].split('.') : [];
    if (prerelease.some(function (part) { return /^\d+$/.test(part) && part.length > 1 && part.charAt(0) === '0'; })) return null;
    return { value: value, core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: prerelease };
  }
  function compare(a, b) {
    for (var i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
    if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
    for (var j = 0; j < Math.max(a.prerelease.length, b.prerelease.length); j++) {
      var left = a.prerelease[j], right = b.prerelease[j];
      if (left === undefined || right === undefined) return left === undefined ? -1 : 1;
      if (left === right) continue;
      var ln = /^\d+$/.test(left), rn = /^\d+$/.test(right);
      if (ln && rn) return left.length !== right.length ? left.length > right.length ? 1 : -1 : left > right ? 1 : -1;
      if (ln !== rn) return ln ? -1 : 1;
      return left > right ? 1 : -1;
    }
    return 0;
  }
  function preview(root) {
    try {
      var url = new URL(root.location.href);
      var hostname = url.hostname.toLowerCase().replace(/\.$/, '');
      return !/^https?:$/.test(url.protocol) || hostname === 'localhost' || /\.localhost$/.test(hostname) || /^127\./.test(hostname) || hostname === '[::1]' || hostname === '::1' || hostname === '0.0.0.0';
    } catch (_) { return true; }
  }
  function create(root, options) {
    options = options || {};
    var current = semver(options.version);
    var allowed = options.enabled === true && current && !preview(root);
    var running = false, suspended = false, generation = 0, pending = null, abortCatalog = null;
    var telemetry = null, telemetryActive = false, failures = 0, retryAt = 0, lastOutcome = null;
    var state = Object.freeze({ status: 'unavailable', label: LABELS.unavailable, currentVersion: current ? current.value : null, publishedVersion: null, telemetryActive: false, reason: 'stopped' });
    function disabledReason() { return preview(root) ? 'preview' : !current ? 'invalid-version' : 'disabled'; }
    function now() { return root.Date && typeof root.Date.now === 'function' ? root.Date.now() : Date.now(); }
    function visible() { return !!(root.document && root.document.visibilityState === 'visible') && !suspended; }
    function publish(status, reason, publishedVersion) {
      var label = LABELS[status] || LABELS.unavailable;
      if (reason === 'preview') label = '电脑预览，不连接插件中心';
      else if (reason === 'disabled') label = '插件中心接入未启用';
      else if (reason === 'hidden') label = '页面已隐藏，插件中心连接已暂停';
      else if (reason === 'stopped') label = '插件中心连接已停止';
      else if (reason === 'backoff') label = '插件中心暂不可用，请稍后再检查';
      state = Object.freeze({ status: status, label: label, currentVersion: current ? current.value : null, publishedVersion: semver(publishedVersion) ? publishedVersion : null, telemetryActive: telemetryActive, reason: reason || null });
      if (typeof options.onChange === 'function') { try { options.onChange(state); } catch (_) {} }
      return state;
    }
    function stopTelemetry() {
      telemetryActive = false;
      if (telemetry && typeof telemetry.stop === 'function') { try { telemetry.stop(); } catch (_) {} }
    }
    function startTelemetry() {
      if (!running || !visible() || !lastOutcome || lastOutcome.status !== 'current' || telemetryActive) return;
      try {
        if (!telemetry) {
          var factory = typeof options.sdk === 'function' ? options.sdk : options.sdk && options.sdk.create;
          if (typeof factory !== 'function') throw new Error('SDK unavailable');
          telemetry = factory.call(options.sdk, { baseUrl: BASE, pluginId: PLUGIN_ID, pluginVersion: current.value });
          if (!telemetry || typeof telemetry.start !== 'function' || typeof telemetry.stop !== 'function') throw new Error('SDK unavailable');
        }
        telemetryActive = true;
        var epoch = generation;
        Promise.resolve(telemetry.start()).catch(function () {
          if (!running || generation !== epoch) return;
          stopTelemetry();
          publish('current', 'sdk-unavailable', lastOutcome.publishedVersion);
        });
      } catch (_) { stopTelemetry(); }
    }
    function cancelCatalog() {
      generation++;
      var cancel = abortCatalog;
      abortCatalog = null;
      pending = null;
      if (cancel) cancel();
    }
    function attach() {
      root.document.addEventListener('visibilitychange', visibilityChanged);
      root.addEventListener('pagehide', pageHidden);
      root.addEventListener('pageshow', pageShown);
    }
    function detach() {
      if (root.document && typeof root.document.removeEventListener === 'function') root.document.removeEventListener('visibilitychange', visibilityChanged);
      if (typeof root.removeEventListener === 'function') { root.removeEventListener('pagehide', pageHidden); root.removeEventListener('pageshow', pageShown); }
    }
    function pause() {
      cancelCatalog(); stopTelemetry();
      publish('unavailable', 'hidden', lastOutcome && lastOutcome.publishedVersion);
    }
    function resume() {
      if (!running || !visible()) return;
      if (lastOutcome) {
        startTelemetry();
        publish(lastOutcome.status, null, lastOutcome.publishedVersion);
      } else check();
    }
    function visibilityChanged() { if (!running) return; if (!visible()) pause(); else resume(); }
    function pageHidden() { if (!running) return; suspended = true; pause(); }
    function pageShown() { if (!running || !suspended) return; suspended = false; resume(); }
    function failure(reason, retryAfter) {
      stopTelemetry();
      failures = Math.min(7, failures + 1);
      var delay = Math.min(60000, 1000 * Math.pow(2, failures - 1));
      // Honor server throttling with a bounded one-hour ceiling. No retry timer:
      // only an explicit check or a visibility resume may make the next request.
      if (Number.isFinite(retryAfter)) delay = Math.max(delay, Math.min(3600000, Math.max(0, retryAfter)));
      retryAt = now() + delay;
      return publish('unavailable', reason, null);
    }
    function catalog() {
      return new Promise(function (resolve, reject) {
        var xhr, settled = false;
        function finish(error, result) {
          if (settled) return;
          settled = true;
          if (abortCatalog === cancel) abortCatalog = null;
          if (error) reject(error); else resolve(result);
        }
        function cancel() { finish({ reason: 'cancelled' }); if (xhr) { try { xhr.abort(); } catch (_) {} } }
        abortCatalog = cancel;
        try {
          xhr = new root.XMLHttpRequest();
          xhr.open('GET', CATALOG, true);
          xhr.withCredentials = false;
          xhr.timeout = 10000;
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.onload = function () {
            if (xhr.status !== 200) {
              var retryAfter = null;
              if (xhr.status === 429 && typeof xhr.getResponseHeader === 'function') {
                var header = xhr.getResponseHeader('Retry-After') || '';
                retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now();
              }
              finish({ reason: 'http', retryAfter: retryAfter }); return;
            }
            if (xhr.responseURL && xhr.responseURL !== CATALOG) { finish({ reason: 'response' }); return; }
            var raw = xhr.responseText;
            if (typeof raw !== 'string' || raw.length > MAX_BYTES || typeof TextEncoder === 'function' && new TextEncoder().encode(raw).length > MAX_BYTES) { finish({ reason: 'size' }); return; }
            try {
              var data = JSON.parse(raw);
              if (!data || data.ok !== true || !Array.isArray(data.plugins) || data.plugins.length > 1024) throw new Error('Invalid catalog');
              var matches = data.plugins.filter(function (item) { return item && item.id === PLUGIN_ID; });
              if (matches.length > 1 || matches.length === 1 && !semver(matches[0].version)) throw new Error('Invalid plugin version');
              finish(null, matches.length ? matches[0].version : null);
            } catch (_) { finish({ reason: 'response' }); }
          };
          xhr.onprogress = function (event) { if (event.loaded > MAX_BYTES) { finish({ reason: 'size' }); xhr.abort(); } };
          xhr.onerror = function () { finish({ reason: 'network' }); };
          xhr.ontimeout = function () { finish({ reason: 'timeout' }); };
          xhr.onabort = function () { finish({ reason: 'cancelled' }); };
          xhr.send(null);
        } catch (_) { finish({ reason: 'network' }); }
      });
    }
    function check() {
      if (!allowed) return Promise.resolve(publish('unavailable', disabledReason(), null));
      if (!running) return Promise.resolve(publish('unavailable', 'stopped', null));
      if (!visible()) return Promise.resolve(publish('unavailable', 'hidden', lastOutcome && lastOutcome.publishedVersion));
      if (pending) return pending;
      if (retryAt > now()) return Promise.resolve(publish('unavailable', 'backoff', null));
      var epoch = generation;
      publish('checking', null, lastOutcome && lastOutcome.publishedVersion);
      if (!running || epoch !== generation || !visible()) return Promise.resolve(state);
      var task = catalog().then(function (version) {
        if (!running || epoch !== generation || !visible()) return state;
        failures = 0; retryAt = 0;
        var status = version === current.value ? 'current' : version && compare(semver(version), current) > 0 ? 'update-available' : 'unpublished';
        lastOutcome = { status: status, publishedVersion: version };
        if (status === 'current') startTelemetry(); else stopTelemetry();
        return publish(status, null, version);
      }).catch(function (error) {
        if (!running || epoch !== generation || error.reason === 'cancelled') return state;
        lastOutcome = null;
        return failure(error.reason || 'network', error.retryAfter);
      }).finally(function () { if (pending === task) pending = null; });
      pending = task;
      return task;
    }
    function start() {
      if (running) return pending || Promise.resolve(state);
      if (!allowed) return Promise.resolve(publish('unavailable', disabledReason(), null));
      if (!root.document || typeof root.document.addEventListener !== 'function' || typeof root.addEventListener !== 'function' || typeof root.XMLHttpRequest !== 'function') return Promise.resolve(publish('unavailable', 'unsupported', null));
      running = true; suspended = false; generation++;
      attach();
      if (!visible()) return Promise.resolve(publish('unavailable', 'hidden', null));
      return check();
    }
    function stop() {
      running = false; suspended = false;
      cancelCatalog(); stopTelemetry(); detach();
      lastOutcome = null;
      return publish('unavailable', 'stopped', null);
    }
    return Object.freeze({ start: start, check: check, stop: stop, getState: function () { return state; } });
  }
  return Object.freeze({ create: create, pluginId: PLUGIN_ID, baseUrl: BASE });
});
