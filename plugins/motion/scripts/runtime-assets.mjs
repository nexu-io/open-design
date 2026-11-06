import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { access, copyFile, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export async function download(asset, filename) {
  const url = new URL(asset.url);
  assert(url.protocol === 'https:' && /^[a-f0-9]{64}$/.test(asset.sha256), 'Require HTTPS and a pinned SHA256');
  try { if (await sha256(filename) === asset.sha256) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.part';
  try {
    let current = url, response;
    const signal = AbortSignal.timeout(300_000);
    for (let redirects = 0; redirects <= 5; redirects++) {
      assert.equal(current.protocol, 'https:', 'Runtime redirects must use HTTPS');
      response = await fetch(current, { redirect: 'manual', signal });
      if (response.status < 300 || response.status > 399) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      assert(location && redirects < 5, 'Invalid or excessive runtime redirects');
      current = new URL(location, current);
    }
    assert(response.ok && response.body, `Download ${url.hostname}${url.pathname}: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    assert.equal(await sha256(temporary), asset.sha256, `SHA256 mismatch: ${url.pathname}`);
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}

export async function runFile(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 300_000, ...options });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk).slice(-4 * 1024 * 1024); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr || stdout}`)));
  });
}

export function relativePath(root, filename) {
  assert(typeof filename === 'string' && filename && !/[\\\x00-\x1f]/.test(filename) && !filename.startsWith('/') && !/^[a-z]:/i.test(filename)
    && !filename.split('/').includes('..'), 'Unsafe archive path: ' + filename);
  return path.join(root, filename);
}

export async function canonical(directory) {
  const normalized = path.resolve(directory);
  try { return await realpath(normalized); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(await canonical(path.dirname(normalized)), path.basename(normalized));
  }
}

export async function withLock(filename, work) {
  // shortcut: a killed installer leaves its PID lock; verify the process exited before removing it.
  await mkdir(path.dirname(filename), { recursive: true });
  let handle;
  try { handle = await open(filename, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Another OpenMotion install is using ${filename}. Retry after it finishes; after a crash confirm its PID has exited before removing this lock.`);
  }
  try { await handle.writeFile(String(process.pid)); return await work(); }
  finally { await handle.close(); await rm(filename, { force: true }); }
}

export async function obtainAsset(asset, filename, allowLocal = false) {
  assert(/^[a-f0-9]{64}$/.test(asset.sha256), 'Require a pinned SHA256');
  const url = new URL(asset.url);
  if (url.protocol !== 'file:') return download(asset, filename);
  assert(allowLocal, 'Local assets require an explicitly supplied local manifest');
  if (await sha256(filename).catch(error => { if (error.code !== 'ENOENT') throw error; }) === asset.sha256) return;
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = filename + '.' + randomUUID() + '.part';
  try {
    await copyFile(fileURLToPath(url), temporary);
    assert.equal(await sha256(temporary), asset.sha256, 'SHA256 mismatch: local asset');
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
}

export async function extractArchive(filename, directory) {
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  const entries = await runFile(tar, ['-tf', filename]);
  for (const entry of entries.split(/\r?\n/).filter(Boolean)) relativePath(directory, entry);
  await mkdir(directory, { recursive: true });
  await runFile(tar, ['-xf', filename, '-C', directory]);
}

export async function writeJSON(filename, value) {
  return writeAtomic(filename, JSON.stringify(value, null, 2) + '\n');
}

export async function writeAtomic(filename, value) {
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, value, { mode: 0o600 }); await rename(temporary, filename); }
  finally { await rm(temporary, { force: true }); }
}

export async function readJSON(filename) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function executable(filename) { await access(filename, constants.X_OK); return filename; }

export function nativeComponents(info) { return info.media ? ['browser', 'media'] : ['browser', 'ffmpeg', 'ffprobe']; }
