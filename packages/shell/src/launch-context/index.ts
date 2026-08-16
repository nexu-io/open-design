import { randomUUID, createHash } from "node:crypto";
import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const PACKAGED_LAUNCH_CONTEXT_FILE = "open-design-launch-context.json";
export const PACKAGED_LAUNCH_CONTEXT_SCHEMA_VERSION = 2;
export const DEFAULT_LAUNCH_CONTEXT_TTL_MS = 6 * 60 * 60 * 1_000;

export type LaunchContextOwner = {
  pid: number;
  startedAt: string;
};

export type LaunchContextTarget = {
  namespace: string;
  namespaceBaseRoot: string;
};

type LaunchContextSnapshot = {
  bodyBase64: string;
  sha256: string;
};

export type PackagedLaunchContext = {
  createdAt: string;
  expiresAt: string;
  owner: LaunchContextOwner;
  previous: LaunchContextSnapshot | null;
  schemaVersion: 2;
  sessionId: string;
  state: "active" | "pending" | "relaunchable";
  target: LaunchContextTarget;
  updatedAt: string;
};

export type LaunchContextRuntime = {
  isProcessAlive?: (pid: number) => boolean;
  now?: () => Date;
  pathExists?: (path: string) => Promise<boolean>;
};

type ParsedContext = { body: string; context: PackagedLaunchContext };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runtimeDefaults(runtime: LaunchContextRuntime) {
  return {
    isProcessAlive: runtime.isProcessAlive ?? defaultIsProcessAlive,
    now: runtime.now ?? (() => new Date()),
    pathExists: runtime.pathExists ?? defaultPathExists,
  };
}

function sha256(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

function parseIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOwner(value: unknown): LaunchContextOwner | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.pid) || Number(value.pid) < 1) return null;
  if (parseIso(value.startedAt) == null) return null;
  return { pid: Number(value.pid), startedAt: String(value.startedAt) };
}

export function createLaunchContextTarget(input: {
  namespace?: string;
  namespaceBaseRoot?: string;
}): LaunchContextTarget | null {
  const namespace = input.namespace?.trim();
  const namespaceBaseRoot = input.namespaceBaseRoot?.trim();
  if (!namespace || !namespaceBaseRoot) return null;
  return { namespace, namespaceBaseRoot: resolve(namespaceBaseRoot) };
}

export function parsePackagedLaunchContext(value: unknown): PackagedLaunchContext | null {
  if (!isRecord(value) || value.schemaVersion !== PACKAGED_LAUNCH_CONTEXT_SCHEMA_VERSION) return null;
  const owner = parseOwner(value.owner);
  const target = isRecord(value.target) ? createLaunchContextTarget(value.target) : null;
  const state = value.state;
  if (
    owner == null
    || target == null
    || typeof value.sessionId !== "string"
    || value.sessionId.length < 8
    || (state !== "active" && state !== "pending" && state !== "relaunchable")
    || parseIso(value.createdAt) == null
    || parseIso(value.updatedAt) == null
    || parseIso(value.expiresAt) == null
  ) return null;

  let previous: LaunchContextSnapshot | null = null;
  if (value.previous != null) {
    if (
      !isRecord(value.previous)
      || typeof value.previous.bodyBase64 !== "string"
      || !/^[0-9a-f]{64}$/.test(String(value.previous.sha256))
    ) return null;
    const body = Buffer.from(value.previous.bodyBase64, "base64").toString("utf8");
    if (sha256(body) !== value.previous.sha256) return null;
    previous = { bodyBase64: value.previous.bodyBase64, sha256: String(value.previous.sha256) };
  }

  return {
    createdAt: String(value.createdAt),
    expiresAt: String(value.expiresAt),
    owner,
    previous,
    schemaVersion: PACKAGED_LAUNCH_CONTEXT_SCHEMA_VERSION,
    sessionId: value.sessionId,
    state,
    target,
    updatedAt: String(value.updatedAt),
  };
}

async function readContext(path: string): Promise<ParsedContext | null> {
  try {
    const body = await readFile(path, "utf8");
    const context = parsePackagedLaunchContext(JSON.parse(body) as unknown);
    return context == null ? null : { body, context };
  } catch {
    return null;
  }
}

async function atomicWrite(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, body, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}

async function writeContext(path: string, context: PackagedLaunchContext): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(context, null, 2)}\n`);
}

async function restoreSnapshot(path: string, snapshot: LaunchContextSnapshot | null): Promise<void> {
  if (snapshot == null) {
    await rm(path, { force: true });
    return;
  }
  const body = Buffer.from(snapshot.bodyBase64, "base64").toString("utf8");
  if (sha256(body) !== snapshot.sha256) throw new Error("launch context previous snapshot digest mismatch");
  await atomicWrite(path, body);
}

async function acquireLock(path: string, runtime: ReturnType<typeof runtimeDefaults>): Promise<() => Promise<void>> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 2_000;
  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ createdAt: runtime.now().toISOString(), pid: process.pid })}\n`);
      await handle.close();
      return async () => await rm(lockPath, { force: true });
    } catch (error) {
      const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
      if (code !== "EEXIST") throw error;
      let stale = false;
      try {
        const lock = JSON.parse(await readFile(lockPath, "utf8")) as unknown;
        stale = !isRecord(lock)
          || !Number.isSafeInteger(lock.pid)
          || !runtime.isProcessAlive(Number(lock.pid))
          || (parseIso(lock.createdAt) ?? 0) < runtime.now().getTime() - 30_000;
      } catch {
        stale = true;
      }
      if (stale) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`launch context is locked: ${path}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  }
}

async function withLock<T>(path: string, input: LaunchContextRuntime, operation: (runtime: ReturnType<typeof runtimeDefaults>) => Promise<T>): Promise<T> {
  const runtime = runtimeDefaults(input);
  const release = await acquireLock(path, runtime);
  try {
    return await operation(runtime);
  } finally {
    await release();
  }
}

function isExpired(context: PackagedLaunchContext, now: Date): boolean {
  return Date.parse(context.expiresAt) <= now.getTime();
}

async function isUsable(context: PackagedLaunchContext, runtime: ReturnType<typeof runtimeDefaults>): Promise<boolean> {
  return !isExpired(context, runtime.now()) && await runtime.pathExists(context.target.namespaceBaseRoot);
}

async function recoverUnlocked(path: string, runtime: ReturnType<typeof runtimeDefaults>): Promise<"absent" | "recovered" | "valid"> {
  let rawExists = true;
  try {
    await access(path);
  } catch {
    rawExists = false;
  }
  if (!rawExists) return "absent";

  const parsed = await readContext(path);
  if (parsed == null) {
    await rm(path, { force: true });
    return "recovered";
  }
  const { context } = parsed;
  const ownerRequired = context.state === "active" || context.state === "pending";
  if (
    !await isUsable(context, runtime)
    || (ownerRequired && !runtime.isProcessAlive(context.owner.pid))
  ) {
    await restoreSnapshot(path, context.previous);
    return "recovered";
  }
  return "valid";
}

export async function recoverPackagedLaunchContext(
  path: string,
  input: LaunchContextRuntime = {},
): Promise<"absent" | "recovered" | "valid"> {
  return await withLock(path, input, async (runtime) => await recoverUnlocked(path, runtime));
}

export async function beginPackagedLaunchContext(input: {
  owner?: LaunchContextOwner;
  path: string;
  runtime?: LaunchContextRuntime;
  sessionId?: string;
  target: LaunchContextTarget;
  ttlMs?: number;
}): Promise<PackagedLaunchContext> {
  return await withLock(input.path, input.runtime ?? {}, async (runtime) => {
    const recovery = await recoverUnlocked(input.path, runtime);
    if (recovery === "valid") throw new Error(`launch context transaction is already active: ${input.path}`);
    const now = runtime.now();
    const ttlMs = input.ttlMs ?? DEFAULT_LAUNCH_CONTEXT_TTL_MS;
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000) throw new Error("launch context ttlMs must be at least 1000");
    if (!await runtime.pathExists(input.target.namespaceBaseRoot)) {
      throw new Error(`launch context namespace base root does not exist: ${input.target.namespaceBaseRoot}`);
    }
    const owner = input.owner ?? { pid: process.pid, startedAt: now.toISOString() };
    const context: PackagedLaunchContext = {
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      owner,
      previous: null,
      schemaVersion: PACKAGED_LAUNCH_CONTEXT_SCHEMA_VERSION,
      sessionId: input.sessionId ?? randomUUID(),
      state: "pending",
      target: createLaunchContextTarget(input.target)!,
      updatedAt: now.toISOString(),
    };
    await writeContext(input.path, context);
    return context;
  });
}

/** Re-arm a parked transaction so an external launcher can hand it to the next process. */
export async function rearmPackagedLaunchContext(input: {
  owner?: LaunchContextOwner;
  path: string;
  runtime?: LaunchContextRuntime;
  target: LaunchContextTarget;
}): Promise<PackagedLaunchContext | null> {
  return await withLock(input.path, input.runtime ?? {}, async (runtime) => {
    const parsed = await readContext(input.path);
    if (parsed == null || !await isUsable(parsed.context, runtime)) return null;
    const context = parsed.context;
    const target = createLaunchContextTarget(input.target);
    if (
      context.state !== "relaunchable"
      || target == null
      || context.target.namespace !== target.namespace
      || context.target.namespaceBaseRoot !== target.namespaceBaseRoot
    ) return null;
    const now = runtime.now();
    const rearmed = {
      ...context,
      owner: input.owner ?? { pid: process.pid, startedAt: now.toISOString() },
      state: "pending" as const,
      updatedAt: now.toISOString(),
    };
    await writeContext(input.path, rearmed);
    return rearmed;
  });
}

export async function claimPackagedLaunchContext(input: {
  owner?: LaunchContextOwner;
  path: string;
  runtime?: LaunchContextRuntime;
  sessionId?: string;
}): Promise<PackagedLaunchContext | null> {
  return await withLock(input.path, input.runtime ?? {}, async (runtime) => {
    const parsed = await readContext(input.path);
    if (parsed == null || !await isUsable(parsed.context, runtime)) {
      if (parsed != null) await restoreSnapshot(input.path, parsed.context.previous);
      else await rm(input.path, { force: true });
      return null;
    }
    const context = parsed.context;
    if (input.sessionId != null && context.sessionId !== input.sessionId) return null;
    if (context.state === "active" && runtime.isProcessAlive(context.owner.pid)) {
      return context;
    }
    if (context.state !== "pending" && context.state !== "relaunchable") {
      await restoreSnapshot(input.path, context.previous);
      return null;
    }
    const now = runtime.now();
    const owner = input.owner ?? { pid: process.pid, startedAt: now.toISOString() };
    const claimed = { ...context, owner, state: "active" as const, updatedAt: now.toISOString() };
    await writeContext(input.path, claimed);
    return claimed;
  });
}

export async function markPackagedLaunchContextRelaunchable(input: {
  ownerPid?: number;
  path: string;
  runtime?: LaunchContextRuntime;
  sessionId?: string;
}): Promise<boolean> {
  return await withLock(input.path, input.runtime ?? {}, async (runtime) => {
    const parsed = await readContext(input.path);
    if (parsed == null) return false;
    const context = parsed.context;
    if (input.sessionId != null && context.sessionId !== input.sessionId) return false;
    if (input.ownerPid != null && context.owner.pid !== input.ownerPid) return false;
    const updated = { ...context, state: "relaunchable" as const, updatedAt: runtime.now().toISOString() };
    await writeContext(input.path, updated);
    return true;
  });
}

export async function restorePackagedLaunchContext(input: {
  path: string;
  runtime?: LaunchContextRuntime;
  sessionId?: string;
}): Promise<boolean> {
  return await withLock(input.path, input.runtime ?? {}, async () => {
    const parsed = await readContext(input.path);
    if (parsed == null) {
      await rm(input.path, { force: true });
      return false;
    }
    if (input.sessionId != null && parsed.context.sessionId !== input.sessionId) return false;
    await restoreSnapshot(input.path, parsed.context.previous);
    return true;
  });
}
