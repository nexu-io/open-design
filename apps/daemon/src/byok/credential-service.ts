import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  ByokChatProviderConfig,
  ByokCredentialProfile,
  UpsertByokCredentialProfileRequest,
} from '@open-design/contracts';
import {
  isNodePtyUnavailableError,
  loadNodePty,
} from '../services/node-pty.js';

const PROFILE_ID_PATTERN = /^byok-[a-z0-9][a-z0-9._-]{2,95}$/u;
const KEYCHAIN_SERVICE = 'dev.opendesign.byok';
const MAX_SECRET_OUTPUT_BYTES = 64 * 1024;
const INTERACTIVE_SECRET_TIMEOUT_MS = 10_000;

type StoredProfile = Omit<ByokCredentialProfile, 'configured' | 'keyTail'>;
type StoredDocument = {
  version: 1;
  profiles: StoredProfile[];
};

export interface ByokSecretBackend {
  readonly kind: string;
  available(): Promise<boolean>;
  set(profileId: string, secret: string): Promise<void>;
  get(profileId: string): Promise<string | null>;
  delete(profileId: string): Promise<boolean>;
}

export interface ResolvedByokCredentialProfile {
  profile: ByokCredentialProfile;
  provider: ByokChatProviderConfig;
  apiKey: string;
}

export interface ByokCredentialServiceOptions {
  backend?: ByokSecretBackend;
  dataDir: string;
  persistMetadata?: (
    metadataPath: string,
    document: { version: 1; profiles: readonly unknown[] },
  ) => Promise<void>;
}

export class ByokCredentialService {
  readonly backend: ByokSecretBackend;
  readonly metadataPath: string;
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly persistMetadata: NonNullable<
    ByokCredentialServiceOptions['persistMetadata']
  >;

  constructor(options: ByokCredentialServiceOptions) {
    this.backend = options.backend ?? createPlatformByokSecretBackend(
      process.platform,
      options.dataDir,
    );
    this.metadataPath = path.join(options.dataDir, 'byok', 'profiles.json');
    this.persistMetadata = options.persistMetadata ?? writeMetadataDocument;
  }

  async status(): Promise<{ available: boolean; backend: string }> {
    return {
      available: await this.backend.available(),
      backend: this.backend.kind,
    };
  }

  async list(): Promise<ByokCredentialProfile[]> {
    const document = await this.readDocument();
    return Promise.all(document.profiles.map((profile) => this.toPublicProfile(profile)));
  }

  async get(profileId: string): Promise<ByokCredentialProfile | null> {
    assertProfileId(profileId);
    const stored = (await this.readDocument()).profiles.find((profile) => profile.id === profileId);
    return stored ? this.toPublicProfile(stored) : null;
  }

  /**
   * Checks profile metadata without reading the OS credential store. Run
   * admission uses this so the secret is not materialized until the runtime is
   * actually being started.
   */
  async has(profileId: string): Promise<boolean> {
    assertProfileId(profileId);
    return (await this.readDocument()).profiles.some((profile) => profile.id === profileId);
  }

  async upsert(input: UpsertByokCredentialProfileRequest): Promise<ByokCredentialProfile> {
    return this.serializeMutation(() => this.upsertUnlocked(input));
  }

  private async upsertUnlocked(
    input: UpsertByokCredentialProfileRequest,
  ): Promise<ByokCredentialProfile> {
    const available = await this.backend.available();
    if (!available) {
      throw new Error('Secure credential storage is unavailable on this system.');
    }
    const normalized = normalizeProfileInput(input);
    const document = await this.readDocument();
    const existingIndex = input.id
      ? document.profiles.findIndex((profile) => profile.id === input.id)
      : -1;
    const now = Date.now();
    const id = input.id ?? createProfileId();
    assertProfileId(id);
    const existing = existingIndex >= 0 ? document.profiles[existingIndex] : undefined;
    const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    if (normalized.requiresApiKey && !apiKey && !existing) {
      throw new Error('An API key is required when creating this BYOK profile.');
    }
    const previousSecret = apiKey ? await this.backend.get(id) : null;
    if (apiKey) {
      await this.backend.set(id, apiKey);
    } else if (normalized.requiresApiKey && !(await this.backend.get(id))) {
      throw new Error('The BYOK profile has no credential in secure storage.');
    }
    const stored: StoredProfile = {
      id,
      ...normalized,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingIndex >= 0) document.profiles[existingIndex] = stored;
    else document.profiles.push(stored);
    try {
      await this.writeDocument(document);
    } catch (error) {
      if (apiKey) {
        await this.restoreSecretAfterMetadataFailure(
          id,
          previousSecret,
          error,
        );
      }
      throw error;
    }
    return this.toPublicProfile(stored);
  }

  async resolve(profileId: string): Promise<ResolvedByokCredentialProfile | null> {
    assertProfileId(profileId);
    const stored = (await this.readDocument()).profiles.find((profile) => profile.id === profileId);
    if (!stored) return null;
    const apiKey = stored.requiresApiKey ? (await this.backend.get(profileId))?.trim() ?? '' : '';
    if (stored.requiresApiKey && !apiKey) return null;
    const profile = await this.toPublicProfile(stored, apiKey);
    return {
      profile,
      apiKey,
      provider: {
        protocol: stored.protocol,
        apiKey,
        baseUrl: stored.baseUrl,
        model: stored.model,
        requiresApiKey: stored.requiresApiKey,
        ...(stored.apiVersion ? { apiVersion: stored.apiVersion } : {}),
      },
    };
  }

  async delete(profileId: string): Promise<boolean> {
    return this.serializeMutation(() => this.deleteUnlocked(profileId));
  }

  private async deleteUnlocked(profileId: string): Promise<boolean> {
    assertProfileId(profileId);
    const document = await this.readDocument();
    const next = document.profiles.filter((profile) => profile.id !== profileId);
    const existed = next.length !== document.profiles.length;
    const previousSecret = await this.backend.get(profileId);
    const secretDeleted = await this.backend.delete(profileId);
    if (existed) {
      document.profiles = next;
      try {
        await this.writeDocument(document);
      } catch (error) {
        if (secretDeleted && previousSecret !== null) {
          await this.restoreSecretAfterMetadataFailure(
            profileId,
            previousSecret,
            error,
          );
        }
        throw error;
      }
    }
    return existed || secretDeleted;
  }

  private serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async toPublicProfile(
    profile: StoredProfile,
    knownSecret?: string,
  ): Promise<ByokCredentialProfile> {
    const secret = profile.requiresApiKey
      ? knownSecret ?? await this.backend.get(profile.id) ?? ''
      : '';
    return {
      ...profile,
      configured: !profile.requiresApiKey || Boolean(secret),
      ...(secret ? { keyTail: secret.slice(-4) } : {}),
    };
  }

  private async readDocument(): Promise<StoredDocument> {
    try {
      const parsed = JSON.parse(await readFile(this.metadataPath, 'utf8')) as Partial<StoredDocument>;
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
        return { version: 1, profiles: [] };
      }
      return {
        version: 1,
        profiles: parsed.profiles.filter(isStoredProfile),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, profiles: [] };
      }
      throw error;
    }
  }

  private async writeDocument(document: StoredDocument): Promise<void> {
    await this.persistMetadata(this.metadataPath, document);
  }

  private async restoreSecretAfterMetadataFailure(
    profileId: string,
    previousSecret: string | null,
    metadataError: unknown,
  ): Promise<void> {
    try {
      if (previousSecret === null) {
        await this.backend.delete(profileId);
      } else {
        await this.backend.set(profileId, previousSecret);
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [metadataError, rollbackError],
        'BYOK metadata persistence failed and the secure credential rollback also failed.',
      );
    }
  }
}

async function writeMetadataDocument(
  metadataPath: string,
  document: { version: 1; profiles: readonly unknown[] },
): Promise<void> {
  await mkdir(path.dirname(metadataPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${metadataPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporaryPath, metadataPath);
}

function normalizeProfileInput(
  input: UpsertByokCredentialProfileRequest,
): Omit<StoredProfile, 'id' | 'createdAt' | 'updatedAt'> {
  const label = requiredBoundedString(input.label, 'label', 120);
  const baseUrl = requiredBoundedString(input.baseUrl, 'baseUrl', 2_048).replace(/\/+$/u, '');
  const model = requiredBoundedString(input.model, 'model', 256);
  const protocol = input.protocol;
  if (!['anthropic', 'openai', 'azure', 'google', 'ollama', 'senseaudio', 'aihubmix'].includes(protocol)) {
    throw new Error('Unsupported BYOK protocol.');
  }
  try {
    const parsed = new URL(baseUrl);
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username.length > 0
      || parsed.password.length > 0
      || parsed.search.length > 0
      || parsed.hash.length > 0
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(
      'BYOK baseUrl must be an absolute HTTP(S) URL without credentials, query, or fragment.',
    );
  }
  const apiVersion = typeof input.apiVersion === 'string' ? input.apiVersion.trim() : '';
  return {
    label,
    protocol,
    baseUrl,
    model,
    requiresApiKey: input.requiresApiKey !== false,
    ...(apiVersion ? { apiVersion: apiVersion.slice(0, 128) } : {}),
  };
}

function requiredBoundedString(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.length > max) {
    throw new Error(`${field} is required and must be at most ${max} characters.`);
  }
  return trimmed;
}

function createProfileId(): string {
  return `byok-${randomUUID()}`;
}

function assertProfileId(profileId: string): void {
  if (!PROFILE_ID_PATTERN.test(profileId)) throw new Error('Invalid BYOK profile id.');
}

function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as Partial<StoredProfile>;
  return typeof profile.id === 'string'
    && PROFILE_ID_PATTERN.test(profile.id)
    && typeof profile.label === 'string'
    && typeof profile.protocol === 'string'
    && typeof profile.baseUrl === 'string'
    && typeof profile.model === 'string'
    && typeof profile.requiresApiKey === 'boolean'
    && typeof profile.createdAt === 'number'
    && typeof profile.updatedAt === 'number';
}

export function createPlatformByokSecretBackend(
  platform: NodeJS.Platform = process.platform,
  dataDir?: string,
): ByokSecretBackend {
  if (platform === 'darwin') return new MacOsKeychainBackend();
  if (platform === 'linux') return new LinuxSecretServiceBackend();
  if (platform === 'win32' && dataDir) {
    return new RetiredWindowsSecretCleanupBackend(
      path.join(dataDir, 'byok', 'secrets'),
    );
  }
  return new UnavailableSecretBackend(platform);
}

class MacOsKeychainBackend implements ByokSecretBackend {
  readonly kind = 'macos-keychain';
  private writable: boolean | null = null;

  async available() {
    return this.writable !== false && await commandAvailable('/usr/bin/security');
  }

  async set(profileId: string, secret: string) {
    try {
      await runInteractiveMacOsSecretCommand(
        '/usr/bin/security',
        ['add-generic-password', '-a', profileId, '-s', KEYCHAIN_SERVICE, '-U', '-w'],
        secret,
      );
      this.writable = true;
    } catch (error) {
      this.writable = false;
      if (isNodePtyUnavailableError(error)) {
        throw new Error(
          'Secure credential storage is unavailable because its native PTY helper could not be loaded.',
          { cause: error },
        );
      }
      throw new Error('Secure credential backend command failed.');
    }
  }

  async get(profileId: string) {
    const result = await runSecretCommand(
      '/usr/bin/security',
      ['find-generic-password', '-a', profileId, '-s', KEYCHAIN_SERVICE, '-w'],
      undefined,
      true,
    );
    return result === null ? null : result.trimEnd();
  }

  async delete(profileId: string) {
    return (await runSecretCommand(
      '/usr/bin/security',
      ['delete-generic-password', '-a', profileId, '-s', KEYCHAIN_SERVICE],
      undefined,
      true,
    )) !== null;
  }
}

class LinuxSecretServiceBackend implements ByokSecretBackend {
  readonly kind = 'linux-secret-service';
  private readonly command = 'secret-tool';

  async available() {
    return commandAvailable(this.command);
  }

  async set(profileId: string, secret: string) {
    await runSecretCommand(
      this.command,
      ['store', '--label=Open Design BYOK', 'service', KEYCHAIN_SERVICE, 'account', profileId],
      secret,
    );
  }

  async get(profileId: string) {
    const result = await runSecretCommand(
      this.command,
      ['lookup', 'service', KEYCHAIN_SERVICE, 'account', profileId],
      undefined,
      true,
    );
    return result === null ? null : result.trimEnd();
  }

  async delete(profileId: string) {
    return (await runSecretCommand(
      this.command,
      ['clear', 'service', KEYCHAIN_SERVICE, 'account', profileId],
      undefined,
      true,
    )) !== null;
  }
}

class UnavailableSecretBackend implements ByokSecretBackend {
  readonly kind: string;

  constructor(platform: NodeJS.Platform) {
    this.kind = `unavailable-${platform}`;
  }

  async available() { return false; }
  async set(_profileId: string, _secret: string) {
    throw new Error('Secure credential storage is unavailable on this system.');
  }
  async get(_profileId: string) { return null; }
  async delete(_profileId: string) { return false; }
}

class RetiredWindowsSecretCleanupBackend extends UnavailableSecretBackend {
  constructor(private readonly secretsDir: string) {
    super('win32');
  }

  override async delete(profileId: string) {
    assertProfileId(profileId);
    try {
      await unlink(path.join(this.secretsDir, `${profileId}.bin`));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  if (path.isAbsolute(command)) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  return Promise.any(pathEntries.map(async (entry) => {
    const candidate = path.join(entry, command);
    await access(candidate);
    return true;
  })).catch(() => false);
}

async function runSecretCommand(
  command: string,
  args: string[],
  secretInput?: string,
  allowNotFound = false,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_SECRET_OUTPUT_BYTES) stdout.push(chunk);
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('Secure credential backend command failed.')));
    child.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(stdout).toString('utf8'));
      if (allowNotFound && code === 44) return resolve(null);
      if (allowNotFound && code === 1) return resolve(null);
      return reject(new Error('Secure credential backend command failed.'));
    });
    if (secretInput !== undefined) child.stdin.end(`${secretInput}\n`);
    else child.stdin.end();
  });
}

/**
 * `security add-generic-password -w` intentionally prompts twice when the
 * password argument is omitted. A regular stdin pipe is not accepted by the
 * macOS tool, while putting the key after `-w` exposes it in the process list.
 * Drive only those bounded prompts through a pseudo-terminal and keep all
 * output private.
 */
async function runInteractiveMacOsSecretCommand(
  command: string,
  args: string[],
  secret: string,
): Promise<void> {
  const { spawn: spawnPty } = await loadNodePty();
  return new Promise((resolve, reject) => {
    let settled = false;
    let promptResponses = 0;
    let promptScan = '';
    let dataDisposable: { dispose(): void } | null = null;
    let exitDisposable: { dispose(): void } | null = null;
    // `security` does not reliably disable terminal echo before its password
    // prompts. Use a fixed shell program (no interpolation) to disable echo,
    // then exec the command and its validated argv verbatim.
    const child = spawnPty('/bin/sh', [
      '-c',
      'stty -echo; exec "$@"',
      'open-design-keychain',
      command,
      ...args,
    ], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: { ...process.env },
    });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      dataDisposable?.dispose();
      exitDisposable?.dispose();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Best-effort termination; the generic failure below stays secret-free.
      }
      finish(new Error('Secure credential backend command failed.'));
    }, INTERACTIVE_SECRET_TIMEOUT_MS);
    timer.unref?.();
    dataDisposable = child.onData((chunk) => {
      // Security prompts should disable terminal echo. Redact defensively
      // before retaining the bounded prompt tail anyway.
      const safeChunk = secret
        ? chunk.split(secret).join('[redacted]')
        : chunk;
      promptScan = `${promptScan}${safeChunk}`.slice(-512);
      const promptCount = (
        promptScan.match(/(?:retype[^\r\n:]*|password[^\r\n:]*)\s*:/giu)
        ?? []
      ).length;
      while (promptResponses < Math.min(promptCount, 2)) {
        child.write(`${secret}\r`);
        promptResponses += 1;
      }
    });
    exitDisposable = child.onExit(({ exitCode }) => {
      finish(
        exitCode === 0
          ? undefined
          : new Error('Secure credential backend command failed.'),
      );
    });
  });
}
