import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const defaultHeartbeatIntervalMs = 5_000;
const defaultLeaseDurationMs = 15_000;
const defaultTransitionLeaseDurationMs = 30_000;
let sequence = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const canonical = (value) => `${JSON.stringify(value)}\n`;
const iso = () => new Date().toISOString();

async function replaceFile(from, to) {
  try { await rename(from, to); }
  catch (error) {
    if (process.platform !== "win32" || (error?.code !== "EPERM" && error?.code !== "EEXIST")) throw error;
    await unlink(to).catch((unlinkError) => { if (unlinkError?.code !== "ENOENT") throw unlinkError; });
    await rename(from, to);
  }
}

export class FileFixtureLifecyclePort {
  constructor(root, options = {}) {
    this.root = root;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? defaultHeartbeatIntervalMs;
    this.leaseDurationMs = options.leaseDurationMs ?? defaultLeaseDurationMs;
    this.transitionLeaseDurationMs = options.transitionLeaseDurationMs ?? defaultTransitionLeaseDurationMs;
    this.transitionHeartbeatIntervalMs = Math.max(20, Math.min(5_000, Math.floor(this.transitionLeaseDurationMs / 3)));
    this.algebra = options.algebra;
    if (this.algebra == null || !["initial", "validate", "reduce", "project", "blockers", "ready"].every((name) => typeof this.algebra[name] === "function")) {
      throw new Error("fixture lifecycle requires the Standalone shared lifecycle algebra");
    }
    if (!Number.isInteger(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 1_000) throw new Error("invalid fixture heartbeat interval");
    if (!Number.isInteger(this.leaseDurationMs) || this.leaseDurationMs <= 0) throw new Error("invalid fixture lease duration");
    if (!Number.isInteger(this.transitionLeaseDurationMs) || this.transitionLeaseDurationMs < 40) throw new Error("invalid fixture transition lease duration");
  }

  paths(scope) {
    const directory = join(this.root, "channels", scope.channel, "namespaces", scope.namespace, "fixture");
    return { state: join(directory, "lifecycle.json"), lock: join(directory, "lifecycle.lock") };
  }

  async read(scope) {
    const { state: path } = this.paths(scope);
    try { return this.algebra.validate(JSON.parse(await readFile(path, "utf8")), scope); }
    catch (error) { if (error?.code === "ENOENT") return this.algebra.initial({ ...scope }); throw error; }
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
    const owner = canonical({ owner: randomUUID(), pid: process.pid, acquiredAt: iso() });
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try { handle = await open(lock, "wx"); break; }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const metadata = await stat(lock).catch(() => null);
        if (metadata != null && Date.now() - metadata.mtimeMs > 30_000) { await unlink(lock).catch(() => undefined); continue; }
        await sleep(10);
      }
    }
    if (handle == null) throw new Error("fixture lifecycle transaction timed out");
    try {
      await handle.writeFile(owner);
      const current = this.algebra.reduce(await this.read(scope), { type: "tick", now: iso(), leaseDurationMs: this.leaseDurationMs });
      const { state, result } = await operation(current);
      await this.write(scope, state);
      return result ?? this.algebra.project(state, this.heartbeatIntervalMs);
    } finally {
      await handle.close();
      const currentOwner = await readFile(lock, "utf8").catch((error) => { if (error?.code === "ENOENT") return null; throw error; });
      if (currentOwner === owner) await unlink(lock).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    }
  }

  startInternal(scope, generation, attachment, capability, binding) {
    return this.transaction(scope, async (state) => {
      const heartbeatAt = iso();
      const next = this.algebra.reduce(state, {
        type: "start",
        generationId: generation.id,
        bindingDigest: binding?.digest ?? generation.id,
        instanceId: state.instanceId ?? randomUUID(),
        attachment,
        heartbeatAt,
        leaseExpiresAt: new Date(Date.parse(heartbeatAt) + this.leaseDurationMs).toISOString(),
        ...(capability == null ? {} : { capability }),
      });
      return { state: next };
    });
  }

  start(scope, generation, attachment, binding) {
    if (binding == null) throw new Error("fixture lifecycle requires an exact generation binding");
    return this.startInternal(scope, generation, attachment, undefined, binding);
  }
  startWithCapability(scope, generation, attachment, capability, binding) { return this.startInternal(scope, generation, attachment, capability, binding); }

  awaitReady(scope, readiness) {
    return this.transaction(scope, async (state) => ({ state, result: this.algebra.ready(state, readiness) }));
  }

  heartbeatInternal(scope, attachment, capabilityHash) {
    return this.transaction(scope, async (state) => {
      const heartbeatAt = iso();
      return { state: this.algebra.reduce(state, {
        type: "heartbeat",
        attachment,
        heartbeatAt,
        leaseExpiresAt: new Date(Date.parse(heartbeatAt) + this.leaseDurationMs).toISOString(),
        ...(capabilityHash == null ? {} : { capabilityHash }),
      }) };
    });
  }

  heartbeat(scope, attachment) { return this.heartbeatInternal(scope, attachment); }
  heartbeatWithCapability(scope, attachment, capabilityHash) { return this.heartbeatInternal(scope, attachment, capabilityHash); }

  releaseInternal(scope, attachmentId, capabilityHash) {
    return this.transaction(scope, async (state) => ({ state: this.algebra.reduce(state, {
      type: "release-attachment",
      attachmentId,
      ...(capabilityHash == null ? {} : { capabilityHash }),
    }) }));
  }

  release(scope, attachmentId) { return this.releaseInternal(scope, attachmentId); }
  releaseWithCapability(scope, attachmentId, capabilityHash) { return this.releaseInternal(scope, attachmentId, capabilityHash); }
  status(scope) { return this.transaction(scope, async (state) => ({ state })); }
  async occupants(scope) { return (await this.status(scope)).occupants; }

  async beginTransition(scope, kind, options = {}) {
    if (kind !== "shell-install" && kind !== "content-restart") throw new Error(`unsupported fixture lifecycle transition: ${kind}`);
    const token = options.attemptId ?? randomUUID();
    const acquired = await this.transaction(scope, async (state) => {
      if (state.transition != null) {
        if (state.transition.token !== token || state.transition.kind !== kind) {
          return { state, result: { state: "blocked", reason: "transition-active", occupants: this.algebra.project(state, this.heartbeatIntervalMs).occupants } };
        }
        return {
          state,
          result: {
            state: "acquired",
            occupants: this.algebra.project(state, this.heartbeatIntervalMs).occupants,
            transition: state.transition,
          },
        };
      }
      const blockers = this.algebra.blockers(state, kind, { attachmentId: options.ownerAttachmentId, shellType: options.ownerShellType });
      if (blockers.length > 0 && options.force !== true) return { state, result: { state: "blocked", reason: "occupied", occupants: blockers } };
      const acquiredAt = iso();
      const transition = {
        token,
        kind,
        phase: "reserved",
        fence: state.fence,
        acquiredAt,
        expiresAt: new Date(Date.parse(acquiredAt) + this.transitionLeaseDurationMs).toISOString(),
      };
      const next = this.algebra.reduce(state, { type: "reserve-transition", transition });
      return { state: next, result: { state: "acquired", occupants: this.algebra.project(state, this.heartbeatIntervalMs).occupants, transition } };
    });
    if (acquired.state === "blocked") return acquired;
    let transitionFence = acquired.transition.fence;
    let expiresAt = acquired.transition.expiresAt;
    let phase = acquired.transition.phase;
    const renew = async () => {
      expiresAt = new Date(Date.now() + this.transitionLeaseDurationMs).toISOString();
      await this.transaction(scope, async (state) => ({ state: this.algebra.reduce(state, { type: "renew-transition", token, fence: transitionFence, expiresAt }) }));
    };
    const release = async () => {
      await this.transaction(scope, async (state) => ({ state: this.algebra.reduce(state, { type: "release-transition", token, fence: transitionFence }) }));
    };
    const forceStop = async () => {
      expiresAt = new Date(Date.now() + this.transitionLeaseDurationMs).toISOString();
      const status = await this.transaction(scope, async (state) => {
        const next = this.algebra.reduce(state, { type: "force-stop", token, fence: transitionFence, requestedAt: iso(), expiresAt });
        return { state: next };
      });
      transitionFence = status.fence;
      phase = "stopped-sealed";
    };
    const complete = async (generation, attachment, binding, capabilityHash) => {
      const heartbeatAt = iso();
      return this.transaction(scope, async (state) => ({ state: this.algebra.reduce(state, {
        type: "complete-start",
        token,
        fence: transitionFence,
        generationId: generation.id,
        bindingDigest: binding?.digest ?? generation.id,
        instanceId: randomUUID(),
        attachment,
        heartbeatAt,
        leaseExpiresAt: new Date(Date.parse(heartbeatAt) + this.leaseDurationMs).toISOString(),
        ...(capabilityHash == null ? {} : { capabilityHash }),
      }) }));
    };
    return {
      state: "acquired",
      transition: {
        attemptId: token,
        get fence() { return transitionFence; },
        get expiresAt() { return expiresAt; },
        get phase() { return phase; },
        heartbeatIntervalMs: this.transitionHeartbeatIntervalMs,
        occupants: acquired.occupants,
        renew,
        release,
        forceStop,
        completeBoundStart: (generation, attachment, binding, capabilityHash) => complete(generation, attachment, binding, capabilityHash),
      },
    };
  }

  stop(scope, fence) {
    return this.transaction(scope, async (state) => ({ state: this.algebra.reduce(state, { type: "stop", fence, requestedAt: iso() }) }));
  }
}
