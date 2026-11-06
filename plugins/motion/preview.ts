import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { WorkspaceStore } from './workspace.ts';
import { ensureEditor, editorRequest, readEditor, sharedEditorEnabled } from './editor-runtime.ts';

const pluginRoot = fileURLToPath(new URL('./', import.meta.url));
export const VERSION: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export type Health = { service: string; protocol: number; version: string; dataDirectory: string; ffmpeg: boolean; ready: boolean; editorReady?: boolean; studioUrl?: string; hyperframesCli?: string; authoringGuide?: string };
export type Probe = { kind: 'free' | 'busy'; health?: never } | { kind: 'motion'; health: Health };
export type Started = { pid?: number; alive: () => boolean; error: () => string; stop: () => void };
export type PreviewRuntime = {
  probe: (port: number) => Promise<Probe>;
  launch: (port: number, directory: string, log: string, background?: boolean) => Promise<Started>;
  openEditor?: (port: number) => Promise<void>;
  wait: () => Promise<void>;
  attempts: number;
};

async function probe(port: number): Promise<Probe> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return { kind: 'busy' };
    const health = await response.json() as Health;
    return health.service === 'motion-preview' && health.protocol === 2 && health.ready && typeof health.dataDirectory === 'string'
      ? { kind: 'motion', health } : { kind: 'busy' };
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === 'ECONNREFUSED') return { kind: 'free' };
    if (code === 'EPERM' || code === 'EACCES') throw new Error('当前环境不允许访问本地预览服务，请检查本地执行权限。不会改用其他方式绕过限制。');
    return { kind: 'busy' };
  }
}

async function launch(port: number, directory: string, log: string, background = false): Promise<Started> {
  const file = await open(log, 'a', 0o600);
  let child;
  let message = '', closed = false;
  try {
    child = spawn(process.execPath, ['--experimental-strip-types', path.join(pluginRoot, 'server.ts')], {
      cwd: pluginRoot, detached: true, stdio: ['ignore', file.fd, file.fd],
      env: { ...process.env, PORT: String(port), MOTION_DATA_DIR: directory, MOTION_HEADLESS: background ? '1' : '0' },
    });
    child.on('error', error => { message = error.message; closed = true; });
    child.on('exit', () => { closed = true; });
  } finally { await file.close(); }
  child.unref();
  return { pid: child.pid, alive: () => !closed, error: () => message,
    stop: () => { if (!closed) child.kill('SIGTERM'); } };
}

const runtime: PreviewRuntime = { probe, launch, wait: () => new Promise(resolve => setTimeout(resolve, 150)), attempts: 2000 };

function initialPort() {
  const value = Number(process.env.PORT || 4173);
  if (!Number.isInteger(value) || value < 1024 || value > 65526) throw new Error('PORT 必须在 1024–65526 之间');
  return value;
}
async function registeredPort(store: WorkspaceStore): Promise<number | null> {
  try {
    const value = JSON.parse(await readFile(path.join(store.directory, 'preview.json'), 'utf8'));
    return Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535 ? value.port : null;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
}
export async function previewUrl(store: WorkspaceStore) {
  if (sharedEditorEnabled) { const editor = await readEditor(store.directory); if (editor) return new URL(editor.endpoint).origin; }
  return `http://localhost:${await registeredPort(store) || initialPort()}`;
}

async function requestEditor(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const response = await fetch(`${origin}/motion-api/preview/open`, { method: 'POST', headers: { Origin: origin } });
  if (!response.ok) throw new Error((await response.json()).error || '无法启动编辑器');
}

// Background tool calls must not initialize or stamp the active source before
// applying the caller's revision. Opening the editor is a separate operation.
export async function ensureService(store = new WorkspaceStore(), environment: PreviewRuntime = runtime) {
  return openPreview(store, environment, { editor: false });
}

export async function openPreview(store = new WorkspaceStore(), environment: PreviewRuntime = runtime, options = { editor: true }) {
  let existingLegacy = false;
  if (sharedEditorEnabled && environment === runtime && !await readEditor(store.directory)) {
    const port = await registeredPort(store);
    if (port) {
      const found = await probe(port);
      existingLegacy = found.kind === 'motion' && found.health.version === VERSION && path.resolve(found.health.dataDirectory) === store.directory;
    }
  }
  if (sharedEditorEnabled && environment === runtime && !existingLegacy) {
    const before = await readEditor(store.directory), editor = await ensureEditor(store.directory);
    const opened = await editorRequest(editor, '/editor-api/preview', { projectId: store.projectId, editor: options.editor });
    const file = path.join(store.directory, 'preview.json'), temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try { await writeFile(temporary, JSON.stringify({ port: Number(new URL(editor.endpoint).port), pid: editor.pid, version: VERSION }), { mode: 0o600 }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
    return { ...opened, revision: (await store.get()).revision, reused: before?.instanceId === editor.instanceId,
      previewTarget: 'host-built-in-browser', nextAction: 'Open the exact previewUrl in the host built-in browser when available; otherwise return the URL and mark visual/player checks as not_run. Do not start another editor or ask the user to run a terminal server.' };
  }
  await mkdir(store.directory, { recursive: true });
  const lockPath = path.join(store.directory, 'preview-start.lock');
  const deadline = Date.now() + 360_000;
  let lock;
  while (!lock) {
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() > deadline) throw new Error('另一个 Motion 启动任务尚未结束，请稍后重试；不会重启其他进程。');
      await environment.wait();
    }
  }
  try {
    const firstPort = initialPort(), previous = await registeredPort(store);
    const candidates = [...new Set([...(previous ? [previous] : []), ...Array.from({ length: 10 }, (_, i) => firstPort + i)])];
    let available: number | null = null;
    const matches = (result: Probe) => result.kind === 'motion' && result.health.ready && result.health.version === VERSION && path.resolve(result.health.dataDirectory) === store.directory;
    async function ready(port: number, health: Health, reused: boolean, pid?: number) {
      if (options.editor && !health.studioUrl) {
        await (environment.openEditor || requestEditor)(port);
        const updated = await environment.probe(port);
        if (!matches(updated) || !updated.health?.studioUrl) throw new Error('编辑器启动后未通过就绪检查');
        health = updated.health;
      }
      const file = path.join(store.directory, 'preview.json'); const temporary = file + '.' + crypto.randomUUID() + '.tmp';
      try { await writeFile(temporary, JSON.stringify({ port, pid, version: VERSION }), { mode: 0o600 }); await rename(temporary, file); }
      finally { await rm(temporary, { force: true }); }
      return { previewUrl: `http://localhost:${port}`, studioUrl: health.studioUrl, hyperframesCli: health.hyperframesCli, authoringGuide: health.authoringGuide, engine: 'hyperframes', ready: true, reused, ffmpeg: health.ffmpeg, revision: (await store.get()).revision,
        dataDirectory: store.directory, editorReady: Boolean(health.studioUrl), browserOpened: false, previewTarget: 'host-built-in-browser',
        nextAction: options.editor ? 'Use the host built-in browser to open previewUrl in this conversation. Do not ask the user to run a server or launch an external browser. If the host has no built-in browser, return the URL and state that the embedded preview is unavailable.' : 'Background service ready. Opening the editor is not required for template application or export.' };
    }
    // Prefer reusing the exact same Motion version and workspace, even when the
    // first port is occupied. Never kill or reuse an unrelated local service.
    for (const port of candidates) {
      const result = await environment.probe(port);
      if (matches(result)) return await ready(port, (result as { health: Health }).health, true);
      if (result.kind === 'free' && available === null) available = port;
    }
    if (available === null) throw new Error('本地预览端口均已占用；未停止或替换任何已有服务。');
    const log = path.join(store.directory, 'preview.log');
    const child = await environment.launch(available, store.directory, log, !options.editor);
    try {
      for (let i = 0; i < environment.attempts; i++) {
        if (!child.alive()) throw new Error(child.error() || 'Motion 预览进程已退出');
        const result = await environment.probe(available);
        if (matches(result)) return await ready(available, (result as { health: Health }).health, false, child.pid);
        await environment.wait();
      }
      throw new Error('预览服务启动超时');
    } catch (error) {
      child.stop();
      throw new Error(`${error instanceof Error ? error.message : '启动失败'}。请查看 ${log}。不会重启 Codex 或改用其他启动方式绕过权限限制。`);
    }
  } finally { await lock.close(); await rm(lockPath, { force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await openPreview(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
