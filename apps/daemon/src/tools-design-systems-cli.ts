import type {
  ResolveDesignSystemIntentApiResponse,
  ResolveDesignSystemIntentRequest,
  ValidateDesignSystemAdherenceApiResponse,
  ValidateDesignSystemAdherenceRequest,
} from '@open-design/contracts';

type JsonObject = Record<string, unknown>;

interface ToolCliResult {
  exitCode: number;
}

interface ParsedOptions {
  command: string | undefined;
  path?: string;
  intent?: string;
  artifacts: string[];
  designSystemId?: string;
  json: boolean;
  help: boolean;
}

const DESIGN_SYSTEMS_USAGE = `Usage:
  od tools design-systems read --path <manifest-declared-path> [--design-system <id>]
  od tools design-systems resolve --intent <canonical-intent> [--design-system <id>] [--json]
  od tools design-systems validate --intent <canonical-intent> --artifact <project-relative-file> [--artifact <file>...] [--design-system <id>] [--json]

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          Open Design CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools design-systems read --path preview/colors.html
  "$OD_NODE_BIN" "$OD_BIN" tools design-systems resolve --intent account.settings.save
  "$OD_NODE_BIN" "$OD_BIN" tools design-systems validate --intent account.settings.save --artifact account-settings.html --artifact styles.css
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
    artifacts: [],
    json: false,
    help: command === '-h' || command === '--help',
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--path') {
      const value = rest[++index];
      if (!value) return { error: '--path requires a relative file path' };
      options.path = value;
    } else if (arg === '--intent') {
      const value = rest[++index];
      if (!value) return { error: '--intent requires a canonical intent id' };
      options.intent = value;
    } else if (arg === '--artifact') {
      const value = rest[++index];
      if (!value) return { error: '--artifact requires a project-relative file path' };
      options.artifacts.push(value);
    } else if (arg === '--design-system') {
      const value = rest[++index];
      if (!value) return { error: '--design-system requires an id' };
      options.designSystemId = value;
    } else if (arg === '--json') {
      options.json = true;
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

async function requestJson<TBody = unknown>(baseUrl: URL, token: string, pathname: string, init: RequestInit = {}): Promise<{ status: number; body: TBody }> {
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
  return { status: response.status, body: body as TBody };
}

function normalizeCliError(body: unknown): JsonObject {
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

async function printApiResult(response: { status: number; body: unknown }): Promise<ToolCliResult> {
  if (response.status < 200 || response.status >= 300) {
    writeJson({ ok: false, status: response.status, error: normalizeCliError(response.body) }, process.stderr);
    return { exitCode: 1 };
  }
  const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body)
    ? response.body as JsonObject
    : { result: response.body };
  writeJson({ ok: true, ...body });
  return { exitCode: 0 };
}

async function printAdherenceResult(response: { status: number; body: unknown }): Promise<ToolCliResult> {
  if (response.status < 200 || response.status >= 300) return printApiResult(response);
  const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body)
    ? response.body as JsonObject
    : { result: response.body };
  const report = body.report && typeof body.report === 'object' && !Array.isArray(body.report)
    ? body.report as JsonObject
    : undefined;
  const passed = report?.status === 'passed';
  writeJson({ ok: passed, ...body });
  return { exitCode: passed ? 0 : 2 };
}

export async function runDesignSystemsToolCli(args: string[]): Promise<ToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(DESIGN_SYSTEMS_USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  if (options.command === 'resolve') {
    if (!options.intent) return fail('resolve requires --intent <canonical-intent>');
    const request: ResolveDesignSystemIntentRequest = {
      intent: options.intent,
      ...(options.designSystemId ? { designSystemId: options.designSystemId } : {}),
    };
    return printApiResult(
      await requestJson<ResolveDesignSystemIntentApiResponse>(baseUrl, token, '/api/tools/design-systems/resolve-intent', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  }

  if (options.command === 'validate') {
    if (!options.intent) return fail('validate requires --intent <canonical-intent>');
    if (options.artifacts.length === 0) {
      return fail('validate requires at least one --artifact <project-relative-file>');
    }
    const request: ValidateDesignSystemAdherenceRequest = {
      intent: options.intent,
      artifacts: options.artifacts,
      ...(options.designSystemId ? { designSystemId: options.designSystemId } : {}),
    };
    return printAdherenceResult(
      await requestJson<ValidateDesignSystemAdherenceApiResponse>(baseUrl, token, '/api/tools/design-systems/validate-adherence', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  }

  if (options.command !== 'read') return fail(`unknown design-systems command: ${options.command}`);
  if (!options.path) return fail('read requires --path <manifest-declared-path>');

  return printApiResult(
    await requestJson(baseUrl, token, '/api/tools/design-systems/read', {
      method: 'POST',
      body: JSON.stringify({
        path: options.path,
        ...(options.designSystemId ? { designSystemId: options.designSystemId } : {}),
      }),
    }),
  );
}
