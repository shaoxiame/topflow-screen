'use strict';
const vm = require('node:vm');

// The device TXT only manages the native screen. Keep the PC preview sources
// unchanged, and preserve the reviewed lifecycle/authentication helpers verbatim.
// Deliberately fail closed when source anchors change instead of guessing where
// to remove an optional browser UI or accepting a partly stripped bundle.
function managerOnly(source) {
  if (typeof source !== 'string') throw Error('Manager source must be text');
  let out = source;
  function position(text) {
    const first = out.indexOf(text);
    if (first < 0 || out.indexOf(text, first + text.length) !== -1) throw Error('Production manager anchor changed: ' + text.slice(0, 90));
    return first;
  }
  function replace(text, replacement) {
    const at = position(text);
    out = out.slice(0, at) + replacement + out.slice(at + text.length);
  }
  function removeRegion(start, end) {
    const begin = position(start), finish = position(end);
    if (finish <= begin) throw Error('Production manager region order changed');
    out = out.slice(0, begin) + out.slice(finish);
  }

  // Retain the exact same authenticated shell transport, without the optional
  // browser business-control bridges (getData/postData/DatadApp).
  const shellStart = position('      runShellWithRoot: async function (command, timeout) {');
  const shellEnd = position('\n      }\n    };\n  }\n  function register(root)');
  if (shellEnd <= shellStart) throw Error('Production shell bridge order changed');
  const shell = out.slice(shellStart, shellEnd + '\n      }'.length);
  removeRegion('  function readBridges(root, control) {', '  function register(root) {');
  replace('  function register(root) {', '  function readBridges(root) {\n    return {\n' + shell + '\n    };\n  }\n  function register(root) {');

  replace('var panel = null, screen = null, mounted = null, message = null, observer = null, controls = false, busy = false, currentState = null;',
    'var panel = null, message = null, observer = null, busy = false, currentState = null;');
  replace('var bridges = readBridges(root, function () { return controls; });', 'var bridges = readBridges(root);');
  removeRegion('    function stopWebScreen() {', '    function closePanel() {');
  replace('\n      stopWebScreen();\n', '\n');
  replace('      panel = screen = message = null;', '      panel = message = null;');
  replace('\n        stopWebScreen();\n', '\n');
  replace("      busy = true; activeAction = 'uninstall'; stateEpoch++; updateButtons(); stopWebScreen();", "      busy = true; activeAction = 'uninstall'; stateEpoch++; updateButtons();");

  const detailsStart = position('<details data-tf-advanced>');
  const detailsEnd = out.indexOf('</details>', detailsStart);
  if (detailsEnd <= detailsStart) throw Error('Production manager HTML order changed');
  out = out.slice(0, detailsStart) + out.slice(detailsEnd + '</details>'.length);
  replace("doc.body.append(panel); screen = panel.querySelector('[data-tf-screen]'); message = panel.querySelector('[data-tf-message]');",
    "doc.body.append(panel); message = panel.querySelector('[data-tf-message]');");
  replace('if (panel && !panel.isConnected) { stopWebScreen(); if (observer) observer.disconnect(); observer = null; panel = screen = message = null; currentState = null; }',
    'if (panel && !panel.isConnected) { if (observer) observer.disconnect(); observer = null; panel = message = null; currentState = null; }');
  replace("      panel.querySelector('[data-tf-advanced]').ontoggle = function (event) { if (event.target.open) mountScreen(); else stopWebScreen(); };\n", '');
  replace("entry.textContent = 'TopFlow 屏幕 · 预览与管理';", "entry.textContent = 'TopFlow 屏幕 · 管理';");

  const forbidden = /TopflowDeviceAPI|TopFlowAoyou|TopFlowUI|data-tf-(?:advanced|controls|screen)|mountScreen|stopWebScreen|DatadApp|\bgetData\b|\bpostData\b|\bmock\b|demoSnapshot|setSnapshot|TF_FIXTURES/;
  if (forbidden.test(out)) throw Error('Production manager retains a browser preview or simulation dependency');
  new vm.Script(out, { filename: 'ufi-plugin.production.js' });
  return out;
}

module.exports = { managerOnly };
