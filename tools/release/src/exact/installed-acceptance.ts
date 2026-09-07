import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { readReleasePolicyReceipt, releaseTargetsEqual, type ReleasePolicyReceipt } from "../policy/release-profile.ts";
import { canonicalBytes, readObject, type JsonObject } from "./control-common.ts";

const digest = (body: Buffer) => createHash("sha256").update(body).digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;

async function installedFile(root: string, value: JsonObject | undefined, label: string): Promise<JsonObject> {
  if (!nonempty(value?.file) || isAbsolute(value.file)) throw new Error(`installed ${label} path is invalid`);
  const path = await realpath(resolve(root, value.file));
  const child = relative(await realpath(root), path);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error(`installed ${label} escapes the installation`);
  const body = await readFile(path);
  if (digest(body) !== value.sha256 || body.length !== value.size) throw new Error(`installed ${label} binding mismatch`);
  return { file: basename(path), sha256: value.sha256, size: value.size };
}

async function runtimeProof(path: string): Promise<JsonObject> {
  const attempts = new Map<string, string[]>();
  let latest: string | undefined;
  for (const line of (await readFile(path, "utf8")).replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(Boolean)) {
    const event = JSON.parse(line) as JsonObject;
    if (!nonempty(event.attemptId) || !nonempty(event.event)) throw new Error("invalid Electron runtime log event");
    latest = event.attemptId;
    const events = attempts.get(latest) ?? [];
    events.push(event.event);
    attempts.set(latest, events);
  }
  const events = latest == null ? [] : attempts.get(latest)!;
  const committed = events.indexOf("startup.committed"), stopped = events.indexOf("shutdown.complete");
  // An earlier successful attempt must never mask the current failed or pending run.
  if (committed < 0 || stopped <= committed || events.includes("startup.failed")) {
    throw new Error("latest installed Electron attempt did not commit and shut down cleanly");
  }
  return { outcome: "ready", attemptId: latest, events };
}

async function hotProof(input: JsonObject, published: JsonObject): Promise<JsonObject> {
  const receiptPath = String(input.hotAcceptanceReceipt);
  const hot = await readObject(receiptPath);
  if (hot.schemaVersion !== 1 || hot.operation !== "electron.cdp.contract.invoked" || !Array.isArray(hot.results)
    || hot.results.length !== 4 || hot.results.some((value: unknown) => value == null || typeof value !== "object" || Array.isArray(value))) {
    throw new Error("Electron CDP hot acceptance receipt is invalid");
  }
  const [before, checked, applied, after] = hot.results;
  const shellVersion = before.lines?.shell?.currentVersion;
  if (!nonempty(shellVersion) || !nonempty(hot.discoveryUrl)
    || checked.lines?.closure?.state !== "ready" || checked.lines?.closure?.candidateVersion !== published.releaseVersion
    || (applied.outcome !== "context-destroyed" && applied.lines?.closure?.state !== "current")
    || shellVersion !== after.lines?.shell?.currentVersion || after.lines?.shell?.state === "applying") {
    throw new Error("Electron CDP did not prove an isolated Closure hot update");
  }
  if (!nonempty(input.standaloneState) || !nonempty(input.standaloneGenerationsRoot)) {
    throw new Error("Electron hot acceptance requires Standalone generation state");
  }
  const state = await readObject(input.standaloneState);
  const id = state.active;
  if (state.schemaVersion !== 4 || typeof id !== "string" || !/^[a-f0-9]{64}$/u.test(id)
    || state.lastHealthy !== id || state.prepared != null || state.activationIntent != null || state.activationAttempt != null) {
    throw new Error("Electron hot acceptance found an unsettled Standalone generation");
  }
  const generationPath = join(input.standaloneGenerationsRoot, `${id}.json`);
  const generation = await readObject(generationPath);
  if (generation.schemaVersion !== 4 || generation.id !== id || generation.channel !== published.channel
    || generation.releaseVersion !== published.releaseVersion) throw new Error("Electron hot acceptance did not activate the candidate Standalone generation");
  return {
    releaseVersion: published.releaseVersion, discoveryUrl: hot.discoveryUrl,
    receiptSha256: digest(await readFile(receiptPath)), generationId: id,
    generationSha256: digest(await readFile(generationPath)), stateSha256: digest(await readFile(input.standaloneState)),
  };
}

async function electronProof(input: JsonObject, published: JsonObject, required: JsonObject): Promise<JsonObject> {
  const installationPath = join(input.installedRoot, "standalone-installation.json");
  const installation = await readObject(installationPath);
  if (installation.schemaVersion !== 1 || installation.channel !== published.channel || installation.target !== required.target
    || !nonempty(installation.releaseVersion) || (input.hotAcceptanceReceipt == null && installation.releaseVersion !== published.releaseVersion)) {
    throw new Error("installed Electron release identity mismatch");
  }
  if (!Array.isArray(installation.seeds)) throw new Error("installed Electron seeds are invalid");
  const files: JsonObject = {};
  for (const name of ["host", "supervisor", "content", "trust"]) files[name] = await installedFile(input.installedRoot, installation[name], name);
  files.seeds = await Promise.all(installation.seeds.map((value: JsonObject) => installedFile(input.installedRoot, value, "seed")));
  if (!nonempty(input.runtimeLog)) throw new Error("installed Electron acceptance requires its runtime log");
  return {
    shell: required.shell, target: installation.target,
    proof: {
      installationSha256: digest(await readFile(installationPath)), files,
      runtime: await runtimeProof(input.runtimeLog), baselineReleaseVersion: installation.releaseVersion,
      ...(input.hotAcceptanceReceipt == null ? {} : { hotUpdate: await hotProof(input, published) }),
    },
  };
}

async function terminalProof(input: JsonObject, required: JsonObject): Promise<JsonObject> {
  if (!nonempty(input.runtimeProofRoot)) throw new Error("Terminal acceptance requires runtimeProofRoot");
  const proof = await readObject(join(input.runtimeProofRoot, "installed-proof.json"));
  const manifestPath = join(input.installedRoot, "install-manifest.json");
  const manifest = await readObject(manifestPath);
  const sidecarDigest = (await readFile(join(input.installedRoot, "install-manifest.sha256"), "utf8")).trim().split(/\s+/u)[0];
  if (manifest.target !== required.target || !canonicalBytes(manifest.shell).equals(canonicalBytes(required.shell))) throw new Error("installed Shell manifest does not bind the published contribution");
  if (digest(await readFile(manifestPath)) !== sidecarDigest) throw new Error("installed Shell manifest digest mismatch");
  if (proof.outcome !== "ready") throw new Error("installed Shell probe did not complete");
  const runtime: JsonObject = {};
  for (const operation of ["start", "status", "stop"]) {
    runtime[operation] = await readObject(join(input.runtimeProofRoot, `runtime-${operation}.json`));
    if (runtime[operation].outcome !== "ready") throw new Error("installed Shell lifecycle did not complete");
  }
  const started = runtime.start.result ?? {}, status = runtime.status.result ?? {}, stopped = runtime.stop.result ?? {};
  if (started.state !== "running" || started.references !== 1 || !nonempty(started.attachmentCapability)
    || !nonempty(started.generationId) || !nonempty(started.bindingDigest)) throw new Error("installed Shell did not establish an attached generation");
  if (status.state !== "running" || status.generationId !== started.generationId || status.bindingDigest !== started.bindingDigest) throw new Error("installed Shell status lost its exact generation binding");
  if (!Number.isSafeInteger(started.sidecar?.generationPid) || started.sidecar.generationPid <= 0
    || status.sidecar?.generationPid !== started.sidecar.generationPid || status.sidecar?.status !== "ready") throw new Error("installed Shell status lost its Sidecar generation");
  if (stopped.state !== "stopped" || !Array.isArray(stopped.sidecar?.remainingPids) || stopped.sidecar.remainingPids.length !== 0) throw new Error("installed Shell did not stop its lifecycle and physical Sidecar");
  return { shell: manifest.shell, target: manifest.target, proof, runtime };
}

/** Collect installed evidence against the published topology, never caller-selected metadata. */
export async function collectInstalledAcceptance(input: JsonObject): Promise<{ credential: JsonObject; policy: ReleasePolicyReceipt }> {
  if (!nonempty(input.installedRoot) || !["electron", "terminal"].includes(input.shellType) || !nonempty(input.target)) throw new Error("installed acceptance target is invalid");
  const published = await readObject(String(input.publishReceipt ?? ""));
  if (published.schemaVersion !== 1 || published.operation !== "exact.publish" || !Array.isArray(published.requiredAcceptances)) throw new Error("invalid exact.publish receipt");
  const policy = await readReleasePolicyReceipt(input.policyReceipt, {
    capability: "acceptance", channel: published.channel, releaseVersion: published.releaseVersion, sourceCommit: published.sourceCommit,
  });
  if (published.profile !== policy.profile || !releaseTargetsEqual(published.target, policy.target)) throw new Error("published acceptance policy binding mismatch");
  const candidates = published.requiredAcceptances.filter((value: JsonObject) => value.shell?.type === input.shellType && value.target === input.target);
  if (candidates.length !== 1) throw new Error("installed acceptance requires one matching published target");
  const required = candidates[0];
  const installed = input.shellType === "electron" ? await electronProof(input, published, required) : await terminalProof(input, required);
  return { policy, credential: {
    schemaVersion: 1, operation: "exact.acceptance", status: "accepted",
    channel: published.channel, releaseVersion: published.releaseVersion, sourceCommit: published.sourceCommit,
    shell: required.shell, target: required.target, artifact: required.artifact, shellMetadata: required.shellMetadata,
    ...(required.installIdentity == null ? {} : { installIdentity: required.installIdentity }),
    ...(required.platformTrust == null ? {} : { platformTrust: required.platformTrust }),
    updater: required.updater, installed,
  } };
}
