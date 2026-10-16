'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const wallpaper = require('../src/manager-wallpaper.js');

function png(width, height, animated = false) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); out.write(type, 4, 'ascii'); data.copy(out, 8); return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    ...(animated ? [chunk('acTL', Buffer.alloc(8))] : []), chunk('IDAT', Buffer.from([0])), chunk('IEND', Buffer.alloc(0))]);
}
function jpeg(width, height) {
  const out = Buffer.alloc(31); out[0] = 255; out[1] = 216; out[2] = 255; out[3] = 192;
  out.writeUInt16BE(17, 4); out[6] = 8; out.writeUInt16BE(height, 7); out.writeUInt16BE(width, 9); out[11] = 3;
  out[21] = 255; out[22] = 218; out.writeUInt16BE(6, 23); out[29] = 255; out[30] = 217; return out;
}
function webp(width, height, { lossless = false, extended = false, animated = false } = {}) {
  const chunk = (name, data) => {
    const out = Buffer.alloc(8 + data.length + (data.length & 1)); out.write(name, 0, 'ascii'); out.writeUInt32LE(data.length, 4); data.copy(out, 8); return out;
  };
  let frame;
  if (lossless) {
    frame = Buffer.alloc(5); frame[0] = 47; frame.writeUInt32LE(((width - 1) | (height - 1) << 14) >>> 0, 1);
  } else {
    frame = Buffer.alloc(10); frame[3] = 157; frame[4] = 1; frame[5] = 42; frame.writeUInt16LE(width, 6); frame.writeUInt16LE(height, 8);
  }
  const chunks = [];
  if (extended || animated) {
    const vp8x = Buffer.alloc(10); vp8x[0] = animated ? 2 : 0; vp8x.writeUIntLE(width - 1, 4, 3); vp8x.writeUIntLE(height - 1, 7, 3);
    chunks.push(chunk('VP8X', vp8x));
  }
  chunks.push(chunk(lossless ? 'VP8L' : 'VP8 ', frame));
  const body = Buffer.concat(chunks), out = Buffer.alloc(12 + body.length);
  out.write('RIFF'); out.writeUInt32LE(out.length - 8, 4); out.write('WEBP', 8); body.copy(out, 12); return out;
}
function file(bytes, type = 'image/png') {
  return { size: bytes.length, type, async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } };
}
function browser({ width = 640, height = 480, fallbackImage = false, invalidDecode = false, failCanvas = false, failBlob = false, rejectDecode = false } = {}) {
  const calls = { decode: 0, closed: 0, urls: [], revoked: [], draw: [], canvases: [] };
  const pixels = new Uint8ClampedArray(320 * 480 * 4); pixels.fill(255);
  const context = { fillRect() {}, drawImage(...args) { calls.draw.push(args); }, getImageData() { return { data: pixels }; } };
  const root = {
    URL: { createObjectURL(blob) { const url = 'blob:local-' + (calls.urls.length + 1); calls.urls.push({ url, blob }); return url; }, revokeObjectURL(url) { calls.revoked.push(url); } },
    document: { createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = { width: 0, height: 0, getContext() { return failCanvas ? null : context; }, toBlob(callback, type) { assert.equal(type, 'image/png'); callback(failBlob ? null : { type, isCropped: true }); } };
      calls.canvases.push(canvas); return canvas;
    } }
  };
  if (!fallbackImage) root.createImageBitmap = async () => {
    calls.decode++;
    if (rejectDecode) throw new Error('decoder rejected input');
    return { width: invalidDecode ? 99999 : width, height, close() { calls.closed++; } };
  };
  else root.Image = class {
    constructor() { this.naturalWidth = width; this.naturalHeight = height; }
    set src(value) {
      this._src = value;
      if (value) { calls.decode++; queueMicrotask(() => rejectDecode ? this.onerror() : this.onload()); }
    }
    get src() { return this._src; }
  };
  for (const name of ['fetch', 'XMLHttpRequest', 'localStorage', 'sessionStorage']) {
    Object.defineProperty(root, name, { get() { throw new Error('Local wallpaper must not access ' + name); } });
  }
  return { root, calls, pixels };
}

test('RGB565 package has exact binary header, little-endian rows, and deterministic black alpha compositing', () => {
  const rgba = new Uint8ClampedArray(320 * 480 * 4);
  rgba.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0]);
  rgba.set([255, 255, 255, 128], 320 * 4);
  const bytes = wallpaper.encodeRGBA(rgba, 320, 480), view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 307216);
  assert.equal(Buffer.from(bytes.subarray(0, 8)).toString('ascii'), 'TFWP5651');
  assert.equal(view.getUint16(8, true), 320); assert.equal(view.getUint16(10, true), 480); assert.equal(view.getUint32(12, true), 307200);
  assert.deepEqual([...bytes.subarray(16, 26)], [0, 248, 224, 7, 31, 0, 255, 255, 0, 0]);
  assert.equal(view.getUint16(16 + 320 * 2, true), 0x8410);
  assert.throws(() => wallpaper.encodeRGBA(rgba, 480, 320), /320/);
  assert.throws(() => wallpaper.encodeRGBA(new Uint32Array(rgba.length), 320, 480), /RGBA/);
  assert.throws(() => wallpaper.encodeRGBA(new Int8Array(rgba.length), 320, 480), /RGBA/);
});

test('local HTTP SHA-256 matches standard empty, abc, padding-boundary and complete wallpaper package hashes', () => {
  assert.equal(wallpaper.sha256(new Uint8Array()), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(wallpaper.sha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const length of [55, 56, 63, 64, 65]) {
    const bytes = Uint8Array.from({ length }, (_, index) => index * 37 & 255);
    assert.equal(wallpaper.sha256(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  const rgba = Uint8ClampedArray.from({ length: 320 * 480 * 4 }, (_, index) => index * 31 & 255);
  const bytes = wallpaper.encodeRGBA(rgba, 320, 480);
  assert.equal(bytes.length, 307216);
  assert.equal(wallpaper.sha256(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
  const backing = Buffer.concat([Buffer.from('outside'), bytes, Buffer.from('outside')]), slice = backing.subarray(7, 7 + bytes.length);
  assert.equal(wallpaper.sha256(slice), crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => wallpaper.sha256('abc'), /字节数组/);
});

test('prepare uses centered cover crop at 320x480, returns only the fixed-size result, and releases resources', async () => {
  const b = browser(), original = file(png(640, 480));
  const result = await wallpaper.prepare(b.root, original);
  assert.equal(result.width, 320); assert.equal(result.height, 480);
  assert.equal(result.sourceWidth, 640); assert.equal(result.sourceHeight, 480);
  assert.equal(result.bytes.length, 307216);
  assert.deepEqual(b.calls.draw[0].slice(1), [160, 0, 320, 480, 0, 0, 320, 480]);
  assert.equal(b.calls.urls.length, 1); assert.equal(b.calls.urls[0].blob.isCropped, true);
  assert.notEqual(b.calls.urls[0].blob, original);
  assert.equal(b.calls.closed, 1); assert.equal(b.calls.canvases[0].width, 1); assert.equal(b.calls.canvases[0].height, 1);
  result.dispose(); result.dispose(); assert.deepEqual(b.calls.revoked, [result.previewUrl]);
});

test('portrait crop and browser-applied JPEG orientation use actual decoded dimensions', async () => {
  const b = browser({ width: 480, height: 800 });
  const result = await wallpaper.prepare(b.root, file(jpeg(800, 480), 'image/jpeg'));
  assert.equal(result.sourceWidth, 480); assert.equal(result.sourceHeight, 800);
  assert.deepEqual(b.calls.draw[0].slice(1), [0, 40, 480, 720, 0, 0, 320, 480]);
  result.dispose();
});

test('file limit, actual signatures, MIME mismatch, malformed input and huge headers reject before decoding', async () => {
  const b = browser();
  await assert.rejects(wallpaper.prepare(b.root, { size: 12 * 1024 * 1024 + 1, arrayBuffer() { throw new Error('must not read'); } }), /12 MiB/);
  await assert.rejects(wallpaper.prepare(b.root, { size: 0 }), /12 MiB/);
  await assert.rejects(wallpaper.prepare(b.root, file(Buffer.from('<svg></svg>'), 'image/png')), /仅支持/);
  await assert.rejects(wallpaper.prepare(b.root, file(Buffer.from('GIF89a'), 'image/gif')), /仅支持/);
  await assert.rejects(wallpaper.prepare(b.root, file(png(640, 480), 'image/jpeg')), /不一致/);
  await assert.rejects(wallpaper.prepare(b.root, file(png(9000, 10))), /8192/);
  await assert.rejects(wallpaper.prepare(b.root, file(png(8192, 8192))), /4000 万/);
  await assert.rejects(wallpaper.prepare(b.root, file(jpeg(9000, 10), 'image/jpeg')), /8192/);
  await assert.rejects(wallpaper.prepare(b.root, file(webp(9000, 10), 'image/webp')), /8192/);
  await assert.rejects(wallpaper.prepare(b.root, file(png(640, 480).subarray(0, 40))), /不完整/);
  await assert.rejects(wallpaper.prepare(b.root, file(Buffer.from([255, 216, 255, 217]), 'image/jpeg')), /尺寸/);
  const repeatJPEG = jpeg(640, 480);
  await assert.rejects(wallpaper.prepare(b.root, file(Buffer.concat([repeatJPEG.subarray(0, 21), repeatJPEG.subarray(2)]), 'image/jpeg')), /多组尺寸/);
  const repeatPNG = png(640, 480);
  await assert.rejects(wallpaper.prepare(b.root, file(Buffer.concat([repeatPNG.subarray(0, 33), repeatPNG.subarray(8)]))), /多组尺寸/);
  const badSize = file(png(640, 480)); badSize.size++;
  await assert.rejects(wallpaper.prepare(b.root, badSize), /读取不完整/);
  assert.equal(b.calls.decode, 0); assert.equal(b.calls.urls.length, 0);
});

test('static lossy, lossless and extended WebP headers are supported, animated WebP and PNG are rejected', async () => {
  const b = browser();
  for (const options of [{}, { lossless: true }, { extended: true }, { extended: true, lossless: true }]) {
    const result = await wallpaper.prepare(b.root, file(webp(640, 480, options), 'image/webp')); result.dispose();
  }
  assert.equal(b.calls.decode, 4);
  await assert.rejects(wallpaper.prepare(b.root, file(webp(640, 480, { animated: true }), 'image/webp')), /动画/);
  await assert.rejects(wallpaper.prepare(b.root, file(png(640, 480, true))), /动画/);
  assert.equal(b.calls.decode, 4);
});

test('Image fallback releases input URL after success and decode failure, preview URL remains caller-owned', async () => {
  const b = browser({ fallbackImage: true }), result = await wallpaper.prepare(b.root, file(png(640, 480)));
  assert.equal(b.calls.urls.length, 2);
  assert.deepEqual(b.calls.revoked, [b.calls.urls[0].url]);
  result.dispose(); assert.deepEqual(b.calls.revoked, b.calls.urls.map(item => item.url));
  const broken = browser({ fallbackImage: true, rejectDecode: true });
  await assert.rejects(wallpaper.prepare(broken.root, file(png(640, 480))), /无法解码/);
  assert.deepEqual(broken.calls.revoked, broken.calls.urls.map(item => item.url));
});

test('decoded dimensions, canvas errors and preview failures release native bitmap and canvas resources', async () => {
  for (const options of [{ invalidDecode: true }, { failCanvas: true }, { failBlob: true }]) {
    const b = browser(options);
    await assert.rejects(wallpaper.prepare(b.root, file(png(640, 480))));
    assert.equal(b.calls.closed, 1); assert.equal(b.calls.urls.length, 0);
    for (const canvas of b.calls.canvases) { assert.equal(canvas.width, 1); assert.equal(canvas.height, 1); }
  }
  const b = browser({ rejectDecode: true });
  await assert.rejects(wallpaper.prepare(b.root, file(png(640, 480))), /decoder rejected/);
  assert.equal(b.calls.urls.length, 0);
});

test('browser UMD attaches a dependency-free local helper', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/manager-wallpaper.js'), 'utf8'), sandbox);
  assert.equal(typeof sandbox.TopFlowManagerWallpaper.prepare, 'function');
  assert.equal(typeof sandbox.TopFlowManagerWallpaper.encodeRGBA, 'function');
  assert.equal(typeof sandbox.TopFlowManagerWallpaper.sha256, 'function');
  assert.equal(sandbox.TopFlowManagerWallpaper.sha256(new Uint8Array([97, 98, 99])), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
