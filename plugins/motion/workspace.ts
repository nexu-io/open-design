import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { copyFile, cp, lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { delay, nativeProjectConfig, pluginRoot } from './hyperframes.ts';
import { validateProject, duration } from './shared/legacy.ts';
import type { Project as LegacyProject } from './shared/legacy.ts';
import { exportExpectation } from './shared/export-expectation.ts';
import type { ExportExpectation } from './shared/export-spec.ts';
import { validateInstruction, type ProjectConversation, type ProjectMessage } from './shared/conversation.ts';
import { creationMode, type CreativeSession, type SessionDetail } from './shared/session.ts';

const legacyDataDir = fileURLToPath(new URL('.motion-data/', import.meta.url));
export const defaultDataDir = process.env.MOTION_DATA_DIR || (process.platform === 'darwin' && !existsSync(legacyDataDir)
  ? path.join(os.homedir(), 'Library', 'Application Support', 'OpenDesign') : legacyDataDir);
const ignored = new Set(['node_modules', 'renders', 'dist', 'output']);
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.md', '.vtt', '.srt', '.glsl', '.vert', '.frag']);
// Hyperframes 0.9.7 includes these native Studio manifests in render inputs.
// Everything else in .hyperframes is a cache and must not change a revision.
const studioManifests = ['.hyperframes/studio-manual-edits.json', '.hyperframes/studio-motion.json'];
export type SourceFile = { path: string; size: number; hash: string };
export type FileEdit = { path: string; content: string };
export type SavedProject = { id: string; title: string; templateId?: string; createdAt?: number; openedAt?: number };
export type ProjectCatalog = { activeId: string; projects: SavedProject[]; sessions?: CreativeSession[]; activeSessionId?: string };
export type ExportJob = { id: string; projectId?: string; versionId?: string; requestId?: string; phase1?: boolean; stage?: string; verification?: unknown; revision: string; state: 'pending' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  createdAt: number; expiresAt: number; token?: string; workerPid?: number; file?: string; error?: string; expected?: ExportExpectation };
export class Conflict extends Error { constructor() { super('工程已经被 Studio 或 Agent 更新，请重新读取 revision 后再修改。'); } }

export function projectPath(name: string): string {
  if (studioManifests.includes(name)) return name;
  if (typeof name !== 'string' || !name || name.length > 240 || name.includes('\\') || name.includes(':') || /[\x00-\x1f]/.test(name)
    || name.split('/').some(part => !part || part.startsWith('.') || ignored.has(part))) throw new Error('工程文件路径无效：' + name);
  return name;
}
function alive(pid?: number) { try { if (!pid) return false; process.kill(pid, 0); return true; } catch { return false; } }
async function atomic(filename: string, content: string | Buffer) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = path.join(path.dirname(filename), '.motion-write-' + crypto.randomUUID());
  try { await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, filename); }
  finally { await rm(temporary, { force: true }); }
}

export class WorkspaceStore {
  directory: string;
  hashes = new Map<string, { signature: string; hash: string }>();
  selectedProjectId?: string;
  workspaceStore?: WorkspaceStore;
  constructor(directory = defaultDataDir, projectId?: string) { this.directory = path.resolve(directory); this.selectedProjectId = projectId; }
  get projectId() { return this.selectedProjectId ?? this.projectCatalog().activeId; }
  forProject(id: string) {
    if (!this.projectCatalog().projects.some(project => project.id === id)) throw new Error('PROJECT_NOT_FOUND: 工程不存在');
    this.projectDirectoryFor(id);
    const scoped = new WorkspaceStore(this.directory, id);
    scoped.workspaceStore = this.workspaceStore ?? this;
    return scoped;
  }
  projectDirectoryFor(id: string) {
    if (id === 'project') return path.join(this.directory, 'project');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('工程编号无效');
    return path.join(this.directory, 'projects', id);
  }
  projectCatalog(): ProjectCatalog {
    let catalog: ProjectCatalog;
    try { catalog = JSON.parse(readFileSync(path.join(this.directory, 'projects.json'), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') catalog = { activeId: 'project', projects: [{ id: 'project', title: '初始工程' }] };
      else throw error;
    }
    if (!Array.isArray(catalog.projects) || !catalog.projects.some(item => item.id === catalog.activeId)) throw new Error('工程目录记录损坏');
    for (const item of catalog.projects) { this.projectDirectoryFor(item.id); if (typeof item.title !== 'string') throw new Error('工程名称无效'); }
    // Legacy conversations keep their IDs and files; all new sessions own artifact IDs.
    catalog.sessions ??= catalog.projects.map(project => ({ ...project, mode: 'motion', artifacts: [{ id: project.id, kind: 'motion-project', projectId: project.id, title: project.title, templateId: project.templateId }] }));
    catalog.activeSessionId ??= catalog.sessions.find(session => session.artifacts.some(artifact => artifact.projectId === catalog.activeId))?.id;
    const owners = new Set<string>(), sessionIds = new Set<string>(), artifactIds = new Set<string>();
    for (const session of catalog.sessions) {
      this.projectDirectoryFor(session.id); creationMode(session.mode);
      if (sessionIds.has(session.id) || typeof session.title !== 'string') throw new Error('会话记录损坏');
      sessionIds.add(session.id);
      if (!Array.isArray(session.artifacts) || session.artifacts.some(artifact => !catalog.projects.some(project => project.id === artifact.projectId))) throw new Error('会话产物记录损坏');
      for (const artifact of session.artifacts) {
        if (artifact.kind !== 'motion-project' || typeof artifact.id !== 'string' || artifactIds.has(artifact.id) || owners.has(artifact.projectId)) throw new Error('会话产物归属记录损坏');
        artifactIds.add(artifact.id); owners.add(artifact.projectId);
        artifact.title = catalog.projects.find(project => project.id === artifact.projectId)!.title;
      }
      session.activeArtifactId = session.artifacts.find(item => item.id === session.activeArtifactId)?.id ?? session.artifacts[0]?.id;
    }
    if (owners.size !== catalog.projects.length || !catalog.sessions.some(item => item.id === catalog.activeSessionId)) throw new Error('会话产物归属记录损坏');
    return catalog;
  }
  get projectDirectory() { return this.projectDirectoryFor(this.projectId); }
  async createSession(input: { id?: string; mode: string; title: string; templateId?: string; instruction?: string }) {
    const mode = creationMode(input.mode), title = validateProjectTitle(input.title);
    const instruction = input.instruction === undefined ? undefined : validateInstruction(input.instruction);
    const id = input.id ?? crypto.randomUUID(); this.projectDirectoryFor(id);
    return this.lock(async () => {
      const catalog = this.projectCatalog(), existing = catalog.sessions!.find(item => item.id === id);
      if (existing) {
        const session = await this.session(id);
        if (session.title !== title || session.mode !== mode.id || session.templateId !== input.templateId || session.messages[0]?.content !== instruction) throw new Error('会话编号已使用');
        return session;
      }
      const session: CreativeSession = { id, title, mode: mode.id, templateId: input.templateId, artifacts: [], createdAt: Date.now(), openedAt: Date.now() };
      const messages: ProjectMessage[] = instruction ? [{ id: crypto.randomUUID(), role: 'user', content: instruction, createdAt: Date.now() }] : [];
      catalog.sessions!.unshift(session); catalog.activeSessionId = id;
      const file = path.join(this.directory, 'sessions', id + '.json');
      await atomic(file, JSON.stringify({ sessionId: id, messages }));
      try { await atomic(path.join(this.directory, 'projects.json'), JSON.stringify(catalog)); }
      catch (error) { await rm(file, { force: true }); throw error; }
      return { ...session, messages };
    });
  }
  async selectSession(id: string) {
    return this.lock(async () => {
      const catalog = this.projectCatalog(), session = catalog.sessions!.find(item => item.id === id);
      if (!session) throw new Error('会话不存在');
      catalog.activeSessionId = id; session.openedAt = Date.now();
      await atomic(path.join(this.directory, 'projects.json'), JSON.stringify(catalog));
      return { sessionId: id, session };
    });
  }
  // Called while holding the workspace lock, after the candidate Studio is ready.
  async selectProject(id: string, entry?: SavedProject, instruction?: string, sessionTarget?: { sessionId?: string; title?: string; templateId?: string }) {
    this.projectDirectoryFor(id);
    const catalog = this.projectCatalog();
    if (entry) {
      if (entry.id !== id || catalog.projects.some(item => item.id === id)) throw new Error('工程编号已存在');
      catalog.projects.unshift(entry);
    }
    if (!catalog.projects.some(item => item.id === id)) throw new Error('工程不存在');
    catalog.activeId = id;
    catalog.projects.find(item => item.id === id)!.openedAt = Date.now();
    let session = catalog.sessions!.find(item => sessionTarget?.sessionId ? item.id === sessionTarget.sessionId : item.artifacts.some(artifact => artifact.projectId === id));
    if (sessionTarget?.sessionId && !session) throw new Error('会话不存在');
    const creatingSession = !session;
    if (!session) {
      session = { id: crypto.randomUUID(), title: sessionTarget?.title || entry!.title, mode: 'motion', createdAt: Date.now(), artifacts: [], templateId: sessionTarget?.templateId || entry?.templateId };
      catalog.sessions!.unshift(session);
    }
    if (entry) session.artifacts.push({ id: crypto.randomUUID(), kind: 'motion-project', projectId: id, title: entry.title, templateId: entry.templateId ?? sessionTarget?.templateId });
    const artifact = session.artifacts.find(item => item.projectId === id);
    if (!artifact) throw new Error('该产物不属于此会话');
    session.activeArtifactId = artifact.id;
    session.openedAt = Date.now(); catalog.activeSessionId = session.id;
    const conversationFile = path.join(this.directory, 'sessions', session.id + '.json');
    if (instruction && creatingSession) await atomic(conversationFile, JSON.stringify({ sessionId: session.id, messages: [{ id: crypto.randomUUID(), role: 'user', content: validateInstruction(instruction), createdAt: Date.now() }] }));
    try { await atomic(path.join(this.directory, 'projects.json'), JSON.stringify(catalog)); }
    catch (error) { if (instruction && creatingSession) await rm(conversationFile, { force: true }); throw error; }
    if (this.selectedProjectId !== undefined) this.selectedProjectId = id;
  }
  async session(id: string): Promise<SessionDetail> {
    this.projectDirectoryFor(id);
    const session = this.projectCatalog().sessions!.find(item => item.id === id);
    if (!session) throw new Error('会话不存在');
    try { return { ...session, messages: JSON.parse(await readFile(path.join(this.directory, 'sessions', id + '.json'), 'utf8')).messages }; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...session, messages: [] };
      throw error;
    }
  }
  async conversation(projectId: string): Promise<ProjectConversation> {
    const session = this.projectCatalog().sessions!.find(item => item.artifacts.some(artifact => artifact.projectId === projectId));
    if (!session) throw new Error('工程不存在');
    return { projectId, messages: (await this.session(session.id)).messages };
  }
  async addProjectMessage(projectId: string, id: string, content: string) {
    const session = this.projectCatalog().sessions!.find(item => item.artifacts.some(artifact => artifact.projectId === projectId));
    if (!session) throw new Error('工程不存在');
    return { projectId, messages: (await this.addSessionMessage(session.id, id, content)).messages };
  }
  async addSessionMessage(sessionId: string, id: string, content: string, role: 'user' | 'assistant' = 'user') {
    content = validateInstruction(content);
    if (!['user', 'assistant'].includes(role)) throw new Error('消息角色无效');
    if (typeof id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error('消息编号无效');
    return this.lock(async () => {
      const conversation = await this.session(sessionId);
      const existing = conversation.messages.find(message => message.id === id);
      if (existing) {
        if (existing.content !== content || existing.role !== role) throw new Error('消息编号已使用');
        return conversation;
      }
      if (conversation.messages.length >= 200) throw new Error('此会话已保存 200 条创作需求');
      const message: ProjectMessage = { id, role, content, createdAt: Date.now() };
      conversation.messages.push(message);
      await atomic(path.join(this.directory, 'sessions', sessionId + '.json'), JSON.stringify({ sessionId, messages: conversation.messages }));
      return conversation;
    });
  }
  async renameSession(id: string, title: string) {
    title = validateProjectTitle(title);
    return this.lock(async () => {
      const catalog = this.projectCatalog(), session = catalog.sessions!.find(item => item.id === id);
      if (!session) throw new Error('会话不存在');
      session.title = title;
      await atomic(path.join(this.directory, 'projects.json'), JSON.stringify(catalog));
      return catalog;
    });
  }
  async renameProject(id: string, title: string) {
    title = validateProjectTitle(title);
    return this.lock(async () => {
      const catalog = this.projectCatalog();
      const project = catalog.projects.find(item => item.id === id);
      if (!project) throw new Error('工程不存在');
      project.title = title;
      await atomic(path.join(this.directory, 'projects.json'), JSON.stringify(catalog));
      return catalog;
    });
  }
  get jobFilename() { return path.join(this.directory, 'export.json'); }

  async lock<T>(change: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const lockPath = path.join(this.directory, 'workspace.lock');
    let lock; const end = Date.now() + 30_000;
    while (!lock) {
      try { lock = await open(lockPath, 'wx', 0o600); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() > end) throw new Error('工程正在被另一进程使用，请检查 workspace.lock');
        await delay(25);
      }
    }
    try { return await change(); }
    finally { await lock.close(); await rm(lockPath, { force: true }); }
  }

  async safePath(name: string, directory = this.projectDirectory) {
    projectPath(name);
    let target = directory;
    for (const part of ['', ...name.split('/')]) {
      if (part) target = path.join(target, part);
      try { if ((await lstat(target)).isSymbolicLink()) throw new Error('工程不支持符号链接：' + name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return target;
  }
  async files(directory = this.projectDirectory): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    const collect = async (name: string) => {
      const filename = await this.safePath(name, directory), info = await stat(filename);
      if (!info.isFile()) throw new Error('工程源文件类型无效：' + name);
      const signature = `${info.ino}:${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
      let cached = this.hashes.get(filename);
      if (!cached || cached.signature !== signature) {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(filename)) hash.update(chunk);
        cached = { signature, hash: hash.digest('hex') }; this.hashes.set(filename, cached);
      }
      files.push({ path: name, size: info.size, hash: cached.hash });
      if (files.length > 5000) throw new Error('工程文件数超过 5000');
    };
    const walk = async (folder: string) => {
      for (const entry of await readdir(path.join(directory, folder), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
        const name = folder ? folder + '/' + entry.name : entry.name;
        projectPath(name);
        if (entry.isSymbolicLink()) throw new Error('工程不支持符号链接：' + name);
        if (entry.isDirectory()) await walk(name);
        else if (entry.isFile()) await collect(name);
      }
    };
    await this.safePath('index.html', directory);
    try { await lstat(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    await walk('');
    for (const name of studioManifests) {
      try { await collect(name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  revision(files: SourceFile[]) { return createHash('sha256').update(JSON.stringify(files)).digest('hex'); }
  async get() {
    const directory = this.projectDirectory;
    const files = await this.files(directory);
    const index = files.find(file => file.path === 'index.html');
    return { revision: this.revision(files), project: index ? {
      format: 'hyperframes' as const, entry: 'index.html', directory, files,
      html: index.size <= 2 * 1024 * 1024 ? await readFile(path.join(directory, 'index.html'), 'utf8') : undefined,
    } : null };
  }
  async readFile(name: string) {
    if (!textExtensions.has(path.extname(projectPath(name)))) throw new Error('此工具只读取文本源文件；媒体请使用文件路径');
    const filename = await this.safePath(name);
    if ((await stat(filename)).size > 2 * 1024 * 1024) throw new Error('源文件超过 2 MB，请使用本地文件工具读取');
    return { path: name, content: await readFile(filename, 'utf8') };
  }
  async writeFiles(expectedRevision: string, edits: FileEdit[]) {
    if (!Array.isArray(edits) || !edits.length || edits.length > 100) throw new Error('一次需要提交 1–100 个源文件');
    const names = new Set<string>(); let size = 0;
    for (const file of edits) {
      if (!file || typeof file.content !== 'string') throw new Error('源文件需要 path 和 content');
      projectPath(file.path);
      if (!textExtensions.has(path.extname(file.path))) throw new Error('请用 motion_import_asset 导入媒体文件');
      if (names.has(file.path)) throw new Error('提交包含重复文件');
      names.add(file.path); size += Buffer.byteLength(file.content);
    }
    if (size > 8 * 1024 * 1024) throw new Error('一次提交不能超过 8 MB');
    return this.lock(async () => {
      const current = await this.get();
      if (current.revision !== expectedRevision) throw new Conflict();
      if (!current.project && !names.has('index.html')) throw new Error('新工程必须包含 index.html');
      const paths = await Promise.all(edits.map(file => this.safePath(file.path)));
      if ((await this.get()).revision !== expectedRevision) throw new Conflict();
      for (let i = 0; i < edits.length; i++) await atomic(paths[i], edits[i].content);
      return this.get();
    });
  }
  async importAsset(expectedRevision: string, sourcePath: string, targetPath: string) {
    if (!path.isAbsolute(sourcePath)) throw new Error('素材来源必须是本地绝对路径');
    projectPath(targetPath);
    if (!targetPath.startsWith('assets/')) throw new Error('素材目标必须位于 assets/');
    const source = await stat(sourcePath);
    if (!source.isFile() || source.size > 2 * 1024 ** 3) throw new Error('素材必须是小于 2 GB 的文件');
    return this.lock(async () => {
      if ((await this.get()).revision !== expectedRevision) throw new Conflict();
      const target = await this.safePath(targetPath);
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = path.join(path.dirname(target), '.motion-import-' + crypto.randomUUID());
      try {
        await copyFile(sourcePath, temporary);
        if ((await this.get()).revision !== expectedRevision) throw new Conflict();
        await rename(temporary, target);
      } finally { await rm(temporary, { force: true }); }
      return this.get();
    });
  }

  async initialize(runtimeRoot: string) {
    return this.lock(async () => {
      if ((await this.get()).project) return;
      if ((await this.files()).length) throw new Error('工程目录已有文件但缺少 index.html，请先修复入口');
      const staging = path.join(this.directory, 'initialize-' + crypto.randomUUID());
      await mkdir(path.join(staging, 'assets'), { recursive: true });
      try {
        let legacy: LegacyProject | null = null;
        try {
          const old = JSON.parse(await readFile(path.join(this.directory, 'workspace.json'), 'utf8'));
          if (old.project) legacy = validateProject(old.project);
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (legacy) await migrateLegacy(legacy, staging);
        else await cp(path.join(pluginRoot, 'templates'), staging, { recursive: true });
        await copyFile(path.join(runtimeRoot, 'node_modules/gsap/dist/gsap.min.js'), path.join(staging, 'assets/gsap.min.js'));
        await writeFile(path.join(staging, 'hyperframes.json'), JSON.stringify(nativeProjectConfig, null, 2));
        // The legacy workspace.json remains untouched. Never replace an existing native entry.
        try { await rename(staging, this.projectDirectory); }
        catch (error) { throw new Error('无法创建 Hyperframes 工程，已有目录保持不变', { cause: error }); }
      } finally { await rm(staging, { recursive: true, force: true }); }
    });
  }

  async job(id?: string): Promise<ExportJob | null> {
    if (id && !/^[a-f0-9-]{36}$/.test(id)) throw new Error('无效的导出任务编号');
    try {
      const value = JSON.parse(await readFile(id ? path.join(this.directory, 'jobs', id, 'job.json') : this.jobFilename, 'utf8'));
      if (id) return value;
      return await this.job(value.id) ?? value;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async saveJob(job: ExportJob) {
    await atomic(path.join(this.directory, 'jobs', job.id, 'job.json'), JSON.stringify(job));
    const current = await this.job();
    if (!current || current.id === job.id) await atomic(this.jobFilename, JSON.stringify(job));
  }
  async status(jobId?: string) {
    const current = await this.get();
    let job = await this.job(jobId);
    if (this.selectedProjectId !== undefined && job?.projectId && job.projectId !== this.projectId) job = null;
    if (job && ['pending', 'running', 'cancelling'].includes(job.state) && (job.expiresAt < Date.now() || (job.state !== 'pending' && !alive(job.workerPid)))) {
      job.state = 'failed'; job.error = '后台渲染已中断或超时，请重新导出';
      await this.saveJob(job);
    }
    if (job?.state === 'completed') {
      try { if (!(await stat(path.join(this.directory, 'exports', job.id + '.mp4'))).size) throw new Error('empty'); }
      catch { job.state = 'failed'; job.error = '导出文件已不存在，请重新导出'; delete job.file; await this.saveJob(job); }
    }
    if (job) { delete job.token; delete job.workerPid; }
    const catalog = this.projectCatalog();
    // A newly opened empty conversation must not be reported as owner of the last native project.
    const sessionId = catalog.sessions!.find(item => item.artifacts.some(artifact => artifact.projectId === this.projectId))!.id;
    return { revision: current.revision, hasProject: Boolean(current.project), projectId: this.projectId, projectTitle: catalog.projects.find(item => item.id === this.projectId)!.title, sessionId, activeSessionId: catalog.activeSessionId, exportJob: job };
  }
  snapshotDirectory(id: string) { return path.join(this.directory, 'jobs', id, 'project'); }
  async requestExport(expectedRevision: string, options: Partial<Pick<ExportJob, 'phase1' | 'versionId' | 'requestId'>> & { audio?: ExportExpectation['audio'] } = {}) {
    return this.lock(async () => {
      const current = await this.get();
      if (current.revision !== expectedRevision) throw new Conflict();
      if (!current.project) throw new Error('还没有 Hyperframes 工程');
      const previous = await this.job();
      if (previous && ['pending', 'running', 'cancelling'].includes(previous.state) && previous.expiresAt > Date.now() && (previous.state === 'pending' || alive(previous.workerPid))) throw new Error('EXPORT_BUSY: 已有导出任务正在等待或运行');
      const { audio, ...identity } = options;
      const job: ExportJob = { ...identity, id: crypto.randomUUID(), projectId: this.projectId, revision: expectedRevision, state: 'pending', stage: 'queued', createdAt: Date.now(), expiresAt: Date.now() + 30 * 60_000 };
      const snapshot = this.snapshotDirectory(job.id);
      try {
        for (const file of current.project.files) {
          const source = await this.safePath(file.path);
          const destination = path.join(snapshot, file.path);
          await mkdir(path.dirname(destination), { recursive: true }); await copyFile(source, destination);
        }
        if (this.revision(await this.files(snapshot)) !== expectedRevision || (await this.get()).revision !== expectedRevision) throw new Conflict();
        job.expected = await exportExpectation(this.directory, snapshot);
        if (audio) job.expected.audio = audio;
        await atomic(path.join(this.directory, 'jobs', job.id, 'job.json'), JSON.stringify(job));
        await atomic(this.jobFilename, JSON.stringify(job));
        return job;
      } catch (error) { await rm(path.dirname(snapshot), { recursive: true, force: true }); throw error; }
    });
  }
  async claimExport() {
    return this.lock(async () => {
      const job = await this.job();
      if (!job || job.state !== 'pending' || job.expiresAt < Date.now()) return null;
      job.state = 'running'; job.token = crypto.randomUUID(); job.workerPid = process.pid;
      await this.saveJob(job); return job;
    });
  }
  async finishExport(id: string, token: string, error?: string) {
    return this.lock(async () => {
      const job = await this.job(id) ?? await this.job();
      if (!job || job.id !== id || job.token !== token || !['running', 'cancelling'].includes(job.state)) throw new Error('无效的导出任务凭据');
      if (job.state === 'cancelling') {
        job.state = 'cancelled'; job.stage = 'cancelled'; delete job.token; delete job.workerPid;
        await this.saveJob(job); return job;
      }
      if (!error && !(await stat(path.join(this.directory, 'exports', id + '.mp4'))).size) throw new Error('Hyperframes 未生成视频');
      job.state = error ? 'failed' : 'completed'; job.stage = job.state;
      if (error) job.error = error.slice(-2000); else job.file = 'exports/' + id + '.mp4';
      delete job.token; delete job.workerPid;
      await this.saveJob(job); return job;
    });
  }
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function validateProjectTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100 || /[\x00-\x1f]/.test(value)) throw new Error('项目名称需要 1–100 个字符');
  return value.trim();
}

/** An empty native composition, ready for Studio uploads and timeline edits. */
export async function createBlankProject(directory: string, runtimeRoot: string, title: string) {
  await mkdir(path.join(directory, 'assets'), { recursive: true });
  await copyFile(path.join(runtimeRoot, 'node_modules/gsap/dist/gsap.min.js'), path.join(directory, 'assets/gsap.min.js'));
  await writeFile(path.join(directory, 'hyperframes.json'), JSON.stringify(nativeProjectConfig, null, 2));
  await writeFile(path.join(directory, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(title)}</title>
<script src="assets/gsap.min.js"></script>
<style>body{margin:0}#main{position:relative;width:1920px;height:1080px;overflow:hidden;background:#000}</style></head>
<body><div id="main" data-composition-id="main" data-start="0" data-duration="10" data-width="1920" data-height="1080" data-fps="30"></div>
<script>window.__timelines = {main: gsap.timeline({paused:true})};</script></body></html>`);
}
async function migrateLegacy(project: LegacyProject, directory: string) {
  const assets = new Map<string, string>();
  for (const [i, asset] of project.assets.entries()) {
    const match = asset.data.match(/^data:[^/]+\/([^;]+);base64,([\s\S]+)$/)!;
    const name = `assets/media-${i}.${match[1] === 'quicktime' ? 'mov' : match[1]}`;
    await writeFile(path.join(directory, name), Buffer.from(match[2], 'base64')); assets.set(asset.id, name);
  }
  let start = 0;
  const clips: string[] = [];
  await mkdir(path.join(directory, 'compositions'), { recursive: true });
  for (const [i, shot] of project.shots.entries()) {
    const id = `shot-${i}`;
    const asset = project.assets.find(item => item.id === shot.assetId);
    const media = asset ? `<${asset.type === 'video' ? 'video muted playsinline' : 'img'} id="media-${i}" class="clip" src="${assets.get(asset.id)}" data-start="0" data-duration="${shot.duration}" data-track-index="0" ${asset.type === 'video' ? `data-media-start="${shot.start}"` : ''} style="position:absolute;width:540px;height:960px;object-fit:${shot.fit}" ${asset.type === 'video' ? '></video>' : '>'}` : '';
    const position = { top: 'top:80px', center: 'top:380px', bottom: 'bottom:100px' }[shot.position];
    await writeFile(path.join(directory, 'compositions', id + '.html'), `<template>
<style>#${id}-root{position:absolute;inset:0;font-family:Inter,sans-serif;overflow:hidden}#${id}-bg{position:absolute;inset:0;background:#203021}#${id}-caption{position:absolute;left:40px;right:40px;${position};text-align:center;color:white;text-shadow:0 2px 8px #000}#${id}-caption h1{font-size:38px;white-space:pre-wrap}#${id}-caption p{font-size:22px;white-space:pre-wrap}</style>
<div id="${id}-root" data-composition-id="${id}" data-width="540" data-height="960" data-duration="${shot.duration}"><div id="${id}-bg"></div>${media}<div id="${id}-caption"><h1>${escape(shot.caption)}</h1><p style="color:${shot.accent}">${escape(shot.subtitle)}</p></div></div>
<script>window.__timelines = window.__timelines || {}; window.__timelines['${id}'] = gsap.timeline({paused:true});</script></template>`);
    clips.push(`<div id="${id}" class="clip" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${shot.duration}" data-track-index="0" data-width="540" data-height="960"></div>`);
    start += shot.duration;
  }
  await writeFile(path.join(directory, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escape(project.title)}</title><script src="assets/gsap.min.js"></script>
<style>body{margin:0}#main{position:relative;width:540px;height:960px;overflow:hidden}</style></head>
<body><div id="main" data-composition-id="main" data-start="0" data-duration="${duration(project)}" data-width="540" data-height="960" data-fps="24">${clips.join('\n')}</div>
<script>window.__timelines = {main: gsap.timeline({paused:true})};</script></body></html>`);
}
