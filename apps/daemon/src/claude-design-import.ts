import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { validateProjectPath } from './projects.js';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const MAX_FILES = 5000;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  isDirectory: boolean;
};

type ImportedFile = { path: string; body: Buffer };

export async function importClaudeDesignZip(zipPath: string, projectDir: string) {
  const zip = await readFile(zipPath);
  const entries = readCentralDirectory(zip);
  const files: ImportedFile[] = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (files.length >= MAX_FILES) throw new Error('zip contains too many files');
    const relPath = sanitizeZipPath(entry.name);
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      throw new Error(`zip file too large: ${relPath}`);
    }

    // Decode first; the central directory's uncompressedSize is unreliable for
    // streaming/data-descriptor zips (it can read 0 even when the payload
    // carries real data). The inflate cap and the post-decode size checks below
    // are authoritative.
    const body = readEntryBody(zip, entry);
    if (body.length > MAX_FILE_BYTES) {
      throw new Error(`zip file too large: ${relPath}`);
    }
    if (entry.uncompressedSize > 0 && body.length !== entry.uncompressedSize) {
      throw new Error(`zip entry size mismatch: ${relPath}`);
    }
    totalBytes += body.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('zip is too large');

    files.push({ path: relPath, body: normalizeImportedClaudeDesignFile(relPath, body) });
  }

  if (files.length === 0) throw new Error('zip contains no files');
  const entryFile = chooseEntryFile(files.map((f) => f.path));
  if (!entryFile) throw new Error('zip does not contain an HTML file');

  const dirCreates = new Map<string, Promise<string | undefined>>();
  const ensureDir = (dir: string) => {
    let pending = dirCreates.get(dir);
    if (!pending) {
      pending = mkdir(dir, { recursive: true });
      dirCreates.set(dir, pending);
    }
    return pending;
  };

  await mkdir(projectDir, { recursive: true });
  await Promise.all(files.map(async (f) => {
    const target = safeJoin(projectDir, f.path);
    await ensureDir(path.dirname(target));
    await writeFile(target, f.body);
  }));

  return {
    entryFile,
    files: files.map((f) => f.path),
  };
}

function normalizeImportedClaudeDesignFile(relPath: string, body: Buffer): Buffer {
  if (path.basename(relPath) !== 'design-canvas.jsx') return body;
  const source = body.toString('utf8');
  const { result, wheelMatched, gestureMatched } = normalizeDesignCanvasWheelHandling(source);
  // Warn whenever any rewrite regex missed. Either one drifting silently
  // is enough to ship a half-rewritten canvas: a missed `wheelBlock`
  // reproduces the original zoom-on-scroll bug, and a missed
  // `gestureBlock` lets Safari's native gesture* handlers re-introduce
  // their own pinch zoom on top of the normalized wheel path. Operators
  // grep for `[claude-design-import]` to find these before the bug
  // report comes back in.
  if (!wheelMatched || !gestureMatched) {
    const missing: string[] = [];
    if (!wheelMatched) missing.push('wheel-handler');
    if (!gestureMatched) missing.push('gesture-handler');
    console.warn(
      `[claude-design-import] design-canvas.jsx found but ${missing.join(' + ')} rewrite regex(es) did not match; imported canvas may zoom on scroll or behave unexpectedly. Update normalizeDesignCanvasWheelHandling to match the new template.`,
    );
  }
  return result === source ? body : Buffer.from(result, 'utf8');
}

function normalizeDesignCanvasWheelHandling(source: string): {
  result: string;
  wheelMatched: boolean;
  gestureMatched: boolean;
} {
  const wheelBlock = /    \/\/ Mouse-wheel vs trackpad-scroll heuristic\.[\s\S]*?    const onWheel = \(e\) => \{\n[\s\S]*?    \};\n/;
  const gestureBlock = /    \/\/ Safari sends native gesture\* events for trackpad pinch with a smooth\n[\s\S]*?    const onGestureEnd = \(e\) => \{ e\.preventDefault\(\); isGesturing = false; \};/;
  // Check both regexes against the original source so callers can tell
  // wheel-only drift from gesture-only drift. If `wheelBlock` does not
  // match we leave the source untouched and skip the gesture rewrite —
  // a partial rewrite that swapped the gesture handler against an
  // unchanged wheel handler would be worse than no rewrite at all.
  const wheelMatched = wheelBlock.test(source);
  const gestureMatched = gestureBlock.test(source);
  if (!wheelMatched) {
    return { result: source, wheelMatched, gestureMatched };
  }
  const normalizedWheel = source.replace(wheelBlock, `    // Plain wheel input should pan the infinite canvas. Claude Design exports
    // previously guessed that large integer vertical deltas were mouse-wheel
    // zoom clicks, but macOS trackpads can emit the same shape during ordinary
    // two-finger scrolling. Keep zoom explicit via Cmd+wheel or the host
    // toolbar so vertical navigation cannot accidentally scale the canvas.
    const wheelDeltaToPixels = (delta, mode, axis) => {
      const px = mode === 1 ? delta * 16 : mode === 2 ? delta * 160 : delta;
      const limit = axis === 'y' ? 72 : 160;
      return Math.max(-limit, Math.min(limit, px));
    };
    const panByWheel = (e) => {
      const dx = wheelDeltaToPixels(e.deltaX || 0, e.deltaMode || 0, 'x');
      const dy = wheelDeltaToPixels(e.deltaY || 0, e.deltaMode || 0, 'y');
      tf.current.x -= dx;
      tf.current.y -= dy;
      apply();
    };

    // Cmd+wheel still zooms, but we have to split notched mouse wheels from
    // smooth trackpad pinch deltas inside the Cmd branch: a single mouse
    // notch arrives as deltaY≈100, and Math.exp(-100*0.01)≈0.367 would shrink
    // the canvas by ~63% per click. The notched ratio Math.exp(-sign*0.18)
    // gives ~17% per click — the same feel the original Claude export had
    // before this normalizer collapsed both paths. We also accept ctrlKey
    // here because Chromium/Firefox synthesize wheel events with
    // \`ctrlKey: true\` during a trackpad pinch — without that, smooth pinch
    // would silently fall through to panByWheel(e) and the canvas would
    // pan instead of zoom on those browsers.
    const isNotchedWheel = (e) =>
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isGesturing) return;
      if (e.ctrlKey || e.metaKey) {
        const factor = isNotchedWheel(e)
          ? Math.exp(-Math.sign(e.deltaY) * 0.18)
          : Math.exp(-e.deltaY * 0.01);
        zoomAt(e.clientX, e.clientY, factor);
        return;
      }
      panByWheel(e);
    };
`);
  if (!gestureMatched) {
    return { result: normalizedWheel, wheelMatched, gestureMatched };
  }
  const result = normalizedWheel.replace(gestureBlock, `    // Safari can emit native gesture* events while a user scrolls on a
    // trackpad. Ignore those here; explicit zoom is Cmd+wheel or the host
    // toolbar.
    let isGesturing = false;
    const onGestureStart = (e) => { e.preventDefault(); e.stopPropagation(); isGesturing = true; };
    const onGestureChange = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onGestureEnd = (e) => { e.preventDefault(); e.stopPropagation(); isGesturing = false; };`);
  return { result, wheelMatched, gestureMatched };
}

function readCentralDirectory(zip: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  if (centralOffset + centralSize > zip.length) {
    throw new Error('invalid zip central directory');
  }

  const entries: ZipEntry[] = [];
  let offset = centralOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error('invalid zip central directory entry');
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    if ((flags & 1) !== 0) throw new Error('encrypted zip entries are not supported');
    if (method !== 0 && method !== 8) {
      throw new Error(`unsupported zip compression method: ${method}`);
    }
    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      isDirectory: name.endsWith('/'),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function findEndOfCentralDirectory(zip: Buffer): number {
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('invalid zip: missing central directory');
}

function readEntryBody(zip: Buffer, entry: ZipEntry): Buffer {
  const offset = entry.localOffset;
  if (zip.readUInt32LE(offset) !== LOCAL_SIG) {
    throw new Error(`invalid zip local header: ${entry.name}`);
  }
  const nameLen = zip.readUInt16LE(offset + 26);
  const extraLen = zip.readUInt16LE(offset + 28);
  const bodyStart = offset + 30 + nameLen + extraLen;
  const bodyEnd = bodyStart + entry.compressedSize;
  if (bodyEnd > zip.length) throw new Error(`zip entry exceeds archive: ${entry.name}`);
  const compressed = zip.slice(bodyStart, bodyEnd);
  if (entry.method === 0) return Buffer.from(compressed);
  // A genuinely empty deflate payload would still occupy at least the BFINAL
  // marker; an entirely missing payload cannot be inflated, so treat it as
  // empty rather than handing a zero-length buffer to zlib.
  if (compressed.length === 0) return Buffer.alloc(0);
  // When the central directory advertises 0 (streaming zips with data
  // descriptors), fall back to the per-file ceiling so legitimate non-empty
  // payloads decode instead of being silently truncated. The post-decode
  // checks in the caller enforce MAX_FILE_BYTES and total-bytes limits.
  const cap = entry.uncompressedSize > 0 ? entry.uncompressedSize : MAX_FILE_BYTES;
  return inflateRawSync(compressed, { maxOutputLength: cap });
}

function sanitizeZipPath(name: string): string {
  if (name.includes('\0')) throw new Error('invalid zip file name');
  if (/^[A-Za-z]:/.test(name) || name.startsWith('/')) {
    throw new Error('absolute zip paths are not allowed');
  }
  return validateProjectPath(name);
}

function chooseEntryFile(paths: string[]): string | null {
  const html = paths.filter((p) => /\.html?$/i.test(p));
  if (html.length === 0) return null;
  const lower = new Map(html.map((p) => [p.toLowerCase(), p]));
  return (
    lower.get('index.html') ??
    html.find((p) => !p.includes('/')) ??
    html[0] ??
    null
  );
}

function safeJoin(root: string, relPath: string): string {
  const target = path.resolve(root, relPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error('path escapes project dir');
  }
  return target;
}
