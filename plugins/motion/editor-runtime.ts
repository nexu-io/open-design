import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { appendFile, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore, Conflict } from './workspace.ts';
import { isMain } from './shared/entry.ts';

export const sharedEditorEnabled = process.platform === 'darwin';
const root = fileURLToPath(new URL('./', import.meta.url));
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const runtimeFiles = ['package-lock.json', 'scripts/npm-runtime.mjs', 'scripts/runtime-assets.mjs', 'scripts/runtime-lock.json', 'scripts/verify-export.ts', ...readdirSync(root).filter(file => file.endsWith('.ts')),
  ...['shared', 'gateway'].flatMap(folder => readdirSync(path.join(root, folder)).filter(file => /\.(ts|mjs|pl|json)$/.test(file)).map(file => folder + '/' + file))].sort();
export const editorBuild = createHash('sha256').update(runtimeFiles.map(file => file + '\n' + readFileSync(path.join(root, file))).join('\n')).digest('hex');
const service = 'opendesign-editor', protocol = 1;
export type EditorRegistry = { service: string; protocol: number; version: string; build: string; instanceId: string; pid: number; dataDirectory: string; endpoint: string; token: string };
export type Selection = { projectId?: string | null; sessionId?: string };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function editorDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const data = await realpath(directory), runtime = path.join(data, '.editor-runtime');
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  const info = await lstat(runtime);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid!() || (info.mode & 0o077)) throw new Error('编辑器运行目录必须由当前用户拥有且权限为 0700');
  return { data, runtime };
}
export async function readEditor(directory: string): Promise<EditorRegistry | null> {
  const { data, runtime } = await editorDirectory(directory);
  let value: EditorRegistry;
  try { value = JSON.parse(await readFile(path.join(runtime, 'runtime.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  const address = new URL(value.endpoint);
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || !address.port || address.pathname !== '/' || address.username || address.password || address.hash || address.search || value.dataDirectory !== data || !/^[a-f0-9]{64}$/.test(value.token) || typeof value.instanceId !== 'string') throw new Error('编辑器发现记录无效');
  return value;
}
export async function editorRequest(registry: EditorRegistry, route: string, body?: unknown, timeout = 120_000): Promise<any> {
  const response = await fetch(new URL(route, registry.endpoint), { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { Authorization: `Bearer ${registry.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || '编辑器请求失败'), { status: response.status, code: result.code });
  return result;
}
export async function ensureEditor(directory: string): Promise<EditorRegistry> {
  const { data, runtime } = await editorDirectory(directory);
  let launcher: ReturnType<typeof spawn> | undefined;
  for (let attempt = 0; attempt < 600; attempt++) {
    const registry = await readEditor(data);
    if (registry) {
      try {
        const health = await editorRequest(registry, '/editor-api/health', undefined, 1200);
        if (health.service !== service || health.dataDirectory !== data || health.instanceId !== registry.instanceId) throw Object.assign(new Error('编辑器实例身份不匹配'), { terminal: true });
        if (health.protocol !== protocol || health.version !== version || health.build !== editorBuild) throw Object.assign(new Error('编辑器协议或代码版本不兼容；请先停止旧后台后重试'), { terminal: true });
        return registry;
      } catch (error) { if ((error as any).terminal || (error as any).status) throw error; }
    }
    if (!launcher || launcher.exitCode !== null || launcher.signalCode !== null) {
      // Refuse a pre-runtime server for this workspace instead of starting a second editor.
      try {
        const old = JSON.parse(await readFile(path.join(data, 'preview.json'), 'utf8'));
        if (Number.isInteger(old.port)) {
          const health = await fetch(`http://127.0.0.1:${old.port}/api/health`, { signal: AbortSignal.timeout(800) }).then(r => r.json()).catch(() => null);
          if (health?.service === 'motion-preview' && typeof health.dataDirectory === 'string' && path.resolve(health.dataDirectory) === data) throw Object.assign(new Error('该工作区仍由旧预览服务管理；请先退出旧服务后重试'), { terminal: true });
        }
      } catch (error) { if ((error as any).terminal) throw error; if (!(error instanceof SyntaxError) && (error as any).code !== 'ENOENT') throw error; }
      const log = await open(path.join(runtime, 'editor.log'), 'a', 0o600);
      try {
        launcher = spawn('/usr/bin/perl', [path.join(root, 'shared/editor-launch.pl'), data, process.execPath, path.join(root, 'shared/editor-daemon.ts')], { detached: true, stdio: ['ignore', log.fd, log.fd], env: { ...process.env, MOTION_DATA_DIR: data } });
        await new Promise<void>((resolve, reject) => { launcher!.once('spawn', resolve); launcher!.once('error', () => reject(new Error('macOS 系统 Perl 启动器不可用，请检查系统 /usr/bin/perl'))); });
        launcher.unref();
      } finally { await log.close(); }
    }
    await pause(100);
  }
  throw new Error('编辑器未就绪，请查看 .editor-runtime/editor.log；未删除锁或停止其他进程');
}

export async function editorHeaders(store: WorkspaceStore, origin: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: origin };
  if (sharedEditorEnabled) {
    const registry = await readEditor(store.directory);
    if (registry && new URL(registry.endpoint).origin === origin) Object.assign(headers, { Authorization: `Bearer ${registry.token}`, 'X-OpenDesign-Project-Id': store.projectId });
  }
  return headers;
}

export async function serveEditor(directory: string) {
  const { data, runtime } = await editorDirectory(directory);
  const held = fstatSync(Number(process.env.OPENMOTION_EDITOR_LOCK_FD)), lock = statSync(path.join(runtime, 'runtime.lock'));
  if (held.dev !== lock.dev || held.ino !== lock.ino) throw new Error('请通过共享编辑器启动器运行后台');
  const store = new WorkspaceStore(data), token = randomBytes(32).toString('hex'), instanceId = randomUUID();
  // All production macOS writers enter this authority; stale private workspace locks died with the old owner.
  await rm(path.join(data, 'workspace.lock'), { force: true });
  const previous = await store.job();
  if (previous && ['pending', 'running', 'cancelling'].includes(previous.state)) {
    previous.state = 'failed'; previous.error = 'Editor restarted; this export was interrupted and was not replayed';
    delete previous.workerPid; delete previous.token; await store.saveJob(previous);
  }
  const { startServer } = await import('./server.ts');
  const { callTool, tools } = await import('./mcp-tools.ts');
  const { stopCommands } = await import('./hyperframes.ts');
  const identity = () => ({ service, protocol, version, build: editorBuild, instanceId, pid: process.pid, dataDirectory: data });
  let active = 0, stopping = false, queue = Promise.resolve();
  const running = await startServer(store, 0, { editor: false, editorToken: token, privateHandler: async (req, res) => {
    if (!req.url?.startsWith('/editor-api/')) return false;
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      const host = new URL(`http://${req.headers.host || ''}`);
      if (!['localhost', '127.0.0.1'].includes(host.hostname) || host.port !== String(running.server.address() && (running.server.address() as any).port) || req.headers.origin) { json(403, { error: '仅允许本机私有调用' }); return true; }
      if (req.headers.authorization !== `Bearer ${token}`) { json(401, { error: '需要编辑器凭据' }); return true; }
      if (req.method === 'GET' && req.url === '/editor-api/health') { json(200, identity()); return true; }
      if (req.method === 'POST' && req.url === '/editor-api/shutdown') {
        const job = await store.job();
        const { gatewayFor } = await import('./gateway/service.ts');
        const busy = (await gatewayFor(store).listJobs()).some(item => ['queued', 'running'].includes(item.state));
        if (active || running.activeToolCalls || busy || job && ['pending', 'running', 'cancelling'].includes(job.state)) { json(409, { error: 'Editor has active work' }); return true; }
        json(200, { stopping: true }); setImmediate(() => { void stop(); }); return true;
      }
      if (stopping) { json(503, { error: 'Editor is stopping' }); return true; }
      if (req.method !== 'POST' || !['/editor-api/preview', '/editor-api/tools/call'].includes(req.url)) { json(404, { error: 'Unknown editor operation' }); return true; }
      if (!req.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'Use application/json' }); return true; }
      let size = 0; const chunks: Buffer[] = [];
      for await (const chunk of req) { size += chunk.length; if (size > 9 * 1024 * 1024) throw new Error('请求过大'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (req.url === '/editor-api/preview') {
        if (body.projectId !== undefined && typeof body.projectId !== 'string') throw new Error('工程编号无效');
        if (body.editor !== undefined && typeof body.editor !== 'boolean') throw new Error('编辑器开关无效');
        if (body.editor !== false) await running.ensureStudio();
        if (body.editor !== false && body.projectId !== undefined && body.projectId !== store.projectId) await running.openProject(body.projectId);
        json(200, await running.info()); return true;
      }
      active++;
      const work = queue.catch(() => {}).then(async () => {
        const tool = tools.find(item => item.name === body.name);
        if (!tool || !body.arguments || typeof body.arguments !== 'object' || Array.isArray(body.arguments) || Object.keys(body.arguments).some(key => !Object.hasOwn(tool.inputSchema.properties, key))) throw new Error('工具或参数无效');
        if (body.arguments.projectId !== undefined && typeof body.arguments.projectId !== 'string') throw new Error('工程编号无效');
        if (body.selection !== undefined && (!body.selection || typeof body.selection !== 'object' || Array.isArray(body.selection) || Object.keys(body.selection).some(key => !['projectId', 'sessionId'].includes(key)))) throw new Error('连接上下文无效');
        if (body.selection?.projectId !== undefined && body.selection.projectId !== null && typeof body.selection.projectId !== 'string') throw new Error('连接工程编号无效');
        if (body.selection?.sessionId !== undefined && typeof body.selection.sessionId !== 'string') throw new Error('连接会话编号无效');
        const args = { ...body.arguments }, selection: Selection = { ...body.selection };
        if (args.sessionId === undefined && ['design_get_session', 'motion_apply_template'].includes(body.name)) args.sessionId = selection.sessionId ?? store.projectCatalog().activeSessionId;
        const projectId = args.projectId ?? selection.projectId;
        if (projectId === null && ['motion_read_file', 'motion_write_files', 'motion_import_asset', 'motion_inspect_project', 'motion_request_export'].includes(body.name)) throw new Error('当前会话没有产物，请先读取、创建或打开产物');
        const scoped = typeof projectId === 'string' ? store.forProject(projectId) : store.forProject(store.projectId);
        const result: any = await callTool(body.name, args, scoped);
        if (result?.projectId) {
          selection.projectId = result.projectId;
          selection.sessionId = result.sessionId ?? store.projectCatalog().sessions!.find(session => session.artifacts.some(a => a.projectId === result.projectId))?.id;
        } else if (body.name === 'design_create_session' || body.name === 'design_get_session') {
          const session = result.session ?? result;
          selection.sessionId = result.sessionId ?? session.id;
          const artifact = session.artifacts?.find((a: any) => a.id === session.activeArtifactId) ?? session.artifacts?.[0];
          selection.projectId = artifact?.projectId ?? null;
        } else if (['motion_get_project', 'motion_open_preview', 'motion_write_files', 'motion_read_file', 'motion_request_export'].includes(body.name)) selection.projectId = scoped.projectId;
        return { result, selection };
      });
      queue = work.then(() => {}, () => {});
      try { json(200, await work); } finally { active--; }
    } catch (error) { json(error instanceof Conflict ? 409 : 400, { error: (error as Error).message, code: error instanceof Conflict ? 'REVISION_CONFLICT' : 'EDITOR_ERROR' }); }
    return true;
  } });
  const endpoint = `http://127.0.0.1:${(running.server.address() as any).port}/`;
  const registry = { ...identity(), endpoint, token }, temporary = path.join(runtime, `runtime.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(registry), { mode: 0o600 }); await rename(temporary, path.join(runtime, 'runtime.json'));
  await appendFile(path.join(runtime, 'starts.jsonl'), JSON.stringify(identity()) + '\n', { mode: 0o600 });
  async function stop() {
    if (stopping) return; stopping = true; stopCommands(); await running.close();
    await rm(path.join(runtime, 'runtime.json'), { force: true }); process.exit(0);
  }
  process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
}
if (isMain(import.meta.url)) {
  try {
    if (process.argv[2] === '--stop') {
      const registry = await readEditor(new WorkspaceStore().directory);
      if (registry) console.log(JSON.stringify(await editorRequest(registry, '/editor-api/shutdown', {})));
    }
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
