import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  collectSystemEnvironment,
  diagnosticFailureCode,
  diagnosticId,
  summarizeProxyEnvironment,
  type DiagnosticFailureCode,
  type DiagnosticProxyEnvironment,
  type SystemEnvironmentSnapshot,
} from './diagnostics-environment.js';

const MAX_FAILURES = 100;
const MAX_BYTES = 256 * 1024;
const SAMPLE_INTERVAL_MS = 60_000;
const FLUSH_INTERVAL_MS = 60_000;
const MAX_WORKSPACES = 50;

type Source = 'workspace-directory' | 'workspace-context' | 'team-projects' | 'shared-resources' | 'local-api';
type Workspace = { workspaceId: string | null; memberId: string | null; workspaceType: 'team' | 'personal' | null };
type Failure = Workspace & {
  source: Source;
  code: DiagnosticFailureCode;
  status: number | null;
  operation: string | null;
  requestId: string | null;
  proxySampledAt: string | null;
  firstAt: string;
  lastAt: string;
  count: number;
  firstEnvironmentAt: string | null;
  lastEnvironmentAt: string | null;
  proxyConfiguration: DiagnosticProxyEnvironment | null;
};

export type FailureInput = {
  source: Source;
  operation?: string;
  requestId?: unknown;
  error?: unknown;
  timedOut?: boolean;
  status?: number;
  workspaceId?: unknown;
  memberId?: unknown;
  workspaceType?: unknown;
  /** Already-used child env, only summarized on a new group or once per minute. */
  env?: NodeJS.ProcessEnv;
};

function workspace(value: { workspaceId?: unknown; memberId?: unknown; workspaceType?: unknown }): Workspace {
  return {
    workspaceId: diagnosticId(value.workspaceId),
    memberId: diagnosticId(value.memberId),
    workspaceType: value.workspaceType === 'team' || value.workspaceType === 'personal' ? value.workspaceType : null,
  };
}

export function diagnosticsEvidencePaths(dataRoot: string) {
  const directory = join(dataRoot, 'diagnostics');
  return { directory, current: join(directory, 'environment-evidence.json'), previous: join(directory, 'environment-evidence.previous.json') };
}

/** One bounded checkpoint, plus the preceding process's checkpoint. No growing log or write queue. */
export function createEvidenceCheckpointWriter(dataRoot: string): (content: string) => Promise<void> {
  const paths = diagnosticsEvidencePaths(dataRoot);
  let rotated = false;
  return async (content) => {
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('diagnostics checkpoint exceeds byte limit');
    await mkdir(paths.directory, { recursive: true });
    if (!rotated) {
      await rename(paths.current, paths.previous).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      rotated = true;
    }
    const temporary = `${paths.current}.tmp`;
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, paths.current);
  };
}

export function createDiagnosticsEvidence(options: {
  collect?: () => Promise<SystemEnvironmentSnapshot>;
  write?: (content: string) => Promise<void>;
  now?: () => number;
} = {}) {
  const now = options.now ?? Date.now;
  const failures = new Map<string, Failure>();
  const environments: SystemEnvironmentSnapshot[] = [];
  let directory: { observedAt: string; truncated: boolean; items: Workspace[] } | null = null;
  let context: (Workspace & { observedAt: string }) | null = null;
  let lastSample = -Infinity;
  let collecting: Promise<void> | null = null;
  let writing: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let closed = false;
  let writeFailed = false;
  let droppedGroups = 0;
  let collectionState: 'not-requested' | 'collecting' | 'settled' | 'unavailable' = 'not-requested';

  function snapshot() {
    return {
      schemaVersion: 1,
      exportedAt: new Date(now()).toISOString(),
      limits: { failures: MAX_FAILURES, bytes: MAX_BYTES, sampleIntervalMs: SAMPLE_INTERVAL_MS, flushIntervalMs: FLUSH_INTERVAL_MS },
      coverage: {
        actualNetworkRoute: 'not-observed', vpn: 'not-determined',
        workspaceContext: 'last-daemon-response-not-browser-selection',
        failureEnvironment: 'cached-sample-at-or-before-failure; null-means-not-yet-sampled',
        persistence: options.write ? (writeFailed ? 'unavailable' : 'periodic-checkpoint') : 'memory-only',
        droppedGroups,
        environmentCollection: collectionState,
      },
      directory,
      context,
      environments: [...environments],
      failures: Array.from(failures.values(), (entry) => ({ ...entry })),
    };
  }

  function serialize(): string {
    let content = JSON.stringify(snapshot());
    while (Buffer.byteLength(content) > MAX_BYTES && failures.size > 0) {
      failures.delete(failures.keys().next().value!);
      droppedGroups += 1;
      content = JSON.stringify(snapshot());
    }
    return content;
  }

  function scheduleWrite(): void {
    dirty = true;
    if (!options.write || timer || writing || closed) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
    timer.unref();
  }

  async function flush(): Promise<void> {
    if (writing) return writing;
    if (!dirty || !options.write) return;
    dirty = false;
    const content = serialize();
    writing = Promise.resolve().then(() => options.write!(content)).then(() => {
      writeFailed = false;
    }).catch(() => {
      writeFailed = true;
      // Retry at the next bounded interval, never recurse into the error journal.
      dirty = true;
    }).finally(() => {
      writing = null;
      if (dirty && !closed) scheduleWrite();
    });
    return writing;
  }

  function refresh(): Promise<void> {
    if (closed) return Promise.resolve();
    if (collecting) return collecting;
    if (now() - lastSample < SAMPLE_INTERVAL_MS) return Promise.resolve();
    lastSample = now();
    collectionState = 'collecting';
    collecting = Promise.resolve().then(() => (options.collect ?? collectSystemEnvironment)()).then((environment) => {
      collectionState = 'settled';
      environments.push(environment);
      if (environments.length > 4) environments.shift();
      scheduleWrite();
    }).catch(() => {
      // Collection failure cannot change a business result or invalidate the ZIP.
      collectionState = 'unavailable';
    }).finally(() => { collecting = null; });
    return collecting;
  }

  return {
    refresh,
    flush,
    snapshot: () => JSON.parse(serialize()) as ReturnType<typeof snapshot>,
    record(input: FailureInput): void {
      if (closed) return;
      const identity = workspace(input);
      let code: DiagnosticFailureCode = diagnosticFailureCode(input.error);
      if (input.status) code = 'http';
      if (input.timedOut) code = 'timeout';
      const status = Number.isInteger(input.status) && input.status! >= 400 && input.status! <= 599 ? input.status! : null;
      const operation = input.operation && /^[a-zA-Z0-9/_.:-]{1,160}$/.test(input.operation) ? input.operation : null;
      const key = `${operation}:${input.source}:${code}:${status}:${identity.workspaceId}:${identity.memberId}:${identity.workspaceType}`;
      const timestamp = now();
      const time = new Date(timestamp).toISOString();
      const environmentAt = environments.at(-1)?.sampledAt ?? null;
      const existing = failures.get(key);
      if (existing) {
        existing.count = Math.min(existing.count + 1, Number.MAX_SAFE_INTEGER);
        if (input.env && timestamp - Date.parse(existing.proxySampledAt ?? existing.firstAt) >= SAMPLE_INTERVAL_MS) {
          existing.proxyConfiguration = summarizeProxyEnvironment(input.env);
          existing.proxySampledAt = time;
        }
        existing.lastAt = time;
        existing.requestId = diagnosticId(input.requestId);
        existing.lastEnvironmentAt = environmentAt;
        failures.delete(key);
        failures.set(key, existing);
      } else {
        failures.set(key, {
          ...identity,
          source: input.source,
          code,
          status,
          operation,
          requestId: diagnosticId(input.requestId),
          proxySampledAt: input.env ? time : null,
          firstAt: time,
          lastAt: time,
          count: 1,
          firstEnvironmentAt: environmentAt,
          lastEnvironmentAt: environmentAt,
          proxyConfiguration: input.env ? summarizeProxyEnvironment(input.env) : null,
        });
        if (failures.size > MAX_FAILURES) {
          failures.delete(failures.keys().next().value!);
          droppedGroups += 1;
        }
      }
      scheduleWrite();
      if (!collecting && now() - lastSample >= SAMPLE_INTERVAL_MS) void refresh();
    },
    observeDirectory(items: readonly { workspaceId?: unknown; memberId?: unknown; workspaceType?: unknown; workspaceMemberId?: unknown }[]): void {
      if (closed) return;
      directory = { observedAt: new Date(now()).toISOString(), truncated: items.length > MAX_WORKSPACES,
        items: items.slice(0, MAX_WORKSPACES).map((item) => workspace({ ...item, memberId: item.memberId ?? item.workspaceMemberId })) };
    },
    observeContext(value: { workspaceId?: unknown; memberId?: unknown; workspaceType?: unknown } | null): void {
      if (closed) return;
      context = value ? { ...workspace(value), observedAt: new Date(now()).toISOString() } : null;
    },
    close(): void {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export type DiagnosticsEvidence = ReturnType<typeof createDiagnosticsEvidence>;
let activeEvidence: DiagnosticsEvidence | null = null;

/** Configure once with the daemon's resolved data root; readers never guess it. */
export function configureDiagnosticsEvidence(dataRoot: string): void {
  activeEvidence?.close();
  activeEvidence = createDiagnosticsEvidence({ write: createEvidenceCheckpointWriter(dataRoot) });
}

export function getDiagnosticsEvidence(): DiagnosticsEvidence | null { return activeEvidence; }

export function recordDiagnosticFailure(input: FailureInput): void {
  try { activeEvidence?.record(input); } catch { /* Diagnostics must not replace the business failure. */ }
}
