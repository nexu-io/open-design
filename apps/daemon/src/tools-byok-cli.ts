import type {
  ByokCredentialProfile,
  ByokCredentialProfileResponse,
  ByokCredentialProfilesResponse,
  ConnectionTestResponse,
  UpsertByokCredentialProfileRequest,
} from '@open-design/contracts';

import { resolveDaemonUrl } from './daemon-url.js';

interface ByokCliDependencies {
  fetchImpl?: typeof fetch;
  readStdin?: () => Promise<string>;
  resolveDaemonUrlImpl?: typeof resolveDaemonUrl;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

interface ParsedByokArgs {
  command: 'list' | 'save' | 'test' | 'delete' | 'help';
  positionals: string[];
  values: Record<string, string>;
  booleans: Set<string>;
}

export interface ByokCliResult {
  exitCode: number;
}

const USAGE = `Usage:
  od byok list [--json] [--daemon-url <url>]
  od byok save --label <name> --protocol <protocol> --base-url <url> \\
    --model <id> (--api-key-stdin | --no-api-key) [--id <profile-id>] \\
    [--api-version <version>] [--json]
  od byok test <profile-id> [--json] [--daemon-url <url>]
  od byok delete <profile-id> [--json] [--daemon-url <url>]

Security:
  API keys are accepted only from stdin via --api-key-stdin. Never put a key
  in command arguments, chat, environment variables, manifests, or files.
  Use --no-api-key only for local/self-hosted endpoints that need no credential.
`;

const VALUE_FLAGS = new Set([
  'daemon-url',
  'id',
  'label',
  'protocol',
  'base-url',
  'model',
  'api-version',
]);
const BOOLEAN_FLAGS = new Set(['api-key-stdin', 'no-api-key', 'json', 'help', 'h']);
const BYOK_PROTOCOLS = new Set([
  'anthropic',
  'openai',
  'azure',
  'google',
  'ollama',
  'senseaudio',
  'aihubmix',
]);

function parseArgs(args: string[]): ParsedByokArgs | { error: string } {
  const normalized = args[0] === 'profiles' ? args.slice(1) : args;
  const first = normalized[0];
  const command =
    first === undefined || first === 'help' || first === '--help' || first === '-h'
      ? 'help'
      : first;
  if (
    command !== 'list'
    && command !== 'save'
    && command !== 'test'
    && command !== 'delete'
    && command !== 'help'
  ) {
    return { error: `unknown BYOK command: ${command}` };
  }

  const values: Record<string, string> = {};
  const booleans = new Set<string>();
  const positionals: string[] = [];
  for (
    let index = command === 'help' && first?.startsWith('-') ? 0 : 1;
    index < normalized.length;
    index += 1
  ) {
    const arg = normalized[index];
    if (!arg) continue;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const separator = arg.indexOf('=');
    const key = separator >= 0 ? arg.slice(2, separator) : arg.slice(2);
    if (key === 'api-key') {
      return {
        error:
          '--api-key is forbidden because command arguments may be exposed. Use --api-key-stdin.',
      };
    }
    if (BOOLEAN_FLAGS.has(key)) {
      if (separator >= 0) return { error: `--${key} does not accept a value` };
      booleans.add(key);
      continue;
    }
    if (!VALUE_FLAGS.has(key)) return { error: `unknown option: --${key}` };
    const value = separator >= 0 ? arg.slice(separator + 1) : normalized[++index];
    if (!value || value.startsWith('--')) return { error: `--${key} requires a value` };
    values[key] = value;
  }
  if (booleans.has('help') || booleans.has('h')) {
    return { command: 'help', positionals: [], values, booleans };
  }
  return { command, positionals, values, booleans };
}

async function defaultReadStdin(): Promise<string> {
  process.stdin.setEncoding('utf8');
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 65_536) {
      throw new Error('credential input exceeds the 64 KiB safety limit');
    }
  }
  return value;
}

function safeHttpBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.username.length > 0
      || url.password.length > 0
      || url.search.length > 0
      || url.hash.length > 0
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function safeLoopbackDaemonBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol)
      || !new Set(['127.0.0.1', '::1', 'localhost']).has(url.hostname.toLowerCase())
      || url.username.length > 0
      || url.password.length > 0
      || url.search.length > 0
      || url.hash.length > 0
    ) {
      return null;
    }
    return value.replace(/\/+$/u, '');
  } catch {
    return null;
  }
}

function safeProfile(value: unknown): ByokCredentialProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const profile = value as Partial<ByokCredentialProfile>;
  if (
    typeof profile.id !== 'string'
    || typeof profile.label !== 'string'
    || typeof profile.protocol !== 'string'
    || typeof profile.baseUrl !== 'string'
    || typeof profile.model !== 'string'
  ) {
    return null;
  }
  const baseUrl = safeHttpBaseUrl(profile.baseUrl);
  if (!baseUrl) return null;
  return {
    id: profile.id,
    label: profile.label,
    protocol: profile.protocol,
    baseUrl,
    model: profile.model,
    ...(typeof profile.apiVersion === 'string' ? { apiVersion: profile.apiVersion } : {}),
    requiresApiKey: profile.requiresApiKey === true,
    configured: profile.configured === true,
    ...(typeof profile.keyTail === 'string' ? { keyTail: profile.keyTail } : {}),
    createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : 0,
    updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : 0,
  };
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new Error('Open Design daemon is not reachable');
  }
  if (!response.ok) {
    throw new Error(`Open Design daemon rejected the request (HTTP ${response.status})`);
  }
  if (response.status === 204) return {};
  try {
    return await response.json();
  } catch {
    throw new Error('Open Design daemon returned invalid JSON');
  }
}

function printProfile(profile: ByokCredentialProfile): string {
  const credential = profile.configured
    ? `configured${profile.keyTail ? ` (…${profile.keyTail})` : ''}`
    : 'not configured';
  return `${profile.id}\t${profile.label}\t${profile.protocol}\t${profile.model}\t${credential}`;
}

function safeConnectionTest(value: unknown): Pick<
  ConnectionTestResponse,
  'ok' | 'kind' | 'latencyMs' | 'model' | 'status'
> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Partial<ConnectionTestResponse>;
  if (
    typeof result.ok !== 'boolean'
    || typeof result.kind !== 'string'
    || typeof result.latencyMs !== 'number'
  ) {
    return null;
  }
  return {
    ok: result.ok,
    kind: result.kind,
    latencyMs: result.latencyMs,
    ...(typeof result.model === 'string' ? { model: result.model } : {}),
    ...(typeof result.status === 'number' ? { status: result.status } : {}),
  };
}

export async function runByokToolCli(
  args: string[],
  dependencies: ByokCliDependencies = {},
): Promise<ByokCliResult> {
  const parsed = parseArgs(args);
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  const fail = (message: string): ByokCliResult => {
    stderr(`${message}\n`);
    return { exitCode: 1 };
  };

  if ('error' in parsed) return fail(parsed.error);
  if (parsed.command === 'help') {
    stdout(USAGE);
    return { exitCode: 0 };
  }

  const resolveUrl = dependencies.resolveDaemonUrlImpl ?? resolveDaemonUrl;
  const daemonBaseUrl = safeLoopbackDaemonBaseUrl(
    await resolveUrl(
      parsed.values['daemon-url']
        ? { flagUrl: parsed.values['daemon-url'] }
        : {},
    ),
  );
  if (!daemonBaseUrl) {
    return fail('BYOK credentials may only be sent to a loopback Open Design daemon URL');
  }
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const useJson = parsed.booleans.has('json');

  try {
    if (parsed.command === 'list') {
      if (parsed.positionals.length > 0) return fail('list does not accept positional arguments');
      const payload = await requestJson(
        fetchImpl,
        `${daemonBaseUrl}/api/byok/profiles`,
      ) as Partial<ByokCredentialProfilesResponse>;
      const profiles = Array.isArray(payload.profiles)
        ? payload.profiles
          .map(safeProfile)
          .filter((profile): profile is ByokCredentialProfile => profile !== null)
        : [];
      if (useJson) {
        stdout(`${JSON.stringify({
          available: payload.available === true,
          backend: typeof payload.backend === 'string' ? payload.backend : 'unknown',
          profiles,
        })}\n`);
      } else if (profiles.length === 0) {
        stdout('No secure BYOK profiles configured.\n');
      } else {
        stdout(`${profiles.map(printProfile).join('\n')}\n`);
      }
      return { exitCode: 0 };
    }

    if (parsed.command === 'save') {
      if (parsed.positionals.length > 0) return fail('save does not accept positional arguments');
      for (const required of ['label', 'protocol', 'base-url', 'model']) {
        if (!parsed.values[required]) return fail(`--${required} is required`);
      }
      if (!BYOK_PROTOCOLS.has(parsed.values.protocol!)) {
        return fail(`--protocol must be one of: ${[...BYOK_PROTOCOLS].join(', ')}`);
      }
      const providerBaseUrl = safeHttpBaseUrl(parsed.values['base-url']!);
      if (!providerBaseUrl) {
        return fail('--base-url must be an HTTP(S) URL without credentials, query, or fragment');
      }
      const readsApiKey = parsed.booleans.has('api-key-stdin');
      const isKeyless = parsed.booleans.has('no-api-key');
      if (readsApiKey === isKeyless) {
        return fail('choose exactly one of --api-key-stdin or --no-api-key');
      }
      let apiKey = '';
      if (readsApiKey) {
        const readStdin = dependencies.readStdin ?? defaultReadStdin;
        apiKey = (await readStdin()).replace(/[\r\n]+$/u, '');
        if (!apiKey) return fail('stdin did not contain an API key');
      }
      const request: UpsertByokCredentialProfileRequest = {
        ...(parsed.values.id ? { id: parsed.values.id } : {}),
        label: parsed.values.label!,
        protocol: parsed.values.protocol! as UpsertByokCredentialProfileRequest['protocol'],
        baseUrl: providerBaseUrl,
        model: parsed.values.model!,
        ...(parsed.values['api-version']
          ? { apiVersion: parsed.values['api-version'] }
          : {}),
        requiresApiKey: readsApiKey,
        ...(readsApiKey ? { apiKey } : {}),
      };
      const payload = await requestJson(
        fetchImpl,
        `${daemonBaseUrl}/api/byok/profiles`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
      ) as Partial<ByokCredentialProfileResponse>;
      const profile = safeProfile(payload.profile);
      if (!profile) throw new Error('Open Design daemon returned an invalid profile');
      stdout(useJson
        ? `${JSON.stringify({ profile })}\n`
        : `Saved ${printProfile(profile)}\n`);
      return { exitCode: 0 };
    }

    const id = parsed.positionals[0];
    if (!id || parsed.positionals.length !== 1) {
      return fail(`${parsed.command} requires exactly one profile id`);
    }
    if (parsed.command === 'test') {
      const payload = await requestJson(
        fetchImpl,
        `${daemonBaseUrl}/api/byok/profiles/${encodeURIComponent(id)}/test`,
        { method: 'POST', headers: { Accept: 'application/json' } },
      );
      const result = safeConnectionTest(payload);
      if (!result) throw new Error('Open Design daemon returned an invalid connection test');
      stdout(useJson
        ? `${JSON.stringify(result)}\n`
        : `${result.ok ? 'Connection succeeded' : 'Connection failed'} (${result.kind}, ${result.latencyMs} ms)${result.model ? ` using ${result.model}` : ''}.\n`);
      return { exitCode: result.ok ? 0 : 1 };
    }
    await requestJson(
      fetchImpl,
      `${daemonBaseUrl}/api/byok/profiles/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: { Accept: 'application/json' } },
    );
    stdout(useJson
      ? `${JSON.stringify({ deleted: true, id })}\n`
      : `Deleted BYOK profile ${id}.\n`);
    return { exitCode: 0 };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'BYOK command failed');
  }
}
