import { readFile, link, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

import { resolveDaemonUrl } from '../daemon-url.js';

type StoreScreenshotCommand =
  | 'create'
  | 'upload'
  | 'generate'
  | 'validate'
  | 'export'
  | 'status'
  | 'versions'
  | 'restore';

type StoreScreenshotApiPlatform = 'appStore' | 'googlePlay';

interface StoreScreenshotJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'interrupted';
  progress?: { completed: number; total: number };
  error?: { code?: string; message?: string };
  [key: string]: unknown;
}

interface ParsedStoreScreenshotArgs {
  command: string | undefined;
  positionals: string[];
  flags: {
    daemonUrl?: string;
    input?: string;
    promptFile?: string;
    platform?: string;
    output?: string;
    json: boolean;
    wait: boolean;
    help: boolean;
  };
}

interface StoreScreenshotCliResult {
  exitCode: number;
}

export type StoreScreenshotCliFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface StoreScreenshotCliDeps {
  fetchFn?: StoreScreenshotCliFetch | undefined;
  onHttpFailure(response: Response): Promise<unknown>;
  onNetworkFailure(error: unknown, baseUrl: string): never;
  readStdin?: (() => Promise<string>) | undefined;
  stdout?: Pick<NodeJS.WriteStream, 'write'> | undefined;
  stderr?: Pick<NodeJS.WriteStream, 'write'> | undefined;
  pollIntervalMs?: number | undefined;
}

interface PollStoreScreenshotJobOptions {
  baseUrl: string;
  projectId: string;
  jobId: string;
  fetchFn?: StoreScreenshotCliFetch | undefined;
  intervalMs?: number | undefined;
  sleep?: ((milliseconds: number) => Promise<void>) | undefined;
  onHttpFailure(response: Response): Promise<unknown>;
  onNetworkFailure?: ((error: unknown, baseUrl: string) => never) | undefined;
}

interface StoreScreenshotRequestDeps {
  fetchFn: StoreScreenshotCliFetch | undefined;
  onHttpFailure(response: Response): Promise<unknown>;
  onNetworkFailure(error: unknown, baseUrl: string): never;
}

const USAGE = `Usage:
  od store-screenshot create <project-id> [--input <json>] [--json]
  od store-screenshot upload <project-id> <file> [--json]
  od store-screenshot generate <project-id> --prompt-file <path|-> [--json]
  od store-screenshot validate <project-id> [--platform app-store|google-play|all] [--json]
  od store-screenshot export <project-id> [--platform app-store|google-play|all] [--output <dir>] [--wait] [--json]
  od store-screenshot status <project-id> <job-id> [--json]
  od store-screenshot versions <project-id> [--json]
  od store-screenshot restore <project-id> <version> [--json]

Options:
  --daemon-url <url>       Override the Open Design daemon URL.
  --json                   Emit a machine-readable result envelope.
`;

function parseArgs(args: string[]): ParsedStoreScreenshotArgs | { error: string } {
  const [command, ...rest] = args;
  const parsed: ParsedStoreScreenshotArgs = {
    command,
    positionals: [],
    flags: {
      json: false,
      wait: false,
      help: command === 'help' || command === '-h' || command === '--help',
    },
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg == null) continue;
    if (arg === '--help' || arg === '-h') {
      parsed.flags.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed.positionals.push(arg);
      continue;
    }
    if (arg === '--json') {
      parsed.flags.json = true;
      continue;
    }
    if (arg === '--wait') {
      parsed.flags.wait = true;
      continue;
    }
    const option = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    const inlineValue = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : undefined;
    const value = inlineValue ?? rest[++index];
    if (value == null || (inlineValue === undefined && value.startsWith('--'))) {
      return { error: `${option} requires a value` };
    }
    if (option === '--daemon-url') parsed.flags.daemonUrl = value;
    else if (option === '--input') parsed.flags.input = value;
    else if (option === '--prompt-file') parsed.flags.promptFile = value;
    else if (option === '--platform') parsed.flags.platform = value;
    else if (option === '--output') parsed.flags.output = value;
    else return { error: `unknown flag: ${option}. Run with --help for accepted flags.` };
  }
  return parsed;
}

function writeJson(
  value: unknown,
  stream: Pick<NodeJS.WriteStream, 'write'>,
): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(
  message: string,
  stderr: Pick<NodeJS.WriteStream, 'write'>,
  exitCode = 2,
): StoreScreenshotCliResult {
  stderr.write(`${message}\n`);
  return { exitCode };
}

function failStructured(
  code: string,
  message: string,
  stderr: Pick<NodeJS.WriteStream, 'write'>,
): StoreScreenshotCliResult {
  writeJson({ error: { code, message, data: {} } }, stderr);
  return { exitCode: 1 };
}

function platformsFromFlag(
  value: string | undefined,
): StoreScreenshotApiPlatform[] | null {
  const platform = value ?? 'all';
  if (platform === 'app-store') return ['appStore'];
  if (platform === 'google-play') return ['googlePlay'];
  if (platform === 'all') return ['appStore', 'googlePlay'];
  return null;
}

function encodedBasePath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/store-screenshots`;
}

function readJob(payload: unknown): StoreScreenshotJob | null {
  if (!payload || typeof payload !== 'object') return null;
  const job = (payload as { job?: unknown }).job;
  if (!job || typeof job !== 'object') return null;
  const id = (job as { id?: unknown }).id;
  const status = (job as { status?: unknown }).status;
  if (
    typeof id !== 'string'
    || !['queued', 'running', 'done', 'failed', 'interrupted'].includes(String(status))
  ) {
    return null;
  }
  return job as StoreScreenshotJob;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function request(
  url: string,
  init: RequestInit | undefined,
  deps: StoreScreenshotRequestDeps,
  baseUrl: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await (deps.fetchFn ?? fetch)(url, init);
  } catch (error) {
    return deps.onNetworkFailure(error, baseUrl);
  }
  if (!response.ok) {
    await deps.onHttpFailure(response);
    throw new Error('structured HTTP failure handler unexpectedly returned');
  }
  return response;
}

async function requestJson(
  url: string,
  init: RequestInit | undefined,
  deps: StoreScreenshotRequestDeps,
  baseUrl: string,
): Promise<unknown> {
  return request(url, init, deps, baseUrl).then((response) => response.json());
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function readPrompt(
  promptFile: string,
  readStdin: () => Promise<string>,
): Promise<string> {
  if (promptFile === '-') return readStdin();
  return readFile(promptFile, 'utf8');
}

function mimeForUpload(filePath: string): string | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

async function writeDownloadSafely(outputDir: string, body: Buffer): Promise<string> {
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true });
  const destination = join(directory, 'store-screenshots.zip');
  const temporary = join(directory, `.store-screenshots.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    await link(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return destination;
}

function outputSuccess(
  payload: Record<string, unknown>,
  json: boolean,
  stdout: Pick<NodeJS.WriteStream, 'write'>,
  humanMessage: string,
): StoreScreenshotCliResult {
  if (json) writeJson({ ok: true, ...payload }, stdout);
  else stdout.write(`${humanMessage}\n`);
  return { exitCode: 0 };
}

export async function pollStoreScreenshotJob({
  baseUrl,
  projectId,
  jobId,
  fetchFn = fetch,
  intervalMs = 500,
  sleep = defaultSleep,
  onHttpFailure,
  onNetworkFailure,
}: PollStoreScreenshotJobOptions): Promise<StoreScreenshotJob> {
  const jobUrl = `${baseUrl}${encodedBasePath(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  while (true) {
    let response: Response;
    try {
      response = await fetchFn(jobUrl);
    } catch (error) {
      if (onNetworkFailure) return onNetworkFailure(error, baseUrl);
      throw error;
    }
    if (!response.ok) {
      await onHttpFailure(response);
      throw new Error('structured HTTP failure handler unexpectedly returned');
    }
    const job = readJob(await response.json());
    if (!job) throw new Error('Daemon returned an invalid store screenshot job');
    if (job.status !== 'queued' && job.status !== 'running') return job;
    await sleep(intervalMs);
  }
}

export async function runStoreScreenshotCli(
  args: string[],
  deps: StoreScreenshotCliDeps,
): Promise<StoreScreenshotCliResult> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const parsed = parseArgs(args);
  if ('error' in parsed) return fail(parsed.error, stderr);
  if (parsed.flags.help || !parsed.command) {
    stdout.write(USAGE);
    return { exitCode: parsed.command ? 0 : 2 };
  }
  if (![
    'create',
    'upload',
    'generate',
    'validate',
    'export',
    'status',
    'versions',
    'restore',
  ].includes(parsed.command)) {
    return fail(`unknown subcommand: od store-screenshot ${parsed.command}`, stderr);
  }
  const command = parsed.command as StoreScreenshotCommand;
  const [projectId, secondPositional, ...extraPositionals] = parsed.positionals;
  if (!projectId || extraPositionals.length > 0) {
    return fail(`Invalid arguments.\n${USAGE}`, stderr);
  }
  if (command === 'upload' || command === 'status' || command === 'restore') {
    if (!secondPositional) return fail(`Invalid arguments.\n${USAGE}`, stderr);
  } else if (secondPositional) {
    return fail(`Invalid arguments.\n${USAGE}`, stderr);
  }
  if (parsed.flags.output && (!parsed.flags.wait || command !== 'export')) {
    return fail('--output requires `store-screenshot export --wait`', stderr);
  }
  const platforms = platformsFromFlag(parsed.flags.platform);
  if ((command === 'validate' || command === 'export') && !platforms) {
    return fail('--platform must be one of: app-store | google-play | all', stderr);
  }
  if (
    parsed.flags.platform
    && command !== 'validate'
    && command !== 'export'
  ) {
    return fail('--platform is only valid with validate or export', stderr);
  }
  const daemonUrl = await resolveDaemonUrl(
    parsed.flags.daemonUrl ? { flagUrl: parsed.flags.daemonUrl } : {},
  );
  const baseUrl = daemonUrl.replace(/\/$/, '');
  const basePath = encodedBasePath(projectId);
  const requestDeps = {
    fetchFn: deps.fetchFn,
    onHttpFailure: deps.onHttpFailure,
    onNetworkFailure: deps.onNetworkFailure,
  };

  try {
    if (command === 'create') {
      let input: unknown = {};
      if (parsed.flags.input != null) {
        try {
          input = JSON.parse(parsed.flags.input) as unknown;
        } catch (error) {
          return fail(
            `--input must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
            stderr,
          );
        }
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          return fail('--input must be a JSON object', stderr);
        }
      }
      const payload = await requestJson(
        `${baseUrl}${basePath}`,
        jsonPost(input),
        requestDeps,
        baseUrl,
      ) as { document?: unknown };
      return outputSuccess(
        { document: payload.document },
        parsed.flags.json,
        stdout,
        `[store-screenshot] created document for ${projectId}`,
      );
    }

    if (command === 'upload') {
      const filePath = secondPositional!;
      const mime = mimeForUpload(filePath);
      if (!mime) return fail('upload file must be PNG, JPEG, or WebP', stderr);
      const bytes = await readFile(filePath);
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), basename(filePath));
      const payload = await requestJson(
        `${baseUrl}${basePath}/assets`,
        { method: 'POST', body: form },
        requestDeps,
        baseUrl,
      ) as { asset?: unknown };
      return outputSuccess(
        { asset: payload.asset },
        parsed.flags.json,
        stdout,
        `[store-screenshot] uploaded ${basename(filePath)}`,
      );
    }

    if (command === 'generate') {
      if (!parsed.flags.promptFile) {
        return fail('generate requires --prompt-file <path|->', stderr);
      }
      const prompt = await readPrompt(
        parsed.flags.promptFile,
        deps.readStdin ?? (async () => readFileSync(0, 'utf8')),
      );
      if (!prompt) return fail('--prompt-file must not be empty', stderr);
      const payload = await requestJson(
        `${baseUrl}${basePath}/generate`,
        jsonPost({ prompt }),
        requestDeps,
        baseUrl,
      );
      const job = readJob(payload);
      if (!job) return failStructured('INVALID_RESPONSE', 'Daemon returned an invalid job', stderr);
      return outputSuccess(
        { jobId: job.id, job },
        parsed.flags.json,
        stdout,
        `[store-screenshot] generate job ${job.id} ${job.status}`,
      );
    }

    if (command === 'validate') {
      const payload = await requestJson(
        `${baseUrl}${basePath}/validate`,
        jsonPost({ platforms }),
        requestDeps,
        baseUrl,
      ) as Record<string, unknown>;
      const valid = payload.valid === true;
      return outputSuccess(
        payload,
        parsed.flags.json,
        stdout,
        `[store-screenshot] validation ${valid ? 'passed' : 'failed'}`,
      );
    }

    if (command === 'export') {
      const payload = await requestJson(
        `${baseUrl}${basePath}/export`,
        jsonPost({ platforms }),
        requestDeps,
        baseUrl,
      );
      const queuedJob = readJob(payload);
      if (!queuedJob) {
        return failStructured('INVALID_RESPONSE', 'Daemon returned an invalid job', stderr);
      }
      if (!parsed.flags.wait) {
        return outputSuccess(
          { jobId: queuedJob.id, job: queuedJob },
          parsed.flags.json,
          stdout,
          `[store-screenshot] export job ${queuedJob.id} ${queuedJob.status}`,
        );
      }
      const job = await pollStoreScreenshotJob({
        baseUrl,
        projectId,
        jobId: queuedJob.id,
        fetchFn: deps.fetchFn,
        intervalMs: deps.pollIntervalMs,
        onHttpFailure: deps.onHttpFailure,
        onNetworkFailure: deps.onNetworkFailure,
      });
      if (job.status === 'failed' || job.status === 'interrupted') {
        return failStructured(
          job.error?.code ?? 'JOB_FAILED',
          job.error?.message ?? `Store screenshot export job ${job.status}`,
          stderr,
        );
      }
      let output: { outputPath?: string; bytes?: number } = {};
      if (parsed.flags.output) {
        const downloadResponse = await request(
          `${baseUrl}${basePath}/jobs/${encodeURIComponent(job.id)}/download`,
          undefined,
          requestDeps,
          baseUrl,
        );
        const bytes = Buffer.from(await downloadResponse.arrayBuffer());
        const outputPath = await writeDownloadSafely(parsed.flags.output, bytes);
        output = { outputPath, bytes: bytes.byteLength };
      }
      return outputSuccess(
        { jobId: job.id, job, ...output },
        parsed.flags.json,
        stdout,
        output.outputPath
          ? `[store-screenshot] exported ${output.outputPath}`
          : `[store-screenshot] export job ${job.id} done`,
      );
    }

    if (command === 'status') {
      const payload = await requestJson(
        `${baseUrl}${basePath}/jobs/${encodeURIComponent(secondPositional!)}`,
        undefined,
        requestDeps,
        baseUrl,
      );
      const job = readJob(payload);
      if (!job) return failStructured('INVALID_RESPONSE', 'Daemon returned an invalid job', stderr);
      return outputSuccess(
        { job },
        parsed.flags.json,
        stdout,
        `[store-screenshot] job ${job.id} ${job.status}`,
      );
    }

    if (command === 'versions') {
      const payload = await requestJson(
        `${baseUrl}${basePath}/versions`,
        undefined,
        requestDeps,
        baseUrl,
      ) as { versions?: unknown };
      return outputSuccess(
        { versions: payload.versions },
        parsed.flags.json,
        stdout,
        `[store-screenshot] versions ${
          Array.isArray(payload.versions) ? payload.versions.length : 0
        }`,
      );
    }

    const version = Number(secondPositional);
    if (!Number.isInteger(version) || version <= 0 || String(version) !== secondPositional) {
      return fail('restore version must be a positive integer', stderr);
    }
    const payload = await requestJson(
      `${baseUrl}${basePath}/versions/${version}/restore`,
      jsonPost({}),
      requestDeps,
      baseUrl,
    ) as { document?: unknown };
    return outputSuccess(
      { document: payload.document },
      parsed.flags.json,
      stdout,
      `[store-screenshot] restored version ${version}`,
    );
  } catch (error) {
    return failStructured(
      'CLI_ERROR',
      error instanceof Error ? error.message : String(error),
      stderr,
    );
  }
}
