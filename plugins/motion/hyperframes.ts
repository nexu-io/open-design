import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { access, copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateExportExpectation } from './shared/export-spec.ts';

export const HYPERFRAMES_VERSION = '0.9.7';
// Omitting registry uses the pinned CLI's official catalog, just like a native project.
export const nativeProjectConfig = {
  $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
};
export const pluginRoot = fileURLToPath(new URL('./', import.meta.url));
export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const commands = new Set<ChildProcess>();
function terminate(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else if (child.pid && process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill(signal));
    else child.kill(signal);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
}
export function stopCommands() { for (const child of commands) terminate(child); }

export function runtimeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_PREVIEW_HOST: '127.0.0.1',
    // shortcut: pinned Node can hang in Windows compile-cache startup; remove after upstream fix is verified (nodejs/node#66438).
    ...(process.platform === 'win32' ? { NODE_DISABLE_COMPILE_CACHE: '1' } : {}),
    ...(!process.env.HYPERFRAMES_FFMPEG_PATH && process.env.FFMPEG_PATH ? { HYPERFRAMES_FFMPEG_PATH: process.env.FFMPEG_PATH } : {}),
    ...(!process.env.HYPERFRAMES_FFPROBE_PATH && process.env.FFPROBE_PATH ? { HYPERFRAMES_FFPROBE_PATH: process.env.FFPROBE_PATH } : {}) };
}

export type CommandResult = { code: number; stdout: string; stderr: string };
export function execute(command: string, args: string[], cwd: string, timeout = 120_000, environment: NodeJS.ProcessEnv = {}, signal?: AbortSignal): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('COMMAND_CANCELLED')); return; }
    const child = spawn(command, args, { cwd, env: { ...runtimeEnv(), ...environment }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    commands.add(child);
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; terminate(child); }, timeout);
    const killer = setTimeout(() => terminate(child, 'SIGKILL'), timeout + 5000);
    let cancellationKiller: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { terminate(child); cancellationKiller = setTimeout(() => terminate(child, 'SIGKILL'), 5000); };
    signal?.addEventListener('abort', cancel, { once: true });
    const cleanup = () => { commands.delete(child); clearTimeout(timer); clearTimeout(killer); clearTimeout(cancellationKiller); signal?.removeEventListener('abort', cancel); };
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-4 * 1024 * 1024); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-32 * 1024); });
    child.on('error', error => { cleanup(); reject(error); });
    child.on('close', code => {
      cleanup();
      if (signal?.aborted) reject(new Error('COMMAND_CANCELLED'));
      else if (timedOut) reject(new Error('Hyperframes 执行超时：' + stderr.slice(-1000)));
      else resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function installed(root: string) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, 'node_modules/hyperframes/package.json'), 'utf8'));
    if (manifest.version !== HYPERFRAMES_VERSION) return false;
    await access(path.join(root, 'node_modules/gsap/dist/gsap.min.js'));
    await access(path.join(root, 'node_modules/hyperframes/dist/studio/index.html'));
    return true;
  } catch { return false; }
}

// Packaged plugins have no node_modules. Install the locked runtime in the writable
// data directory; never alter the plugin cache or the user's global npm packages.
export async function ensureRuntime(dataDirectory: string, prepareNative = true): Promise<string> {
  if (prepareNative) await (await import('./scripts/npm-runtime.mjs')).ensureNativeRuntime(pluginRoot);
  if (await installed(pluginRoot)) return pluginRoot;
  const lockfile = await readFile(path.join(pluginRoot, 'package-lock.json'));
  const { createHash } = await import('node:crypto');
  const key = createHash('sha256').update(lockfile).digest('hex').slice(0, 16);
  const root = path.join(dataDirectory, 'runtime', key);
  await mkdir(root, { recursive: true });
  const ready = async () => {
    try { return await readFile(path.join(root, 'ready'), 'utf8') === key && await installed(root); }
    catch { return false; }
  };
  if (await ready()) return root;
  let lock;
  const end = Date.now() + 240_000;
  while (!lock) {
    try { lock = await open(path.join(root, 'install.lock'), 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (await ready()) return root;
      if (Date.now() > end) throw new Error('Hyperframes 依赖安装仍被占用，请检查 runtime 目录中的 install.lock');
      await delay(250);
    }
  }
  try {
    if (await ready()) return root;
    await copyFile(path.join(pluginRoot, 'package.json'), path.join(root, 'package.json'));
    await copyFile(path.join(pluginRoot, 'package-lock.json'), path.join(root, 'package-lock.json'));
    const result = await execute(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], root, 180_000);
    if (result.code || !await installed(root)) throw new Error('Hyperframes 安装失败：' + (result.stderr || result.stdout).slice(-1500));
    await (await import('node:fs/promises')).writeFile(path.join(root, 'ready'), key, { mode: 0o600 });
    return root;
  } finally { await lock.close(); await rm(path.join(root, 'install.lock'), { force: true }); }
}

export function cliPath(runtimeRoot: string) { return path.join(runtimeRoot, 'node_modules/hyperframes/bin/hyperframes.mjs'); }
export async function runHyperframes(runtimeRoot: string, directory: string, args: string[], timeout?: number, environment?: NodeJS.ProcessEnv, signal?: AbortSignal) {
  return execute(process.execPath, [cliPath(runtimeRoot), ...args], directory, timeout, environment, signal);
}
export async function inspectProject(runtimeRoot: string, directory: string, view: string, signal?: AbortSignal) {
  if (!['info', 'lint', 'timeline'].includes(view)) throw new Error('view 必须为 info、lint 或 timeline');
  const result = await runHyperframes(runtimeRoot, directory, [view, '.', '--json'], undefined, undefined, signal);
  try { return { exitCode: result.code, result: JSON.parse(result.stdout) }; }
  catch { throw new Error('Hyperframes ' + view + ' 失败：' + (result.stderr || result.stdout).slice(-1500)); }
}

// Read the immutable render input, never the later active project or the output MP4.
// Use the pinned runtime's public parser and fps rules; no wrapper composition DSL.
export async function snapshotExportExpectation(runtimeRoot: string, directory: string) {
  const info = await inspectProject(runtimeRoot, directory, 'info');
  if (info.exitCode) throw new Error('无法读取导出快照规格：' + JSON.stringify(info.result));
  const coreRoot = path.join(runtimeRoot, 'node_modules/@hyperframes/core');
  const core = JSON.parse(await readFile(path.join(coreRoot, 'package.json'), 'utf8'));
  const [{ parseHTMLContent }, { parseFps, fpsToNumber }] = await Promise.all([
    import(pathToFileURL(path.join(coreRoot, core.exports['./compiler'].import)).href),
    import(pathToFileURL(path.join(coreRoot, core.exports['.'].import)).href),
  ]);
  const document = parseHTMLContent(await readFile(path.join(directory, 'index.html'), 'utf8'));
  const attribute = (element: Element, name: string) => Array.from(element.attributes).find(item => item.name.toLowerCase() === name)?.value;
  const compositions = Array.from(document.querySelectorAll('*')) as Element[];
  const roots = compositions.filter(element => attribute(element, 'data-composition-id') !== undefined);
  const root = roots.find(element => attribute(element, 'data-root') === 'true') || roots[0];
  if (!root) throw new Error('导出快照缺少根 composition');
  const fps = parseFps(attribute(root, 'data-fps')?.trim() || '30');
  if (!fps.ok) throw new Error('导出快照帧率无效：' + fps.reason);
  return validateExportExpectation({ width: info.result.width, height: info.result.height,
    duration: info.result.duration, fps: fpsToNumber(fps.value), audio: 'optional' });
}

export type Studio = { url: string; projectDirectory: string; alive: () => boolean; close: () => Promise<void> };
/** Repair only the nonexistent catalog URL generated by earlier Motion versions. */
export async function repairGeneratedRegistry(projectDirectory: string) {
  const filename = path.join(projectDirectory, 'hyperframes.json');
  let original: string, config: Record<string, unknown>;
  try { original = await readFile(filename, 'utf8'); config = JSON.parse(original); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return false;
    throw error;
  }
  if (!config || config.registry !== 'https://hyperframes.heygen.com/registry') return false;
  delete config.registry;
  const temporary = path.join(projectDirectory, '.motion-config-' + crypto.randomUUID());
  try {
    await writeFile(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    if (await readFile(filename, 'utf8') !== original) throw new Error('工程配置刚被修改，请重试打开工程');
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
  return true;
}

export async function startStudio(runtimeRoot: string, projectDirectory: string, logFile: string, port = 20_000): Promise<Studio> {
  await repairGeneratedRegistry(projectDirectory);
  // Keep the native service above the ports restricted by browser/Fetch runtimes.
  // Repeated project switches can otherwise increment a 4174 start into 4190.
  const studioPort = Math.max(20_000, port);
  const log = await open(logFile, 'a', 0o600);
  const child = spawn(process.execPath, [cliPath(runtimeRoot), 'preview', projectDirectory, '--port', String(studioPort), '--foreground', '--force-new', '--no-open', '--json'], {
    cwd: projectDirectory, env: runtimeEnv(), stdio: ['ignore', 'pipe', log.fd], windowsHide: true, detached: process.platform !== 'win32',
  });
  // Attach lifecycle listeners before yielding: an immediate spawn error must be handled.
  const closingLog = log.close();
  let live = true;
  const exited = new Promise<void>(resolve => child.once('exit', () => { live = false; resolve(); }));
  const close = async () => {
    if (!live) return;
    terminate(child);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); })]);
    clearTimeout(timer);
    if (live) terminate(child, 'SIGKILL');
  };
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let buffer = '', lastOutput = '';
      const timer = setTimeout(() => reject(new Error('Hyperframes Studio 启动超时，请查看 studio.log；最近输出：' + (lastOutput || '(尚无 stdout)'))), 60_000);
      const fail = (error: Error) => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(`Hyperframes Studio 已退出 (${code})，请查看 studio.log`)));
      child.stdout.on('data', data => {
        buffer += data;
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          lastOutput = line.slice(-2000);
          try {
            const payload = JSON.parse(line);
            if (payload.ok === false) return fail(new Error(payload.error?.message || 'Studio 启动失败'));
            if (payload.result?.ready) {
              if (path.resolve(payload.result.projectDir) !== projectDirectory) return fail(new Error('Studio 返回的工程目录不匹配：' + JSON.stringify({ requested: projectDirectory, returned: payload.result.projectDir })));
              const address = new URL(payload.result.studioUrl);
              if (!['localhost', '127.0.0.1'].includes(address.hostname)) return fail(new Error('Studio 返回了非本机地址'));
              clearTimeout(timer); resolve(address.href);
            }
          } catch { /* Ignore human-readable CLI diagnostics, never expose them on MCP stdout. */ }
        }
      });
    });
    const identityUrl = new URL('/__hyperframes_config', url);
    const response = await fetch(identityUrl, { signal: AbortSignal.timeout(3000) });
    const identity = await response.json() as { isHyperframes: boolean; projectDir: string; version: string };
    if (!response.ok || !identity.isHyperframes || path.resolve(identity.projectDir) !== projectDirectory || identity.version !== HYPERFRAMES_VERSION) {
      throw new Error('Hyperframes Studio 的版本或工程目录不匹配');
    }
    return { url, projectDirectory, alive: () => live, close };
  } catch (error) { await close(); throw error; }
  finally { await closingLog; }
}
