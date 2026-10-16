(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowWallpaperPanel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BYTES = 307216, CHUNK_BYTES = 24576;
  var BOOT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  function parse(output) {
    var lines = String(output).split(/\r?\n/).filter(function (line) { return line.indexOf('TOPFLOW_WALLPAPER=') === 0; });
    if (lines.length !== 1) throw Error('壁纸状态未确认');
    var state = JSON.parse(lines[0].slice(18));
    if (!state || typeof state.configured !== 'boolean' || typeof state.pending !== 'boolean' ||
      typeof state.uploadValid !== 'boolean' || !BOOT_ID.test(state.bootId || '') ||
      (state.previousBoot !== undefined && typeof state.previousBoot !== 'boolean') ||
      !Number.isSafeInteger(state.uploadedBytes) || state.uploadedBytes < 0 || state.uploadedBytes > BYTES ||
      (state.uploadValid && (!state.pending || state.uploadedBytes !== BYTES)) ||
      (state.configured && !/^[a-f0-9]{64}$/.test(state.sha256)) ||
      (state.pending && (!/^[a-f0-9]{64}$/.test(state.pendingSha256) || !/^[a-f0-9]{32}$/.test(state.pendingNonce) || !BOOT_ID.test(state.pendingBootId || '')))) throw Error('壁纸状态格式未确认');
    state.previousBoot = state.previousBoot === true || state.pending && state.pendingBootId !== state.bootId;
    return state;
  }
  function nonce(root) {
    if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') throw Error('当前浏览器缺少安全随机数，不能开始壁纸上传。');
    var bytes = new Uint8Array(16); root.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (value) { return ('0' + value.toString(16)).slice(-2); }).join('');
  }
  function base64(bytes) {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', output = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      output += alphabet[a >> 2] + alphabet[(a & 3) << 4 | (b || 0) >> 4] +
        (i + 1 < bytes.length ? alphabet[(b & 15) << 2 | (c || 0) >> 6] : '=') +
        (i + 2 < bytes.length ? alphabet[c & 63] : '=');
    }
    return output;
  }
  function mount(root, host, context) {
    var helper = root.TopFlowManagerWallpaper, selected = null, epoch = 0, disposed = false, preparing = false, state = null;
    host.innerHTML = '<section class="tf-package-wallpaper" aria-label="锁屏壁纸"><div class="tf-wallpaper-layout"><div class="tf-wallpaper-preview" data-tf-wallpaper-preview><img data-tf-wallpaper-image alt="所选壁纸裁切预览" hidden><span class="tf-wallpaper-preview-label">LOCK SCREEN</span><span class="tf-wallpaper-preview-title">你的屏幕<br>你的风格</span><span class="tf-wallpaper-preview-unlock">长按解锁</span></div><div class="tf-wallpaper-content"><div class="tf-package-section-head"><div><span class="tf-package-caption">个性化</span><b>锁屏壁纸</b></div><span class="tf-wallpaper-size">320 × 480</span></div><p class="tf-wallpaper-description">上传喜欢的照片，为锁屏换个背景。网速与解锁按钮会保留清晰的遮罩层。</p><p class="tf-wallpaper-status" data-tf-wallpaper-state role="status" aria-live="polite">读取壁纸状态后可应用</p><div class="tf-wallpaper-actions"><button type="button" data-tf-wallpaper-choose>选择图片</button><button type="button" class="tf-package-subtle" data-tf-wallpaper-apply disabled>应用壁纸</button><button type="button" data-tf-wallpaper-clear disabled>恢复默认</button><button type="button" data-tf-wallpaper-abort hidden>清理已结束的上传</button></div><input data-tf-wallpaper-file type="file" accept="image/jpeg,image/png,image/webp" hidden><p class="tf-package-footnote">JPG / PNG / 静态 WebP · 最大 12 MB · 居中裁切<br>仅上传约 300 KB 的屏幕图像，下次锁屏或唤醒生效。</p></div></div></section>';
    function el(name) { return host.querySelector('[data-tf-wallpaper-' + name + ']'); }
    function message(text) { if (!disposed) el('state').textContent = text; }
    function available() { var s = context.state(); return s && s.installed && !s.partial && !s.uploadActive && !s.versionMismatch && !context.reviewOnly; }
    function clearSelection() { epoch++; if (selected) selected.dispose(); selected = null; el('image').hidden = true; el('image').removeAttribute('src'); el('preview').removeAttribute('data-selected'); el('file').value = ''; }
    function update() {
      if (disposed) return;
      var busy = context.busy() || preparing, ready = available() && !!state;
      el('choose').disabled = busy;
      el('file').disabled = busy;
      el('apply').disabled = busy || !ready || (state.pending ? state.previousBoot || !state.uploadValid : !selected);
      el('apply').textContent = preparing ? '正在处理图片…' : state && state.pending && !state.previousBoot && state.uploadValid ? '完成上次壁纸应用' : '应用壁纸';
      el('clear').disabled = busy || !ready || state.pending || !state.configured;
      el('abort').hidden = !(ready && state.pending);
      el('abort').textContent = state && state.pending && state.previousBoot ? '清理旧上传' : '清理未完成上传';
      el('abort').disabled = busy;
    }
    async function read() { state = parse(await context.command('status')); return state; }
    function describe() {
      if (!available()) return '安装或更新到本版屏幕组件后可应用壁纸';
      if (!state) return '壁纸状态未确认，请刷新状态';
      if (state.pending && state.previousBoot) return '设备已重启，可清理旧上传后重新选择图片。旧上传不能继续应用；已生效的壁纸保持不变。';
      if (state.pending) return state.uploadValid ? '图像已校验，可完成应用或清理。' : '上传尚未完整确认，可清理本次上传后重新选择。不会自动重传，已生效的壁纸保持不变。';
      if (selected) return '裁切预览已就绪 · 尚未上传';
      return state.configured ? '已配置自定义壁纸 · 选择新图片可替换' : '当前使用默认锁屏背景';
    }
    async function refresh() {
      state = null;
      try { if (available()) await read(); message(describe()); }
      catch (e) { message('壁纸状态读取失败：' + e.message); }
      update();
    }
    async function select() {
      if (context.busy() || disposed) return;
      var file = el('file').files && el('file').files[0]; if (!file) return;
      clearSelection(); var mine = epoch; preparing = true; message('正在本地裁切图片…'); update();
      try {
        var prepared = await helper.prepare(root, file);
        if (disposed || mine !== epoch) { prepared.dispose(); return; }
        selected = prepared; selected.sha256 = helper.sha256(prepared.bytes);
        el('image').src = prepared.previewUrl; el('image').hidden = false; el('preview').setAttribute('data-selected', 'true');
        message('裁切预览已就绪 · 尚未上传');
      } catch (e) { if (!disposed && mine === epoch) message(e.message); }
      finally { if (mine === epoch) preparing = false; update(); }
    }
    async function apply() {
      if (el('apply').disabled || disposed) return;
      await context.run(async function () {
        var sha, transaction;
        try {
          await read();
          if (disposed) return;
          if (state.pending) {
            if (state.previousBoot) throw Error('设备已重启，请先清理旧上传，不能继续应用');
            if (!state.uploadValid) throw Error('图像尚未完整确认，请先清理本次上传');
            sha = state.pendingSha256; transaction = { nonce: state.pendingNonce, bootId: state.pendingBootId };
          } else {
            if (!selected) return;
            sha = selected.sha256;
          }
          if (!await context.confirm('应用此锁屏壁纸？只写入本插件的图像文件，下次锁屏或唤醒生效。')) return;
          if (disposed) return;
          if (!state.pending) {
            if (!selected || selected.bytes.length !== BYTES) throw Error('壁纸图像尺寸无效，请重新选择');
            transaction = { nonce: nonce(root), bootId: state.bootId };
            message('正在准备锁屏壁纸…');
            await context.command('prepare', sha, 'PREPARED', transaction);
            for (var offset = 0; offset < BYTES; offset += CHUNK_BYTES) {
              if (disposed) return;
              var end = Math.min(offset + CHUNK_BYTES, BYTES);
              await context.command('chunk', sha, 'CHUNKED', { nonce: transaction.nonce, bootId: transaction.bootId, offset: offset, base64: base64(selected.bytes.subarray(offset, end)) });
              message('正在上传锁屏壁纸 · ' + Math.round(end / BYTES * 100) + '%');
            }
          }
          if (disposed) return;
          await context.command('commit', sha, 'COMMITTED', transaction);
          await read();
          if (!state.configured || state.pending || state.sha256 !== sha) throw Error('壁纸应用回读不一致，请刷新确认');
          clearSelection(); message('壁纸已应用 · 下次锁屏或唤醒生效');
        } catch (e) {
          if (disposed) return;
          var detail = e.message;
          try { await read(); } catch (_) { state = null; }
          message(detail + (state && state.pending && state.previousBoot ? '。设备已重启，可清理旧上传；旧壁纸保持不变。' : state && state.pending ? '。未自动重传，可清理本次上传；旧壁纸保持不变。' : '。未自动重试，请核对状态。'));
        }
      }); update();
    }
    async function clear(abort) {
      if (context.busy() || disposed) return;
      await context.run(async function () {
        try {
          await read();
          if (disposed) return;
          if (abort ? !state.pending : state.pending || !state.configured) return;
          if (!await context.confirm(abort ? (state.previousBoot ? '设备已重启，清理本插件上次启动遗留的壁纸上传？已生效的壁纸保持不变。' : '清理本插件本次未完成的壁纸上传？已生效的壁纸保持不变。') : '恢复默认锁屏背景？只删除本插件的自定义壁纸。')) return;
          if (disposed) return;
          await context.command(abort ? 'abort' : 'clear', abort ? state.pendingSha256 : state.sha256, abort ? 'ABORTED' : 'CLEARED', { nonce: abort ? state.pendingNonce : nonce(root), bootId: state.bootId });
          await read();
          if (state.pending || !abort && state.configured) throw Error('壁纸清理回读未确认');
          if (!abort) clearSelection();
          message(abort ? '已清理未完成上传，可重新选择图片' : '已恢复默认背景 · 下次锁屏或唤醒生效');
        } catch (e) { state = null; message(e.message + '。请刷新状态；不会自动重试。'); }
      }); update();
    }
    el('choose').onclick = function () { if (!context.busy()) el('file').click(); };
    el('file').onchange = select; el('apply').onclick = apply;
    el('clear').onclick = function () { return clear(false); }; el('abort').onclick = function () { return clear(true); };
    update();
    return { refresh: refresh, update: update, reset: function () { clearSelection(); preparing = false; state = null; message(describe()); update(); }, dispose: function () { disposed = true; clearSelection(); } };
  }
  return { mount: mount, parse: parse };
});
