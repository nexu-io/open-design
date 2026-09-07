import { readFile } from 'node:fs/promises';

import { SkillDiscoveryToolLoadPrepareResponseV1Schema } from '@open-design/contracts';

import { materializeVerifiedSkillDiscoveryResources } from './materialize.js';

type JsonObject = Record<string, unknown>;

export interface SkillDiscoveryToolCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  query?: string;
  queryFile?: string;
  id?: string;
  revision?: string;
  candidateDigest?: string;
  role?: 'primary' | 'auxiliary';
  outputKind?: string;
  purpose?: string;
  purposeFile?: string;
  replaceId?: string;
  reason?: string;
  reasonFile?: string;
  limit?: number;
  resolution?: 'none' | 'clarify';
  rehydrate: boolean;
  json: boolean;
  help: boolean;
}

const SKILLS_USAGE = `Usage:
  od tools skills search (--query <text> | --query-file <path|->)
                         [--role primary|auxiliary] [--output-kind <kind>]
                         [--limit 1..5] [--json]
  od tools skills load --id <id> --catalog-revision <sha256:...>
                       --candidate-digest <sha256:...> --role primary|auxiliary
                       (--purpose <text> | --purpose-file <path|->)
                       [--replace <active-primary-id>] [--json]
  od tools skills deactivate --id <active-auxiliary-id>
                             (--reason <text> | --reason-file <path|->) [--json]
  od tools skills resolve (--none | --clarify)
                          (--reason <text> | --reason-file <path|->) [--json]
  od tools skills status [--rehydrate] [--json]
  od tools skills rehydrate [--json]

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          OpenDesign CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools skills search --query-file - --json
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, details?: unknown): SkillDiscoveryToolCliResult {
  writeJson(
    { ok: false, error: { message, ...(details === undefined ? {} : { details }) } },
    process.stderr,
  );
  return { exitCode: 1 };
}

function takeValue(
  args: string[],
  index: number,
  flag: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    return { ok: false, error: `${flag} requires a value` };
  }
  return { ok: true, value };
}

function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    rehydrate: false,
    json: false,
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--rehydrate') {
      options.rehydrate = true;
      continue;
    }
    if (arg === '--none' || arg === '--clarify') {
      const resolution = arg === '--none' ? 'none' : 'clarify';
      if (options.resolution && options.resolution !== resolution) {
        return { error: 'pass exactly one of --none or --clarify' };
      }
      options.resolution = resolution;
      continue;
    }

    const parsed = takeValue(rest, index, arg);
    if (!parsed.ok) return parsed;
    index += 1;
    switch (arg) {
      case '--query': options.query = parsed.value; break;
      case '--query-file': options.queryFile = parsed.value; break;
      case '--id': options.id = parsed.value; break;
      case '--catalog-revision':
      case '--revision': options.revision = parsed.value; break;
      case '--candidate-digest': options.candidateDigest = parsed.value; break;
      case '--output-kind': options.outputKind = parsed.value; break;
      case '--purpose': options.purpose = parsed.value; break;
      case '--purpose-file': options.purposeFile = parsed.value; break;
      case '--replace': options.replaceId = parsed.value; break;
      case '--reason': options.reason = parsed.value; break;
      case '--reason-file': options.reasonFile = parsed.value; break;
      case '--role':
        if (parsed.value !== 'primary' && parsed.value !== 'auxiliary') {
          return { error: '--role must be primary or auxiliary' };
        }
        options.role = parsed.value;
        break;
      case '--limit': {
        if (!/^[1-5]$/u.test(parsed.value)) {
          return { error: '--limit must be an integer from 1 to 5' };
        }
        options.limit = Number(parsed.value);
        break;
      }
      default: return { error: `unknown option: ${arg}` };
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

async function requestJson(
  baseUrl: URL,
  token: string,
  pathname: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
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

function normalizeCliError(body: unknown): JsonObject {
  const rawError = body && typeof body === 'object' && 'error' in body
    ? (body as JsonObject).error
    : body;
  if (typeof rawError === 'string') return { message: rawError };
  if (!rawError || typeof rawError !== 'object') {
    return { message: String(rawError ?? 'request failed') };
  }
  const error = rawError as JsonObject;
  return {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    message: typeof error.message === 'string'
      ? error.message
      : String(error.error ?? 'request failed'),
    ...(error.details === undefined ? {} : { details: error.details }),
    ...(typeof error.retryable === 'boolean' ? { retryable: error.retryable } : {}),
  };
}

function printApiResult(response: {
  status: number;
  body: unknown;
}): SkillDiscoveryToolCliResult {
  if (response.status < 200 || response.status >= 300) {
    writeJson(
      { ok: false, status: response.status, error: normalizeCliError(response.body) },
      process.stderr,
    );
    return { exitCode: 1 };
  }
  const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body)
    ? response.body as JsonObject
    : { result: response.body };
  writeJson({ ok: true, ...body });
  return { exitCode: 0 };
}

async function readTextInput(
  inline: string | undefined,
  file: string | undefined,
  label: string,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  if (inline !== undefined && file !== undefined) {
    return { ok: false, error: `pass either --${label} or --${label}-file, not both` };
  }
  let value = inline;
  if (file !== undefined) {
    value = file === '-' ? await readStdin() : await readFile(file, 'utf8');
  }
  if (value === undefined || value.trim().length === 0) {
    return { ok: false, error: `${label} is required` };
  }
  return { ok: true, value: value.trim() };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runSkillDiscoveryToolCli(
  args: string[],
): Promise<SkillDiscoveryToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(SKILLS_USAGE);
    return { exitCode: options.help ? 0 : 1 };
  }

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  try {
    if (options.command === 'search') {
      const query = await readTextInput(options.query, options.queryFile, 'query');
      if (!query.ok) return fail(query.error);
      return printApiResult(await requestJson(baseUrl, token, '/api/tools/skills/search', {
        method: 'POST',
        body: JSON.stringify({
          query: query.value,
          ...(options.role ? { role: options.role } : {}),
          ...(options.outputKind ? { outputKind: options.outputKind } : {}),
          ...(options.limit ? { limit: options.limit } : {}),
        }),
      }));
    }

    if (options.command === 'load') {
      if (!options.id) return fail('load requires --id <id>');
      if (!options.revision) return fail('load requires --catalog-revision <sha256:...>');
      if (!options.candidateDigest) {
        return fail('load requires --candidate-digest <sha256:...>');
      }
      if (!options.role) return fail('load requires --role primary|auxiliary');
      const purpose = await readTextInput(options.purpose, options.purposeFile, 'purpose');
      if (!purpose.ok) return fail(purpose.error);
      const preparedResponse = await requestJson(baseUrl, token, '/api/tools/skills/load', {
        method: 'POST',
        body: JSON.stringify({
          id: options.id,
          revision: options.revision,
          candidateDigest: options.candidateDigest,
          role: options.role,
          purpose: purpose.value,
          ...(options.replaceId ? { replaceId: options.replaceId } : {}),
        }),
      });
      if (preparedResponse.status < 200 || preparedResponse.status >= 300) {
        return printApiResult(preparedResponse);
      }
      const prepared = SkillDiscoveryToolLoadPrepareResponseV1Schema.safeParse(
        preparedResponse.body,
      );
      if (!prepared.success) {
        return fail('daemon returned an invalid Skill load prepare response');
      }

      // The verified bundle stays in process memory and is never written to
      // Agent-visible stdout. Materialization runs under the Agent/CLI cwd
      // authority rather than the daemon's broader filesystem authority.
      const materialization = await materializeVerifiedSkillDiscoveryResources({
        cwd: process.cwd(),
        alias: prepared.data.alias,
        resources: prepared.data.resources.map((resource) => ({
          relativePath: resource.relativePath,
          digest: resource.digest,
          size: resource.size,
          mode: resource.mode,
          bytes: Buffer.from(resource.bytesBase64, 'base64'),
        })),
      });
      return printApiResult(await requestJson(
        baseUrl,
        token,
        '/api/tools/skills/load/commit',
        {
          method: 'POST',
          body: JSON.stringify({
            pendingToken: prepared.data.pendingToken,
            expectedStateRevision: prepared.data.expectedStateRevision,
            materialization,
          }),
        },
      ));
    }

    if (options.command === 'resolve') {
      if (!options.resolution) return fail('resolve requires exactly one of --none or --clarify');
      const reason = await readTextInput(options.reason, options.reasonFile, 'reason');
      if (!reason.ok) return fail(reason.error);
      return printApiResult(await requestJson(baseUrl, token, '/api/tools/skills/resolve', {
        method: 'POST',
        body: JSON.stringify({ resolution: options.resolution, reason: reason.value }),
      }));
    }

    if (options.command === 'deactivate') {
      if (!options.id) return fail('deactivate requires --id <active-auxiliary-id>');
      const reason = await readTextInput(options.reason, options.reasonFile, 'reason');
      if (!reason.ok) return fail(reason.error);
      return printApiResult(await requestJson(baseUrl, token, '/api/tools/skills/deactivate', {
        method: 'POST',
        body: JSON.stringify({ id: options.id, reason: reason.value }),
      }));
    }

    if (options.command === 'status' || options.command === 'rehydrate') {
      const rehydrate = options.command === 'rehydrate' || options.rehydrate;
      return printApiResult(await requestJson(
        baseUrl,
        token,
        rehydrate ? '/api/tools/skills/rehydrate' : '/api/tools/skills/status',
        rehydrate ? { method: 'POST', body: JSON.stringify({}) } : { method: 'GET' },
      ));
    }

    return fail(`unknown skills command: ${options.command}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

export { SKILLS_USAGE };
