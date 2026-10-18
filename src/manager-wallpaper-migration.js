(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowWallpaperMigration = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BYTES = 307216, CHUNK = 24576, BOOT = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function line(text, prefix) {
    var found = String(text).split(/\r?\n/).filter(function (value) { return value.indexOf(prefix) === 0; });
    if (found.length !== 1) throw Error('壁纸备份响应未确认；旧组件保留');
    return found[0].slice(prefix.length);
  }
  function snapshot(text) {
    var value = JSON.parse(line(text, 'TOPFLOW_WALLPAPER_BACKUP='));
    if (!value || !BOOT.test(value.bootId || '') || !(value.sha256 === null || /^[a-f0-9]{64}$/.test(value.sha256))) throw Error('壁纸备份状态无效；旧组件保留');
    return { sha256: value.sha256, bootId: value.bootId };
  }
  function decode(text, length) {
    if (text.length !== Math.ceil(length / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw Error('壁纸备份分块不完整；旧组件保留');
    var result = new Uint8Array(length), at = 0;
    for (var i = 0; i < text.length; i += 4) {
      var a = ALPHABET.indexOf(text[i]), b = ALPHABET.indexOf(text[i + 1]), c = ALPHABET.indexOf(text[i + 2]), d = ALPHABET.indexOf(text[i + 3]);
      result[at++] = a << 2 | b >> 4;
      if (at < length) result[at++] = b << 4 | c >> 2;
      if (at < length) result[at++] = c << 6 | d;
    }
    return result;
  }
  function base64(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
      text += ALPHABET[a >> 2] + ALPHABET[(a & 3) << 4 | b >> 4] + (i + 1 < bytes.length ? ALPHABET[(b & 15) << 2 | c >> 6] : '=') + (i + 2 < bytes.length ? ALPHABET[c & 63] : '=');
    }
    return text;
  }
  function validate(value, hash) {
    if (!value || !value.bytes || value.bytes.length !== BYTES || !/^[a-f0-9]{64}$/.test(value.sha256 || '') || hash(value.bytes) !== value.sha256) throw Error('内存壁纸校验失败，未写入设备');
    var header = [84,70,87,80,53,54,53,49,64,1,224,1,0,176,4,0];
    for (var i = 0; i < header.length; i++) if (value.bytes[i] !== header[i]) throw Error('壁纸格式无效，未写入设备');
  }
  async function backup(context) {
    var first = snapshot(await context.read(null)), saved = { sha256: first.sha256, bootId: first.bootId, bytes: null, transaction: null };
    if (first.sha256 !== null) {
      saved.bytes = new Uint8Array(BYTES);
      for (var offset = 0; offset < BYTES; offset += CHUNK) {
        var count = Math.min(CHUNK, BYTES - offset);
        saved.bytes.set(decode(line(await context.read(first, offset), 'TOPFLOW_WALLPAPER_CHUNK='), count), offset);
      }
      validate(saved, context.hash);
    }
    var last = snapshot(await context.read(first));
    if (last.sha256 !== first.sha256 || last.bootId !== first.bootId) throw Error('备份期间壁纸或设备已变化；旧组件保留');
    return saved;
  }
  async function restore(saved, context) {
    validate(saved, context.hash);
    var state = context.parse(await context.command('status'));
    if (state.configured && !state.pending && state.sha256 === saved.sha256) return true;
    if (state.configured && state.sha256 !== saved.sha256) throw Error('设备已有其他壁纸；未覆盖，请先核对');
    if (state.pending) {
      if (!saved.transaction || state.pendingNonce !== saved.transaction.nonce || state.pendingSha256 !== saved.sha256) throw Error('存在其他未完成的壁纸上传；保留内存备份');
      if (!state.previousBoot && state.uploadValid) {
        await context.command('commit', saved.sha256, 'COMMITTED', saved.transaction);
      } else {
        // Only an explicit user retry reaches an existing transaction. Never
        // automatically retry a timed-out chunk or a commit with unknown result.
        await context.command('abort', saved.sha256, 'ABORTED', { nonce: state.pendingNonce, bootId: state.bootId });
        saved.transaction = null;
      }
      state = context.parse(await context.command('status'));
      if (state.pending) throw Error('上次壁纸上传清理未确认；保留内存备份');
    }
    if (!state.configured) {
      var nonce = context.nonce();
      if (!/^[a-f0-9]{32}$/.test(nonce)) throw Error('壁纸事务随机数无效');
      saved.transaction = { nonce: nonce, bootId: state.bootId };
      await context.command('prepare', saved.sha256, 'PREPARED', saved.transaction);
      for (var offset = 0; offset < BYTES; offset += CHUNK) {
        await context.command('chunk', saved.sha256, 'CHUNKED', { nonce: nonce, bootId: state.bootId, offset: offset, base64: base64(saved.bytes.subarray(offset, Math.min(offset + CHUNK, BYTES))) });
      }
      await context.command('commit', saved.sha256, 'COMMITTED', saved.transaction);
    }
    state = context.parse(await context.command('status'));
    if (!state.configured || state.pending || state.sha256 !== saved.sha256) throw Error('壁纸恢复回读未确认；保留内存备份');
    return true;
  }
  return { backup: backup, restore: restore, snapshot: snapshot };
});
