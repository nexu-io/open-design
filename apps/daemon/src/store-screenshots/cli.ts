import { readFile, link, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

import {
  CreateStoreScreenshotDocumentRequestSchema,
  StoreScreenshotDocumentResponseSchema,
  StoreScreenshotJobResponseSchema,
  StoreScreenshotValidationResultSchema,
  StoreScreenshotVersionsResponseSchema,
  UploadStoreScreenshotAssetResponseSchema,
  type StoreScreenshotJob,
} from '@open-design/contracts';

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

interface StoreScreenshotCliError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  exitCode: number;
}

interface ParsedStoreScreenshotSuccess {
  ok: true;
  value: ParsedStoreScreenshotArgs;
}

interface ParsedStoreScreenshotFailure {
  ok: false;
  error: StoreScreenshotCliError;
  json: boolean;
}

type ParsedStoreScreenshotResult =
  | ParsedStoreScreenshotSuccess
  | ParsedStoreScreenshotFailure;

interface StrictSchema<T> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{
      code: string;
      message: string;
      path: PropertyKey[];
    }> } };
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
  od store-screenshot create <project-id> --input <json> [--json]
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

const STORE_SCREENSHOT_COMMANDS = new Set<StoreScreenshotCommand>([
  'create',
  'upload',
  'generate',
  'validate',
  'export',
  'status',
  'versions',
  'restore',
]);

const STRING_FLAGS = new Set([
  'daemon-url',
  'input',
  'prompt-file',
  'platform',
  'output',
]);
const BOOLEAN_FLAGS = new Set(['json', 'wait', 'help']);
const COMMON_FLAGS = new Set(['daemon-url', 'json', 'help']);
const COMMAND_FLAGS: Record<StoreScreenshotCommand, ReadonlySet<string>> = {
  create: new Set([...COMMON_FLAGS, 'input']),
  upload: COMMON_FLAGS,
  generate: new Set([...COMMON_FLAGS, 'prompt-file']),
  validate: new Set([...COMMON_FLAGS, 'platform']),
  export: new Set([...COMMON_FLAGS, 'platform', 'output', 'wait']),
  status: COMMON_FLAGS,
  versions: COMMON_FLAGS,
  restore: COMMON_FLAGS,
};

function cliError(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
  exitCode = 2,
): StoreScreenshotCliError {
  return { code, message, details, exitCode };
}

function parseArgs(args: string[]): ParsedStoreScreenshotResult {
  const jsonRequested = args.some((arg) => arg === '--json' || arg.startsWith('--json='));
  const commandIndex = args.findIndex((arg) => STORE_SCREENSHOT_COMMANDS.has(
    arg as StoreScreenshotCommand,
  ));
  const command = commandIndex >= 0 ? args[commandIndex] : undefined;
  const parsed: ParsedStoreScreenshotArgs = {
    command,
    positionals: [],
    flags: {
      json: false,
      wait: false,
      help: false,
    },
  };
  const allowedFlags = command && STORE_SCREENSHOT_COMMANDS.has(command as StoreScreenshotCommand)
    ? COMMAND_FLAGS[command as StoreScreenshotCommand]
    : COMMON_FLAGS;
  const seenFlags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    if (index === commandIndex) continue;
    const arg = args[index];
    if (arg == null) continue;
    if (!arg.startsWith('--')) {
      if (arg === '-h') {
        if (seenFlags.has('help')) {
          return {
            ok: false,
            json: jsonRequested,
            error: cliError('INVALID_ARGUMENT', 'duplicate flag: --help', { flag: 'help' }),
          };
        }
        seenFlags.add('help');
        parsed.flags.help = true;
        continue;
      }
      if (arg.startsWith('-')) {
        return {
          ok: false,
          json: jsonRequested,
          error: cliError(
            'INVALID_ARGUMENT',
            `unknown flag: ${arg}. Run with --help for accepted flags.`,
            { flag: arg },
          ),
        };
      }
      if (arg === 'help' && commandIndex < 0) {
        parsed.flags.help = true;
        continue;
      }
      parsed.positionals.push(arg);
      continue;
    }
    const equalsIndex = arg.indexOf('=');
    const flag = (equalsIndex >= 0 ? arg.slice(2, equalsIndex) : arg.slice(2));
    const inlineValue = equalsIndex >= 0 ? arg.slice(equalsIndex + 1) : undefined;
    if (!STRING_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) {
      return {
        ok: false,
        json: jsonRequested,
        error: cliError(
          'INVALID_ARGUMENT',
          `unknown flag: --${flag}. Run with --help for accepted flags.`,
          { flag },
        ),
      };
    }
    if (!allowedFlags.has(flag)) {
      return {
        ok: false,
        json: jsonRequested,
        error: cliError(
          'INVALID_ARGUMENT',
          `--${flag} is not valid for store-screenshot ${command ?? '(missing command)'}`,
          { command: command ?? null, flag },
        ),
      };
    }
    if (seenFlags.has(flag)) {
      return {
        ok: false,
        json: jsonRequested,
        error: cliError('INVALID_ARGUMENT', `duplicate flag: --${flag}`, { flag }),
      };
    }
    seenFlags.add(flag);
    if (BOOLEAN_FLAGS.has(flag)) {
      if (inlineValue !== undefined) {
        return {
          ok: false,
          json: jsonRequested,
          error: cliError(
            'INVALID_ARGUMENT',
            `flag --${flag} does not accept a value`,
            { flag },
          ),
        };
      }
      if (flag === 'json') parsed.flags.json = true;
      else if (flag === 'wait') parsed.flags.wait = true;
      else parsed.flags.help = true;
      continue;
    }
    const nextIndex = index + 1;
    const value = inlineValue ?? (
      nextIndex === commandIndex ? undefined : args[nextIndex]
    );
    const stdinPromptValue = flag === 'prompt-file' && value === '-';
    if (
      value == null
      || (inlineValue === undefined && value.startsWith('-') && !stdinPromptValue)
    ) {
      return {
        ok: false,
        json: jsonRequested,
        error: cliError(
          'INVALID_ARGUMENT',
          `flag --${flag} requires a value`,
          { flag },
        ),
      };
    }
    if (inlineValue === undefined) index = nextIndex;
    if (flag === 'daemon-url') parsed.flags.daemonUrl = value;
    else if (flag === 'input') parsed.flags.input = value;
    else if (flag === 'prompt-file') parsed.flags.promptFile = value;
    else if (flag === 'platform') parsed.flags.platform = value;
    else if (flag === 'output') parsed.flags.output = value;
  }
  if (commandIndex < 0 && parsed.positionals.length > 0 && !parsed.flags.help) {
    return {
      ok: false,
      json: jsonRequested,
      error: cliError(
        'INVALID_ARGUMENT',
        `unknown subcommand: od store-screenshot ${parsed.positionals[0]}`,
        { command: parsed.positionals[0] },
      ),
    };
  }
  return { ok: true, value: parsed };
}

function writeJson(
  value: unknown,
  stream: Pick<NodeJS.WriteStream, 'write'>,
): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeCliError(
  error: StoreScreenshotCliError,
  json: boolean,
  stderr: Pick<NodeJS.WriteStream, 'write'>,
): StoreScreenshotCliResult {
  if (json) {
    writeJson({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }, stderr);
  } else {
    stderr.write(`${error.message}\n`);
    const issues = Array.isArray(error.details.issues) ? error.details.issues : [];
    for (const issue of issues) {
      if (!issue || typeof issue !== 'object') continue;
      const code = 'code' in issue ? String(issue.code) : 'ISSUE';
      const message = 'message' in issue ? String(issue.message) : '';
      stderr.write(`  [${code}] ${message}\n`);
    }
  }
  return { exitCode: error.exitCode };
}

class StoreScreenshotCliException extends Error {
  constructor(readonly cliError: StoreScreenshotCliError) {
    super(cliError.message);
    this.name = 'StoreScreenshotCliException';
  }
}

function schemaIssueDetails(
  issues: Array<{ code: string; message: string; path: PropertyKey[] }>,
): { issues: Array<{ code: string; message: string; path: string }> } {
  return {
    issues: issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map(String).join('.'),
    })),
  };
}

function parseStrictResponse<T>(
  schema: StrictSchema<T>,
  value: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new StoreScreenshotCliException(cliError(
    'PROTOCOL_ERROR',
    `Daemon returned an invalid ${label} response`,
    schemaIssueDetails(parsed.error.issues),
    1,
  ));
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
  const response = await request(url, init, deps, baseUrl);
  let raw = '';
  try {
    raw = await response.text();
    return JSON.parse(raw) as unknown;
  } catch {
    throw new StoreScreenshotCliException(cliError(
      'PROTOCOL_ERROR',
      'Daemon returned invalid JSON',
      { status: response.status },
      1,
    ));
  }
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
  try {
    if (promptFile === '-') return await readStdin();
    return await readFile(promptFile, 'utf8');
  } catch (error) {
    throw new StoreScreenshotCliException(cliError(
      'FILE_ERROR',
      `Unable to read prompt file: ${error instanceof Error ? error.message : String(error)}`,
      { path: promptFile },
      1,
    ));
  }
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
  const destination = join(directory, 'store-screenshots.zip');
  const temporary = join(directory, `.store-screenshots.${process.pid}.${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    await link(temporary, destination);
    return destination;
  } catch (error) {
    throw new StoreScreenshotCliException(cliError(
      'FILE_ERROR',
      `Unable to write store screenshot export: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { outputPath: destination },
      1,
    ));
  } finally {
    await rm(temporary, { force: true });
  }
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
    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      throw new StoreScreenshotCliException(cliError(
        'PROTOCOL_ERROR',
        'Daemon returned invalid JSON',
        { status: response.status },
        1,
      ));
    }
    const { job } = parseStrictResponse(
      StoreScreenshotJobResponseSchema,
      payload,
      'store screenshot job',
    );
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
  const parsedResult = parseArgs(args);
  if (!parsedResult.ok) {
    return writeCliError(parsedResult.error, parsedResult.json, stderr);
  }
  const parsed = parsedResult.value;
  if (parsed.flags.help) {
    stdout.write(USAGE);
    return { exitCode: 0 };
  }
  if (!parsed.command) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      'store-screenshot command is required',
      {},
    ), parsed.flags.json, stderr);
  }
  const command = parsed.command as StoreScreenshotCommand;
  const [projectId, secondPositional, ...extraPositionals] = parsed.positionals;
  if (!projectId || extraPositionals.length > 0) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      'Invalid positional arguments. Run `od store-screenshot --help` for usage.',
      { command, received: parsed.positionals },
    ), parsed.flags.json, stderr);
  }
  if (command === 'upload' || command === 'status' || command === 'restore') {
    if (!secondPositional) {
      return writeCliError(cliError(
        'INVALID_ARGUMENT',
        `store-screenshot ${command} requires a second positional argument`,
        { command },
      ), parsed.flags.json, stderr);
    }
  } else if (secondPositional) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      `store-screenshot ${command} accepts only <project-id>`,
      { command, received: parsed.positionals },
    ), parsed.flags.json, stderr);
  }
  if (command === 'create' && !parsed.flags.input) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      'store-screenshot create requires --input <json>',
      { command },
    ), parsed.flags.json, stderr);
  }
  if (command === 'generate' && !parsed.flags.promptFile) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      'store-screenshot generate requires --prompt-file <path|->',
      { command },
    ), parsed.flags.json, stderr);
  }
  if (parsed.flags.output && (!parsed.flags.wait || command !== 'export')) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      '--output requires `store-screenshot export --wait`',
      { command },
    ), parsed.flags.json, stderr);
  }
  const platforms = platformsFromFlag(parsed.flags.platform);
  if ((command === 'validate' || command === 'export') && !platforms) {
    return writeCliError(cliError(
      'INVALID_ARGUMENT',
      '--platform must be one of: app-store | google-play | all',
      { platform: parsed.flags.platform },
    ), parsed.flags.json, stderr);
  }

  try {
    let createInput: unknown;
    if (command === 'create') {
      try {
        createInput = JSON.parse(parsed.flags.input!) as unknown;
      } catch (error) {
        throw new StoreScreenshotCliException(cliError(
          'INVALID_JSON',
          `--input must be valid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
          {},
        ));
      }
      const validated = CreateStoreScreenshotDocumentRequestSchema.safeParse(createInput);
      if (!validated.success) {
        throw new StoreScreenshotCliException(cliError(
          'INVALID_INPUT',
          '--input does not match the store screenshot create contract',
          schemaIssueDetails(validated.error.issues),
        ));
      }
      createInput = validated.data;
    }
    const version = command === 'restore' ? Number(secondPositional) : null;
    if (
      command === 'restore'
      && (!Number.isInteger(version) || Number(version) <= 0 || String(version) !== secondPositional)
    ) {
      throw new StoreScreenshotCliException(cliError(
        'INVALID_ARGUMENT',
        'restore version must be a positive integer',
        { version: secondPositional },
      ));
    }
    const daemonUrl = await resolveDaemonUrl(
      parsed.flags.daemonUrl ? { flagUrl: parsed.flags.daemonUrl } : {},
    );
    const baseUrl = daemonUrl.replace(/\/$/, '');
    const basePath = encodedBasePath(projectId);
    const requestDeps: StoreScreenshotRequestDeps = {
      fetchFn: deps.fetchFn,
      onHttpFailure: deps.onHttpFailure,
      onNetworkFailure: deps.onNetworkFailure,
    };

    if (command === 'create') {
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}`,
        jsonPost(createInput),
        requestDeps,
        baseUrl,
      );
      const payload = parseStrictResponse(
        StoreScreenshotDocumentResponseSchema,
        rawPayload,
        'store screenshot document',
      );
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
      if (!mime) {
        throw new StoreScreenshotCliException(cliError(
          'INVALID_ARGUMENT',
          'upload file must be PNG, JPEG, or WebP',
          { path: filePath },
        ));
      }
      let bytes: Buffer;
      try {
        bytes = await readFile(filePath);
      } catch (error) {
        throw new StoreScreenshotCliException(cliError(
          'FILE_ERROR',
          `Unable to read upload file: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { path: filePath },
          1,
        ));
      }
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mime }), basename(filePath));
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/assets`,
        { method: 'POST', body: form },
        requestDeps,
        baseUrl,
      );
      const payload = parseStrictResponse(
        UploadStoreScreenshotAssetResponseSchema,
        rawPayload,
        'store screenshot asset',
      );
      return outputSuccess(
        { asset: payload.asset },
        parsed.flags.json,
        stdout,
        `[store-screenshot] uploaded ${basename(filePath)}`,
      );
    }

    if (command === 'generate') {
      const prompt = await readPrompt(
        parsed.flags.promptFile!,
        deps.readStdin ?? (async () => readFileSync(0, 'utf8')),
      );
      if (!prompt) {
        throw new StoreScreenshotCliException(cliError(
          'INVALID_ARGUMENT',
          '--prompt-file must not be empty',
          { path: parsed.flags.promptFile },
        ));
      }
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/generate`,
        jsonPost({ prompt }),
        requestDeps,
        baseUrl,
      );
      const { job } = parseStrictResponse(
        StoreScreenshotJobResponseSchema,
        rawPayload,
        'store screenshot job',
      );
      return outputSuccess(
        { jobId: job.id, job },
        parsed.flags.json,
        stdout,
        `[store-screenshot] generate job ${job.id} ${job.status}`,
      );
    }

    if (command === 'validate') {
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/validate`,
        jsonPost({ platforms }),
        requestDeps,
        baseUrl,
      );
      const payload = parseStrictResponse(
        StoreScreenshotValidationResultSchema,
        rawPayload,
        'store screenshot validation',
      );
      if (!payload.valid) {
        return writeCliError(cliError(
          'VALIDATION_FAILED',
          'Store screenshot validation failed',
          { issues: payload.issues },
          1,
        ), parsed.flags.json, stderr);
      }
      return outputSuccess(
        payload,
        parsed.flags.json,
        stdout,
        '[store-screenshot] validation passed',
      );
    }

    if (command === 'export') {
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/export`,
        jsonPost({ platforms }),
        requestDeps,
        baseUrl,
      );
      const { job: queuedJob } = parseStrictResponse(
        StoreScreenshotJobResponseSchema,
        rawPayload,
        'store screenshot job',
      );
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
        return writeCliError(cliError(
          job.error?.code ?? 'JOB_FAILED',
          job.error?.message ?? `Store screenshot export job ${job.status}`,
          { jobId: job.id, status: job.status },
          1,
        ), parsed.flags.json, stderr);
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
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/jobs/${encodeURIComponent(secondPositional!)}`,
        undefined,
        requestDeps,
        baseUrl,
      );
      const { job } = parseStrictResponse(
        StoreScreenshotJobResponseSchema,
        rawPayload,
        'store screenshot job',
      );
      return outputSuccess(
        { job },
        parsed.flags.json,
        stdout,
        `[store-screenshot] job ${job.id} ${job.status}`,
      );
    }

    if (command === 'versions') {
      const rawPayload = await requestJson(
        `${baseUrl}${basePath}/versions`,
        undefined,
        requestDeps,
        baseUrl,
      );
      const payload = parseStrictResponse(
        StoreScreenshotVersionsResponseSchema,
        rawPayload,
        'store screenshot versions',
      );
      return outputSuccess(
        { versions: payload.versions },
        parsed.flags.json,
        stdout,
        `[store-screenshot] versions ${
          Array.isArray(payload.versions) ? payload.versions.length : 0
        }`,
      );
    }

    const rawPayload = await requestJson(
      `${baseUrl}${basePath}/versions/${version}/restore`,
      jsonPost({}),
      requestDeps,
      baseUrl,
    );
    const payload = parseStrictResponse(
      StoreScreenshotDocumentResponseSchema,
      rawPayload,
      'store screenshot document',
    );
    return outputSuccess(
      { document: payload.document },
      parsed.flags.json,
      stdout,
      `[store-screenshot] restored version ${version}`,
    );
  } catch (error) {
    if (error instanceof StoreScreenshotCliException) {
      return writeCliError(error.cliError, parsed.flags.json, stderr);
    }
    return writeCliError(cliError(
      'CLI_ERROR',
      error instanceof Error ? error.message : String(error),
      {},
      1,
    ), parsed.flags.json, stderr);
  }
}
