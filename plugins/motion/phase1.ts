import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceStore, createBlankProject, projectPath, validateProjectTitle } from './workspace.ts';
import { copyTemplate, findTemplate } from './template-library.ts';
import { getTemplate } from './template-catalog.ts';
import { execute, inspectProject } from './hyperframes.ts';
import { verificationBinaries } from './scripts/verify-export.ts';
import { validateInstruction } from './shared/conversation.ts';
import { sessionPath } from './shared/workspace-url.ts';
import { phase1Tools, validateInput } from './shared/phase1-tools.ts';
import { atomicJson, cloneFile, fileHash, jsonFile, ProjectVersions, recoverProjectTransactions } from './phase1-versions.ts';
import type { ContentVersion } from './phase1-versions.ts';

const metadataPath = 'motion-project.json', assetIndexPath = 'motion-assets.json';
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.md', '.vtt', '.srt', '.glsl', '.vert', '.frag']);
const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
function canonical(value: any): any { return Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value; }
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function cursor(value: any) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function parseCursor(value: string | undefined, kind: string, scope: string) {
  if (!value) return null;
  try { const item = JSON.parse(Buffer.from(value, 'base64url').toString()); if (item.kind !== kind || item.scope !== scope || !Array.isArray(item.after) || item.after.length !== 2 || !Number.isSafeInteger(item.after[0]) || item.after[0] < 0 || typeof item.after[1] !== 'string' || !item.after[1]) throw 0; return item; }
  catch { throw new Error('INVALID_CURSOR: 游标不属于本次查询'); }
}
function tupleCompare(a: any[], b: any[]) { return a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : a[0] - b[0]; }
export type Phase1Context = {
  origin: () => string; nativeUrl: (projectId: string) => string | undefined;
  openProject: (projectId: string) => Promise<void>;
  mutation: <T>(task: () => Promise<T>) => Promise<T>;
  cancel: (projectId: string, jobId: string) => Promise<unknown>;
};

/** Thin public contract over the existing workspace, Studio history, probes and export engine. */
export class Phase1Service {
  private tail: Promise<unknown> = Promise.resolve();
  private recovered = false;
  pending = 0;
  readonly store: WorkspaceStore;
  readonly runtimeRoot: string;
  readonly context: Phase1Context;
  constructor(store: WorkspaceStore, runtimeRoot: string, context: Phase1Context) { this.store = store; this.runtimeRoot = runtimeRoot; this.context = context; }
  versions(projectId: string) { return new ProjectVersions(this.store.forProject(projectId), this.runtimeRoot, this.context.nativeUrl(projectId)); }
  async call(name: string, args: any) {
    const definition = phase1Tools.find(tool => tool.name === name);
    if (!definition) throw new Error('MCP_TOOL_NOT_EXPOSED: ' + name);
    validateInput(definition.inputSchema, args);
    const run = async () => {
      if (!this.recovered) { await recoverProjectTransactions(this.store, this.runtimeRoot); this.recovered = true; }
      return this.dispatch(name, args);
    };
    this.pending++;
    const result = this.tail.then(run, run).finally(() => { this.pending--; }); this.tail = result.catch(() => {}); return result;
  }
  async writeRequest(name: string, args: any, task: (record: any) => Promise<any>) {
    if (!args.requestId) throw new Error('INVALID_ARGUMENT: requestId is required');
    const file = path.join(this.store.directory, 'phase1', 'requests', digest(args.requestId) + '.json');
    const inputHash = digest({ name, args });
    const previous = await jsonFile<any>(file, null);
    if (previous) {
      if (previous.inputHash !== inputHash) throw new Error('REQUEST_ID_CONFLICT: 相同 requestId 不能使用不同输入');
      if (previous.state === 'completed') return { ...previous.result, ...(previous.result.job ? { job: await this.publicJob(previous.result.job.id) } : {}), replayed: true };
      if (previous.state === 'failed') throw new Error(previous.error);
      // A lost reply must not turn into a second write or render.
      if (args.projectId) {
        const index = await this.versions(args.projectId).index();
        const version = index.versions.find(item => item.requestId === args.requestId);
        if (version) {
          const result = { projectId: args.projectId, version: this.versions(args.projectId).publicVersion(version), revision: version.revision, recovered: true };
          await atomicJson(file, { ...previous, state: 'completed', result }); return result;
        }
        for (const id of await readdir(path.join(this.store.directory, 'jobs')).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
          const job = await this.store.job(id).catch(() => null);
          if (job?.requestId === args.requestId && job.projectId === args.projectId) {
            const result = { projectId: args.projectId, job: await this.publicJob(job.id), recovered: true };
            await atomicJson(file, { ...previous, state: 'completed', result }); return result;
          }
        }
      }
      if (name === 'motion_create_project' && this.store.projectCatalog().projects.some(project => project.id === previous.projectId)) {
        const project = await this.detail(previous.projectId);
        const result = { ...project, recovered: true }; await atomicJson(file, { ...previous, state: 'completed', result }); return result;
      }
      throw new Error('REQUEST_STATE_UNKNOWN: 原请求未确认终态，未重复执行；请查询项目或任务状态');
    }
    const record = { inputHash, name, state: 'pending', projectId: name === 'motion_create_project' ? crypto.randomUUID() : args.projectId,
      sessionId: args.sessionId ?? crypto.randomUUID(), createdAt: Date.now() };
    await atomicJson(file, record);
    let result;
    try { result = await task(record); }
    catch (error) {
      await atomicJson(file, { ...record, state: 'failed', error: errorText(error) }); throw error;
    }
    await atomicJson(file, { ...record, state: 'completed', result }); return result;
  }
  async publicJob(jobId: string) {
    const job = (await this.store.status(jobId)).exportJob;
    if (!job) throw new Error('EXPORT_NOT_FOUND');
    const { token, workerPid, ...safe } = job;
    return { ...safe, ...(job.state === 'completed' ? { path: path.join(this.store.directory, job.file!), downloadUrl: this.context.origin() + '/api/exports/' + job.id + '/file' } : {}) };
  }
  async detail(projectId: string, args: any = {}) {
    const versions = this.versions(projectId), scoped = versions.store;
    return versions.withHistory(async history => {
      const version = await versions.current(history), state = await scoped.get();
      if (args.expectedRevision && args.expectedRevision !== state.revision) throw new Error('VERSION_CONFLICT: 源码快照已变化');
      const meta = await jsonFile<any>(path.join(scoped.projectDirectory, metadataPath), {});
      const assets = await jsonFile<any[]>(path.join(scoped.projectDirectory, assetIndexPath), []);
      const owner = this.store.projectCatalog().sessions!.find(session => session.artifacts.some(artifact => artifact.projectId === projectId))!;
      let file;
      if (args.file) {
        const name = projectPath(args.file.path);
        if (!textExtensions.has(path.extname(name))) throw new Error('UNSUPPORTED_TEXT_TYPE');
        const handle = await open(await scoped.safePath(name), 'r');
        try {
          const size = (await handle.stat()).size, offset = args.file.offset ?? 0, length = args.file.length ?? 65536;
          if (offset > size) throw new Error('INVALID_FILE_OFFSET');
          const data = Buffer.alloc(Math.min(length + 4, size - offset));
          const { bytesRead } = await handle.read(data, 0, data.length, offset);
          if (bytesRead && (data[0] & 0xc0) === 0x80) throw new Error('INVALID_UTF8_OFFSET');
          let end = Math.min(length, bytesRead);
          while (end < bytesRead && end > 0 && (data[end] & 0xc0) === 0x80) end--;
          if (!end && bytesRead) throw new Error('READ_WINDOW_TOO_SMALL');
          file = { path: name, content: new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, end)), offset, bytes: end, totalBytes: size, nextOffset: offset + end < size ? offset + end : null };
        } finally { await handle.close(); }
      }
      const jobs = [];
      for (const id of await readdir(path.join(this.store.directory, 'jobs')).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
        const job = await this.store.job(id).catch(() => null);
        if (job?.projectId === projectId) jobs.push(job);
      }
      jobs.sort((a, b) => b.createdAt - a.createdAt);
      if (args.exportJobId && !jobs.some(job => job.id === args.exportJobId)) throw new Error('EXPORT_NOT_FOUND: 任务不属于该项目');
      const exportJob = args.exportJobId ? await this.publicJob(args.exportJobId) : jobs[0] ? await this.publicJob(jobs[0].id) : null;
      if ((await scoped.get()).revision !== state.revision) throw new Error('VERSION_CONFLICT: 读取期间工程已变化');
      return { projectId, sessionId: owner.id, project: state.project, revision: state.revision, version: versions.publicVersion(version),
        currentVersionId: version.versionId, currentVersionNumber: version.versionNumber, dataDirectory: this.store.directory,
        hyperframesCli: path.join(this.runtimeRoot, 'node_modules/hyperframes/bin/hyperframes.mjs'), authoringGuide: path.join(this.runtimeRoot, 'node_modules/hyperframes/dist/skills/hyperframes/SKILL.md'),
        requirements: meta.requirements ?? (await scoped.conversation(projectId)).messages.map(message => message.content).join('\n'),
        projectType: meta.projectType ?? 'legacy', source: meta.source ?? null, assets, file, exportJob,
        exports: jobs.map(({ token, workerPid, ...job }) => job), reviews: await jsonFile(path.join(this.store.directory, 'phase1', 'reviews', projectId + '.json'), []),
        limits: { textBatchFiles: 100, textBatchBytes: 8388608, textReadBytes: 2097152, assetBytes: 2147483648, attachmentTransport: 'local_path' } };
    });
  }
  async review(args: any, objectId?: string) {
    if (!args.review) throw new Error('INVALID_ARGUMENT: review is required');
    const review = args.review, index = await this.versions(args.projectId).index();
    if (!index.versions.some(version => version.versionId === review.versionId)) throw new Error('VERSION_NOT_FOUND');
    if (objectId && review.objectId !== objectId) throw new Error('REVIEW_OBJECT_MISMATCH');
    if (review.range && review.range.end < review.range.start) throw new Error('INVALID_REVIEW_RANGE');
    const file = path.join(this.store.directory, 'phase1', 'reviews', args.projectId + '.json');
    const reviews = await jsonFile<any[]>(file, []);
    const record = { ...review, projectId: args.projectId, requestId: args.requestId, createdAt: Date.now(), verifiedUserAdoption: false };
    reviews.push(record); await atomicJson(file, reviews); return { projectId: args.projectId, review: record, changed: false };
  }
  async dispatch(name: string, args: any): Promise<any> {
    if (name === 'motion_get_project' && !args.projectId) {
      if (args.file || args.exportJobId || args.expectedRevision) throw new Error('INVALID_ARGUMENT: projectId is required for details');
      const scope = args.sessionId ?? 'workspace';
      const page = parseCursor(args.cursor, 'projects', scope);
      const catalog = this.store.projectCatalog();
      if (args.sessionId && !catalog.sessions!.some(session => session.id === args.sessionId)) throw new Error('SESSION_NOT_FOUND');
      const ids = args.sessionId ? new Set(catalog.sessions!.find(session => session.id === args.sessionId)!.artifacts.map(artifact => artifact.projectId)) : null;
      const all = [];
      for (const item of catalog.projects) {
        if (ids && !ids.has(item.id)) continue;
        if (await stat(path.join(this.store.projectDirectoryFor(item.id), 'index.html')).catch(() => null)) all.push(item);
      }
      all.sort((a, b) => -tupleCompare([a.createdAt ?? 0, a.id], [b.createdAt ?? 0, b.id]));
      const visible = all.filter(item => !page || tupleCompare([item.createdAt ?? 0, item.id], page.after) < 0);
      const projects = visible.slice(0, 5).map(item => ({ ...item, createdAt: item.createdAt ?? null,
        sessionId: catalog.sessions!.find(session => session.artifacts.some(artifact => artifact.projectId === item.id))!.id }));
      const last = projects.at(-1);
      return { dataDirectory: this.store.directory, projects, pageSize: 5, hasMore: visible.length > 5, nextCursor: visible.length > 5 ? cursor({ kind: 'projects', scope, after: [last!.createdAt ?? 0, last!.id] }) : null };
    }
    if (name === 'motion_get_project') {
      if (args.cursor) throw new Error('INVALID_ARGUMENT: cursor is for project lists');
      if (args.sessionId && !this.store.projectCatalog().sessions!.some(session => session.id === args.sessionId && session.artifacts.some(artifact => artifact.projectId === args.projectId))) throw new Error('PROJECT_SESSION_MISMATCH');
      return this.detail(args.projectId, args);
    }
    if (name === 'motion_list_versions') {
      const versions = this.versions(args.projectId);
      return versions.withHistory(async history => {
        const index = await versions.sync(history), page = parseCursor(args.cursor, 'versions', args.projectId);
        const all = [...index.versions].reverse().filter(item => !page || item.versionNumber < page.after[0]);
        const shown = all.slice(0, 5), current = index.versions.at(-1)!;
        return { projectId: args.projectId, currentVersionId: current.versionId, currentVersionNumber: current.versionNumber,
          versions: shown.map(item => ({ ...versions.publicVersion(item), isCurrent: item.versionId === current.versionId })), pageSize: 5,
          hasMore: all.length > 5, nextCursor: all.length > 5 ? cursor({ kind: 'versions', scope: args.projectId, after: [shown.at(-1)!.versionNumber, shown.at(-1)!.versionId] }) : null };
      });
    }
    if (name === 'motion_create_project') return this.writeRequest(name, args, async record => {
      if (args.projectType === 'natural_language' && (args.templateId || args.referenceVideoId || args.referenceUrl) || args.projectType === 'template' && (args.referenceVideoId || args.referenceUrl) || args.projectType === 'reference_video' && (args.templateId || args.referenceVideoId && args.referenceUrl)) throw new Error('INVALID_ARGUMENT: creation source must match projectType');
      if (args.projectType === 'template' && !args.templateId || args.projectType === 'reference_video' && !args.referenceVideoId && !args.referenceUrl) throw new Error('INVALID_ARGUMENT: creation source is required');
      const source = args.templateId || args.referenceVideoId ? getTemplate(args.templateId ?? args.referenceVideoId) : null;
      if (args.projectType === 'template' && source?.kind !== 'builtin') throw new Error('TEMPLATE_NOT_COPYABLE: 请在 Studio 选择可编辑原生模板；参考视频需由 Agent 重建');
      if (args.referenceUrl && !['https:', 'http:'].includes(new URL(args.referenceUrl).protocol)) throw new Error('INVALID_REFERENCE_URL');
      validateInstruction(args.requirements);
      const title = validateProjectTitle(args.title), directory = this.store.projectDirectoryFor(record.projectId);
      let registered = false;
      try {
        if (args.projectType === 'template') await copyTemplate(findTemplate(args.templateId).id, directory, this.runtimeRoot);
        else await createBlankProject(directory, this.runtimeRoot, title);
        const meta = { schemaVersion: 1, projectType: args.projectType, requirements: args.requirements, creationRequestId: args.requestId,
          source: source ? { id: source.id, kind: source.kind, previewUrl: source.previewUrl, sourceUrl: source.sourceUrl } : args.referenceUrl ? { url: args.referenceUrl, inspected: false } : null };
        await atomicJson(path.join(directory, metadataPath), meta);
        await atomicJson(path.join(directory, assetIndexPath), []);
        await this.store.lock(async () => {
          const catalog = this.store.projectCatalog();
          let session = args.sessionId ? catalog.sessions!.find(item => item.id === args.sessionId) : null;
          if (args.sessionId && !session) throw new Error('SESSION_NOT_FOUND');
          if (!session) {
            session = { id: record.sessionId, title, mode: 'motion', artifacts: [], createdAt: Date.now(), openedAt: Date.now() };
            catalog.sessions!.unshift(session);
            await atomicJson(path.join(this.store.directory, 'sessions', session.id + '.json'), { sessionId: session.id, messages: [{ id: crypto.randomUUID(), role: 'user', content: args.requirements, createdAt: Date.now() }] });
          }
          const project = { id: record.projectId, title, templateId: source?.id, createdAt: Date.now() };
          catalog.projects.unshift(project); session.artifacts.push({ id: crypto.randomUUID(), kind: 'motion-project', projectId: project.id, title, templateId: source?.id });
          session.activeArtifactId = session.artifacts.at(-1)!.id;
          const activeExists = await stat(path.join(this.store.projectDirectoryFor(catalog.activeId), 'index.html')).catch(() => null);
          if (!activeExists) { catalog.activeId = project.id; catalog.activeSessionId = session.id; }
          await atomicJson(path.join(this.store.directory, 'projects.json'), catalog); registered = true;
        });
        const detail = await this.detail(record.projectId);
        return { ...detail, created: true, previewUrl: this.context.origin() + sessionPath(detail.sessionId, detail.projectId, { embedded: true }), creationComplete: true, filmComplete: false };
      } catch (error) { if (!registered) await rm(directory, { recursive: true, force: true }); throw error; }
    });
    if (name === 'motion_open_preview') {
      if (args.action === 'record_review') {
        if (!args.projectId) throw new Error('INVALID_ARGUMENT: projectId is required for review');
        return this.writeRequest(name, args, () => this.review(args));
      }
      const catalog = this.store.projectCatalog();
      const session = args.sessionId ? catalog.sessions!.find(item => item.id === args.sessionId) : null;
      if (args.sessionId && !session) throw new Error('SESSION_NOT_FOUND');
      const projectId = args.projectId ?? session?.artifacts.find(item => item.id === session.activeArtifactId)?.projectId ?? session?.artifacts.at(-1)?.projectId;
      if (!projectId) throw new Error('PROJECT_NOT_BOUND: 请传入 projectId 或已绑定的 OpenMotion sessionId');
      this.store.forProject(projectId);
      if (session && !session.artifacts.some(artifact => artifact.projectId === projectId)) throw new Error('PROJECT_SESSION_MISMATCH');
      const checked = await inspectProject(this.runtimeRoot, this.store.projectDirectoryFor(projectId), 'lint');
      if (checked.exitCode) throw new Error('PROJECT_VALIDATION_FAILED: ' + JSON.stringify(checked.result));
      await this.context.openProject(projectId);
      const detail = await this.detail(projectId);
      return { ...detail, previewUrl: this.context.origin() + sessionPath(detail.sessionId, projectId, { embedded: args.embedded !== false }),
        sessionUrl: this.context.origin() + sessionPath(detail.sessionId, projectId), embeddedPreviewUrl: this.context.origin() + sessionPath(detail.sessionId, projectId, { embedded: true }),
        preflight: checked.result, openedByHost: false, selectionSource: args.projectId ? 'explicit_project' : 'bound_session' };
    }
    if (name === 'motion_edit_project') return this.writeRequest(name, args, () => this.context.mutation(() => this.store.lock(async () => {
      const versions = this.versions(args.projectId), scoped = versions.store;
      const names = new Set<string>(); let bytes = 0;
      for (const file of args.files) {
        projectPath(file.path);
        if (!textExtensions.has(path.extname(file.path)) || [metadataPath, assetIndexPath].includes(file.path)) throw new Error('INVALID_FILE_TYPE_OR_RESERVED_PATH');
        if (names.has(file.path)) throw new Error('DUPLICATE_FILE_PATH'); names.add(file.path); bytes += Buffer.byteLength(file.content);
      }
      if (bytes > 8388608) throw new Error('SOURCE_BATCH_TOO_LARGE: 8 MiB limit');
      const changes = [...args.files];
      if (args.requirements !== undefined) {
        validateInstruction(args.requirements);
        const meta = await jsonFile<any>(path.join(scoped.projectDirectory, metadataPath), { schemaVersion: 1, projectType: 'legacy' });
        changes.push({ path: metadataPath, content: JSON.stringify({ ...meta, requirements: args.requirements }) });
      }
      return versions.withHistory(async history => ({ projectId: args.projectId,
        ...await versions.transaction(history, args.expectedRevision, args.expectedVersionId, args.requestId, changes, { label: args.summary ?? 'Agent source edit' }),
        changedFiles: changes.map(file => file.path), previewSync: this.context.nativeUrl(args.projectId) ? 'file_watcher_notified' : 'not_open' }));
    })));
    if (name === 'motion_restore_version') return this.writeRequest(name, args, () => this.context.mutation(() => this.store.lock(async () => {
      const versions = this.versions(args.projectId);
      return versions.withHistory(async history => {
        const index = await versions.sync(history), target = index.versions.find(version => version.versionId === args.versionId);
        if (!target) throw new Error('VERSION_NOT_FOUND');
        return { projectId: args.projectId, restoredFromVersionId: target.versionId,
          ...await versions.restore(history, target, args.expectedRevision, args.expectedVersionId, args.requestId),
          previewSync: this.context.nativeUrl(args.projectId) ? 'file_watcher_notified' : 'not_open' };
      });
    })));
    if (name === 'motion_import_assets') return this.importAssets(args);
    if (name === 'motion_export_cancel') return this.writeRequest(name, args, async () => ({ projectId: args.projectId, job: await this.context.cancel(args.projectId, args.jobId) }));
    if (name === 'motion_export_request') return this.writeRequest(name, args, async () => {
      if (args.action === 'record_review') {
        if (!args.jobId) throw new Error('INVALID_ARGUMENT: jobId is required');
        const job = await this.store.job(args.jobId);
        if (!job || job.projectId !== args.projectId || job.state !== 'completed') throw new Error('EXPORT_NOT_COMPLETED');
        if (args.review?.versionId !== job.versionId) throw new Error('REVIEW_VERSION_MISMATCH');
        return this.review(args, job.id);
      }
      if (!args.versionId || !args.expectedRevision) throw new Error('INVALID_ARGUMENT: versionId and expectedRevision are required');
      const detail = await this.detail(args.projectId);
      if (detail.currentVersionId !== args.versionId || detail.revision !== args.expectedRevision) throw new Error('VERSION_CONFLICT');
      const job = await this.store.forProject(args.projectId).requestExport(args.expectedRevision, { phase1: true, versionId: args.versionId, requestId: args.requestId, audio: args.audio });
      return { projectId: args.projectId, job: { ...job, token: undefined, workerPid: undefined }, technicalVerification: 'automatic_after_render', contentReview: 'pending' };
    });
    throw new Error('MCP_TOOL_NOT_EXPOSED: ' + name);
  }
  async importAssets(args: any) {
    return this.writeRequest('motion_import_assets', args, async () => {
      const versions = this.versions(args.projectId), scoped = versions.store;
      const existing = await jsonFile<any[]>(path.join(scoped.projectDirectory, assetIndexPath), []);
      const items: any[] = [], changes: any[] = [], added: any[] = [];
      const staging = path.join(this.store.directory, 'phase1', 'import-' + crypto.randomUUID());
      await mkdir(staging, { recursive: true });
      try {
        const itemIds = new Set<string>();
        for (const item of args.items) {
          if (itemIds.has(item.itemId)) throw new Error('DUPLICATE_ITEM_ID'); itemIds.add(item.itemId);
          try {
            const inputHash = digest(item), prior = existing.find(asset => asset.itemId === item.itemId);
            if (prior) {
              if (prior.inputHash !== inputHash) throw new Error('ITEM_ID_CONFLICT');
              if (!await stat(path.join(scoped.projectDirectory, prior.path)).catch(() => null)) throw new Error('ASSET_NOT_IN_CURRENT_VERSION: 请恢复对应版本或使用新 itemId 重新导入');
              items.push({ ...prior, status: 'completed', reused: true }); continue;
            }
            if (!path.isAbsolute(item.sourcePath)) throw new Error('ATTACHMENT_NOT_READABLE: 需要本机实际绝对路径');
            const info = await stat(item.sourcePath);
            if (!info.isFile() || info.size >= 2147483648) throw new Error('ASSET_TOO_LARGE_OR_NOT_FILE');
            const staged = path.join(staging, crypto.randomUUID()); await cloneFile(item.sourcePath, staged);
            if ((await stat(staged)).size >= 2147483648) throw new Error('ASSET_TOO_LARGE_OR_NOT_FILE');
            const probe = await execute(verificationBinaries().ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', staged], staging, 60_000);
            if (probe.code) throw new Error('INVALID_MEDIA: 无法读取真实媒体');
            const media = JSON.parse(probe.stdout), stream = media.streams?.find((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic) ?? media.streams?.find((s: any) => s.codec_type === 'audio');
            if (!stream) throw new Error('UNSUPPORTED_MEDIA_TYPE');
            const image: Record<string, [string, string]> = { png: ['image/png', 'png'], mjpeg: ['image/jpeg', 'jpg'], webp: ['image/webp', 'webp'], gif: ['image/gif', 'gif'] };
            const format = String(media.format?.format_name ?? '');
            const kind = (/image2|_pipe|^gif$/.test(format) ? image[stream.codec_name] : undefined) ?? (stream.codec_type === 'video' && format.includes('mov') ? ['video/mp4', 'mp4'] : stream.codec_type === 'video' && /webm|matroska/.test(format) ? ['video/webm', 'webm'] : stream.codec_type === 'audio' ? ({ wav: ['audio/wav', 'wav'], mp3: ['audio/mpeg', 'mp3'], ogg: ['audio/ogg', 'ogg'], flac: ['audio/flac', 'flac'], aac: ['audio/aac', 'aac'] } as any)[format] ?? (format.includes('mov') ? ['audio/mp4', 'm4a'] : null) : null);
            if (!kind || stream.codec_type === 'video' && !(stream.width > 0 && stream.height > 0)) throw new Error('UNSUPPORTED_MEDIA_TYPE');
            const decoded = await execute(verificationBinaries().ffmpeg, ['-v', 'error', '-xerror', '-err_detect', 'explode', '-i', staged, '-map', '0:' + stream.index, stream.codec_type === 'video' ? '-frames:v' : '-frames:a', '1', '-f', 'null', '-'], staging, 60_000);
            if (decoded.code) throw new Error('INVALID_MEDIA: 媒体首帧无法解码');
            const assetId = crypto.randomUUID(), relative = 'assets/imported/' + assetId + '.' + kind[1];
            const asset = { itemId: item.itemId, assetId, inputHash, path: relative, mimeType: kind[0], size: (await stat(staged)).size,
              sha256: await fileHash(staged), width: stream.width, height: stream.height, duration: Number(media.format.duration) || undefined, name: item.name ?? path.basename(item.sourcePath) };
            changes.push({ path: relative, source: staged }); added.push(asset); items.push({ ...asset, status: 'completed' });
          } catch (error) { items.push({ itemId: item.itemId, status: 'failed', error: errorText(error) }); }
        }
        let saved: any = null;
        if (added.length) saved = await this.context.mutation(() => this.store.lock(() => versions.withHistory(async history => {
          const current = await versions.current(history);
          if (digest(await jsonFile(path.join(scoped.projectDirectory, assetIndexPath), [])) !== digest(existing)) throw new Error('VERSION_CONFLICT: 素材索引在导入时变化');
          changes.push({ path: assetIndexPath, content: JSON.stringify([...existing, ...added]) });
          return versions.transaction(history, current.revision, current.versionId, args.requestId, changes, { label: 'Import ' + added.length + ' assets' });
        })));
        return { projectId: args.projectId, status: items.every(item => item.status === 'completed') ? 'completed' : items.some(item => item.status === 'completed') ? 'partial' : 'failed', items, ...saved, appliedToTimeline: false };
      } finally { await rm(staging, { recursive: true, force: true }); }
    });
  }
}
