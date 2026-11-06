import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkspaceStore, projectPath } from './workspace.ts';
import type { SourceFile } from './workspace.ts';

export async function atomicJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { await writeFile(temporary, JSON.stringify(data), { mode: 0o600 }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export async function jsonFile<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
export async function fileHash(file: string) {
  const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex');
}
async function exists(file: string) { try { await stat(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }
export async function cloneFile(from: string, to: string) { await mkdir(path.dirname(to), { recursive: true }); await copyFile(from, to, constants.COPYFILE_FICLONE); }
export type NativeHistory = {
  checkpoint(): Promise<void>; list(): any[] | Promise<any[]>; peek(point: string): any;
  readBlob(hash: string): Promise<Buffer>; pin(point: string, value: boolean): any;
  beginWindow(who: any, label: string, options: any): Promise<{ id: string; close(): Promise<any> }>;
};
type VersionFile = SourceFile & { retained?: boolean; missing?: boolean };
export type ContentVersion = { versionId: string; versionNumber: number; nativePoint: string; createdAt: number;
  source: string; summary: string; revision: string; files: VersionFile[]; requestId?: string; restoredFromVersionId?: string };
type VersionIndex = { versions: ContentVersion[]; ignored: string[] };
const actor = { kind: 'agent', name: 'OpenMotion Agent' };

function remoteHistory(base: string): NativeHistory {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('INVALID_HISTORY_OWNER');
  async function call(action = '', body?: unknown, binary = false) {
    const response = await fetch(base.replace(/\/$/, '') + action, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error('NATIVE_HISTORY_FAILED: ' + (await response.text()).slice(0, 1200));
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  return { checkpoint: async () => { await call('/checkpoint', {}); }, list: async () => (await call()).entries,
    peek: async point => (await call('/peek/' + encodeURIComponent(point))).files,
    readBlob: hash => call('/blob/' + hash, undefined, true), pin: (entryId, pinned) => call('/pin', { entryId, pinned }),
    beginWindow: async (who, label, options) => {
      const opened = await call('/window', { who, label, ...options });
      return { id: opened.windowId, close: async () => (await call('/window/' + opened.windowId + '/close', {})).entry };
    } };
}

/** Version IDs/index reuse native history; only otherwise-uncopied blobs are retained here. */
export class ProjectVersions {
  readonly root: string;
  readonly store: WorkspaceStore;
  readonly runtimeRoot: string;
  readonly nativeUrl?: string;
  constructor(store: WorkspaceStore, runtimeRoot: string, nativeUrl?: string) {
    this.store = store; this.runtimeRoot = runtimeRoot; this.nativeUrl = nativeUrl;
    this.root = path.join(store.directory, 'phase1');
  }
  get indexFile() { return path.join(this.root, 'versions', this.store.projectId + '.json'); }
  blob(hash: string) { if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_BLOB_HASH'); return path.join(this.root, 'retained', hash); }
  async withHistory<T>(task: (history: NativeHistory) => Promise<T>): Promise<T> {
    if (this.nativeUrl) return task(remoteHistory(new URL('/api/projects/' + this.store.projectId + '/history', this.nativeUrl).href));
    const native = await import(pathToFileURL(path.join(this.runtimeRoot, 'node_modules/@hyperframes/studio-server/dist/history/index.js')).href);
    let history: any;
    try { history = await native.openProjectHistory({ projectDir: this.store.projectDirectory,
      historyRoot: process.env.HYPERFRAMES_HISTORY_ROOT || native.DEFAULT_HISTORY_ROOT, ownerWaitMs: 50 }); }
    catch (e) {
      if (e instanceof native.HistoryBusyError && e.url) {
        const owner = new URL(e.url);
        if (!owner.pathname.endsWith('/projects/' + encodeURIComponent(this.store.projectId) + '/history')) throw e;
        return task(remoteHistory(owner.href));
      }
      throw e;
    }
    try { return await task(history); } finally { await history.close(); }
  }
  async index() { return jsonFile<VersionIndex>(this.indexFile, { versions: [], ignored: [] }); }
  async capture(history: NativeHistory, point: string, entry: any, index: VersionIndex, options: Partial<ContentVersion> = {}) {
    const manifest = await history.peek(point);
    if (!manifest) throw new Error('VERSION_NOT_RESTORABLE: 原生历史已不存在');
    const files: VersionFile[] = [];
    for (const [name, hash] of Object.entries(manifest) as [string, string][]) {
      try { projectPath(name); } catch { continue; }
      const file: VersionFile = { path: name, hash, size: 0 };
      try { file.size = (await history.readBlob(hash)).length; }
      catch {
        file.retained = true;
        const retained = this.blob(hash);
        if (!(await exists(retained))) {
          const source = await this.store.safePath(name);
          if (await exists(source) && await fileHash(source) === hash) {
            const temporary = retained + '.' + crypto.randomUUID();
            try {
              await cloneFile(source, temporary);
              if (await fileHash(temporary) !== hash) throw new Error('VERSION_CAPTURE_CONFLICT');
              await rename(temporary, retained);
            } finally { await rm(temporary, { force: true }); }
          }
        }
        if (await exists(retained)) file.size = (await stat(retained)).size; else file.missing = true;
      }
      files.push(file);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const revision = this.store.revision(files.map(({ path, size, hash }) => ({ path, size, hash })));
    const previous = index.versions.at(-1);
    if (previous?.revision === revision) { index.ignored.push(point); return previous; }
    const version: ContentVersion = { versionId: point === 'start' ? crypto.randomUUID() : point,
      versionNumber: (previous?.versionNumber ?? 0) + 1, nativePoint: point, createdAt: entry?.endedAt ?? Date.now(),
      source: entry?.who?.kind ?? 'baseline', summary: entry?.label ?? 'Initial project', revision, files, ...options };
    index.versions.push(version);
    if (point !== 'start') await history.pin(point, true);
    return version;
  }
  async sync(history: NativeHistory) {
    await history.checkpoint();
    const index = await this.index();
    const entries = await history.list();
    const seen = new Set([...index.ignored, ...index.versions.map(item => item.nativePoint)]);
    if (!index.versions.length) await this.capture(history, 'start', undefined, index);
    for (const entry of entries) if (!seen.has(entry.id)) await this.capture(history, entry.id, entry, index);
    await atomicJson(this.indexFile, index);
    return index;
  }
  publicVersion(version: ContentVersion) {
    const { files, nativePoint, ...value } = version;
    return { ...value, restorable: files.every(file => !file.missing), unavailableFiles: files.filter(file => file.missing).map(file => file.path), filePaths: files.map(file => file.path) };
  }
  async current(history: NativeHistory) {
    const index = await this.sync(history); const version = index.versions.at(-1)!;
    const current = await this.store.get();
    if (current.revision !== version.revision) throw new Error('VERSION_CONFLICT: 工程仍在修改，请重新读取');
    return version;
  }
  async transaction(history: NativeHistory, expectedRevision: string, expectedVersionId: string | undefined,
    requestId: string, changes: { path: string; content?: string | Buffer; source?: string; remove?: boolean }[],
    options: { label: string; restoredFromVersionId?: string }) {
    const current = await this.current(history);
    if (current.revision !== expectedRevision || expectedVersionId && current.versionId !== expectedVersionId) throw new Error('VERSION_CONFLICT: 请重新读取当前工程与版本');
    const paths = changes.map(change => projectPath(change.path));
    if (paths.some((name, i) => paths.some((other, j) => i !== j && (name === other || name.startsWith(other + '/'))))) throw new Error('CONFLICTING_FILE_PATHS');
    const window = await history.beginWindow(actor, options.label, { exclusive: true, idleMs: 600_000 });
    const transaction = path.join(this.root, 'transactions', crypto.randomUUID());
    const journal: any = { projectId: this.store.projectId, requestId, windowId: window.id, state: 'prepared', changes: [] };
    let committed = false;
    try {
      if ((await this.store.get()).revision !== expectedRevision) throw new Error('VERSION_CONFLICT: GUI 已产生新修改');
      const names = new Set<string>();
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i]; projectPath(change.path);
        if (names.has(change.path)) throw new Error('DUPLICATE_FILE_PATH'); names.add(change.path);
        const target = await this.store.safePath(change.path);
        const info = await lstat(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
        if (info && !info.isFile()) throw new Error('INVALID_FILE_TARGET: ' + change.path);
        const before = info ? await fileHash(target) : null;
        if (info) await cloneFile(target, path.join(transaction, 'old', String(i)));
        const next = path.join(transaction, 'new', String(i));
        if (!change.remove) {
          await mkdir(path.dirname(next), { recursive: true });
          if (change.source) await cloneFile(change.source, next); else await writeFile(next, change.content!, { mode: 0o600 });
        }
        journal.changes.push({ path: change.path, before, after: change.remove ? null : await fileHash(next) });
      }
      await atomicJson(path.join(transaction, 'journal.json'), journal);
      if ((await this.store.get()).revision !== expectedRevision) throw new Error('VERSION_CONFLICT: 工程在保存前变化');
      for (let i = 0; i < changes.length; i++) {
        const target = await this.store.safePath(changes[i].path);
        if (changes[i].remove) await rm(target, { force: true });
        else { await mkdir(path.dirname(target), { recursive: true }); await rename(path.join(transaction, 'new', String(i)), target); }
      }
      const entry = await window.close();
      const index = await this.index();
      const version = entry ? await this.capture(history, entry.id, entry, index, { requestId,
        source: options.restoredFromVersionId ? 'restore' : 'agent', restoredFromVersionId: options.restoredFromVersionId }) : current;
      await atomicJson(this.indexFile, index);
      journal.state = 'committed'; journal.versionId = version.versionId;
      await atomicJson(path.join(transaction, 'journal.json'), journal); committed = true;
      return { version: this.publicVersion(version), revision: version.revision, changed: version.versionId !== current.versionId };
    } catch (error) {
      if (await exists(path.join(transaction, 'journal.json'))) await this.rollback(transaction, journal);
      throw error;
    } finally {
      await window.close().catch(() => {});
      if (committed || !await exists(path.join(transaction, 'journal.json'))) await rm(transaction, { recursive: true, force: true });
    }
  }
  async rollback(directory: string, journal: any) {
    for (const change of journal.changes) {
      const file = await this.store.safePath(change.path);
      const hash = await exists(file) ? await fileHash(file) : null;
      if (hash !== change.before && hash !== change.after) throw new Error('RECOVERY_CONFLICT: 已保留恢复副本，不能覆盖外部修改');
    }
    for (let i = journal.changes.length - 1; i >= 0; i--) {
      const change = journal.changes[i], target = await this.store.safePath(change.path);
      if (change.before === null) await rm(target, { force: true });
      else { await mkdir(path.dirname(target), { recursive: true }); await cloneFile(path.join(directory, 'old', String(i)), target); }
    }
    const index = await this.index();
    index.versions = index.versions.filter(version => version.requestId !== journal.requestId);
    index.ignored.push(journal.windowId);
    await atomicJson(this.indexFile, index);
    await rm(directory, { recursive: true, force: true });
  }
  async restore(history: NativeHistory, target: ContentVersion, expectedRevision: string, expectedVersionId: string, requestId: string) {
    const directory = path.join(this.root, 'restore-' + crypto.randomUUID());
    try {
      const changes: { path: string; source?: string; remove?: boolean }[] = [];
      for (const file of target.files) {
        const staged = path.join(directory, file.path);
        await mkdir(path.dirname(staged), { recursive: true });
        if (file.retained) await cloneFile(this.blob(file.hash), staged);
        else await writeFile(staged, await history.readBlob(file.hash), { mode: 0o600 });
        if (await fileHash(staged) !== file.hash) throw new Error('VERSION_NOT_RESTORABLE: 历史文件缺失或损坏');
        changes.push({ path: file.path, source: staged });
      }
      const wanted = new Set(target.files.map(file => file.path));
      for (const file of await this.store.files()) if (!wanted.has(file.path)) changes.push({ path: file.path, remove: true });
      return await this.transaction(history, expectedRevision, expectedVersionId, requestId, changes,
        { label: 'Restore v' + target.versionNumber, restoredFromVersionId: target.versionId });
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

export async function recoverProjectTransactions(store: WorkspaceStore, runtimeRoot: string) {
  return store.lock(async () => {
  const root = path.join(store.directory, 'phase1', 'transactions');
  for (const name of await readdir(root).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    const directory = path.join(root, name); const journal = await jsonFile<any>(path.join(directory, 'journal.json'), null);
    if (!journal) { await rm(directory, { recursive: true, force: true }); continue; }
    if (journal.state === 'committed') { await rm(directory, { recursive: true, force: true }); continue; }
    const versions = new ProjectVersions(store.forProject(journal.projectId), runtimeRoot);
    await versions.withHistory(async history => {
      const window = await history.beginWindow(actor, 'Recover interrupted save', { exclusive: true, idleMs: 600_000 });
      try { await versions.rollback(directory, journal); } finally {
        const entry = await window.close();
        if (entry) { const index = await versions.index(); index.ignored.push(entry.id); await atomicJson(versions.indexFile, index); }
      }
    });
  }
  });
}
