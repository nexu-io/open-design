// Minimal ZIP encoder, stored mode (no compression). Big enough for the
// "Download as ZIP" button — we only ever pack a handful of UTF-8 text files
// (HTML/CSS/JS/Markdown) totalling well under a few MB, so skipping deflate
// keeps the implementation small and dependency-free.

export interface ZipEntry {
  path: string;
  content: string;
}

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  return { time, date };
}

export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const now = dosTime(new Date());

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.path);
    const dataBytes = enc.encode(entry.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + name).
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);          // version needed
    lv.setUint16(6, 0, true);           // flags
    lv.setUint16(8, 0, true);           // method: stored
    lv.setUint16(10, now.time, true);   // mod time
    lv.setUint16(12, now.date, true);   // mod date
    lv.setUint32(14, crc, true);        // crc-32
    lv.setUint32(18, size, true);       // compressed size
    lv.setUint32(22, size, true);       // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localChunks.push(local, dataBytes);

    // Central directory header (46 bytes + name).
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);  // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // method
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra len
    cv.setUint16(32, 0, true);           // comment len
    cv.setUint16(34, 0, true);           // disk number
    cv.setUint16(36, 0, true);           // internal attrs
    cv.setUint32(38, 0, true);           // external attrs
    cv.setUint32(42, offset, true);      // relative offset of local header
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + dataBytes.length;
    centralSize += central.length;
  }

  // End of central directory record.
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  // Concatenate into one buffer rather than passing Uint8Arrays straight to
  // the Blob constructor — the Blob lib types now reject Uint8Array<...>
  // in some TS configurations.
  const totalSize =
    localChunks.reduce((n, c) => n + c.length, 0) +
    centralChunks.reduce((n, c) => n + c.length, 0) +
    eocd.length;
  const out = new Uint8Array(totalSize);
  let p = 0;
  for (const c of localChunks) { out.set(c, p); p += c.length; }
  for (const c of centralChunks) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return new Blob([out.buffer], { type: 'application/zip' });
}
