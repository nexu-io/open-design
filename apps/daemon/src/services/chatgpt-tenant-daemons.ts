import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface ChatGptTenantCredentials {
  subject: string;
  controlKey: string;
  runtimeKey: string;
  expiresAt: string;
  apiUrl: string;
  linkUrl: string;
}

export interface ChatGptTenantDaemon {
  url: string;
  isRunning(): boolean;
  stop(): Promise<void>;
}

export interface StartChatGptTenantDaemonInput {
  subject: string;
  dataDir: string;
  credentials: ChatGptTenantCredentials;
}

export interface ManagedChatGptTenantManagerOptions {
  dataRoot: string;
  exchangeCredentials: (accessToken: string) => Promise<ChatGptTenantCredentials>;
  startDaemon: (input: StartChatGptTenantDaemonInput) => Promise<ChatGptTenantDaemon>;
  now?: () => number;
  refreshSkewMs?: number;
  idleTtlMs?: number;
  maxActiveTenants?: number;
}

interface TenantEntry {
  daemon: ChatGptTenantDaemon;
  credentialExpiresAtMs: number;
  lastUsedAtMs: number;
}

interface CapabilityAuthorization {
  subject: string;
  accessToken: string;
  expiresAtMs: number;
}

const DEFAULT_REFRESH_SKEW_MS = 5 * 60_000;
const DEFAULT_IDLE_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_ACTIVE_TENANTS = 8;

export function chatGptTenantKey(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

export function chatGptTenantDataDir(dataRoot: string, subject: string): string {
  return path.join(dataRoot, 'chatgpt-tenants', chatGptTenantKey(subject));
}

export class ManagedChatGptTenantManager {
  readonly #options: ManagedChatGptTenantManagerOptions;
  readonly #entries = new Map<string, TenantEntry>();
  readonly #pending = new Map<string, Promise<string>>();
  readonly #reaping = new Map<string, Promise<void>>();
  readonly #capabilityAuthorizations = new Map<string, CapabilityAuthorization>();

  constructor(options: ManagedChatGptTenantManagerOptions) {
    this.#options = options;
  }

  async resolve(subject: string, accessToken: string): Promise<string> {
    if (!subject.trim() || !accessToken.trim()) {
      throw new Error('Managed ChatGPT tenants require a subject and OAuth access token.');
    }
    const reaping = this.#reaping.get(subject);
    if (reaping) await reaping;

    const now = this.#now();
    const existing = this.#entries.get(subject);
    if (
      existing?.daemon.isRunning() &&
      existing.credentialExpiresAtMs > now + this.#refreshSkewMs()
    ) {
      existing.lastUsedAtMs = now;
      return existing.daemon.url;
    }

    const inFlight = this.#pending.get(subject);
    if (inFlight) return inFlight;
    if (!existing && this.#entries.size + this.#pending.size >= this.#maxActiveTenants()) {
      throw new Error(
        `Managed ChatGPT tenant capacity is full (${this.#maxActiveTenants()} active tenants).`,
      );
    }
    const starting = this.#replaceTenant(subject, accessToken).finally(() => {
      this.#pending.delete(subject);
    });
    this.#pending.set(subject, starting);
    return starting;
  }

  async resolveCapability(tenantKey: string): Promise<string> {
    const authorization = this.#capabilityAuthorizations.get(tenantKey);
    if (!authorization || authorization.expiresAtMs <= this.#now()) {
      if (authorization) this.#capabilityAuthorizations.delete(tenantKey);
      throw new Error('The ChatGPT artifact link has expired. Return to ChatGPT and refresh the result.');
    }
    return this.resolve(authorization.subject, authorization.accessToken);
  }

  async reapIdle(): Promise<number> {
    const now = this.#now();
    for (const [tenantKey, authorization] of this.#capabilityAuthorizations) {
      if (authorization.expiresAtMs <= now) this.#capabilityAuthorizations.delete(tenantKey);
    }
    const cutoff = now - (this.#options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS);
    const stale = [...this.#entries.entries()].filter(
      ([subject, entry]) =>
        entry.lastUsedAtMs <= cutoff &&
        !this.#pending.has(subject) &&
        !this.#reaping.has(subject),
    );
    await Promise.all(
      stale.map(async ([subject, entry]) => {
        const stopping = entry.daemon.stop().finally(() => {
          if (this.#entries.get(subject) === entry) this.#entries.delete(subject);
          this.#reaping.delete(subject);
        });
        this.#reaping.set(subject, stopping);
        await stopping;
      }),
    );
    return stale.length;
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([...this.#pending.values()]);
    await Promise.allSettled([...this.#reaping.values()]);
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    this.#capabilityAuthorizations.clear();
    await Promise.allSettled(entries.map((entry) => entry.daemon.stop()));
  }

  async #replaceTenant(subject: string, accessToken: string): Promise<string> {
    const credentials = await this.#options.exchangeCredentials(accessToken);
    if (credentials.subject !== subject) {
      throw new Error('Vela returned tenant credentials for a different OAuth subject.');
    }
    const credentialExpiresAtMs = Date.parse(credentials.expiresAt);
    if (!Number.isFinite(credentialExpiresAtMs) || credentialExpiresAtMs <= this.#now()) {
      throw new Error('Vela returned expired tenant credentials.');
    }
    const previous = this.#entries.get(subject);
    if (previous) {
      this.#entries.delete(subject);
      await previous.daemon.stop();
    }
    const daemon = await this.#options.startDaemon({
      subject,
      dataDir: chatGptTenantDataDir(this.#options.dataRoot, subject),
      credentials,
    });
    this.#entries.set(subject, {
      daemon,
      credentialExpiresAtMs,
      lastUsedAtMs: this.#now(),
    });
    this.#capabilityAuthorizations.set(chatGptTenantKey(subject), {
      subject,
      accessToken,
      expiresAtMs: credentialExpiresAtMs,
    });
    return daemon.url;
  }

  #now(): number {
    return this.#options.now?.() ?? Date.now();
  }

  #refreshSkewMs(): number {
    return this.#options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;
  }

  #maxActiveTenants(): number {
    return this.#options.maxActiveTenants ?? DEFAULT_MAX_ACTIVE_TENANTS;
  }
}

function tenantCredentialUrl(env: NodeJS.ProcessEnv): string {
  const configured = String(env.OD_CHATGPT_TENANT_CREDENTIAL_URL ?? '').trim();
  if (configured) return configured;
  const issuer = String(env.OD_CHATGPT_OAUTH_ISSUER ?? '').trim();
  if (!issuer) {
    throw new Error('Managed ChatGPT tenant mode requires OD_CHATGPT_OAUTH_ISSUER.');
  }
  return new URL('/api/v1/open-design/tenant-credentials', issuer).toString();
}

function tenantGatewaySecret(env: NodeJS.ProcessEnv): string {
  const secret = String(env.OD_CHATGPT_TENANT_GATEWAY_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('Managed ChatGPT tenant mode requires OD_CHATGPT_TENANT_GATEWAY_SECRET.');
  }
  return secret;
}

async function exchangeTenantCredentials(
  accessToken: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<ChatGptTenantCredentials> {
  const response = await fetchImpl(tenantCredentialUrl(env), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'x-open-design-gateway-secret': tenantGatewaySecret(env),
    },
  });
  if (!response.ok) {
    throw new Error(`Vela tenant credential exchange failed with status ${response.status}.`);
  }
  const body = await response.json() as Partial<ChatGptTenantCredentials>;
  for (const field of ['subject', 'controlKey', 'runtimeKey', 'expiresAt', 'apiUrl', 'linkUrl'] as const) {
    if (typeof body[field] !== 'string' || !body[field]?.trim()) {
      throw new Error(`Vela tenant credential response is missing ${field}.`);
    }
  }
  return body as ChatGptTenantCredentials;
}

function tenantChildEnvironment(
  env: NodeJS.ProcessEnv,
  input: StartChatGptTenantDaemonInput,
): NodeJS.ProcessEnv {
  return {
    ...env,
    OD_DATA_DIR: input.dataDir,
    OD_BIND_HOST: '127.0.0.1',
    OD_CHATGPT_TENANT_MODE: '',
    OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: '',
    OD_CHATGPT_MCP_ALLOW_UNAUTHENTICATED: '',
    OD_CHATGPT_MCP_TOKEN: '',
    OD_API_TOKEN: '',
    VELA_CONTROL_KEY: input.credentials.controlKey,
    VELA_RUNTIME_KEY: input.credentials.runtimeKey,
    VELA_API_URL: input.credentials.apiUrl,
    VELA_LINK_URL: input.credentials.linkUrl,
  };
}

async function startTenantDaemonProcess(
  input: StartChatGptTenantDaemonInput,
  env: NodeJS.ProcessEnv,
): Promise<ChatGptTenantDaemon> {
  await mkdir(input.dataDir, { recursive: true });
  const entry = String(env.OD_CHATGPT_TENANT_DAEMON_ENTRY ?? process.argv[1] ?? '').trim();
  if (!entry) {
    throw new Error('Managed ChatGPT tenant mode cannot resolve the daemon entrypoint.');
  }
  const child = spawn(
    process.execPath,
    [entry, 'daemon', 'start', '--headless', '--host', '127.0.0.1', '--port', '0'],
    {
      env: tenantChildEnvironment(env, input),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const url = await waitForTenantDaemon(child);
  return {
    url,
    isRunning: () => child.exitCode === null && child.signalCode === null,
    stop: () => stopTenantDaemon(child),
  };
}

async function waitForTenantDaemon(child: ChildProcess): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('error', onError);
      child.off('exit', onExit);
      if (error) reject(error);
      else if (url) resolve(url);
    };
    const onStdout = (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString('utf8')}`.slice(-16_384);
      const match = /\[od\] listening on (https?:\/\/\S+)/u.exec(stdout);
      if (match?.[1]) finish(undefined, match[1]);
    };
    const onStderr = (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_096);
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(
        `Tenant daemon exited during startup (code=${code}, signal=${signal}): ${stderr.trim()}`,
      ));
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error(`Tenant daemon did not become ready within 30 seconds: ${stderr.trim()}`));
    }, 30_000);
    timeout.unref?.();
    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function stopTenantDaemon(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5_000);
    timeout.unref?.();
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function createManagedChatGptTenantManager(input: {
  dataRoot: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): ManagedChatGptTenantManager | null {
  const env = input.env ?? process.env;
  if (String(env.OD_CHATGPT_TENANT_MODE ?? '').trim().toLowerCase() !== 'managed') {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxActiveTenantsRaw = String(
    env.OD_CHATGPT_TENANT_MAX_ACTIVE ?? DEFAULT_MAX_ACTIVE_TENANTS,
  );
  const maxActiveTenants = Number.parseInt(maxActiveTenantsRaw, 10);
  if (!Number.isInteger(maxActiveTenants) || maxActiveTenants <= 0) {
    throw new Error('OD_CHATGPT_TENANT_MAX_ACTIVE must be a positive integer.');
  }
  tenantCredentialUrl(env);
  tenantGatewaySecret(env);
  return new ManagedChatGptTenantManager({
    dataRoot: input.dataRoot,
    maxActiveTenants,
    exchangeCredentials: (accessToken) => exchangeTenantCredentials(accessToken, env, fetchImpl),
    startDaemon: (tenant) => startTenantDaemonProcess(tenant, env),
  });
}
