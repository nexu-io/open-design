import { createHash, randomUUID } from 'node:crypto';
import { chmod, link, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WorkspaceStore } from '../workspace.ts';
import { modalities, type Agent, type GenerateInput, type GenerationJob, type GatewayStatus, type Model, type Modality, type ProviderId, type ProviderState } from '../shared/gateway.ts';
import { builtinModels, discoverModels, modelKey, providerIds, providerLabels, validModelId } from './catalog.ts';
import { detectAgents, generateCodexImage } from './agents.ts';
import { downloadMedia, mediaType, ProviderError, type Fetcher } from './network.ts';
import { providerAdapters } from './providers.ts';

type Config = { version: 1; providers: Partial<Record<ProviderId, { enabled?: boolean; verification?: 'verified' | 'rejected'; keyHash?: string; checkedAt?: number }>>;
  routes: Partial<Record<Modality, string>>; customModels: Model[] };
type Options = { fetcher?: Fetcher; detect?: () => Promise<Agent[]>; codex?: typeof generateCodexImage; download?: typeof downloadMedia; pollMs?: number };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const uuid = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
function alive(pid?: number) { try { if (!pid) return false; process.kill(pid, 0); return true; } catch { return false; } }
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw new Error('Model gateway data is unreadable'); }
}
async function atomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + randomUUID() + '.tmp';
  try { await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 }); await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}
function providerId(value: unknown): asserts value is ProviderId {
  if (!providerIds.includes(value as ProviderId)) throw new Error('Unknown model provider');
}
function modality(value: unknown): asserts value is Modality {
  if (!modalities.includes(value as Modality)) throw new Error('modality must be image, video or audio');
}
function parameters(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 64_000) throw new Error('parameters must be an object under 64 KB');
  if (Object.keys(value).some(key => /^(?:model|prompt|api[_-]?key|authorization|webhook_url|__proto__|constructor|prototype)$/i.test(key))) throw new Error('parameters contains a reserved field');
  return value as Record<string, unknown>;
}

export class ModelGateway {
  store: WorkspaceStore;
  options: Options;
  root: string;
  active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private detecting?: Promise<Agent[]>;
  private agentCache?: { time: number; agents: Agent[] };
  private ticking = false;
  private closed = false;
  constructor(store: WorkspaceStore, options: Options = {}) { this.store = store; this.options = options; this.root = path.join(store.directory, 'model-gateway'); }
  async config(): Promise<Config> {
    return readJson(path.join(this.root, 'config.json'), { version: 1, providers: {}, routes: {}, customModels: [] });
  }
  private async credentials() { return readJson<Partial<Record<ProviderId, string>>>(path.join(this.root, 'secrets.json'), {}); }
  private async credential(id: ProviderId) {
    const saved = (await this.credentials())[id];
    const env = id === 'atlascloud' ? process.env.ATLASCLOUD_API_KEY : id === 'fal' ? process.env.FAL_KEY : undefined;
    return { key: saved || env || '', source: saved ? 'stored' as const : env ? 'environment' as const : 'none' as const };
  }
  async configureProvider(id: unknown, input: { apiKey?: unknown; enabled?: unknown }) {
    providerId(id);
    if (!input || typeof input !== 'object') throw new Error('Provider settings required');
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean');
    if (input.apiKey !== undefined && input.apiKey !== null && (typeof input.apiKey !== 'string' || !input.apiKey.trim() || input.apiKey.length > 4096 || /[\x00-\x1f]/.test(input.apiKey))) throw new Error('Invalid API key');
    if (id === 'codex' && input.apiKey !== undefined) throw new Error('Codex uses its own local login; no API key is stored here');
    await this.store.lock(async () => {
      const config = await this.config(); const state = config.providers[id] ?? {};
      if (input.apiKey !== undefined) {
        const keys = await this.credentials();
        if (input.apiKey === null) delete keys[id]; else keys[id] = (input.apiKey as string).trim();
        await atomic(path.join(this.root, 'secrets.json'), keys);
        await chmod(this.root, 0o700);
        delete state.verification; delete state.keyHash; delete state.checkedAt;
      }
      if (input.enabled !== undefined) state.enabled = input.enabled as boolean;
      config.providers[id] = state;
      await atomic(path.join(this.root, 'config.json'), config);
    });
    return this.status();
  }
  async agents(refresh = false) {
    if (!refresh && this.agentCache && Date.now() - this.agentCache.time < 30_000) return this.agentCache.agents;
    if (!this.detecting) this.detecting = (this.options.detect ?? detectAgents)().then(agents => { this.agentCache = { time: Date.now(), agents }; return agents; }).finally(() => { this.detecting = undefined; });
    return this.detecting;
  }
  private async models(): Promise<Model[]> {
    const cached = await readJson<Model[]>(path.join(this.root, 'catalog.json'), []);
    return [...new Map([...builtinModels, ...cached, ...(await this.config()).customModels].map(model => [model.id, model])).values()];
  }
  async listModels(input: { provider?: unknown; modality?: unknown; query?: unknown; refresh?: unknown; offset?: unknown; limit?: unknown } = {}) {
    if (input.provider !== undefined) providerId(input.provider);
    if (input.modality !== undefined) modality(input.modality);
    if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 200)) throw new Error('Invalid model search');
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') throw new Error('refresh must be boolean');
    const warnings: string[] = [];
    if (input.refresh) {
      const selected = (['atlascloud', 'fal'] as const).filter(id => !input.provider || input.provider === id);
      const discovered = await Promise.all(selected.map(async id => {
        try { return await discoverModels(id, String(input.query ?? ''), this.options.fetcher ?? fetch); }
        catch { warnings.push(`${providerLabels[id]} catalogue unavailable; showing cached and built-in models`); return []; }
      }));
      await this.store.lock(async () => {
        const cached = await readJson<Model[]>(path.join(this.root, 'catalog.json'), []);
        const merged = [...new Map([...cached, ...discovered.flat()].map(model => [model.id, model])).values()].slice(-5000);
        await atomic(path.join(this.root, 'catalog.json'), merged);
      });
    }
    const query = String(input.query ?? '').toLowerCase();
    const all = (await this.models()).filter(model => (!input.provider || model.provider === input.provider) && (!input.modality || model.modality === input.modality)
      && (!query || `${model.id} ${model.label} ${model.mode} ${model.description ?? ''}`.toLowerCase().includes(query)));
    const offset = input.offset ?? 0, limit = input.limit ?? 100;
    if (!Number.isInteger(offset) || Number(offset) < 0 || !Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) throw new Error('Invalid model pagination');
    return { models: all.slice(Number(offset), Number(offset) + Number(limit)), total: all.length,
      nextOffset: Number(offset) + Number(limit) < all.length ? Number(offset) + Number(limit) : null, warnings };
  }
  async registerModel(input: { provider?: unknown; modelId?: unknown; label?: unknown; modality?: unknown; mode?: unknown; defaults?: unknown }) {
    providerId(input.provider); validModelId(input.modelId); modality(input.modality);
    if (input.provider === 'codex') throw new Error('Codex exposes its built-in image model only');
    if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 180) throw new Error('A model label is required');
    if (typeof input.mode !== 'string' || !/^[a-z-]{3,60}$/.test(input.mode)) throw new Error('A generation mode is required');
    const model: Model = { id: modelKey(input.provider, input.modelId), provider: input.provider, modelId: input.modelId, label: input.label.trim(),
      modality: input.modality, mode: input.mode, source: 'custom', defaults: parameters(input.defaults) };
    await this.store.lock(async () => { const config = await this.config(); config.customModels = [...config.customModels.filter(m => m.id !== model.id), model]; await atomic(path.join(this.root, 'config.json'), config); });
    return { model };
  }
  async setRoute(kind: unknown, modelId: unknown) {
    modality(kind);
    if (modelId !== null && !(await this.models()).some(m => m.id === modelId && m.modality === kind)) throw new Error('Route must select a model of the same modality');
    await this.store.lock(async () => { const config = await this.config(); if (modelId === null) delete config.routes[kind]; else config.routes[kind] = modelId as string; await atomic(path.join(this.root, 'config.json'), config); });
    return this.status();
  }
  async status(refreshAgents = false): Promise<GatewayStatus> {
    const [config, agents, models] = await Promise.all([this.config(), this.agents(refreshAgents), this.models()]);
    const providers: ProviderState[] = await Promise.all(providerIds.map(async id => {
      const saved = config.providers[id] ?? {}, enabled = saved.enabled !== false;
      if (id === 'codex') {
        const agent = agents.find(a => a.id === id);
        return { id, label: providerLabels[id], enabled, configured: !!agent?.authenticated, available: enabled && !!agent?.available,
          credentialSource: 'local-agent', verification: 'unverified', reason: !enabled ? 'Disabled' : agent?.reason ?? 'Not detected' };
      }
      const credentials = await this.credential(id);
      const verification = credentials.key && saved.keyHash === hash(credentials.key) ? saved.verification ?? 'unverified' : 'unverified';
      return { id, label: providerLabels[id], enabled, configured: !!credentials.key, available: enabled && !!credentials.key && verification !== 'rejected',
        credentialSource: credentials.source, verification, checkedAt: saved.checkedAt,
        reason: !enabled ? 'Disabled' : !credentials.key ? 'API key required' : verification === 'rejected' ? 'Credentials or permissions rejected; update the key' : verification === 'verified' ? 'A generation request succeeded with this key' : 'Configured; availability and quota are checked when generating' };
    }));
    const capabilities = modalities.map(kind => {
      const available = models.filter(model => model.modality === kind && providers.find(p => p.id === model.provider)?.available);
      const selected = config.routes[kind] ? available.find(m => m.id === config.routes[kind]) : available.find(m => m.mode.startsWith('text-to-'));
      return { modality: kind, available: available.length > 0, modelIds: available.map(m => m.id), selectedModelId: selected?.id };
    });
    return { providers, agents, routes: config.routes, capabilities };
  }
  async getJob(id: unknown) {
    if (!uuid(id)) throw new Error('Invalid generation job ID');
    const job = await readJson<GenerationJob | null>(path.join(this.root, 'jobs', id + '.json'), null);
    if (!job) throw new Error('Generation job not found');
    // Jobs preserve their original output paths. Studio can subsequently rename/delete files.
    for (const asset of job.assets) {
      const target = await this.store.safePath(asset.path, this.store.projectDirectoryFor(job.projectId));
      asset.available = await lstat(target).then(info => info.isFile() && !info.isSymbolicLink(), () => false);
    }
    return job;
  }
  async listJobs(projectId?: string) {
    const names = await readdir(path.join(this.root, 'jobs')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error; });
    const jobs = await Promise.all(names.filter(name => uuid(name.slice(0, -5)) && name.endsWith('.json')).map(name => this.getJob(name.slice(0, -5))));
    return jobs.filter(job => !projectId || job.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  }
  private saveJob(job: GenerationJob) { return atomic(path.join(this.root, 'jobs', job.id + '.json'), job); }
  async submit(input: GenerateInput): Promise<GenerationJob> {
    if (!input || typeof input !== 'object') throw new Error('Generation input required');
    modality(input.modality);
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 20_000) throw new Error('Prompt must contain 1–20000 characters');
    const params = parameters(input.parameters);
    if (input.referenceAsset !== undefined && (typeof input.referenceAsset !== 'string' || !input.referenceAsset || input.referenceAsset.length > 1024)) throw new Error('Invalid reference image path');
    if (input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== 'string' || !/^[\w-]{1,100}$/.test(input.idempotencyKey))) throw new Error('Invalid idempotency key');
    if (input.usage && (typeof input.usage !== 'object' || Object.entries(input.usage).some(([key, value]) => !['compositionId', 'elementId', 'property'].includes(key) || typeof value !== 'string' || value.length > 240))) throw new Error('Invalid editor usage context');
    const status = await this.status();
    const selected = input.model ?? status.routes[input.modality] ?? status.capabilities.find(c => c.modality === input.modality)?.selectedModelId;
    const model = (await this.models()).find(m => m.id === selected && m.modality === input.modality);
    const projectId = input.projectId ?? this.store.projectCatalog().activeId;
    const requestHash = hash(JSON.stringify({ projectId, model: input.model ?? null, modality: input.modality, prompt: input.prompt, parameters: params, usage: input.usage, ...(input.referenceAsset ? { referenceAsset: input.referenceAsset } : {}) }));
    return this.store.lock(async () => {
      if (!this.store.projectCatalog().projects.some(p => p.id === projectId)) throw new Error('Project not found');
      const entry = await this.store.safePath('index.html', this.store.projectDirectoryFor(projectId));
      await lstat(entry).catch(() => { throw new Error('Open a project before generating media'); });
      const jobs = await this.listJobs();
      const previous = input.idempotencyKey ? jobs.find(j => j.idempotencyKey === input.idempotencyKey && j.projectId === projectId) : undefined;
      if (previous) { if (previous.requestHash !== requestHash) throw new Error('Idempotency key was already used for another request'); return previous; }
      if (!model || !status.providers.find(p => p.id === model.provider)?.available) throw new Error('Selected model is unavailable; configure an available provider or choose a different model');
      if (input.referenceAsset && (model.provider !== 'codex' || !model.supportsImageReference || input.modality !== 'image')) throw new Error('Selected model does not support reference image editing');
      if (jobs.filter(j => j.state === 'queued' || j.state === 'running').length >= 20) throw new Error('Generation queue is full (20 jobs)');
      const job: GenerationJob = { id: randomUUID(), projectId, state: 'queued', modality: input.modality, prompt: input.prompt.trim(), model,
        parameters: params, usage: input.usage, idempotencyKey: input.idempotencyKey, requestHash,
        createdAt: Date.now(), updatedAt: Date.now(), phase: 'queued', assets: [] };
      const work = path.join(this.root, 'work', job.id);
      try {
        if (input.referenceAsset) {
          const source = await this.store.safePath(input.referenceAsset, this.store.projectDirectoryFor(projectId));
          const info = await lstat(source);
          if (!info.isFile() || info.isSymbolicLink() || info.size > 20 * 1024 * 1024) throw new Error('Reference image must be a local file under 20 MB');
          const bytes = await readFile(source), media = mediaType(bytes, 'image');
          if (bytes.length > 20 * 1024 * 1024) throw new Error('Reference image exceeds 20 MB');
          if (!['png', 'jpg', 'webp'].includes(media.extension)) throw new Error('Use a PNG, JPEG or WebP reference image');
          job.reference = { path: input.referenceAsset, sha256: hash(bytes), mimeType: media.mimeType, bytes: bytes.length };
          await mkdir(work, { recursive: true, mode: 0o700 });
          await writeFile(path.join(work, 'reference.' + media.extension), bytes, { flag: 'wx', mode: 0o600 });
        }
        await this.saveJob(job); return job;
      } catch (error) { await rm(work, { recursive: true, force: true }); throw error; }
    });
  }
  async cancel(id: unknown) {
    const job = await this.store.lock(async () => {
      const job = await this.getJob(id);
      if (job.state === 'queued' || job.state === 'running') { job.state = 'cancelled'; job.phase = 'cancelled'; job.updatedAt = Date.now(); await this.saveJob(job); }
      return job;
    });
    this.active.get(job.id)?.controller.abort();
    if (job.state === 'cancelled' && !job.startedAt) await rm(path.join(this.root, 'work', job.id), { recursive: true, force: true });
    return job;
  }
  private async verifyKey(id: ProviderId, key: string, verification: 'verified' | 'rejected') {
    if (id === 'codex' || !key) return;
    await this.store.lock(async () => {
      if ((await this.credential(id)).key !== key) return;
      const config = await this.config(); config.providers[id] = { ...config.providers[id], verification, keyHash: hash(key), checkedAt: Date.now() };
      await atomic(path.join(this.root, 'config.json'), config);
    });
  }
  async tick() {
    if (this.ticking || this.closed) return;
    this.ticking = true;
    try {
      const claimed = await this.store.lock(async () => {
        const jobs = await this.listJobs();
        for (const job of jobs.filter(j => j.state === 'running' && !alive(j.workerPid))) {
          job.state = 'failed'; job.phase = 'interrupted'; job.error = 'Worker stopped; request was not automatically resubmitted. Check provider history before retrying.'; job.updatedAt = Date.now(); await this.saveJob(job);
          await rm(path.join(this.root, 'work', job.id), { recursive: true, force: true });
        }
        const capacity = Math.max(0, 2 - jobs.filter(j => j.state === 'running').length);
        const next = jobs.filter(j => j.state === 'queued').reverse().slice(0, capacity);
        for (const job of next) { job.state = 'running'; job.phase = 'starting'; job.startedAt = Date.now(); job.updatedAt = Date.now(); job.workerPid = process.pid; await this.saveJob(job); }
        return next;
      });
      for (const job of claimed) {
        const controller = new AbortController();
        const done = this.run(job, controller).catch(() => {
          // A storage failure must not become an unhandled rejection or retry a paid request.
          console.error(`Model gateway could not persist job ${job.id}; check local data storage`);
        }).finally(() => this.active.delete(job.id));
        this.active.set(job.id, { controller, done });
      }
    } finally { this.ticking = false; }
  }
  private async run(job: GenerationJob, controller: AbortController) {
    const dir = path.join(this.root, 'work', job.id);
    let key = '';
    const timeout = setTimeout(() => controller.abort(new Error('Generation timed out')), 15 * 60_000);
    let checking = false;
    const cancelPoll = setInterval(() => {
      if (checking) return; checking = true;
      void this.getJob(job.id).then(latest => { if (latest.state === 'cancelled') controller.abort(); }).catch(() => controller.abort()).finally(() => { checking = false; });
    }, 500);
    const progress = async (phase: string, remoteId?: string) => {
      await this.store.lock(async () => { const current = await this.getJob(job.id); if (current.state !== 'running') { controller.abort(); return; }
        current.phase = phase; if (remoteId) current.remoteId = remoteId; current.updatedAt = Date.now(); await this.saveJob(current); });
    };
    try {
      key = (await this.credential(job.model.provider)).key;
      const provider = (await this.status()).providers.find(p => p.id === job.model.provider);
      if (!provider?.available) throw new Error('Provider is no longer available');
      await mkdir(dir, { recursive: true, mode: 0o700 });
      let buffers: Buffer[];
      if (job.model.provider === 'codex') {
        await progress('generating');
        const reference = job.reference ? path.join(dir, 'reference.' + (job.reference.mimeType === 'image/jpeg' ? 'jpg' : job.reference.mimeType.split('/')[1])) : undefined;
        buffers = [await (this.options.codex ?? generateCodexImage)(job.prompt + (Object.keys(job.parameters).length ? '\nImage options: ' + JSON.stringify(job.parameters) : ''), dir, controller.signal, reference)];
      } else {
        const urls = await providerAdapters[job.model.provider].generate(job, { key, fetcher: this.options.fetcher ?? fetch, signal: controller.signal, progress, pollMs: this.options.pollMs });
        await this.verifyKey(job.model.provider, key, 'verified');
        await progress('downloading');
        buffers = [];
        for (const url of urls) buffers.push(await (this.options.download ?? downloadMedia)(url, controller.signal));
      }
      const files = buffers.map((bytes, i) => { const media = mediaType(bytes, job.modality); return { bytes, mimeType: media.mimeType, path: `assets/generated/${job.id}-${i + 1}.${media.extension}` }; });
      controller.signal.throwIfAborted();
      await this.store.lock(async () => {
        const current = await this.getJob(job.id); if (current.state !== 'running') return;
        const project = this.store.projectDirectoryFor(job.projectId);
        if (!this.store.projectCatalog().projects.some(p => p.id === job.projectId)) throw new Error('Target project no longer exists');
        const targets: string[] = [];
        try {
          for (const file of files) {
            controller.signal.throwIfAborted();
            const target = await this.store.safePath(file.path, project);
            await mkdir(path.dirname(target), { recursive: true });
            const staged = path.join(dir, path.basename(file.path));
            await writeFile(staged, file.bytes, { flag: 'wx', mode: 0o600 });
            await link(staged, target); targets.push(target);
          }
          current.state = 'completed'; current.phase = 'completed'; current.updatedAt = Date.now();
          current.assets = files.map(file => ({ path: file.path, mimeType: file.mimeType, bytes: file.bytes.length }));
          await this.saveJob(current);
        } catch (error) { await Promise.all(targets.map(target => rm(target, { force: true }))); throw error; }
      });
    } catch (error) {
      if (error instanceof ProviderError && (error.status === 401 || error.status === 403)) await this.verifyKey(job.model.provider, key, 'rejected');
      await this.store.lock(async () => {
        const current = await this.getJob(job.id); if (current.state !== 'running') return;
        current.state = 'failed'; current.phase = 'failed'; current.updatedAt = Date.now();
        let message = controller.signal.aborted ? 'Generation stopped or timed out; no automatic retry was made' : error instanceof Error ? error.message : 'Generation failed';
        if (key) message = message.replaceAll(key, '[redacted]');
        current.error = message.slice(0, 500); await this.saveJob(current);
      });
    } finally { clearTimeout(timeout); clearInterval(cancelPoll); await rm(dir, { recursive: true, force: true }); }
  }
  async close() { this.closed = true; for (const task of this.active.values()) task.controller.abort(); await Promise.allSettled([...this.active.values()].map(task => task.done)); }
}
const gateways = new WeakMap<WorkspaceStore, ModelGateway>();
export function gatewayFor(store: WorkspaceStore) {
  store = store.workspaceStore ?? store;
  let gateway = gateways.get(store); if (!gateway) { gateway = new ModelGateway(store); gateways.set(store, gateway); } return gateway;
}
