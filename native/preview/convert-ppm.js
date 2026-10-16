/* Convert the local native renderer's P6 output to PNG. No network access. */
const fs = require('node:fs');
const zlib = require('node:zlib');
function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, crc]);
}
function convert(input, output) {
  const ppm = fs.readFileSync(input), header = ppm.toString('ascii', 0, 80).match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);
  if (!header) throw new Error('Expected binary P6 PPM');
  const width = Number(header[1]), height = Number(header[2]);
  const rgb = ppm.subarray(Buffer.byteLength(header[0]));
  if (rgb.length !== width * height * 3) throw new Error('Truncated PPM');
  const scanlines = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(scanlines, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(output, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]));
}
if (require.main === module) for (const input of process.argv.slice(2)) convert(input, input.replace(/\.ppm$/i, '') + '.png');
module.exports = convert;
