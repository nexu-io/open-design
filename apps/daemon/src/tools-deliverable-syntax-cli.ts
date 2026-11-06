import type {
  DeliverableSyntaxToolCliFailure,
  DeliverableSyntaxToolCliSuccess,
  DeliverableSyntaxToolResponse,
} from '@open-design/contracts';

type JsonObject = Record<string, unknown>;

interface ToolCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  help: boolean;
}

const DELIVERABLE_SYNTAX_USAGE = `Usage:
  od tools deliverable-syntax check [--json]

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          OpenDesign CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools deliverable-syntax check --json
`;

function writeJson(value: unknown, stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string): ToolCliResult {
  const output: DeliverableSyntaxToolCliFailure = {
    ok: false,
    error: { message },
  };
  writeJson(output, process.stderr);
  return { exitCode: 1 };
}

function parseOptions(args: string[]): ParsedOptions | { error: string } {
  const [command, ...rest] = args;
  const options: ParsedOptions = {
    command: command === '-h' || command === '--help' ? undefined : command,
    help: command === '-h' || command === '--help',
  };

  for (const arg of rest) {
    if (arg === '--json') continue;
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    return { error: `unknown option: ${arg}` };
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

async function requestJson(baseUrl: URL, token: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(endpoint(baseUrl, '/api/tools/deliverable-syntax/check'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
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

function normalizeCliError(body: unknown): DeliverableSyntaxToolCliFailure['error'] {
  const rawError = body && typeof body === 'object' && 'error' in body ? (body as JsonObject).error : body;
  if (typeof rawError === 'string') return { message: rawError };
  if (!rawError || typeof rawError !== 'object') return { message: String(rawError ?? 'request failed') };
  const error = rawError as JsonObject;
  return {
    ...(typeof error.code === 'string' ? { code: error.code } : {}),
    message: typeof error.message === 'string' ? error.message : String(error.error ?? 'request failed'),
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export async function runDeliverableSyntaxToolCli(args: string[]): Promise<ToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(DELIVERABLE_SYNTAX_USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }
  if (options.command !== 'check') return fail(`unknown deliverable-syntax command: ${options.command}`);

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  try {
    const response = await requestJson(baseUrl, token);
    if (response.status < 200 || response.status >= 300) {
      const output: DeliverableSyntaxToolCliFailure = {
        ok: false,
        status: response.status,
        error: normalizeCliError(response.body),
      };
      writeJson(output, process.stderr);
      return { exitCode: 1 };
    }
    const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body)
      ? response.body as DeliverableSyntaxToolResponse
      : { result: response.body };
    const output = { ok: true, ...body } as DeliverableSyntaxToolCliSuccess;
    writeJson(output);
    return { exitCode: 0 };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}
