import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

const ink = [16, 22, 20, 255];
const card = [27, 40, 34, 255];
const gold = [240, 193, 77, 255];
const cream = [244, 241, 232, 255];
const green = [62, 154, 98, 255];
const orange = [224, 122, 61, 255];
const line = [213, 224, 214, 255];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 4 + 1);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function rounded(x, y, left, top, width, height, radius) {
  const right = left + width;
  const bottom = top + height;
  if (x < left || y < top || x >= right || y >= bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function paint(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 64;
  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = (y * size + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const fillRound = (left, top, width, height, radius, color) => {
    const x0 = Math.floor(left);
    const y0 = Math.floor(top);
    const x1 = Math.ceil(left + width);
    const y1 = Math.ceil(top + height);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (rounded(x, y, left, top, width, height, radius)) put(x, y, color);
      }
    }
  };

  if (maskable) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = ink[0];
      pixels[i + 1] = ink[1];
      pixels[i + 2] = ink[2];
      pixels[i + 3] = 255;
    }
  } else {
    fillRound(0, 0, size, size, 16 * scale, ink);
  }

  const inset = maskable ? 12 * scale : 8 * scale;
  const cardX = 10 * scale + (maskable ? 2 * scale : 0);
  const cardY = 12 * scale + (maskable ? 1 * scale : 0);
  const cardW = 44 * scale - (maskable ? 4 * scale : 0);
  const cardH = 40 * scale - (maskable ? 2 * scale : 0);
  fillRound(cardX, cardY, cardW, cardH, 8 * scale, card);
  // Gold stroke approximated by an outer rounded rect behind a smaller inner fill.
  fillRound(cardX - 1.4 * scale, cardY - 1.4 * scale, cardW + 2.8 * scale, cardH + 2.8 * scale, 9 * scale, gold);
  fillRound(cardX, cardY, cardW, cardH, 7.2 * scale, card);

  const row = (y, swatch, lineWidth) => {
    fillRound(16 * scale, y * scale, 10 * scale, 6 * scale, 2 * scale, swatch);
    fillRound(30 * scale, (y + 1.4) * scale, lineWidth * scale, 3 * scale, 1.5 * scale, y === 19 ? cream : line);
  };
  row(19, gold, 18);
  row(29, green, 14);
  row(39, orange, 16);
  void inset;
  return pixels;
}

await mkdir(outDir, { recursive: true });
const files = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable.png", 512, true],
];
for (const [name, size, maskable] of files) {
  const png = encodePng(size, size, paint(size, { maskable }));
  await writeFile(path.join(outDir, name), png);
  console.log(`wrote public/icons/${name}`);
}
