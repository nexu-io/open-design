import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requestPath = process.env.OD_TERMINAL_FOSSIL_REQUEST_V1;
const resultPath = process.env.OD_TERMINAL_FOSSIL_RESULT_V1;
if (!requestPath || !resultPath) throw new Error("Terminal fossil exchange environment is incomplete");

const digestPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const inside = (root, path) => {
  const value = relative(root, path);
  return value !== "" && !value.startsWith("..") && !isAbsolute(value);
};

function validateRequest(value) {
  if (value?.schemaVersion !== 1) throw new Error("unsupported fossil request schema");
  const operations = new Set(["probe", "start", "heartbeat", "release", "stop", "status", "prepare-update", "apply-update"]);
  if (!operations.has(value.operation)) throw new Error("unsupported fossil operation");
  if (!/^[a-z0-9]{1,12}$/.test(value.channel) || value.channel === "local") throw new Error("invalid exact channel");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.namespace)) throw new Error("invalid namespace");
  if (typeof value.carrierResolutionFile !== "string" || !isAbsolute(value.carrierResolutionFile)) throw new Error("invalid carrier resolution path");
  if (value.operation !== "probe" && (typeof value.storeRoot !== "string" || !isAbsolute(value.storeRoot))) throw new Error("lifecycle operation requires an absolute Store root");
  if (new Set(["start", "heartbeat", "release"]).has(value.operation) && !/^[A-Za-z0-9._-]{1,128}$/.test(value.attachmentId)) throw new Error(`${value.operation} requires an attachment id`);
  if (value.operation === "prepare-update" && (typeof value.channelHeadUrl !== "string" || !/^(https?:|file:)\/\//.test(value.channelHeadUrl))) throw new Error("prepare-update requires a channel head URL");
  if (value.activationSource != null && !new Set(["initial-bootstrap", "repair", "silent-policy", "user-restart"]).has(value.activationSource)) throw new Error("invalid activation source");
  return value;
}

async function validateInstallation(value) {
  if (value?.schemaVersion !== 1 || value.shell?.type !== "terminal" || !versionPattern.test(value.shell?.version) || !digestPattern.test(value.shell?.digest)) throw new Error("invalid Shell identity");
  if (value.runtime?.name !== "node" || !versionPattern.test(value.runtime?.version) || !digestPattern.test(value.runtime?.digest)) throw new Error("invalid carrier runtime identity");
  const root = resolve(value.installRoot);
  const manifestPath = resolve(value.manifestFile);
  const executablePath = resolve(value.runtime.executablePath);
  if (!inside(root, manifestPath) || !inside(root, executablePath)) throw new Error("carrier resolution escaped install root");
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== value.shell.digest) throw new Error("Shell manifest binding failed");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest?.schemaVersion !== 1 || manifest.shell?.type !== "terminal" || manifest.shell?.version !== value.shell.version || manifest.target !== value.target) throw new Error("installed manifest identity mismatch");
  if (manifest.runtime?.name !== "node" || manifest.runtime?.version !== value.runtime.version || manifest.runtime?.sha256 !== value.runtime.digest) throw new Error("installed runtime binding mismatch");
  const descriptorPath = (descriptor) => descriptor?.file ?? descriptor?.entrypoint;
  const descriptors = [manifest.carrierLock, manifest.contracts, manifest.fossil, manifest.fixtureLifecycle, manifest.standalone, manifest.seed?.closure, manifest.releaseDocuments?.content, manifest.trust,
    manifest.shellFiles?.sh?.terminal, manifest.shellFiles?.sh?.install, manifest.shellFiles?.ps1?.terminal, manifest.shellFiles?.ps1?.install];
  for (const descriptor of descriptors) {
    const entrypoint = descriptorPath(descriptor);
    if (typeof entrypoint !== "string" || !digestPattern.test(descriptor?.sha256)) throw new Error("invalid installed artifact descriptor");
    const path = resolve(root, normalize(entrypoint));
    if (!inside(root, path) || sha256(await readFile(path)) !== descriptor.sha256) throw new Error(`installed artifact failed verification: ${entrypoint}`);
  }
  const contractIndex = await readJson(resolve(root, manifest.contracts.file));
  if (contractIndex?.schemaVersion !== 1 || !Array.isArray(contractIndex.files) || contractIndex.files.length === 0) throw new Error("invalid contract index");
  for (const descriptor of contractIndex.files) {
    const path = resolve(root, normalize(descriptor?.file));
    if (typeof descriptor?.file !== "string" || !digestPattern.test(descriptor?.sha256) || !inside(root, path) || sha256(await readFile(path)) !== descriptor.sha256) throw new Error("installed contract bundle failed verification");
  }
  const standalonePath = resolve(root, manifest.standalone.entrypoint);
  const standalone = await import(pathToFileURL(standalonePath).href);
  if (typeof standalone.canonicalJson !== "function" || typeof standalone.StandaloneStore !== "function" || typeof standalone.StandaloneUpdater !== "function") throw new Error("installed Standalone public API is incomplete");
  return { root, manifest, manifestBytes, standalone };
}

async function readUrl(url) {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`artifact request failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function trustedKeys(installation) {
  const value = await readJson(resolve(installation.root, installation.manifest.trust.file));
  if (value?.schemaVersion !== 1 || !Array.isArray(value.keys) || value.keys.length === 0) throw new Error("invalid trusted key document");
  const keys = new Map();
  for (const entry of value.keys) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry?.keyId) || typeof entry?.publicKey !== "string" || keys.has(entry.keyId)) throw new Error("invalid trusted key entry");
    keys.set(entry.keyId, entry.publicKey);
  }
  return keys;
}

async function ensureInstalledSeed(request, installation, store, keys) {
  const envelope = await readJson(resolve(installation.root, installation.manifest.releaseDocuments.content.file));
  installation.standalone.verifyStandaloneMetadata(envelope, keys);
  if (envelope.metadata.channel !== request.channel) throw new Error("installed seed belongs to another channel");
  const expectedId = installation.standalone.sha256Hex(installation.standalone.canonicalJson(envelope.metadata));
  let state = await store.readState();
  if (state.active == null && state.prepared == null) {
    const seedBytes = new Uint8Array(await readFile(resolve(installation.root, installation.manifest.seed.closure.file)));
    await store.prepare(envelope, keys, async (artifact) => {
      if (artifact.sha256 !== installation.manifest.seed.closure.sha256 || artifact.size !== seedBytes.byteLength) {
        const error = new Error("required installed seed is incomplete");
        error.code = "resource-unavailable";
        throw error;
      }
      return seedBytes;
    });
    state = await store.readState();
  }
  if (state.active == null && state.prepared === expectedId && state.activationIntent?.generationId !== expectedId) {
    await store.authorizePrepared("initial-bootstrap");
  }
}

async function execute(request, installation) {
  if (request.operation === "probe") return { capabilities: installation.manifest.capabilities, channel: request.channel, namespace: request.namespace };
  const { standalone } = installation;
  const keys = await trustedKeys(installation);
  const storeRoot = resolve(request.storeRoot);
  const store = new standalone.StandaloneStore(storeRoot, { channel: request.channel, namespace: request.namespace });
  const { FileFixtureLifecyclePort } = await import(pathToFileURL(resolve(installation.root, installation.manifest.fixtureLifecycle.entrypoint)).href);
  const lifecycle = new FileFixtureLifecyclePort(storeRoot);
  const shell = { type: "terminal", version: installation.manifest.shell.version, digest: sha256(installation.manifestBytes) };
  const launcher = new standalone.VersionedLauncher(store, lifecycle, shell, request.attachmentId ?? "terminal-control");
  if (request.operation === "start") {
    await ensureInstalledSeed(request, installation, store, keys);
    return new standalone.FossilBootloader(store, shell, async () => launcher).start();
  }
  if (request.operation === "heartbeat") return launcher.heartbeat();
  if (request.operation === "release") return launcher.release();
  if (request.operation === "status") return launcher.status();
  if (request.operation === "stop") return launcher.stop();
  const source = request.operation === "prepare-update"
    ? {
        readChannelHead: async () => JSON.parse(Buffer.from(await readUrl(request.channelHeadUrl)).toString("utf8")),
        readDocument: readUrl,
        readArtifact: async (artifact) => readUrl(artifact.url),
      }
    : {
        readChannelHead: async () => { throw new Error("unused update source"); },
        readDocument: async () => { throw new Error("unused update source"); },
        readArtifact: async () => { throw new Error("unused update source"); },
      };
  const updater = new standalone.StandaloneUpdater(request.channel, "content", shell, keys, store, source);
  if (request.operation === "prepare-update") return updater.prepareLatest(request.activationSource);
  return updater.applyNow(launcher);
}

let operation = "unknown";
let phase = "request";
try {
  const request = validateRequest(await readJson(requestPath));
  operation = request.operation;
  phase = "installation";
  const resolution = await readJson(request.carrierResolutionFile);
  const installation = await validateInstallation(resolution);
  phase = "operation";
  const result = await execute(request, installation);
  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: 1, outcome: "ready", operation, shell: resolution.shell, result })}\n`, "utf8");
} catch (error) {
  const allowed = new Set(["installer-required", "no-generation", "resource-unavailable", "standalone-occupied", "standalone-start-failed"]);
  const code = allowed.has(error?.code) ? error.code : phase === "request" ? "invalid-request" : phase === "installation" ? "invalid-installation" : "operation-failed";
  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: 1, outcome: "rejected", operation, error: { code, message: error instanceof Error ? error.message : String(error) } })}\n`, "utf8");
  process.exitCode = 1;
}
