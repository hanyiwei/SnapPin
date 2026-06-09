const { writeFileSync } = require('fs');
const path = require('path');
const Jimp = require('jimp');

const srcPng = path.join(__dirname, '..', 'assets', 'icon.png');
const outIco = path.join(__dirname, '..', 'resources', 'icon.ico');

const sizes = [16, 32, 48, 64, 128, 256];

async function main() {
  const original = await Jimp.read(srcPng);

  // BMP-format ICO entries, not PNG-compressed — for electron-builder compatibility
  const entries = [];
  for (const size of sizes) {
    const resized = original.clone().resize(size, size);
    const { data, width, height } = resized.bitmap;

    const biSize = 40;
    const pixelDataSize = width * height * 4; // 32bpp BGRA
    const andRowBytes = Math.ceil(width / 8);
    const andRowPadded = Math.ceil(andRowBytes / 4) * 4;
    const andSize = andRowPadded * height;

    const totalSize = biSize + pixelDataSize + andSize;
    const buf = Buffer.alloc(totalSize);

    // BITMAPINFOHEADER
    let pos = 0;
    buf.writeUInt32LE(biSize, pos); pos += 4;
    buf.writeInt32LE(width, pos); pos += 4;
    buf.writeInt32LE(height * 2, pos); pos += 4; // ×2 for ICO = XOR + AND
    buf.writeUInt16LE(1, pos); pos += 2;
    buf.writeUInt16LE(32, pos); pos += 2;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(pixelDataSize, pos); pos += 4;
    buf.writeInt32LE(0, pos); pos += 4;
    buf.writeInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(0, pos); pos += 4;
    buf.writeUInt32LE(0, pos); pos += 4;

    // Pixel data: RGBA → BGRA (bottom-up)
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        buf[pos++] = data[i + 2]; // B
        buf[pos++] = data[i + 1]; // G
        buf[pos++] = data[i];     // R
        buf[pos++] = data[i + 3]; // A
      }
    }

    // AND mask: all zeros (fully opaque)
    buf.fill(0, pos, pos + andSize);

    entries.push({ size, buf });
    console.log(`  ${size}x${size}: ${buf.length} bytes`);
  }

  // Write ICO file
  const count = entries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + count * dirEntrySize;

  const offsets = [];
  let offset = dirSize;
  for (const e of entries) {
    offsets.push(offset);
    offset += e.buf.length;
  }

  const ico = Buffer.alloc(offset);
  let pos = 0;
  ico.writeUInt16LE(0, pos);
  ico.writeUInt16LE(1, pos + 2);
  ico.writeUInt16LE(count, pos + 4);
  pos += 6;

  for (let i = 0; i < count; i++) {
    const s = entries[i].size;
    ico.writeUInt8(s === 256 ? 0 : s, pos);
    ico.writeUInt8(s === 256 ? 0 : s, pos + 1);
    ico.writeUInt8(0, pos + 2);
    ico.writeUInt8(0, pos + 3);
    ico.writeUInt16LE(1, pos + 4);
    ico.writeUInt16LE(32, pos + 6);
    ico.writeUInt32LE(entries[i].buf.length, pos + 8);
    ico.writeUInt32LE(offsets[i], pos + 12);
    pos += 16;
  }

  for (const e of entries) {
    e.buf.copy(ico, pos);
    pos += e.buf.length;
  }

  writeFileSync(outIco, ico);
  console.log(`Wrote ${outIco} (${ico.length} bytes, ${count} sizes, BMP format)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
