import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const canonical = (value) => `${JSON.stringify(value)}\n`;
const sleep = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
let sequence = 0;

async function replaceFile(from, to) {
  try { await rename(from, to); }
  catch (error) {
    if (process.platform !== "win32" || (error?.code !== "EPERM" && error?.code !== "EEXIST")) throw error;
    await unlink(to).catch((unlinkError) => { if (unlinkError?.code !== "ENOENT") throw unlinkError; });
    await rename(from, to);
  }
}

async function readUrl(url) {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`Shell updater request failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function requireCompleteStandaloneRetirement(result) {
  if (result == null || !Array.isArray(result.remainingPids)) {
    throw Object.assign(new Error("Standalone retirement returned an invalid terminal result"), {
      code: "standalone-retirement-invalid",
    });
  }
  const remainingPids = result.remainingPids.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  if (remainingPids.length !== result.remainingPids.length) {
    throw Object.assign(new Error("Standalone retirement returned invalid remaining process identities"), {
      code: "standalone-retirement-invalid",
    });
  }
  if (remainingPids.length > 0) {
    throw Object.assign(
      new Error(`Standalone retirement remains incomplete: ${remainingPids.join(", ")}`),
      { code: "standalone-retirement-incomplete", remainingPids },
    );
  }
}

export class FixtureShellUpdaterPort {
  constructor(root, scope, lifecycle, options = {}) {
    const fixtureRoot = join(root, "channels", scope.channel, "namespaces", scope.namespace, "fixture");
    this.path = join(fixtureRoot, "shell-updater.json");
    this.lockPath = join(fixtureRoot, "shell-updater.lock");
    this.candidatePath = join(fixtureRoot, "shell-candidate.json");
    this.root = root;
    this.scope = scope;
    this.lifecycle = lifecycle;
    this.shellType = options.shellType ?? "electron";
    this.attachmentId = options.attachmentId ?? `${this.shellType}-updater`;
    this.channelHeadUrl = options.channelHeadUrl;
    this.target = options.target;
    this.trustedKeys = options.trustedKeys;
    this.standalone = options.standalone;
    this.faultAt = options.faultAt;
    this.installDelayMs = options.installDelayMs ?? 0;
    this.withRetiredStandalone = options.withRetiredStandalone;
    this.algebra = options.algebra;
    if (this.algebra == null || !["initial", "validate", "reduce"].every((name) => typeof this.algebra[name] === "function")) {
      throw new Error("fixture Shell updater requires the Standalone updater algebra");
    }
    if (typeof this.withRetiredStandalone !== "function") {
      throw new Error("fixture Shell updater requires a guarded Standalone retirement continuation");
    }
  }

  get configured() {
    return this.channelHeadUrl != null && this.target != null && this.trustedKeys != null && this.standalone != null;
  }

  async readSnapshot() {
    try { return this.algebra.validate(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) { if (error?.code === "ENOENT") return this.algebra.initial(this.shellType); throw error; }
  }

  async writePath(path, value) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.${sequence++}.tmp`;
    await writeFile(temporary, canonical(value), { flag: "wx" });
    try { await replaceFile(temporary, path); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
    return value;
  }

  write(snapshot) { return this.writePath(this.path, this.algebra.validate(snapshot)); }

  async update(value) {
    await mkdir(dirname(this.lockPath), { recursive: true });
    let handle;
    const owner = `${process.pid}:${randomUUID()}\n`;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try { handle = await open(this.lockPath, "wx"); break; }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const metadata = await stat(this.lockPath).catch(() => null);
        if (metadata != null && Date.now() - metadata.mtimeMs > 30_000) { await unlink(this.lockPath).catch(() => undefined); continue; }
        await sleep(10);
      }
    }
    if (handle == null) throw new Error("fixture Shell updater transaction timed out");
    try {
      await handle.writeFile(owner);
      const current = await this.readSnapshot();
      return await this.write(this.algebra.reduce(current, { expectedRevision: current.revision, ...value }));
    } finally {
      await handle.close();
      const currentOwner = await readFile(this.lockPath, "utf8").catch((error) => { if (error?.code === "ENOENT") return null; throw error; });
      if (currentOwner === owner) await unlink(this.lockPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    }
  }

  async waitForChange(afterRevision, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    do {
      const snapshot = await this.readSnapshot();
      if (snapshot.revision > afterRevision) return snapshot;
      await sleep(10);
    } while (Date.now() < deadline);
    return this.readSnapshot();
  }

  async discover() {
    await this.update({ state: "checking" });
    const headBytes = await readUrl(this.channelHeadUrl);
    const head = JSON.parse(Buffer.from(headBytes).toString("utf8"));
    this.standalone.verifyStandaloneChannelHead(head, this.trustedKeys);
    if (head.head.channel !== this.scope.channel) throw new Error("Shell sidecar escaped updater channel");
    const lane = head.head.lanes[this.shellType];
    if (lane == null) throw new Error(`channel head lacks Shell lane: ${this.shellType}`);
    const metadataBytes = await readUrl(lane.url);
    if (metadataBytes.byteLength !== lane.size || this.standalone.sha256Hex(metadataBytes) !== lane.sha256) {
      throw new Error("Shell sidecar metadata failed binding verification");
    }
    const envelope = JSON.parse(Buffer.from(metadataBytes).toString("utf8"));
    this.standalone.verifyStandaloneShellMetadata(envelope, this.trustedKeys);
    if (envelope.document.channel !== this.scope.channel || envelope.document.releaseVersion !== lane.releaseVersion) {
      throw new Error("Shell sidecar metadata identity mismatch");
    }
    const distribution = envelope.document.distributions.find(({ shell, target }) => shell.type === this.shellType && target === this.target);
    if (distribution == null) throw new Error(`Shell sidecar lacks target distribution: ${this.shellType}/${this.target}`);
    const candidate = { releaseVersion: lane.releaseVersion, distribution };
    const candidateId = this.standalone.sha256Hex(this.standalone.canonicalJson(candidate));
    await this.writePath(this.candidatePath, candidate);
    return this.update({ state: "available", candidateId });
  }

  async download() {
    const snapshot = await this.readSnapshot();
    const candidate = JSON.parse(await readFile(this.candidatePath, "utf8"));
    const candidateId = this.standalone.sha256Hex(this.standalone.canonicalJson(candidate));
    if (snapshot.candidateId !== candidateId) throw new Error("Shell updater candidate changed before download");
    const artifact = candidate.distribution.artifact;
    await this.update({ state: "downloading", candidateId, progress: { completed: 0, total: artifact.size } });
    const downloaded = await this.standalone.ensureStandaloneBlob(this.root, {
      sha256: artifact.sha256,
      size: artifact.size,
      mediaType: artifact.mediaType,
      sources: [{ kind: "remote", url: artifact.url }],
    }, { resourceId: `${this.shellType}-distribution` });
    const handoff = {
      interaction: candidate.distribution.updater?.interaction ?? "restart-and-install",
      releaseVersion: candidate.releaseVersion,
      target: candidate.distribution.target,
      shell: candidate.distribution.shell,
      artifact: { path: downloaded.path, sha256: artifact.sha256, size: artifact.size, mediaType: artifact.mediaType },
    };
    return this.update({
      state: "ready",
      progress: { completed: artifact.size, total: artifact.size },
      candidateId,
      handoff,
    });
  }

  async failed(error) {
    return this.update({
      state: "failed",
      error: { code: error?.code ?? "shell-update-failed", message: error instanceof Error ? error.message : String(error) },
    });
  }

  async confirmInstalled(proof) {
    const snapshot = await this.readSnapshot();
    const expected = snapshot.handoff?.shell;
    const matches = expected != null
      && proof?.type === expected.type
      && proof.version === expected.version
      && proof.buildHash === expected.buildHash;
    if (snapshot.state === "installed") {
      return { outcome: matches ? "accepted" : "failed", snapshot };
    }
    if ((snapshot.state !== "applying" && snapshot.state !== "handed-off") || expected == null) {
      return { outcome: "failed", snapshot };
    }
    if (!matches) {
      if (snapshot.state === "applying") return { outcome: "failed", snapshot };
      return {
        outcome: "failed",
        snapshot: await this.update({
          state: "handed-off",
          candidateId: snapshot.candidateId,
          installAttemptId: snapshot.installAttemptId,
          handoff: snapshot.handoff,
          error: { code: "installed-shell-mismatch", message: "attached Shell does not match the handed-off distribution" },
        }),
      };
    }
    return {
      outcome: "accepted",
      snapshot: await this.update({ state: "installed", candidateId: snapshot.candidateId, installAttemptId: snapshot.installAttemptId, handoff: snapshot.handoff }),
    };
  }

  async invoke(action) {
    if (action === "check") {
      if (!this.configured) {
        await this.update({ state: "checking" });
        return { outcome: "accepted", snapshot: await this.update({ state: "available", candidateId: `fixture-${randomUUID()}` }) };
      }
      try { return { outcome: "accepted", snapshot: await this.discover() }; }
      catch (error) { return { outcome: "failed", snapshot: await this.failed(error) }; }
    }
    if (action === "download") {
      if (!this.configured) {
        const snapshot = await this.readSnapshot();
        await this.update({ state: "downloading", candidateId: snapshot.candidateId, progress: { completed: 1, total: 2 } });
        const handoff = {
          interaction: "restart-and-install",
          releaseVersion: "0.0.0-fixture.1",
          target: "fixture",
          shell: { type: this.shellType, version: "0.0.0", buildHash: "0".repeat(64) },
          artifact: { path: "fixture", sha256: "0".repeat(64), size: 2, mediaType: "application/octet-stream" },
        };
        return { outcome: "accepted", snapshot: await this.update({ state: "ready", candidateId: snapshot.candidateId, progress: { completed: 2, total: 2 }, handoff }) };
      }
      try { return { outcome: "accepted", snapshot: await this.download() }; }
      catch (error) { return { outcome: "failed", snapshot: await this.failed(error) }; }
    }
    if (action === "later") {
      const snapshot = await this.readSnapshot();
      return { outcome: "accepted", snapshot: await this.update({ state: "ready", candidateId: snapshot.candidateId, handoff: snapshot.handoff, progress: snapshot.progress }) };
    }
    if (action === "abandon") {
      const snapshot = await this.readSnapshot();
      if (snapshot.state !== "handed-off") return { outcome: "unsupported", snapshot };
      return {
        outcome: "accepted",
        snapshot: await this.update({
          state: "failed",
          candidateId: snapshot.candidateId,
          installAttemptId: snapshot.installAttemptId,
          handoff: snapshot.handoff,
          error: { code: "shell-install-abandoned", message: "Shell installation was explicitly abandoned" },
        }),
      };
    }
    if (action !== "install" && action !== "force-stop-and-install") return { outcome: "unsupported", snapshot: await this.readSnapshot() };
    const current = await this.readSnapshot();
    const resuming = current.state === "applying";
    if (!resuming && current.state !== "ready") return { outcome: "unsupported", snapshot: current };
    const installAttemptId = resuming ? current.installAttemptId : randomUUID();
    if (installAttemptId == null) throw new Error("applying Shell update lacks an install attempt identity");
    const transition = await this.lifecycle.beginTransition(this.scope, "shell-install", {
      attemptId: installAttemptId,
      ownerShellType: this.shellType,
      force: resuming || action === "force-stop-and-install",
    });
    if (transition.state === "blocked") {
      if (resuming) {
        throw Object.assign(new Error("Shell install attempt cannot resume its lifecycle transition"), {
          code: "shell-install-transition-unavailable",
        });
      }
      const snapshot = await this.update({
        state: "ready",
        candidateId: current.candidateId,
        blockedBy: transition.occupants,
        handoff: current.handoff,
        progress: current.progress,
      });
      return { outcome: "blocked", snapshot };
    }
    let heartbeat;
    let sealed = transition.transition.phase === "stopped-sealed";
    try {
      const ready = current;
      if (!resuming) {
        await this.update({ state: "applying", candidateId: ready.candidateId, installAttemptId, handoff: ready.handoff, blockedBy: transition.transition.occupants });
      }
      if (this.faultAt === "after-transition") {
        const error = new Error("injected Sidecar crash after transition acquisition");
        error.abandonedTransition = true;
        throw error;
      }
      heartbeat = setInterval(() => { void transition.transition.renew().catch(() => undefined); }, transition.transition.heartbeatIntervalMs);
      heartbeat.unref();
      if (this.installDelayMs > 0) await sleep(this.installDelayMs);
      let continuationInvoked = false;
      const result = await this.withRetiredStandalone({
        scope: this.scope,
        kind: "shell-install",
        attemptId: installAttemptId,
        fence: transition.transition.fence,
        occupants: transition.transition.occupants,
      }, async () => {
        if (continuationInvoked) {
          throw Object.assign(new Error("physical retirement continuation was invoked more than once"), {
            code: "standalone-retirement-continuation-replayed",
          });
        }
        continuationInvoked = true;
        await transition.transition.forceStop();
        sealed = true;
        if (this.faultAt === "before-handoff-persist") {
          throw new Error("injected failure before durable installer handoff");
        }
        return {
          outcome: "accepted",
          snapshot: await this.update({
            state: "handed-off",
            candidateId: ready.candidateId,
            installAttemptId,
            handoff: ready.handoff,
          }),
        };
      });
      if (!continuationInvoked) {
        throw Object.assign(new Error("physical retirement did not invoke its guarded commit"), {
          code: "standalone-retirement-commit-missing",
        });
      }
      return result;
    } catch (error) {
      if (!error?.abandonedTransition && !sealed) await transition.transition.release().catch(() => undefined);
      if (!error?.abandonedTransition && !sealed) {
        return { outcome: "failed", snapshot: await this.failed(error) };
      }
      throw error;
    } finally {
      if (heartbeat != null) clearInterval(heartbeat);
    }
  }
}
