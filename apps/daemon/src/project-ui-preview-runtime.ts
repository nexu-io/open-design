import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { open, readFile, mkdir, access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createCommandInvocation, isProcessAlive, readLogTail } from '@open-design/platform';
import type {
  ProjectUiPreviewRuntimeResponse,
  ProjectUiSurface,
} from '@open-design/contracts';

const PREVIEW_HOST = '127.0.0.1';
const PREVIEW_READY_TIMEOUT_MS = 35_000;
const PREVIEW_READY_CONNECT_TIMEOUT_MS = 1_500;

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

interface PackageJson {
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface PreviewRuntimeEntry {
  key: string;
  projectId: string;
  runtimeRoot: string;
  cwd: string;
  port: number;
  baseUrl: string;
  proxyBasePath: string;
  proxyToken: string;
  logPath: string;
  child: ChildProcess;
  status: 'starting' | 'ready' | 'failed';
  error: string | null;
  startPromise: Promise<ProjectUiPreviewRuntimeResponse> | null;
}

const previewRuntimes = new Map<string, PreviewRuntimeEntry>();
let exitHandlersInstalled = false;

export async function startProjectUiPreviewRuntime(input: {
  projectId: string;
  projectRoot: string;
  stateRoot: string;
  surface: ProjectUiSurface;
}): Promise<ProjectUiPreviewRuntimeResponse> {
  installExitHandlers();
  const requestedRuntimeRoot = normalizeProjectPath(input.surface.previewRuntimeRoot ?? '');
  const previewRoute = input.surface.previewPath ?? input.surface.route ?? '/';
  if (input.surface.previewRuntimeRoot == null) {
    return unsupportedResponse(null, previewRoute, 'This screen does not declare an app runtime.');
  }
  const requestedCwd = safeProjectJoin(input.projectRoot, requestedRuntimeRoot);
  if (!requestedCwd) {
    return unsupportedResponse(requestedRuntimeRoot, previewRoute, 'Preview runtime path is outside the project.');
  }

  const runnable = await findRunnablePackage(input.projectRoot, requestedCwd);
  if (!runnable) {
    return unsupportedResponse(
      requestedRuntimeRoot,
      previewRoute,
      'No package.json with a dev script was found for this screen.',
    );
  }

  const depsInstalled = await dependenciesInstalled(input.projectRoot, runnable.cwd, runnable.packageJson);
  if (!depsInstalled) {
    return {
      status: 'needs-setup',
      runtimeRoot: runnable.runtimeRoot,
      baseUrl: null,
      url: null,
      route: previewRoute,
      error: 'Install this project’s dependencies before starting a live preview.',
    };
  }

  const key = runtimeKey(input.projectId, input.projectRoot, runnable.runtimeRoot);
  const existing = previewRuntimes.get(key);
  if (existing && isRuntimeAlive(existing)) {
    if (existing.status === 'ready') return readyResponse(existing, previewRoute);
    if (existing.startPromise) return existing.startPromise;
  } else if (existing) {
    previewRuntimes.delete(key);
  }
  const proxyToken = runtimeProxyToken();
  const proxyBasePath = `/api/projects/${encodeURIComponent(input.projectId)}/ui-preview/proxy/${proxyToken}`;

  const startPromise = launchRuntime({
    key,
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    stateRoot: input.stateRoot,
    cwd: runnable.cwd,
    runtimeRoot: runnable.runtimeRoot,
    proxyBasePath,
    proxyToken,
    packageJson: runnable.packageJson,
    route: previewRoute,
    framework: input.surface.framework,
  });
  return startPromise;
}

export async function stopAllProjectUiPreviewRuntimes(): Promise<void> {
  const entries = [...previewRuntimes.values()];
  previewRuntimes.clear();
  await Promise.all(entries.map((entry) => stopRuntime(entry)));
}

async function launchRuntime(input: {
  key: string;
  projectId: string;
  projectRoot: string;
  stateRoot: string;
  cwd: string;
  runtimeRoot: string;
  proxyBasePath: string;
  proxyToken: string;
  packageJson: PackageJson;
  route: string;
  framework: string | null;
}): Promise<ProjectUiPreviewRuntimeResponse> {
  const port = await allocatePort();
  const baseUrl = `http://${PREVIEW_HOST}:${port}`;
  const logPath = await previewLogPath(input.stateRoot, input.runtimeRoot);
  const packageManager = await detectPackageManager(input.projectRoot, input.cwd, input.packageJson);
  const extraArgs = previewScriptArgs(input.framework, port);
  const args = packageManagerRunArgs(packageManager, extraArgs);
  const env = {
    ...process.env,
    BROWSER: 'none',
    CI: '1',
    HOST: PREVIEW_HOST,
    HOSTNAME: PREVIEW_HOST,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    VITE_HOST: PREVIEW_HOST,
  };
  const invocation = createCommandInvocation({
    command: commandForPackageManager(packageManager),
    args,
    env,
  });
  const logFile = await open(logPath, 'a');
  let child: ChildProcess;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd: input.cwd,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', logFile.fd, logFile.fd],
      windowsHide: true,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
    });
  } finally {
    await logFile.close().catch(() => undefined);
  }

  const entry: PreviewRuntimeEntry = {
    key: input.key,
    projectId: input.projectId,
    runtimeRoot: input.runtimeRoot,
    cwd: input.cwd,
    port,
    baseUrl,
    proxyBasePath: input.proxyBasePath,
    proxyToken: input.proxyToken,
    logPath,
    child,
    status: 'starting',
    error: null,
    startPromise: null,
  };
  const startPromise = waitForRuntime(entry, input.route);
  entry.startPromise = startPromise;
  previewRuntimes.set(input.key, entry);
  child.once('exit', (code, signal) => {
    entry.status = 'failed';
    entry.error = signal ? `preview process exited with ${signal}` : `preview process exited with code ${code ?? 'unknown'}`;
  });
  child.once('error', (error) => {
    entry.status = 'failed';
    entry.error = errorMessage(error);
  });
  child.unref();
  return startPromise;
}

async function waitForRuntime(
  entry: PreviewRuntimeEntry,
  route: string,
): Promise<ProjectUiPreviewRuntimeResponse> {
  try {
    await waitForPreviewPort(entry);
    entry.status = 'ready';
    entry.error = null;
    entry.startPromise = null;
    return readyResponse(entry, route);
  } catch (error) {
    entry.status = 'failed';
    entry.error = errorMessage(error);
    entry.startPromise = null;
    return {
      status: 'failed',
      runtimeRoot: entry.runtimeRoot,
      baseUrl: null,
      url: null,
      route,
      error: entry.error,
      logTail: await readLogTail(entry.logPath, 30),
    };
  }
}

function readyResponse(entry: PreviewRuntimeEntry, route: string): ProjectUiPreviewRuntimeResponse {
  return {
    status: 'ready',
    runtimeRoot: entry.runtimeRoot,
    baseUrl: entry.proxyBasePath,
    url: joinPreviewUrl(entry.proxyBasePath, route),
    upstreamBaseUrl: entry.baseUrl,
    route,
  };
}

function unsupportedResponse(
  runtimeRoot: string | null,
  route: string | null,
  error: string,
): ProjectUiPreviewRuntimeResponse {
  return { status: 'unsupported', runtimeRoot, baseUrl: null, url: null, route, error };
}

async function findRunnablePackage(
  projectRoot: string,
  startCwd: string,
): Promise<{ cwd: string; runtimeRoot: string; packageJson: PackageJson } | null> {
  let cwd = startCwd;
  while (isInsideOrEqual(projectRoot, cwd)) {
    const packageJson = await readPackageJson(path.join(cwd, 'package.json'));
    if (packageJson?.scripts?.dev) {
      return {
        cwd,
        runtimeRoot: normalizeProjectPath(path.relative(projectRoot, cwd)),
        packageJson,
      };
    }
    if (cwd === projectRoot) break;
    cwd = path.dirname(cwd);
  }
  return null;
}

async function dependenciesInstalled(
  projectRoot: string,
  runtimeCwd: string,
  packageJson: PackageJson,
): Promise<boolean> {
  if (dependencyNames(packageJson).length === 0) return true;
  let cwd = runtimeCwd;
  while (isInsideOrEqual(projectRoot, cwd)) {
    if (await exists(path.join(cwd, 'node_modules'))) return true;
    if (cwd === projectRoot) break;
    cwd = path.dirname(cwd);
  }
  return false;
}

async function detectPackageManager(
  projectRoot: string,
  runtimeCwd: string,
  packageJson: PackageJson,
): Promise<PackageManager> {
  const declared = packageJson.packageManager?.split('@')[0];
  if (declared === 'pnpm' || declared === 'npm' || declared === 'yarn' || declared === 'bun') return declared;

  let cwd = runtimeCwd;
  while (isInsideOrEqual(projectRoot, cwd)) {
    if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
    if (await exists(path.join(cwd, 'package-lock.json'))) return 'npm';
    if (await exists(path.join(cwd, 'yarn.lock'))) return 'yarn';
    if (await exists(path.join(cwd, 'bun.lock')) || await exists(path.join(cwd, 'bun.lockb'))) return 'bun';
    if (cwd === projectRoot) break;
    cwd = path.dirname(cwd);
  }
  return 'npm';
}

function packageManagerRunArgs(packageManager: PackageManager, extraArgs: string[]): string[] {
  if (packageManager === 'pnpm' || packageManager === 'yarn' || packageManager === 'bun') {
    return ['run', 'dev', ...extraArgs];
  }
  return extraArgs.length > 0 ? ['run', 'dev', '--', ...extraArgs] : ['run', 'dev'];
}

function previewScriptArgs(framework: string | null, port: number): string[] {
  if (framework === 'Next.js') return ['--hostname', PREVIEW_HOST, '--port', String(port)];
  if (framework === 'Vite' || framework === 'React') return ['--host', PREVIEW_HOST, '--port', String(port)];
  return [];
}

function commandForPackageManager(packageManager: PackageManager): string {
  if (process.platform === 'win32') return `${packageManager}.cmd`;
  return packageManager;
}

function dependencyNames(packageJson: PackageJson): string[] {
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];
}

async function waitForPreviewPort(entry: PreviewRuntimeEntry): Promise<void> {
  const startedAt = Date.now();
  let lastError: string | null = null;
  while (Date.now() - startedAt < PREVIEW_READY_TIMEOUT_MS) {
    if (!isRuntimeAlive(entry)) {
      throw new Error(entry.error ?? 'preview process exited before it became reachable');
    }
    try {
      await connectToPreviewPort(entry.port);
      return;
    } catch (error) {
      lastError = errorMessage(error);
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${entry.baseUrl}${lastError ? ` (${lastError})` : ''}`);
}

async function connectToPreviewPort(port: number): Promise<void> {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: PREVIEW_HOST, port });
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(PREVIEW_READY_CONNECT_TIMEOUT_MS);
    socket.once('connect', () => finish());
    socket.once('timeout', () => finish(new Error('connection timed out')));
    socket.once('error', (error) => finish(error));
  });
}

async function allocatePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, PREVIEW_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (typeof port === 'number') resolve(port);
        else reject(new Error('failed to allocate preview port'));
      });
    });
  });
}

async function previewLogPath(stateRoot: string, runtimeRoot: string): Promise<string> {
  const logDir = path.join(stateRoot, '.ui-preview');
  await mkdir(logDir, { recursive: true });
  const hash = createHash('sha256').update(runtimeRoot || '.').digest('hex').slice(0, 12);
  return path.join(logDir, `${hash}.log`);
}

async function readPackageJson(filePath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeProjectJoin(projectRoot: string, relativePath: string): string | null {
  const resolved = path.resolve(projectRoot, relativePath);
  return isInsideOrEqual(projectRoot, resolved) ? resolved : null;
}

function isInsideOrEqual(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRuntimeAlive(entry: PreviewRuntimeEntry): boolean {
  return typeof entry.child.pid === 'number' && isProcessAlive(entry.child.pid);
}

async function stopRuntime(entry: PreviewRuntimeEntry): Promise<void> {
  const pid = entry.child.pid;
  if (typeof pid !== 'number') return;
  const signalPid = process.platform === 'win32' ? pid : -pid;
  try {
    process.kill(signalPid, 'SIGTERM');
  } catch {
    return;
  }
  await sleep(500);
  if (!isProcessAlive(pid)) return;
  try {
    process.kill(signalPid, 'SIGKILL');
  } catch {
    // Already stopped.
  }
}

function installExitHandlers(): void {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  process.once('exit', () => {
    for (const entry of previewRuntimes.values()) {
      const pid = entry.child.pid;
      if (typeof pid !== 'number') continue;
      try {
        process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
      } catch {
        // Best effort on daemon shutdown.
      }
    }
  });
}

function runtimeKey(projectId: string, projectRoot: string, runtimeRoot: string): string {
  return `${projectId}:${projectRoot}:${runtimeRoot}`;
}

function runtimeProxyToken(): string {
  return randomBytes(16).toString('hex');
}

export function projectUiPreviewRuntimeProxyTarget(
  projectId: string,
  proxyToken: string,
): { baseUrl: string; proxyBasePath: string } | null {
  for (const entry of previewRuntimes.values()) {
    if (entry.projectId !== projectId) continue;
    if (entry.proxyToken !== proxyToken) continue;
    if (!isRuntimeAlive(entry)) return null;
    return {
      baseUrl: entry.baseUrl,
      proxyBasePath: entry.proxyBasePath,
    };
  }
  return null;
}

function joinPreviewUrl(baseUrl: string, route: string | null): string {
  const pathName = route?.startsWith('/') ? route : `/${route ?? ''}`;
  return `${baseUrl}${pathName.replace(/\/+/g, '/')}`;
}

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/^\.$/u, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
