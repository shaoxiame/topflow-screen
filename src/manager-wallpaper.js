(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopFlowManagerWallpaper = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WIDTH = 320, HEIGHT = 480, PIXELS = WIDTH * HEIGHT;
  var MAX_BYTES = 12 * 1024 * 1024, MAX_EDGE = 8192, MAX_PIXELS = 40000000;

  function fail(message) { throw new Error(message); }
  function size(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) {
      fail('图片尺寸超限：最长边不得超过 8192 像素，总像素不得超过 4000 万。');
    }
    return { width: width, height: height };
  }
  function ascii(bytes, offset, count) {
    var value = '';
    for (var i = 0; i < count; i++) value += String.fromCharCode(bytes[offset + i]);
    return value;
  }
  function u16(bytes, offset) { return bytes[offset] * 256 + bytes[offset + 1]; }
  function u24le(bytes, offset) { return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536; }

  // Header bounds are checked before any decoder or image object is created.
  // All input is local and bounded; only the fixed-size result leaves this API.
  function dimensions(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = null;
    if (bytes.length >= 33 && ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
      if (view.getUint32(8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') fail('PNG 文件头无效。');
      result = size(view.getUint32(16), view.getUint32(20));
      var pngOffset = 8, ended = false, pixels = false;
      while (pngOffset + 12 <= bytes.length) {
        var pngLength = view.getUint32(pngOffset), pngType = ascii(bytes, pngOffset + 4, 4);
        if (pngLength > bytes.length - pngOffset - 12) fail('PNG 文件不完整。');
        if (pngType === 'IHDR' && pngOffset !== 8) fail('PNG 含多组尺寸信息，请重新导出图片。');
        if (pngType === 'acTL') fail('请选择静态图片，不支持动画 PNG。');
        if (pngType === 'IDAT') pixels = true;
        pngOffset += pngLength + 12;
        if (pngType === 'IEND') { ended = pngLength === 0; break; }
      }
      if (!ended || !pixels || pngOffset !== bytes.length) fail('PNG 文件不完整。');
      result.type = 'image/png'; return result;
    }
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
      var jpegOffset = 2;
      while (jpegOffset + 1 < bytes.length) {
        if (bytes[jpegOffset++] !== 255) fail('JPEG 文件头无效。');
        while (jpegOffset < bytes.length && bytes[jpegOffset] === 255) jpegOffset++;
        var marker = bytes[jpegOffset++];
        if (marker === 217) break;
        if (marker === 218) {
          if (!result || jpegOffset + 2 > bytes.length || u16(bytes, jpegOffset) < 2 || u16(bytes, jpegOffset) > bytes.length - jpegOffset) break;
          result.type = 'image/jpeg'; return result;
        }
        if (marker === 1 || marker >= 208 && marker <= 215) continue;
        if (jpegOffset + 2 > bytes.length) break;
        var jpegLength = u16(bytes, jpegOffset);
        if (jpegLength < 2 || jpegLength > bytes.length - jpegOffset) fail('JPEG 文件不完整。');
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].indexOf(marker) >= 0) {
          if (jpegLength < 8) fail('JPEG 尺寸信息无效。');
          if (result) fail('JPEG 含多组尺寸信息，请重新导出图片。');
          result = size(u16(bytes, jpegOffset + 5), u16(bytes, jpegOffset + 3));
        }
        jpegOffset += jpegLength;
      }
      fail('无法读取 JPEG 图片尺寸。');
    }
    if (bytes.length >= 20 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      if (view.getUint32(4, true) + 8 !== bytes.length) fail('WebP 文件不完整。');
      var webpOffset = 12, frame = null;
      while (webpOffset + 8 <= bytes.length) {
        var webpType = ascii(bytes, webpOffset, 4), webpLength = view.getUint32(webpOffset + 4, true);
        var start = webpOffset + 8;
        if (webpLength > bytes.length - start) fail('WebP 文件不完整。');
        if (webpType === 'ANIM' || webpType === 'ANMF') fail('请选择静态图片，不支持动画 WebP。');
        if (webpType === 'VP8X') {
          if (webpLength !== 10) fail('WebP 扩展文件头无效。');
          if (bytes[start] & 2) fail('请选择静态图片，不支持动画 WebP。');
          result = size(u24le(bytes, start + 4) + 1, u24le(bytes, start + 7) + 1);
        } else if (webpType === 'VP8 ') {
          if (webpLength < 10 || bytes[start] & 1 || ascii(bytes, start + 3, 3) !== '\x9d\x01\x2a') fail('WebP 图片数据无效。');
          frame = size(view.getUint16(start + 6, true) & 16383, view.getUint16(start + 8, true) & 16383);
        } else if (webpType === 'VP8L') {
          if (webpLength < 5 || bytes[start] !== 47) fail('WebP 无损文件头无效。');
          var bits = view.getUint32(start + 1, true);
          if (bits >>> 29) fail('WebP 无损版本无效。');
          frame = size((bits & 16383) + 1, (bits >>> 14 & 16383) + 1);
        }
        webpOffset = start + webpLength + (webpLength & 1);
      }
      if (webpOffset !== bytes.length || !frame) fail('无法读取 WebP 图片尺寸。');
      result = result || frame; result.type = 'image/webp'; return result;
    }
    fail('仅支持有效的 JPEG、PNG 或静态 WebP 图片。');
  }

  function encodeRGBA(rgba, width, height) {
    var kind = Object.prototype.toString.call(rgba);
    if (width !== WIDTH || height !== HEIGHT || !rgba || rgba.length !== PIXELS * 4 ||
      (kind !== '[object Uint8Array]' && kind !== '[object Uint8ClampedArray]')) fail('壁纸像素必须为 320 × 480 的 RGBA 字节数组。');
    var bytes = new Uint8Array(16 + PIXELS * 2), view = new DataView(bytes.buffer);
    for (var h = 0; h < 8; h++) bytes[h] = 'TFWP5651'.charCodeAt(h);
    view.setUint16(8, WIDTH, true); view.setUint16(10, HEIGHT, true); view.setUint32(12, PIXELS * 2, true);
    for (var i = 0; i < PIXELS; i++) {
      var source = i * 4, alpha = rgba[source + 3] / 255;
      var r = Math.round(rgba[source] * alpha), g = Math.round(rgba[source + 1] * alpha), b = Math.round(rgba[source + 2] * alpha);
      view.setUint16(16 + i * 2, (r >> 3) << 11 | (g >> 2) << 5 | b >> 3, true);
    }
    return bytes;
  }

  // UFI can be served over a local HTTP address, where SubtleCrypto is absent.
  // Hash only the prepared local package; this does not access browser storage.
  function sha256(bytes) {
    if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1) fail('校验数据必须为字节数组。');
    var constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var length = bytes.byteLength, padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    padded.set(new Uint8Array(bytes.buffer, bytes.byteOffset, length)); padded[length] = 128;
    var view = new DataView(padded.buffer), words = new Uint32Array(64);
    view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
    view.setUint32(padded.length - 4, length * 8 >>> 0);
    function rotate(value, count) { return value >>> count | value << (32 - count); }
    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
      for (i = 16; i < 64; i++) {
        var x = words[i - 15], y = words[i - 2];
        words[i] = words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ x >>> 3) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ y >>> 10);
      }
      var a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
      for (i = 0; i < 64; i++) {
        var first = h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + words[i];
        var second = (rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
        h = g; g = f; f = e; e = d + first >>> 0; d = c; c = b; b = a; a = first + second >>> 0;
      }
      var state = [a, b, c, d, e, f, g, h];
      for (i = 0; i < 8; i++) hash[i] = hash[i] + state[i] >>> 0;
    }
    return hash.map(function (word) { return ('00000000' + word.toString(16)).slice(-8); }).join('');
  }

  function readFile(root, file) {
    if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
    if (!root || typeof root.FileReader !== 'function') fail('当前浏览器不支持读取本地图片。');
    return new Promise(function (resolve, reject) {
      var reader = new root.FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('本地图片读取失败。')); };
      reader.onabort = function () { reject(new Error('本地图片读取已取消。')); };
      reader.readAsArrayBuffer(file);
    });
  }

  async function prepare(root, file) {
    if (!file || !Number.isInteger(file.size) || file.size < 1 || file.size > MAX_BYTES) fail('图片文件不得为空，且不能超过 12 MiB。');
    var input = await readFile(root, file);
    if (!input || input.byteLength !== file.size) fail('本地图片读取不完整。');
    var source = dimensions(new Uint8Array(input));
    input = null;
    if (file.type && String(file.type).toLowerCase() !== source.type) fail('图片格式与文件类型不一致，请重新导出 JPEG、PNG 或 WebP。');
    if (!root || !root.document || !root.URL || typeof root.URL.createObjectURL !== 'function') fail('当前浏览器不支持本地壁纸预览。');
    var decoded = null, canvas = null, inputUrl = '', previewUrl = '', image = null;
    function releaseImage() {
      if (decoded && typeof decoded.close === 'function') decoded.close();
      decoded = null;
      if (image) { image.onload = image.onerror = null; image.src = ''; image = null; }
      if (inputUrl) { root.URL.revokeObjectURL(inputUrl); inputUrl = ''; }
    }
    try {
      if (typeof root.createImageBitmap === 'function') decoded = await root.createImageBitmap(file, { imageOrientation: 'from-image' });
      else {
        if (typeof root.Image !== 'function') fail('当前浏览器不支持图片解码。');
        inputUrl = root.URL.createObjectURL(file);
        image = new root.Image();
        decoded = await new Promise(function (resolve, reject) {
          image.onload = function () { resolve(image); };
          image.onerror = function () { reject(new Error('图片无法解码，请重新导出后选择。')); };
          image.src = inputUrl;
        });
      }
      var actual = size(decoded.naturalWidth || decoded.width, decoded.naturalHeight || decoded.height);
      // EXIF orientation may swap width and height. Both decoded bounds and
      // input-header bounds are checked, without allocating an original-size canvas.
      canvas = root.document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT;
      var context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!context) fail('当前浏览器无法创建壁纸画布。');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.fillStyle = '#000'; context.fillRect(0, 0, WIDTH, HEIGHT);
      var scale = Math.max(WIDTH / actual.width, HEIGHT / actual.height);
      var cropWidth = WIDTH / scale, cropHeight = HEIGHT / scale;
      context.drawImage(decoded, (actual.width - cropWidth) / 2, (actual.height - cropHeight) / 2,
        cropWidth, cropHeight, 0, 0, WIDTH, HEIGHT);
      releaseImage();
      var bytes = encodeRGBA(context.getImageData(0, 0, WIDTH, HEIGHT).data, WIDTH, HEIGHT);
      var blob = await new Promise(function (resolve, reject) {
        if (typeof canvas.toBlob !== 'function') { reject(new Error('当前浏览器不支持生成本地预览。')); return; }
        canvas.toBlob(function (value) { if (value) resolve(value); else reject(new Error('壁纸预览生成失败。')); }, 'image/png');
      });
      previewUrl = root.URL.createObjectURL(blob);
      var ownedUrl = previewUrl, disposed = false;
      return {
        bytes: bytes, previewUrl: ownedUrl, width: WIDTH, height: HEIGHT,
        sourceWidth: actual.width, sourceHeight: actual.height,
        dispose: function () { if (!disposed) { disposed = true; root.URL.revokeObjectURL(ownedUrl); } }
      };
    } catch (error) {
      if (previewUrl) root.URL.revokeObjectURL(previewUrl);
      throw error;
    } finally {
      releaseImage();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }

  return { prepare: prepare, encodeRGBA: encodeRGBA, sha256: sha256 };
});
