#!/usr/bin/env node
// Batch-create and optionally run one design brief across multiple design
// systems through the public daemon API. Intended for fast visual regression
// sweeps while iterating on DESIGN.md files.
//
// Usage (daemon must be running — e.g. `pnpm tools-dev`):
//   node --experimental-strip-types scripts/batch-design-system-test.ts \
//     --prompt "Design a pricing landing page for an AI notes app" \
//     --design-systems default,kami \
//     --skill open-design-landing \
//     --agent claude
//
// Config-file equivalent:
//   node --experimental-strip-types scripts/batch-design-system-test.ts --config batch-ds.json
//
//   {
//     "prompt": "Design a pricing landing page for an AI notes app",
//     "designSystems": ["default", "kami"],
//     "skillId": "open-design-landing",
//     "agentId": "claude",
//     "metadata": { "kind": "prototype", "platform": "responsive" },
//     "concurrency": 2,
//     "timeoutMs": 900000,
//     "output": ".tmp/design-system-batch.jsonl"
//   }

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const RUN_PREFIX = 'ds-batch-';
const FALLBACK_AGENT_ID = 'claude';
const DEFAULT_KIND = 'prototype';
const DEFAULT_PLATFORM = 'responsive';
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 1_500;

type ProjectKind = 'prototype' | 'deck' | 'template' | 'other' | 'image' | 'video' | 'audio';

interface ProjectMetadata {
  kind: ProjectKind;
  platform?: string;
  [key: string]: unknown;
}

interface BatchConfig {
  daemonUrl?: string | null;
  prompt?: string;
  promptFile?: string;
  designSystems?: string[];
  allDesignSystems?: boolean;
  agentId?: string;
  skillId?: string | null;
  model?: string | null;
  reasoning?: string | null;
  namePrefix?: string;
  metadata?: ProjectMetadata;
  customInstructions?: string | null;
  skipDiscoveryBrief?: boolean;
  startRuns?: boolean;
  wait?: boolean;
  concurrency?: number;
  timeoutMs?: number;
  output?: string | null;
  dryRun?: boolean;
}

interface Args extends BatchConfig {
  configPath?: string;
}

interface CreateProjectResponse {
  project: { id: string; name: string; designSystemId: string | null };
  conversationId?: string;
}

interface RunCreateResponse {
  runId: string;
}

interface RunStatusResponse {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  exitCode?: number | null;
  error?: string | null;
  updatedAt?: number;
}

interface ProjectFilesResponse {
  files?: unknown[];
}

interface DesignSystemsResponse {
  designSystems?: Array<{ id: string; title?: string }>;
  systems?: Array<{ id: string; title?: string }>;
}

interface AppConfigResponse {
  config?: {
    agentId?: string | null;
  };
}

interface BatchResult {
  designSystemId: string;
  projectId: string;
  projectName: string;
  conversationId: string | null;
  runId: string | null;
  status: 'created' | RunStatusResponse['status'];
  daemonUrl: string;
  error?: string;
}

interface AssistantMessageUpdate {
  role: 'assistant';
  content: string;
  agentId: string;
  agentName: string;
  runId: string;
  runStatus: RunStatusResponse['status'];
  startedAt: number;
  createdAt: number;
  endedAt?: number;
  producedFiles?: unknown[];
}

type RunTimeoutError = Error & {
  code: 'RUN_TIMEOUT';
  runId: string;
  lastStatus?: RunStatusResponse['status'];
};

function buildRunPrompt(prompt: string, skipDiscoveryBrief: boolean): string {
  if (!skipDiscoveryBrief) return prompt;
  // The persisted skipDiscoveryBrief flag is understood by newer daemons, but
  // this script is often run against an already-started daemon while developing
  // the branch. Include the user-level escape hatch too so older daemons still
  // bypass the discovery form and actually build files.
  return `skip questions, just build. no questions, go.\n\n${prompt}`;
}

function extractAgentTextFromSse(body: string): string {
  const chunks: string[] = [];
  for (const block of body.split(/\n\n+/)) {
    const eventLine = block.split('\n').find((line) => line.startsWith('event:'));
    if (eventLine?.slice('event:'.length).trim() !== 'agent') continue;
    const dataLines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart());
    if (dataLines.length === 0) continue;
    try {
      const payload = JSON.parse(dataLines.join('\n')) as { type?: string; delta?: unknown };
      if (payload.type === 'text_delta' && typeof payload.delta === 'string') chunks.push(payload.delta);
    } catch {
      // Ignore malformed/non-JSON event payloads.
    }
  }
  return chunks.join('');
}

function printHelp(): void {
  console.log(`Usage: node --experimental-strip-types scripts/batch-design-system-test.ts [opts]

Creates one project per design system with the same prompt. By default it also
starts an agent run and waits for every run to finish.

Required input:
  --prompt <text>              Brief to run for every design system.
  --prompt-file <path>         Read the brief from a file instead of --prompt.
  --design-systems <ids>       Comma-separated design system ids, e.g. default,kami.
  --design-system <id>         Add one design system id. Can be repeated.
  --all-design-systems         Use every design system reported by the daemon.
  --config <path>              JSON config file. CLI flags override config values.

Run/project options:
  --daemon <url>               Daemon base URL. Falls back to OD_DAEMON_URL,
                               OD_PORT, then tools-dev status discovery.
  --agent <id>                 Agent id for /api/runs. Default: daemon's saved
                               app config agentId, then ${FALLBACK_AGENT_ID}.
  --skill <id|null>            Skill/design-template id to bind to each project.
  --model <id>                 Optional per-run model override.
  --reasoning <id>             Optional per-run reasoning override.
  --kind <kind>                Project kind metadata. Default: ${DEFAULT_KIND}.
  --platform <platform>        Project platform metadata. Default: ${DEFAULT_PLATFORM}.
  --metadata <json>            Extra metadata JSON merged into project metadata.
  --custom-instructions <txt>  Project-level custom instructions.
  --name-prefix <text>         Project name prefix. Default includes timestamp.
  --no-skip-discovery          Do not set skipDiscoveryBrief on created projects.

Batch options:
  --concurrency <n>            Parallel project/run count. Default: 1.
  --timeout-ms <n>             Per-run wait timeout. Default: ${DEFAULT_TIMEOUT_MS}.
  --create-only                Create projects but do not start agent runs.
  --no-wait                    Start runs and return after run ids are created.
  --output <path>              Write JSONL results to a file.
  --dry-run                    Print the resolved plan without calling daemon.
  -h, --help                   Show this help.

Example config:
  {
    "prompt": "Build a responsive pricing page for an AI notes app",
    "designSystems": ["default", "kami"],
    "skillId": "open-design-landing",
    "agentId": "claude",
    "metadata": { "kind": "prototype", "platform": "responsive" },
    "concurrency": 2,
    "timeoutMs": 900000,
    "output": ".tmp/design-system-batch.jsonl"
  }
`);
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function dedupeDesignSystemIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function validateExplicitDesignSystemIds(requestedIds: string[], availableIds: string[]): string[] {
  const requested = dedupeDesignSystemIds(requestedIds);
  const available = new Set(availableIds.map((id) => id.trim()).filter(Boolean));
  const unknown = requested.filter((id) => !available.has(id));
  if (unknown.length > 0) {
    throw new Error(`unknown design system id(s): ${unknown.join(', ')}`);
  }
  return requested;
}

export function buildAssistantMessageUpdate(params: {
  agentId: string;
  runId: string;
  runStatus: RunStatusResponse['status'];
  createdAt: number;
  content?: string;
  endedAt?: number;
  producedFiles?: unknown[];
}): AssistantMessageUpdate {
  const { agentId, runId, runStatus, createdAt, content = '', endedAt, producedFiles } = params;
  return {
    role: 'assistant',
    content,
    agentId,
    agentName: agentId,
    runId,
    runStatus,
    startedAt: createdAt,
    createdAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    ...(producedFiles !== undefined ? { producedFiles } : {}),
  };
}

export function createRunTimeoutError(
  runId: string,
  timeoutMs: number,
  lastStatus?: RunStatusResponse['status'],
): RunTimeoutError {
  const error = new Error(
    `run timed out after ${timeoutMs}ms${lastStatus ? ` (last status: ${lastStatus})` : ''}`,
  ) as RunTimeoutError;
  error.code = 'RUN_TIMEOUT';
  error.runId = runId;
  if (lastStatus !== undefined) error.lastStatus = lastStatus;
  return error;
}

function isRunTimeoutError(error: unknown): error is RunTimeoutError {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'RUN_TIMEOUT' &&
    typeof (error as { runId?: unknown }).runId === 'string'
  );
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  const designSystems: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${flag} requires a value`);
      return value;
    };
    if (flag === '--config') out.configPath = next();
    else if (flag === '--daemon' || flag === '--daemon-url') out.daemonUrl = next();
    else if (flag === '--prompt') out.prompt = next();
    else if (flag === '--prompt-file') out.promptFile = next();
    else if (flag === '--design-systems') designSystems.push(...parseCsv(next()));
    else if (flag === '--design-system') designSystems.push(next());
    else if (flag === '--all-design-systems') out.allDesignSystems = true;
    else if (flag === '--agent') out.agentId = next();
    else if (flag === '--skill') {
      const value = next();
      out.skillId = value === 'null' || value === 'none' ? null : value;
    } else if (flag === '--model') out.model = next();
    else if (flag === '--reasoning') out.reasoning = next();
    else if (flag === '--kind') {
      out.metadata = { ...(out.metadata ?? { kind: DEFAULT_KIND }), kind: next() as ProjectKind };
    } else if (flag === '--platform') {
      out.metadata = { ...(out.metadata ?? { kind: DEFAULT_KIND }), platform: next() };
    } else if (flag === '--metadata') {
      const metadata = parseJsonObject(next(), '--metadata');
      out.metadata = { ...(out.metadata ?? { kind: DEFAULT_KIND }), ...metadata } as ProjectMetadata;
    } else if (flag === '--custom-instructions') out.customInstructions = next();
    else if (flag === '--name-prefix') out.namePrefix = next();
    else if (flag === '--no-skip-discovery') out.skipDiscoveryBrief = false;
    else if (flag === '--concurrency') out.concurrency = positiveInteger(next(), '--concurrency');
    else if (flag === '--timeout-ms') out.timeoutMs = positiveInteger(next(), '--timeout-ms');
    else if (flag === '--create-only') out.startRuns = false;
    else if (flag === '--no-wait') out.wait = false;
    else if (flag === '--output') out.output = next();
    else if (flag === '--dry-run') out.dryRun = true;
    else if (flag === '-h' || flag === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${flag}`);
    }
  }
  if (designSystems.length > 0) out.designSystems = designSystems;
  return out;
}

function positiveInteger(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} must be a positive integer`);
  return n;
}

async function readConfig(pathLike: string | undefined): Promise<BatchConfig> {
  if (!pathLike) return {};
  const absolute = path.resolve(REPO_ROOT, pathLike);
  const parsed = JSON.parse(await readFile(absolute, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`config must be a JSON object: ${pathLike}`);
  }
  return parsed as BatchConfig;
}

function mergeConfig(fileConfig: BatchConfig, cli: Args): BatchConfig {
  const merged: BatchConfig = { ...fileConfig, ...cli };
  delete (merged as { configPath?: string }).configPath;
  merged.metadata = {
    kind: DEFAULT_KIND,
    platform: DEFAULT_PLATFORM,
    ...(fileConfig.metadata ?? {}),
    ...(cli.metadata ?? {}),
  };
  if (cli.designSystems) merged.designSystems = cli.designSystems;
  return merged;
}

function isDiscoverablePort(value: string | undefined): value is string {
  if (value == null || value.length === 0) return false;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 65536;
}

async function discoverDaemonUrlFromToolsDev(): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    let child;
    try {
      child = spawn('pnpm', ['--silent', 'exec', 'tools-dev', 'status', '--json'], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    child.stderr?.resume();
    child.on('error', () => resolve(null));
    child.on('exit', () => resolve(extractDaemonUrlFromStatusOutput(stdout)));
  });
}

function extractDaemonUrlFromStatusOutput(stdout: string): string | null {
  for (let i = stdout.indexOf('{'); i !== -1; i = stdout.indexOf('{', i + 1)) {
    try {
      const parsed = JSON.parse(stdout.slice(i)) as {
        apps?: { daemon?: { url?: string | null } };
        url?: string | null;
      };
      const url = parsed.apps?.daemon?.url ?? parsed.url ?? null;
      if (typeof url === 'string' && url.length > 0) return url;
    } catch {
      // try the next possible JSON object
    }
  }
  return null;
}

async function resolveDaemonUrl(config: BatchConfig): Promise<string> {
  if (config.daemonUrl) return config.daemonUrl;
  if (process.env.OD_DAEMON_URL) return process.env.OD_DAEMON_URL;
  if (isDiscoverablePort(process.env.OD_PORT)) return `http://127.0.0.1:${process.env.OD_PORT}`;
  const discovered = await discoverDaemonUrlFromToolsDev();
  if (discovered) return discovered;
  throw new Error('cannot determine daemon URL; start `pnpm tools-dev` or pass --daemon <url>');
}

async function api<T = unknown>(daemonUrl: string, method: string, pathPart: string, body?: unknown): Promise<T> {
  const url = `${daemonUrl.replace(/\/$/, '')}${pathPart}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (err) {
    throw new Error(`cannot reach daemon at ${daemonUrl}: ${(err as Error).message || String(err)}`);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`${method} ${pathPart} → ${resp.status}: ${text}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

async function resolvePrompt(config: BatchConfig): Promise<string> {
  if (typeof config.prompt === 'string' && config.prompt.trim()) return config.prompt.trim();
  if (config.promptFile) return (await readFile(path.resolve(REPO_ROOT, config.promptFile), 'utf8')).trim();
  throw new Error('missing prompt: pass --prompt, --prompt-file, or config.prompt');
}

export function resolveDryRunDesignSystems(config: BatchConfig): string[] {
  if (config.allDesignSystems) {
    throw new Error('dry-run with --all-design-systems still requires daemon access; pass explicit --design-systems instead');
  }
  const ids = config.designSystems ?? [];
  if (ids.length === 0) {
    throw new Error('missing design systems: pass --design-systems, --design-system, --all-design-systems, or config.designSystems');
  }
  return dedupeDesignSystemIds(ids);
}

async function resolveDesignSystems(daemonUrl: string, config: BatchConfig): Promise<string[]> {
  const body = await api<DesignSystemsResponse>(daemonUrl, 'GET', '/api/design-systems');
  const systems = body.designSystems ?? body.systems ?? [];
  const availableIds = dedupeDesignSystemIds(systems.map((system) => system.id));
  if (availableIds.length === 0) throw new Error('daemon returned no design systems');
  if (config.allDesignSystems) {
    return availableIds;
  }
  const ids = config.designSystems ?? [];
  if (ids.length === 0) {
    throw new Error('missing design systems: pass --design-systems, --design-system, --all-design-systems, or config.designSystems');
  }
  return validateExplicitDesignSystemIds(ids, availableIds);
}

async function resolveAgentId(daemonUrl: string, config: BatchConfig): Promise<string> {
  if (typeof config.agentId === 'string' && config.agentId.trim()) return config.agentId.trim();
  try {
    const body = await api<AppConfigResponse>(daemonUrl, 'GET', '/api/app-config');
    const configured = body.config?.agentId;
    if (typeof configured === 'string' && configured.trim()) return configured.trim();
  } catch (err) {
    process.stderr.write(
      `warning: could not read daemon app config; falling back to ${FALLBACK_AGENT_ID}: ${(err as Error).message || String(err)}\n`,
    );
  }
  return FALLBACK_AGENT_ID;
}

function makeProjectId(designSystemId: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  const slug = designSystemId.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 50);
  return `${RUN_PREFIX}${slug}-${ts}-${rand}`.slice(0, 128);
}

function makeMessageId(kind: 'user' | 'assistant'): string {
  return `${RUN_PREFIX}${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatBatchTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function terminal(status: RunStatusResponse['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

async function waitForRun(daemonUrl: string, runId: string, timeoutMs: number): Promise<RunStatusResponse> {
  const deadline = Date.now() + timeoutMs;
  let last: RunStatusResponse | null = null;
  while (Date.now() < deadline) {
    last = await api<RunStatusResponse>(daemonUrl, 'GET', `/api/runs/${encodeURIComponent(runId)}`);
    if (terminal(last.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw createRunTimeoutError(runId, timeoutMs, last?.status);
}

export async function cancelTimedOutRun(daemonUrl: string, error: unknown): Promise<boolean> {
  if (!isRunTimeoutError(error)) return false;
  await api<{ ok: true }>(
    daemonUrl,
    'POST',
    `/api/runs/${encodeURIComponent(error.runId)}/cancel`,
    {},
  );
  return true;
}

async function readRunAssistantText(daemonUrl: string, runId: string): Promise<string> {
  const body = await fetch(`${daemonUrl.replace(/\/$/, '')}/api/runs/${encodeURIComponent(runId)}/events`).then((resp) => {
    if (!resp.ok) throw new Error(`GET /api/runs/${runId}/events → ${resp.status}`);
    return resp.text();
  });
  return extractAgentTextFromSse(body);
}

async function appendJsonl(output: string | null | undefined, row: BatchResult): Promise<void> {
  if (!output) return;
  const absolute = path.resolve(REPO_ROOT, output);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(row)}\n`, { flag: 'a' });
}

async function runOne(params: {
  daemonUrl: string;
  prompt: string;
  designSystemId: string;
  config: Required<Pick<BatchConfig, 'agentId' | 'startRuns' | 'wait' | 'skipDiscoveryBrief' | 'timeoutMs'>> & BatchConfig;
}): Promise<BatchResult> {
  const { daemonUrl, prompt, designSystemId, config } = params;
  const runPrompt = buildRunPrompt(prompt, config.skipDiscoveryBrief);
  const projectId = makeProjectId(designSystemId);
  const projectName = `${config.namePrefix ?? 'DS batch'} — ${designSystemId} — ${formatBatchTimestamp(new Date())}`;
  const metadata: ProjectMetadata = {
    kind: DEFAULT_KIND,
    platform: DEFAULT_PLATFORM,
    ...(config.metadata ?? {}),
    source: 'batch-design-system-test',
    batchDesignSystemTest: true,
  };

  const created = await api<CreateProjectResponse>(daemonUrl, 'POST', '/api/projects', {
    id: projectId,
    name: projectName,
    skillId: config.skillId ?? null,
    designSystemId,
    pendingPrompt: runPrompt,
    metadata,
    customInstructions: config.customInstructions ?? undefined,
    skipDiscoveryBrief: config.skipDiscoveryBrief,
  });
  const conversationId = created.conversationId ?? null;
  if (!config.startRuns) {
    return { designSystemId, projectId, projectName, conversationId, runId: null, status: 'created', daemonUrl };
  }
  if (!conversationId) throw new Error('daemon did not return conversationId');

  const now = Date.now();
  const userMessageId = makeMessageId('user');
  const assistantMessageId = makeMessageId('assistant');
  await api(daemonUrl, 'PUT', `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`, {
    role: 'user',
    content: runPrompt,
    createdAt: now,
  });
  await api(daemonUrl, 'PUT', `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`, {
    role: 'assistant',
    content: '',
    agentId: config.agentId,
    agentName: config.agentId,
    runStatus: 'queued',
    startedAt: now,
    createdAt: now,
  });

  const run = await api<RunCreateResponse>(daemonUrl, 'POST', '/api/runs', {
    agentId: config.agentId,
    message: runPrompt,
    currentPrompt: runPrompt,
    projectId,
    conversationId,
    assistantMessageId,
    clientRequestId: `${RUN_PREFIX}${projectId}`,
    skillId: config.skillId ?? null,
    designSystemId,
    model: config.model ?? null,
    reasoning: config.reasoning ?? null,
  });
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
    buildAssistantMessageUpdate({
      agentId: config.agentId,
      runId: run.runId,
      runStatus: 'queued',
      createdAt: now,
    }),
  );
  if (!config.wait) {
    return { designSystemId, projectId, projectName, conversationId, runId: run.runId, status: 'queued', daemonUrl };
  }

  let finalStatus: RunStatusResponse;
  try {
    finalStatus = await waitForRun(daemonUrl, run.runId, config.timeoutMs);
  } catch (err) {
    try {
      const canceled = await cancelTimedOutRun(daemonUrl, err);
      if (canceled) {
        process.stderr.write(`warning: canceled timed-out run ${run.runId} for ${designSystemId}\n`);
      }
    } catch (cancelErr) {
      process.stderr.write(
        `warning: failed to cancel timed-out run ${run.runId} for ${designSystemId}: ${(cancelErr as Error).message || String(cancelErr)}\n`,
      );
    }
    throw err;
  }
  const assistantText = await readRunAssistantText(daemonUrl, run.runId).catch(() => '');
  const producedFiles = await api<ProjectFilesResponse>(daemonUrl, 'GET', `/api/projects/${projectId}/files`)
    .then((body) => body.files ?? [])
    .catch(() => []);
  const endedAt = Date.now();
  await api(
    daemonUrl,
    'PUT',
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
    buildAssistantMessageUpdate({
      agentId: config.agentId,
      runId: run.runId,
      runStatus: finalStatus.status,
      createdAt: now,
      content: assistantText,
      endedAt,
      producedFiles,
    }),
  ).catch((err) => {
    process.stderr.write(`warning: failed to persist assistant message for ${designSystemId}: ${(err as Error).message || String(err)}\n`);
  });
  return {
    designSystemId,
    projectId,
    projectName,
    conversationId,
    runId: run.runId,
    status: finalStatus.status,
    daemonUrl,
    ...(finalStatus.error ? { error: finalStatus.error } : {}),
  };
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function loop(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => loop()));
  return results;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const fileConfig = await readConfig(cli.configPath);
  const config = mergeConfig(fileConfig, cli);
  const prompt = await resolvePrompt(config);
  const resolved = {
    ...config,
    agentId: typeof config.agentId === 'string' && config.agentId.trim() ? config.agentId.trim() : FALLBACK_AGENT_ID,
    startRuns: config.startRuns ?? true,
    wait: config.wait ?? true,
    skipDiscoveryBrief: config.skipDiscoveryBrief ?? true,
    concurrency: config.concurrency ?? 1,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  if (resolved.dryRun) {
    const designSystems = resolveDryRunDesignSystems(config);
    const daemonUrl =
      config.daemonUrl ??
      process.env.OD_DAEMON_URL ??
      (isDiscoverablePort(process.env.OD_PORT) ? `http://127.0.0.1:${process.env.OD_PORT}` : '(not resolved in dry-run)');

    console.log(`design-system batch → ${daemonUrl}`);
    console.log(`prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);
    console.log(`design systems (${designSystems.length}): ${designSystems.join(', ')}`);
    console.log(`agent=${resolved.agentId} skill=${resolved.skillId ?? 'null'} startRuns=${resolved.startRuns} wait=${resolved.wait} concurrency=${resolved.concurrency}`);
    return;
  }

  const daemonUrl = await resolveDaemonUrl(config);
  const designSystems = await resolveDesignSystems(daemonUrl, config);
  resolved.agentId = await resolveAgentId(daemonUrl, config);

  console.log(`design-system batch → ${daemonUrl}`);
  console.log(`prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);
  console.log(`design systems (${designSystems.length}): ${designSystems.join(', ')}`);
  console.log(`agent=${resolved.agentId} skill=${resolved.skillId ?? 'null'} startRuns=${resolved.startRuns} wait=${resolved.wait} concurrency=${resolved.concurrency}`);

  if (resolved.output) {
    const absolute = path.resolve(REPO_ROOT, resolved.output);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, '');
  }

  const failures: BatchResult[] = [];
  const results = await runWithConcurrency(designSystems, resolved.concurrency, async (designSystemId) => {
    process.stdout.write(`  - ${designSystemId}: creating\n`);
    try {
      const row = await runOne({ daemonUrl, prompt, designSystemId, config: resolved });
      await appendJsonl(resolved.output, row);
      process.stdout.write(`  ✓ ${designSystemId}: ${row.status} project=${row.projectId}${row.runId ? ` run=${row.runId}` : ''}\n`);
      if (row.status === 'failed' || row.status === 'canceled') failures.push(row);
      return row;
    } catch (err) {
      const row: BatchResult = {
        designSystemId,
        projectId: '',
        projectName: '',
        conversationId: null,
        runId: null,
        status: 'failed',
        daemonUrl,
        error: (err as Error).message || String(err),
      };
      await appendJsonl(resolved.output, row);
      failures.push(row);
      process.stderr.write(`  ! ${designSystemId}: ${row.error}\n`);
      return row;
    }
  });

  const succeeded = results.filter((r) => r.status === 'created' || r.status === 'queued' || r.status === 'succeeded').length;
  console.log(`done: ${succeeded}/${results.length} ok${resolved.output ? `; results: ${resolved.output}` : ''}`);
  if (failures.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
