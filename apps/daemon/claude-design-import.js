import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { validateProjectPath } from './projects.js';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function importClaudeDesignZip(zipPath, projectDir) {
  const zip = await readFile(zipPath);
  const entries = readCentralDirectory(zip);
  const files = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (files.length >= MAX_FILES) throw new Error('zip contains too many files');
    const relPath = sanitizeZipPath(entry.name);
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      throw new Error(`zip file too large: ${relPath}`);
    }
    totalBytes += entry.uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('zip is too large');

    const body = readEntryBody(zip, entry);
    if (body.length !== entry.uncompressedSize) {
      throw new Error(`zip entry size mismatch: ${relPath}`);
    }
    files.push({ path: relPath, body });
  }

  if (files.length === 0) throw new Error('zip contains no files');
  const entryFile = chooseEntryFile(files.map((f) => f.path));
  if (!entryFile) throw new Error('zip does not contain an HTML file');

  await mkdir(projectDir, { recursive: true });
  for (const f of files) {
    const target = safeJoin(projectDir, f.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, f.body);
  }

  return {
    entryFile,
    files: files.map((f) => f.path),
  };
}

function readCentralDirectory(zip) {
  const eocdOffset = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocdOffset + 10);
  const centralSize = zip.readUInt32LE(eocdOffset + 12);
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);
  if (centralOffset + centralSize > zip.length) {
    throw new Error('invalid zip central directory');
  }

  const entries = [];
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

function findEndOfCentralDirectory(zip) {
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('invalid zip: missing central directory');
}

function readEntryBody(zip, entry) {
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
  return inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize });
}

function sanitizeZipPath(name) {
  if (name.includes('\0')) throw new Error('invalid zip file name');
  if (/^[A-Za-z]:/.test(name) || name.startsWith('/')) {
    throw new Error('absolute zip paths are not allowed');
  }
  return validateProjectPath(name);
}

function chooseEntryFile(paths) {
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

function safeJoin(root, relPath) {
  const target = path.resolve(root, relPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error('path escapes project dir');
  }
  return target;
}
