(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowAoyou = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Inspect metadata only. Original plugin source is never evaluated or returned.
  function parsePluginInventory(source) {
    var pattern = /<!--\s*\[KANO_PLUGIN_START\]\s*(.*?)\s*-->([\s\S]*?)<!--\s*\[KANO_PLUGIN_END\]\s*\1\s*-->/g;
    var map = new Map();
    var match;
    while ((match = pattern.exec(String(source || '')))) {
      var name = match[1].trim();
      var metaMatch = match[2].match(/<!--\s*\[KANO_META\]\s*([\s\S]*?)\s*-->/);
      var version = '';
      if (metaMatch) {
        metaMatch[1].split(';').forEach(function (entry) {
          var position = entry.indexOf('=');
          if (position >= 0 && entry.slice(0, position).trim() === 'v') version = entry.slice(position + 1).trim();
        });
      }
      map.set(name, { name: name, version: version, disabled: match[2].indexOf('[kano_disabled]') >= 0 });
    }
    return Array.from(map.values());
  }

  var VALID_MODES = ['rule', 'global', 'direct'];
  var MODE_LABELS = { rule: '规则分流', global: '全局代理', direct: '全部直连' };

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function safeString(value) { return typeof value === 'string' ? value.slice(0, 512) : ''; }
  function pluginInventory(source) {
    return parsePluginInventory(source).filter(function (plugin) { return /遨游世界|aoyou[-_ ]?world/i.test(plugin.name); });
  }
  function normalizeGroups(response) {
    var proxies = response && response.proxies && typeof response.proxies === 'object' ? response.proxies : {};
    return Object.keys(proxies).filter(function (name) { return proxies[name] && Array.isArray(proxies[name].all); }).map(function (name) {
      var proxy = proxies[name];
      var nodes = proxy.all.filter(function (item) { return typeof item === 'string'; }).map(function (nodeName) {
        var node = proxies[nodeName] || {};
        var history = Array.isArray(node.history) ? node.history : [];
        var latest = history.length ? history[history.length - 1] : null;
        return {
          name: safeString(nodeName),
          type: safeString(node.type),
          alive: typeof node.alive === 'boolean' ? node.alive : null,
          delayMs: latest && Number.isFinite(latest.delay) && latest.delay > 0 ? latest.delay : null
        };
      });
      return {
        name: safeString(name), type: safeString(proxy.type), selected: safeString(proxy.now), nodes: nodes,
        // Automatic groups need engine-specific pin/reset semantics. Do not guess them.
        selectable: proxy.type === 'Selector'
      };
    });
  }
  function sanitizeSnapshot(input) {
    var snapshot = input && typeof input === 'object' ? input : {};
    var rawVersion = snapshot.version;
    var version = typeof rawVersion === 'string' ? rawVersion : rawVersion && rawVersion.version;
    var mode = snapshot.mode || (snapshot.configs && snapshot.configs.mode);
    var groups = normalizeGroups(snapshot.proxies && snapshot.proxies.proxies ? snapshot.proxies : snapshot);
    return {
      installed: typeof snapshot.installed === 'boolean' ? snapshot.installed : null,
      running: typeof snapshot.running === 'boolean' ? snapshot.running : null,
      takeover: typeof snapshot.takeover === 'boolean' ? snapshot.takeover : null,
      version: safeString(version || snapshot.kernel),
      mode: VALID_MODES.indexOf(mode) >= 0 ? mode : null,
      modeLabel: MODE_LABELS[mode] || '未读取',
      groups: groups
    };
  }
  function demoSnapshot() {
    return {
      installed: true, running: true, takeover: true, version: '演示内核', mode: 'rule',
      proxies: {
        '代理出口': { type: 'Selector', now: '香港 · 演示节点', all: ['香港 · 演示节点', '日本 · 演示节点', 'DIRECT'] },
        '香港 · 演示节点': { type: 'Demo', alive: true, history: [{ delay: 38 }] },
        '日本 · 演示节点': { type: 'Demo', alive: true, history: [{ delay: 72 }] },
        DIRECT: { type: 'Direct', alive: true }
      }
    };
  }
  function adapterError(code, message) { var error = new Error(message); error.code = code; return error; }

  /**
   * transport({method, path, body}) must return parsed Mihomo JSON (or reject).
   * It is an independently reviewed bridge to the existing loopback controller,
   * NOT originalPlugin.device.api()/command(), which can install runtime files.
   * No authentication, subscription, runtime.json or secrets are stored here.
   * snapshot is a sanitized local capture; no transport means zero network I/O.
   */
  function createAdapter(options) {
    options = options || {};
    var access = ['readonly', 'demo', 'control'].indexOf(options.mode) >= 0 ? options.mode : 'readonly';
    var transport = typeof options.transport === 'function' ? options.transport : null;
    var snapshot = access === 'demo' ? (options.snapshot || demoSnapshot()) : (options.snapshot || {});
    var state = sanitizeSnapshot(snapshot);
    var inventory = pluginInventory(options.pluginSource || '');
    var source = access === 'demo' ? 'demo' : transport ? 'controller' : 'snapshot';
    var lastUpdated = null;
    var failures = [];

    function exportState() {
      var result = copy(state);
      result.source = source;
      result.readOnly = access !== 'control';
      result.demo = access === 'demo';
      result.lastUpdated = lastUpdated;
      result.errors = failures.slice();
      result.plugin = inventory.length ? copy(inventory[inventory.length - 1]) : null;
      result.capabilities = {
        viewStatus: true, viewGroups: true,
        selectProxy: access === 'demo' || (access === 'control' && !!transport),
        setMode: access === 'demo' || (access === 'control' && !!transport),
        engineLifecycle: false, subscriptionManagement: false, installOrUpgrade: false,
        openOriginalPanel: false
      };
      return result;
    }
    async function read(path) {
      if (!transport) throw adapterError('NO_TRANSPORT', '未连接独立的 Mihomo 只读接口');
      return transport({ method: 'GET', path: path });
    }
    async function getState() {
      failures = [];
      if (transport && access !== 'demo') {
        var reads = await Promise.allSettled([read('/version'), read('/configs'), read('/proxies')]);
        if (reads[0].status === 'fulfilled') {
          state.version = safeString(reads[0].value && reads[0].value.version);
          state.running = true;
          state.installed = true;
        } else {
          // An unreachable bridge is not evidence that the engine is stopped.
          state.running = null;
          failures.push('内核状态暂不可读');
        }
        if (reads[1].status === 'fulfilled') {
          var mode = reads[1].value && reads[1].value.mode;
          state.mode = VALID_MODES.indexOf(mode) >= 0 ? mode : null;
          state.modeLabel = MODE_LABELS[mode] || '未读取';
        } else { state.mode = null; state.modeLabel = '未读取'; failures.push('分流模式暂不可读'); }
        if (reads[2].status === 'fulfilled') state.groups = normalizeGroups(reads[2].value);
        else { state.groups = []; failures.push('节点列表暂不可读'); }
        lastUpdated = new Date().toISOString();
      }
      return exportState();
    }
    async function listGroups() {
      if (transport && access !== 'demo') state.groups = normalizeGroups(await read('/proxies'));
      return copy(state.groups);
    }
    function requireAction(action) {
      if (access !== 'control' && access !== 'demo') throw adapterError('READ_ONLY', '当前为只读预览，不会修改设备');
      if (!action || action.userInitiated !== true) throw adapterError('USER_ACTION_REQUIRED', '只能在用户主动操作后修改');
      if (access === 'control' && !transport) throw adapterError('NO_TRANSPORT', '控制接口未连接');
    }
    async function selectProxy(groupName, nodeName, action) {
      requireAction(action);
      var group = state.groups.find(function (item) { return item.name === groupName; });
      if (!group) throw adapterError('UNKNOWN_GROUP', '请先读取有效策略组');
      if (!group.selectable) throw adapterError('AUTOMATIC_GROUP', '自动策略组请在遨游世界原面板管理');
      if (!group.nodes.some(function (node) { return node.name === nodeName; })) throw adapterError('UNKNOWN_NODE', '节点不属于该策略组');
      if (access === 'demo') {
        group.selected = nodeName;
        return { confirmed: true, demo: true, group: groupName, selected: nodeName };
      }
      var path = '/proxies/' + encodeURIComponent(groupName);
      await transport({ method: 'PUT', path: path, body: { name: nodeName } });
      var updated = await read(path);
      if (!updated || updated.now !== nodeName) throw adapterError('NOT_CONFIRMED', '内核未确认节点切换，请刷新状态');
      group.selected = updated.now;
      return { confirmed: true, demo: false, group: groupName, selected: updated.now };
    }
    async function setMode(mode, action) {
      requireAction(action);
      if (VALID_MODES.indexOf(mode) < 0) throw adapterError('INVALID_MODE', '仅支持规则、全局或直连模式');
      if (access !== 'demo') {
        await transport({ method: 'PATCH', path: '/configs', body: { mode: mode } });
        var updated = await read('/configs');
        if (!updated || updated.mode !== mode) throw adapterError('NOT_CONFIRMED', '内核未确认模式切换，请刷新状态');
      }
      state.mode = mode;
      state.modeLabel = MODE_LABELS[mode];
      return { confirmed: true, demo: access === 'demo', mode: mode, persistent: false };
    }
    function managementEntry() {
      return {
        available: false,
        title: '遨游世界完整管理',
        reason: '原面板打开时可能安装或更新运行文件；只读预览不调用。订阅、启停与升级请在原 UFI 遨游世界卡片操作。'
      };
    }
    return { getState: getState, listGroups: listGroups, selectProxy: selectProxy, setMode: setMode, managementEntry: managementEntry };
  }

  return { parsePluginInventory: parsePluginInventory, normalizeGroups: normalizeGroups, sanitizeSnapshot: sanitizeSnapshot, createAdapter: createAdapter };
});
