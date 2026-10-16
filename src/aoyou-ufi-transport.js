(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowAoyouUfiTransport = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PREFIX = 'TOPFLOW_AOYOU_V1=';
  var MODES = ['rule', 'global', 'direct'];
  var READ_PATHS = ['/version', '/configs', '/proxies'];
  // The device has jsonfilter + Lua 5.1/luci.jsonc, but no jq. This fixed filter
  // runs entirely in memory and emits only fields used by the screen.
  var LUA_FILTER = [
    'local json = require("luci.jsonc")',
    'local operation = os.getenv("TF_AOYOU_OP")',
    'local input = io.read("*a")',
    'if #input > 1048576 then os.exit(4) end',
    'local value = json.parse(input)',
    'if type(value) ~= "table" then os.exit(4) end',
    'local function text(v) if type(v) == "string" then return v end return "" end',
    'local function clean_proxy(p)',
    '  if type(p) ~= "table" then return nil end',
    '  local out = {type = text(p.type)}',
    '  if type(p.alive) == "boolean" then out.alive = p.alive end',
    '  if type(p.all) == "table" then',
    '    out.all = {}; out.now = text(p.now)',
    '    for _, name in ipairs(p.all) do if type(name) == "string" then out.all[#out.all + 1] = name end end',
    '  end',
    '  if type(p.history) == "table" then',
    '    local latest = p.history[#p.history]',
    '    if type(latest) == "table" and type(latest.delay) == "number" then out.history = {{delay = latest.delay}} end',
    '  end',
    '  return out',
    'end',
    'local data',
    'if operation == "get-version" then',
    '  if type(value.version) ~= "string" or #value.version == 0 then os.exit(4) end',
    '  data = {version = value.version, meta = value.meta == true}',
    'elseif operation == "get-configs" then',
    '  if value.mode ~= "rule" and value.mode ~= "global" and value.mode ~= "direct" then os.exit(4) end',
    '  data = {mode = value.mode}',
    'elseif operation == "get-proxies" then',
    '  if type(value.proxies) ~= "table" then os.exit(4) end',
    '  data = {proxies = {}}',
    '  for name, proxy in pairs(value.proxies) do if type(name) == "string" then data.proxies[name] = clean_proxy(proxy) end end',
    'elseif operation == "get-proxy" then',
    '  data = clean_proxy(value)',
    'elseif operation == "select-proxy" or operation == "set-mode" then',
    '  data = {}',
    'else os.exit(4) end',
    'local output = json.stringify({ok = true, operation = operation, data = data})',
    'if type(output) ~= "string" then os.exit(4) end',
    'io.write(output)',
    ''
  ].join('\n');

  function fail(code, message) { var error = new Error(message); error.code = code; return error; }
  function base64(text) {
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8').toString('base64');
    var bytes = new TextEncoder().encode(text);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function safeName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 512 && !/[\u0000-\u001f\u007f]/.test(name) && !name.split('/').some(function (part) { return part === '.' || part === '..'; });
  }
  function canonicalProxyPath(path) {
    if (typeof path !== 'string' || path.indexOf('/proxies/') !== 0 || path.length > 6144) return null;
    var name;
    try { name = decodeURIComponent(path.slice(9)); } catch (_) { return null; }
    if (!safeName(name)) return null;
    return '/proxies/' + encodeURIComponent(name).replace(/[!'()*]/g, function (character) { return '%' + character.charCodeAt(0).toString(16).toUpperCase(); });
  }
  function validateRequest(request, allowWrites) {
    if (!request || typeof request !== 'object') throw fail('INVALID_REQUEST', '遨游接口请求无效');
    var method = request.method || 'GET';
    var path = request.path;
    var body;
    var operation;
    if (method === 'GET' && request.body === undefined) {
      if (READ_PATHS.indexOf(path) >= 0) {
        operation = path === '/version' ? 'get-version' : path === '/configs' ? 'get-configs' : 'get-proxies';
      } else {
        path = canonicalProxyPath(path);
        if (!path) throw fail('ROUTE_NOT_ALLOWED', '不允许读取该遨游接口');
        operation = 'get-proxy';
      }
    } else if (method === 'PUT') {
      if (!allowWrites) throw fail('READ_ONLY', '当前遨游桥接为只读');
      path = canonicalProxyPath(path);
      if (!path || !request.body || Object.keys(request.body).length !== 1 || !safeName(request.body.name)) throw fail('INVALID_SELECTION', '策略组或节点选择无效');
      body = { name: request.body.name };
      operation = 'select-proxy';
    } else if (method === 'PATCH') {
      if (!allowWrites) throw fail('READ_ONLY', '当前遨游桥接为只读');
      if (path !== '/configs' || !request.body || Object.keys(request.body).length !== 1 || MODES.indexOf(request.body.mode) < 0) throw fail('INVALID_MODE', '模式请求无效');
      body = { mode: request.body.mode };
      operation = 'set-mode';
    } else throw fail('ROUTE_NOT_ALLOWED', '遨游桥接不支持该操作');

    return { method: method, path: path, body: body, operation: operation };
  }

  // Every executable line is fixed. Dynamic path/body strings enter only as Base64.
  // No runtime scripts are sourced; no temporary file or configuration is created.
  function prelude() {
    return [
      'tf_fail() { printf \'TOPFLOW_AOYOU_V1={"ok":false,"code":"%s"}\\n\' "$1"; exit 0; }',
      'command -v curl >/dev/null 2>&1 || tf_fail UNSUPPORTED_CURL',
      'command -v jsonfilter >/dev/null 2>&1 || tf_fail UNSUPPORTED_JSONFILTER',
      'command -v lua5.1 >/dev/null 2>&1 || tf_fail UNSUPPORTED_LUA',
      'lua5.1 -e \'local ok,j=pcall(require,"luci.jsonc"); if not ok or type(j.parse)~="function" or type(j.stringify)~="function" then os.exit(1) end\' 2>/dev/null || tf_fail UNSUPPORTED_LUA_JSONC',
      'for TF_TOOL in base64 pidof readlink tr awk; do command -v "$TF_TOOL" >/dev/null 2>&1 || tf_fail UNSUPPORTED_TOOLS; done',
      'TF_PIDS=$(pidof mihomo 2>/dev/null) || tf_fail ENGINE_NOT_RUNNING',
      'set -- $TF_PIDS',
      '[ "$#" -eq 1 ] || tf_fail AMBIGUOUS_ENGINE',
      'TF_PID=$1',
      'case "$TF_PID" in ""|*[!0-9]*) tf_fail INVALID_PROCESS_ID;; esac',
      'TF_EXE=$(readlink "/proc/$TF_PID/exe" 2>/dev/null) || tf_fail ENGINE_NOT_RUNNING',
      '[ "$TF_EXE" = /data/plugins/aoyou-world/mihomo ] || tf_fail UNSUPPORTED_ENGINE_PATH',
      'TF_CONFIG=$(tr \'\\000\' \'\\n\' < "/proc/$TF_PID/cmdline" | awk \'p { print; n++; p=0 } $0 == "-f" { p=1 } END { if (n != 1 || p) exit 1 }\') || tf_fail UNSUPPORTED_RUNTIME_PATH',
      'case "$TF_CONFIG" in /data/plugins/aoyou-world/generations/*/runtime.json|/data/plugins/aoyou-world/generations/*/runtime.self.json) ;; *) tf_fail UNSUPPORTED_RUNTIME_PATH;; esac',
      'TF_GENERATION=${TF_CONFIG#/data/plugins/aoyou-world/generations/}',
      'TF_GENERATION=${TF_GENERATION%/*}',
      '[ "${#TF_GENERATION}" -eq 24 ] || tf_fail UNSUPPORTED_RUNTIME_PATH',
      'case "$TF_GENERATION" in *[!0-9a-f]*) tf_fail UNSUPPORTED_RUNTIME_PATH;; esac',
      '[ -f "$TF_CONFIG" ] || tf_fail UNSUPPORTED_RUNTIME_PATH',
      'TF_RESOLVED=$(readlink -f "$TF_CONFIG" 2>/dev/null) || tf_fail UNSAFE_RUNTIME_PATH',
      '[ "$TF_RESOLVED" = "$TF_CONFIG" ] || tf_fail UNSAFE_RUNTIME_PATH',
      'TF_CONTROLLER=$(jsonfilter -i "$TF_CONFIG" -e \'@["external-controller"]\' 2>/dev/null) || tf_fail UNSUPPORTED_CONTROLLER',
      'case "$TF_CONTROLLER" in 127.0.0.1:*) TF_PORT=${TF_CONTROLLER#127.0.0.1:};; *) tf_fail UNSUPPORTED_CONTROLLER;; esac',
      'case "$TF_PORT" in ""|*[!0-9]*) tf_fail UNSUPPORTED_CONTROLLER;; esac',
      '[ "$TF_PORT" -ge 1 ] 2>/dev/null && [ "$TF_PORT" -le 65535 ] 2>/dev/null || tf_fail UNSUPPORTED_CONTROLLER',
      'TF_SECRET=$(jsonfilter -i "$TF_CONFIG" -e \'@.secret\' 2>/dev/null) || tf_fail UNSUPPORTED_SECRET_FORMAT',
      // Restrict config-header syntax rather than attempting to escape arbitrary secrets.
      'case "$TF_SECRET" in *[!A-Za-z0-9._~+=:/-]*) tf_fail UNSUPPORTED_SECRET_FORMAT;; esac',
      'tf_request() {',
      '  TF_METHOD=$1; TF_PATH_B64=$2; TF_BODY_B64=$3; TF_OPERATION=$4',
      '  TF_PATH=$(printf \'%s\' "$TF_PATH_B64" | base64 -d 2>/dev/null) || tf_fail INVALID_REQUEST',
      '  TF_BODY_CONFIG=',
      '  if [ -n "$TF_BODY_B64" ]; then',
      '    TF_BODY_CONFIG=$(printf \'%s\' "$TF_BODY_B64" | base64 -d 2>/dev/null) || tf_fail INVALID_REQUEST',
      '  fi',
      '  TF_RESPONSE=$({',
      '    printf \'url = "http://%s%s"\\n\' "$TF_CONTROLLER" "$TF_PATH"',
      '    printf \'header = "Authorization: Bearer %s"\\n\' "$TF_SECRET"',
      '    printf \'request = "%s"\\n\' "$TF_METHOD"',
      '    if [ -n "$TF_BODY_B64" ]; then',
      '      printf \'header = "Content-Type: application/json"\\n\'',
      '      printf \'data = %s\\n\' "$TF_BODY_CONFIG"',
      '    fi',
      '  } | curl -q --config - --fail --silent --connect-timeout 3 --max-time 8 --max-filesize 1048576 --path-as-is --noproxy \'*\' 2>/dev/null) || tf_fail HTTP_OR_NETWORK',
      '  [ -n "$TF_RESPONSE" ] || TF_RESPONSE=\'{}\'',
      '  TF_RESULT=$(printf \'%s\' "$TF_RESPONSE" | TF_AOYOU_OP="$TF_OPERATION" lua5.1 -e ' + quoteFixed(LUA_FILTER) + ' 2>/dev/null) || tf_fail INVALID_RESPONSE',
      '  [ -n "$TF_RESULT" ] || tf_fail INVALID_RESPONSE',
      '  printf \'TOPFLOW_AOYOU_V1=%s\\n\' "$TF_RESULT"',
      '}',
      ''
    ].join('\n');
  }
  function quoteFixed(text) { return "'" + text.replace(/'/g, "'\"'\"'") + "'"; }
  function callLine(request) {
    // The outer JSON quoting is the curl config string quoting, generated locally.
    return 'tf_request ' + [request.method, base64(request.path), request.body === undefined ? '' : base64(JSON.stringify(JSON.stringify(request.body))), request.operation].map(quoteFixed).join(' ');
  }
  function buildCommand(request, options) {
    var validated = validateRequest(request, options && options.allowWrites === true);
    return prelude() + callLine(validated) + '\nunset TF_SECRET TF_BODY TF_RESPONSE TF_RESULT\n';
  }
  function buildSnapshotCommand() {
    return prelude() + READ_PATHS.map(function (path) { return callLine(validateRequest({ method: 'GET', path: path }, false)); }).join('\n') + '\nunset TF_SECRET TF_BODY TF_RESPONSE TF_RESULT\n';
  }
  function parseOutput(output, expectedOperation) {
    if (typeof output !== 'string' || output.length > 2 * 1024 * 1024) throw fail('INVALID_RESPONSE', '遨游桥接返回无效');
    var records = output.split(/\r?\n/).filter(function (line) { return line.indexOf(PREFIX) === 0; }).map(function (line) {
      var record;
      try { record = JSON.parse(line.slice(PREFIX.length)); } catch (_) { throw fail('INVALID_RESPONSE', '遨游桥接返回无效'); }
      if (!record || record.ok !== true) {
        var code = record && /^[A-Z_]{1,48}$/.test(record.code || '') ? record.code : 'BRIDGE_FAILED';
        throw fail(code, code.indexOf('UNSUPPORTED_') === 0 ? '现有设备环境不支持该只读桥接，未安装任何依赖' : '未能读取遨游世界控制接口');
      }
      if (!record.data || typeof record.data !== 'object' || Array.isArray(record.data)) throw fail('INVALID_RESPONSE', '遨游桥接返回无效');
      return record;
    });
    if (expectedOperation) {
      var matches = records.filter(function (record) { return record.operation === expectedOperation; });
      if (matches.length !== 1 || records.length !== 1) throw fail('INVALID_RESPONSE', '遨游桥接操作与响应不匹配');
      return matches[0].data;
    }
    if (!records.length) throw fail('INVALID_RESPONSE', '遨游桥接没有返回有效结果');
    return records;
  }
  function createTransport(options) {
    options = options || {};
    if (typeof options.runShellWithRoot !== 'function') throw fail('NO_SHELL_BRIDGE', '未连接 UFI 的既有接口');
    var runner = options.runShellWithRoot;
    var allowWrites = options.allowWrites === true;
    return async function (request) {
      var validated = validateRequest(request, allowWrites);
      var result = await runner(buildCommand(request, { allowWrites: allowWrites }), 12000);
      if (!result || result.success !== true || typeof result.content !== 'string') throw fail('BRIDGE_FAILED', 'UFI 未返回有效的遨游读取结果');
      return parseOutput(result.content, validated.operation);
    };
  }
  function parseSnapshotOutput(output) {
    var records = parseOutput(output);
    var required = ['get-version', 'get-configs', 'get-proxies'];
    if (records.length !== required.length || !required.every(function (operation) { return records.filter(function (record) { return record.operation === operation; }).length === 1; })) throw fail('INVALID_RESPONSE', '遨游快照不完整');
    var version = records.find(function (record) { return record.operation === 'get-version'; }).data;
    var configs = records.find(function (record) { return record.operation === 'get-configs'; }).data;
    var proxies = records.find(function (record) { return record.operation === 'get-proxies'; }).data;
    return { installed: true, running: true, version: version.version, mode: configs.mode, proxies: proxies.proxies };
  }
  return { buildCommand: buildCommand, buildSnapshotCommand: buildSnapshotCommand, parseOutput: parseOutput, parseSnapshotOutput: parseSnapshotOutput, createTransport: createTransport };
});
