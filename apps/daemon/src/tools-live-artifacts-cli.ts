import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

interface CliError {
  code?: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  requestId?: string;
}

interface ToolCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  inputPath?: string;
  artifactId?: string;
  format: 'compact' | 'json';
  help: boolean;
}

const LIVE_ARTIFACTS_USAGE = `Usage:
  od tools live-artifacts create --input artifact.json
  od tools live-artifacts list [--format compact]
  od tools live-artifacts refresh --artifact-id <id>
  od tools live-artifacts update --artifact-id <id> --input artifact.json

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          Open Design CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools live-artifacts list --format compact
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, details?: unknown): ToolCliResult {
  writeJson({ ok: false, error: { message, ...(details === undefined ? {} : { details }) } }, process.stderr);
  return { exitCode: 1 };
}

function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    format: 'compact',
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--input') {
      const value = rest[++index];
      if (!value) return { error: '--input requires a file path' };
      options.inputPath = value;
    } else if (arg === '--artifact-id') {
      const value = rest[++index];
      if (!value) return { error: '--artifact-id requires an artifact id' };
      options.artifactId = value;
    } else if (arg === '--format') {
      const value = rest[++index];
      if (value !== 'compact' && value !== 'json') return { error: '--format must be compact or json' };
      options.format = value;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      return { error: `unknown option: ${arg}` };
    }
  }

  return options;
}

function daemonUrl(): URL | { error: string } {
  const rawUrl = process.env.OD_DAEMON_URL;
  if (!rawUrl) return { error: 'OD_DAEMON_URL is required' };
  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/\/+$/u, '');
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return { error: 'OD_DAEMON_URL must be a valid URL' };
  }
}

function toolToken(): string | { error: string } {
  const token = process.env.OD_TOOL_TOKEN;
  if (!token) return { error: 'OD_TOOL_TOKEN is required' };
  return token;
}

function endpoint(baseUrl: URL, pathname: string): string {
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname}${pathname}`.replace(/\/+/gu, '/');
  return url.toString();
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON in ${filePath}: ${message}`);
  }
}

async function readOptionalTextFile(filePath: string): Promise<string | undefined> {
  try {
    await access(filePath);
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function readOptionalJsonObject(filePath: string): Promise<JsonObject | undefined> {
  try {
    await access(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
  const value = await readJsonFile(filePath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return value as JsonObject;
}

async function readArtifactInput(inputPath: string): Promise<{ input: unknown; templateHtml?: string; provenanceJson?: JsonObject }> {
  const resolvedInputPath = path.resolve(inputPath);
  const input = await readJsonFile(resolvedInputPath);
  const inputDir = path.dirname(resolvedInputPath);
  const dataJson = await readOptionalJsonObject(path.join(inputDir, 'data.json'));
  const templateHtml = await readOptionalTextFile(path.join(inputDir, 'template.html'));
  const provenanceJson = await readOptionalJsonObject(path.join(inputDir, 'provenance.json'));
  let inputWithDataJson = input;
  if (dataJson !== undefined && input && typeof input === 'object' && !Array.isArray(input)) {
    const inputRecord = input as JsonObject;
    const document = inputRecord.document;
    if (document && typeof document === 'object' && !Array.isArray(document)) {
      inputWithDataJson = { ...inputRecord, document: { ...(document as JsonObject), dataJson } };
    }
  }
  return { input: inputWithDataJson, ...(templateHtml === undefined ? {} : { templateHtml }), ...(provenanceJson === undefined ? {} : { provenanceJson }) };
}

async function requestJson(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  const response = await fetch(endpoint(baseUrl, pathname), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  return { status: response.status, body };
}

function compactArtifact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const artifact = value as JsonObject;
  return {
    id: artifact.id,
    title: artifact.title,
    status: artifact.status,
    refreshStatus: artifact.refreshStatus,
    preview: artifact.preview,
    updatedAt: artifact.updatedAt,
  };
}

function compactList(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const response = value as JsonObject;
  const artifacts = Array.isArray(response.artifacts) ? response.artifacts : [];
  return {
    artifacts: artifacts.map(compactArtifact),
  };
}

function compactValidationDetails(details: unknown): unknown {
  if (!details || typeof details !== 'object') return details;
  const record = details as JsonObject;
  if (record.kind !== 'validation' || !Array.isArray(record.issues)) return details;
  return {
    kind: 'validation',
    issues: record.issues.map((issue) => {
      if (!issue || typeof issue !== 'object') return { message: String(issue) };
      const issueRecord = issue as JsonObject;
      return {
        ...(typeof issueRecord.path === 'string' ? { path: issueRecord.path } : {}),
        message: typeof issueRecord.message === 'string' ? issueRecord.message : String(issueRecord.message ?? 'validation failed'),
        ...(typeof issueRecord.code === 'string' ? { code: issueRecord.code } : {}),
      };
    }),
  };
}

function normalizeCliError(body: unknown): CliError {
  const rawError = body && typeof body === 'object' && 'error' in body ? (body as JsonObject).error : body;

  if (typeof rawError === 'string') return { message: rawError };
  if (!rawError || typeof rawError !== 'object') return { message: String(rawError ?? 'request failed') };

  const error = rawError as JsonObject;
  const normalized: CliError = {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    message: typeof error.message === 'string' ? error.message : String(error.error ?? 'request failed'),
    ...(error.details === undefined ? {} : { details: compactValidationDetails(error.details) }),
    ...(typeof error.retryable === 'boolean' ? { retryable: error.retryable } : {}),
    ...(typeof error.requestId === 'string' ? { requestId: error.requestId } : {}),
  };
  return normalized;
}

async function printApiResult(response: { status: number; body: unknown }, compact: (body: unknown) => unknown): Promise<ToolCliResult> {
  if (response.status < 200 || response.status >= 300) {
    writeJson({ ok: false, status: response.status, error: normalizeCliError(response.body) }, process.stderr);
    return { exitCode: 1 };
  }
  const body = compact(response.body);
  writeJson(body && typeof body === 'object' && !Array.isArray(body) ? { ok: true, ...(body as JsonObject) } : { ok: true, result: body });
  return { exitCode: 0 };
}

export async function runLiveArtifactsToolCli(args: string[]): Promise<ToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(LIVE_ARTIFACTS_USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  try {
    if (options.command === 'create') {
      if (!options.inputPath) return fail('create requires --input artifact.json');
      const input = await readArtifactInput(options.inputPath);
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/live-artifacts/create', { method: 'POST', body: JSON.stringify(input) }),
        (body) => ({ artifact: compactArtifact((body as JsonObject).artifact) }),
      );
    }

    if (options.command === 'list') {
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/live-artifacts/list', { method: 'GET' }),
        options.format === 'compact' ? compactList : (body) => body,
      );
    }

    if (options.command === 'update') {
      if (!options.artifactId) return fail('update requires --artifact-id <id>');
      if (!options.inputPath) return fail('update requires --input artifact.json');
      const input = await readArtifactInput(options.inputPath);
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/live-artifacts/update', {
          method: 'POST',
          body: JSON.stringify({ artifactId: options.artifactId, ...input }),
        }),
        (body) => ({ artifact: compactArtifact((body as JsonObject).artifact) }),
      );
    }

    if (options.command === 'refresh') {
      if (!options.artifactId) return fail('refresh requires --artifact-id <id>');
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/live-artifacts/refresh', {
          method: 'POST',
          body: JSON.stringify({ artifactId: options.artifactId }),
        }),
        (body) => ({
          artifact: compactArtifact((body as JsonObject).artifact),
          refresh: (body as JsonObject).refresh,
        }),
      );
    }

    return fail(`unknown live-artifacts command: ${options.command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
