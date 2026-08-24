import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const defaultHeartbeatIntervalMs = 5_000;
const defaultLeaseDurationMs = 15_000;
let sequence = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const canonical = (value) => `${JSON.stringify(value)}\n`;

async function replaceFile(from, to) {
  try { await rename(from, to); }
  catch (error) {
    if (process.platform !== "win32" || (error?.code !== "EPERM" && error?.code !== "EEXIST")) throw error;
    await unlink(to).catch((unlinkError) => { if (unlinkError?.code !== "ENOENT") throw unlinkError; });
    await rename(from, to);
  }
}

function initial(scope) {
  return {
    schemaVersion: 1,
    scope,
    state: "stopped",
    generationId: null,
    instanceId: null,
    attachments: [],
    fence: 0,
    leaseExpiresAt: null,
    stop: null,
  };
}

function publicStatus(state, heartbeatIntervalMs) {
  return {
    scope: state.scope,
    state: state.state,
    generationId: state.generationId,
    instanceId: state.instanceId,
    references: state.attachments.length,
    fence: state.fence,
    lease: state.state === "running" && state.leaseExpiresAt != null
      ? { heartbeatIntervalMs, expiresAt: state.leaseExpiresAt }
      : null,
  };
}

export class FileFixtureLifecyclePort {
  constructor(root, options = {}) {
    this.root = root;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
    this.leaseDurationMs = options.leaseDurationMs ?? defaultLeaseDurationMs;
    if (!Number.isInteger(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 1_000) throw new Error("invalid fixture heartbeat interval");
    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs <= 0) throw new Error("invalid fixture lease duration");
  }

  paths(scope) {
    const directory = join(this.root, "channels", scope.channel, "namespaces", scope.namespace, "fixture");
    return { state: join(directory, "lifecycle.json"), lock: join(directory, "lifecycle.lock") };
  }

  async read(scope) {
    const { state: path } = this.paths(scope);
    try {
      const value = JSON.parse(await readFile(path, "utf8"));
      if (value?.schemaVersion !== 1 || value.scope?.channel !== scope.channel || value.scope?.namespace !== scope.namespace) {
        throw new Error("invalid fixture lifecycle state");
      }
      return value;
    } catch (error) {
      if (error?.code === "ENOENT") return initial({ ...scope });
      throw error;
    }
  }

  async write(scope, value) {
    const { state: path } = this.paths(scope);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, canonical(value), { encoding: "utf8", flag: "wx" });
    try { await replaceFile(temporary, path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }

  async transaction(scope, operation) {
    const { lock } = this.paths(scope);
    await mkdir(dirname(lock), { recursive: true });
    let handle;
    const owner = canonical({ owner: randomUUID(), pid: process.pid, acquiredAt: new Date().toISOString() });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try { handle = await open(lock, "wx"); break; }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const metadata = await stat(lock).catch(() => null);
        if (metadata != null && Date.now() - metadata.mtimeMs > 30_000) {
          await unlink(lock).catch(() => undefined);
          continue;
        }
        await sleep(10);
      }
    }
    if (handle == null) throw new Error("fixture lifecycle transaction timed out");
    try {
      await handle.writeFile(owner);
      const state = await this.read(scope);
      const now = Date.now();
      if (state.state === "running") {
        state.attachments = state.attachments.filter(({ heartbeatAt }) => now - Date.parse(heartbeatAt) <= this.leaseDurationMs);
        const leaseExpired = state.leaseExpiresAt == null || Date.parse(state.leaseExpiresAt) <= now;
        if (state.attachments.length === 0 && leaseExpired) {
          state.state = "stopped";
          state.generationId = null;
          state.instanceId = null;
          state.leaseExpiresAt = null;
          state.fence += 1;
        }
      }
      const next = await operation(state);
      await this.write(scope, next);
      return publicStatus(next, this.heartbeatIntervalMs);
    } finally {
      await handle.close();
      const currentOwner = await readFile(lock, "utf8").catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      });
      if (currentOwner === owner) await unlink(lock).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    }
  }

  start(scope, generation, attachment) {
    return this.transaction(scope, async (state) => {
      if (state.state === "running" && state.generationId !== generation.id) {
        const error = new Error("another generation owns the shared fixture instance");
        error.code = "standalone-occupied";
        throw error;
      }
      if (state.state !== "running") {
        state.state = "running";
        state.generationId = generation.id;
        state.instanceId = randomUUID();
        state.attachments = [];
        state.fence += 1;
        state.stop = null;
      }
      const heartbeatAt = new Date().toISOString();
      state.leaseExpiresAt = new Date(Date.parse(heartbeatAt) + this.leaseDurationMs).toISOString();
      state.attachments = state.attachments.filter(({ id }) => id !== attachment.id);
      state.attachments.push({ ...attachment, heartbeatAt });
      return state;
    });
  }

  heartbeat(scope, attachment) {
    return this.transaction(scope, async (state) => {
      const existing = state.attachments.find(({ id }) => id === attachment.id);
      if (state.state !== "running" || existing == null) throw new Error("fixture attachment is unavailable");
      Object.assign(existing, attachment, { heartbeatAt: new Date().toISOString() });
      state.leaseExpiresAt = new Date(Date.now() + this.leaseDurationMs).toISOString();
      return state;
    });
  }

  release(scope, attachmentId) {
    return this.transaction(scope, async (state) => {
      state.attachments = state.attachments.filter(({ id }) => id !== attachmentId);
      return state;
    });
  }

  status(scope) {
    return this.transaction(scope, async (state) => state);
  }

  stop(scope, fence) {
    return this.transaction(scope, async (state) => {
      if (state.fence !== fence) throw new Error("stale fixture lifecycle stop fence");
      state.stop = { requestedAt: new Date().toISOString(), fence: state.fence + 1 };
      state.state = "stopped";
      state.generationId = null;
      state.instanceId = null;
      state.attachments = [];
      state.leaseExpiresAt = null;
      state.fence += 1;
      return state;
    });
  }
}
