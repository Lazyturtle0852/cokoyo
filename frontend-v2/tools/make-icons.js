// ホーム画面に置くアイコン（public/icon-*.png）を作る。
//
//   node tools/make-icons.js
//
// 絵はアプリの中のスライムと同じドット絵。外部の道具を使わずに PNG を書き出すので、
// 色や形を変えたくなったらここを直して、もう一度走らせる。

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// 背景はブランド色（styles.css の --brand）。ホーム画面で角を丸く切られても
// 欠けないよう、絵は真ん中の6割くらいに収めている（maskable の安全域）。
const BG = [0xEA, 0x58, 0x0C];

// src/field/campusField.ts の SLIME と同じ。o 輪郭 b 体 s 影 h 光 e 目 p ほっぺ
const SLIME = [
  '....oooooo....',
  '..oobbbbbboo..',
  '.obhhbbbbbbbo.',
  '.obhbbbbbbbbo.',
  'obbbbbbbebbebo',
  'obbbbbbbebbebo',
  'obbbbbbpbbpbbo',
  'obbbbbbbbbbbbo',
  'obssbbbbbbbsso',
  '.osssssssssso.',
  '..oooooooooo..',
];
const PALETTE = {
  o: [0x2E, 0x2A, 0x45],
  b: [0xFF, 0xE1, 0x8A],
  h: [0xFF, 0xF6, 0xDE],
  s: [0xE0, 0xAE, 0x4A],
  e: [0x2E, 0x2A, 0x45],
  p: [0xFF, 0x8F, 0xA8],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** RGB の画素（size×size×3）を PNG にする */
function png(size, rgb) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // フィルタなし
    rgb.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 1色8ビット
  ihdr[9] = 2; // トゥルーカラー
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function icon(size) {
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) rgb.set(BG, i * 3);

  const cols = SLIME[0].length;
  const rows = SLIME.length;
  const px = Math.max(1, Math.floor((size * 0.62) / cols)); // ドット1つの大きさ
  const x0 = Math.round((size - cols * px) / 2);
  const y0 = Math.round((size - rows * px) / 2);

  SLIME.forEach((row, ry) => [...row].forEach((ch, rx) => {
    const color = PALETTE[ch];
    if (!color) return;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        rgb.set(color, ((y0 + ry * px + y) * size + (x0 + rx * px + x)) * 3);
      }
    }
  }));
  return png(size, rgb);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(OUT, name), icon(size));
  console.log(`${name} (${size}×${size})`);
}
