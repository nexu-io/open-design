import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  CLOSURE_ARCHIVE_ENTRY_PATH,
  bindClosureCandidateIdentity,
  createClosureComponentTreeDigest,
  resolveClosureDistributionTarget,
  validateClosureBindingIdentity,
  validateClosureCandidateManifest,
  validateClosureDistributionManifest,
  validateClosureFileInventory,
  type ClosureBindingIdentity,
  type ClosureCandidateManifest,
  type ClosureComponentTreeFile,
  type ClosureDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionEntrypointComponent,
  type ClosureDistributionIdentity,
  type ClosureDistributionLauncherComponent,
  type ClosureDistributionManifest,
  type ClosureFileInventory,
  type ResolvedClosureDistributionTarget,
} from "../protocol/index.js";
import { isReleaseChannel, type ReleaseChannel } from "@open-design/release";
import { writeJsonFile } from "@open-design/sidecar";
import { normalizeNamespace } from "@open-design/sidecar/protocol";
import { compareName, readClosureBindingDescriptor } from "./legacy-candidate.js";
import { resolveDistributionInstallationRoot } from "./distribution-paths.js";

export const CLOSURE_BINDING_SCHEMA_VERSION = 3 as const;
export const CLOSURE_STORE_EPOCH = 3 as const;

export type ClosureStoreRequest = {
  channel: string;
  namespace: string;
  root: string;
};

export type ClosureStorePaths = {
  bindingPath: string;
  blobsRoot: string;
  channel: ReleaseChannel;
  channelRoot: string;
  closureRoot: string;
  installationsRoot: string;
  namespace: string;
  namespaceRoot: string;
  resourcesRoot: string;
  root: string;
  stagingRoot: string;
  stateRoot: string;
  versionsRoot: string;
};

export type ClosureDistributionComponentPlan = Readonly<{
  artifact: ClosureDistributionBlob;
  blobPath: string;
  componentRoot: string;
  treeDigest: ClosureDigest;
}>;

export type ClosureDistributionEntrypointPlan = ClosureDistributionComponentPlan & Readonly<{
  entryPath: string;
  resolvedEntryPath: string;
}>;

export type ClosureDistributionLauncherPlan = ClosureDistributionEntrypointPlan & Readonly<{
  handoffPath: string;
  resolvedHandoffPath: string;
}>;

export type ClosureDistributionResourcePlan = Readonly<{
  artifact: ClosureDistributionBlob;
  blobPath: string;
  id: string;
  resourceRoot: string;
  title: string;
  treeDigest: ClosureDigest;
}>;

export type ClosureDistributionGenerationPlan = Readonly<{
  channel: ReleaseChannel;
  generation: number;
  storeRoot: string;
  identity: ClosureDistributionIdentity;
  installationRoot: string;
  manifest: ClosureDistributionManifest;
  manifestPath: string;
  namespace: string;
  required: Readonly<{
    body: ClosureDistributionEntrypointPlan;
    launcher: ClosureDistributionLauncherPlan;
    native: ClosureDistributionComponentPlan;
  }>;
  requiredBlobPaths: readonly string[];
  resources: readonly ClosureDistributionResourcePlan[];
  target: string;
}>;

export type StoredClosureDistributionVerification = Readonly<{
  materializedRoot: string;
  plan: ClosureDistributionGenerationPlan;
}>;

export type ClosureStoreVersionPaths = ClosureStorePaths & {
  archivePath: string;
  digest: string;
  inventoryPath: string;
  manifestPath: string;
  payloadRoot: string;
  version: string;
  versionRoot: string;
};

export type ClosureRuntimePointer = Omit<ClosureBindingIdentity, "platform"> & {
  generation: number;
  target: string;
};

export type CommittedClosureBinding = {
  releaseVersion: string;
  standalone: ClosureRuntimePointer;
};

export type ClosureBindingDescriptor = {
  channel: ReleaseChannel;
  committed: CommittedClosureBinding | null;
  namespace: string;
  nextGeneration: number;
  schemaVersion: typeof CLOSURE_BINDING_SCHEMA_VERSION;
  updatedAt: string;
};

export type StoredClosureVerification = {
  binding: ClosureBindingIdentity;
  inventory: ClosureFileInventory;
  inventoryDigest: string;
  manifest: ClosureCandidateManifest;
  paths: ClosureStoreVersionPaths;
};

export class ClosureStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClosureStoreError";
  }
}

function sha256CanonicalDistribution(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Consume one sealed distribution graph without selecting a release or
 * exposing Store layout. Materialization may stage the returned target, but a
 * later Store commit still publishes the generation atomically.
 */
export function consumeClosureDistributionTarget(
  value: unknown,
  target: string,
): {
  manifest: ClosureDistributionManifest;
  target: ResolvedClosureDistributionTarget;
} {
  const manifest = validateClosureDistributionManifest(value, sha256CanonicalDistribution);
  return {
    manifest,
    target: resolveClosureDistributionTarget(manifest, target),
  };
}

function resolveDistributionBlobPath(paths: ClosureStorePaths, digest: ClosureDigest): string {
  return assertUnderRoot(paths.root, join(paths.blobsRoot, digest.slice("sha256:".length)));
}

export function createClosureResourceIndexKey(
  title: string,
  treeDigest: ClosureDigest,
): string {
  if (title.trim().length === 0 || title !== title.trim()) {
    throw new ClosureStoreError("Closure resource title must be non-empty and trimmed");
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(treeDigest)) {
    throw new ClosureStoreError("Closure resource treeDigest must be a lowercase sha256 digest");
  }
  const digest = treeDigest;
  return createHash("sha256").update(JSON.stringify({ title, treeDigest: digest })).digest("hex");
}

function planDistributionComponent(
  paths: ClosureStorePaths,
  storeRoot: string,
  componentName: "native",
  component: Readonly<{ blob: ClosureDigest; treeDigest: ClosureDigest }>,
  manifest: ClosureDistributionManifest,
): ClosureDistributionComponentPlan;
function planDistributionComponent(
  paths: ClosureStorePaths,
  storeRoot: string,
  componentName: "launcher",
  component: ClosureDistributionLauncherComponent,
  manifest: ClosureDistributionManifest,
): ClosureDistributionLauncherPlan;
function planDistributionComponent(
  paths: ClosureStorePaths,
  storeRoot: string,
  componentName: "body",
  component: ClosureDistributionEntrypointComponent,
  manifest: ClosureDistributionManifest,
): ClosureDistributionEntrypointPlan;
function planDistributionComponent(
  paths: ClosureStorePaths,
  storeRoot: string,
  componentName: "body" | "launcher" | "native",
  component: Readonly<{
    blob: ClosureDigest;
    entryPath?: string;
    handoffPath?: string;
    treeDigest: ClosureDigest;
  }>,
  manifest: ClosureDistributionManifest,
): ClosureDistributionComponentPlan | ClosureDistributionEntrypointPlan | ClosureDistributionLauncherPlan {
  const artifact = manifest.blobs[component.blob];
  if (artifact == null) {
    throw new ClosureStoreError(`Closure distribution component ${componentName} references an unknown blob`);
  }
  const componentRoot = assertUnderRoot(paths.root, join(storeRoot, componentName));
  const common = {
    artifact,
    blobPath: resolveDistributionBlobPath(paths, component.blob),
    componentRoot,
    treeDigest: component.treeDigest,
  };
  if (component.entryPath == null) return common;
  const entrypoint = {
    ...common,
    entryPath: component.entryPath,
    resolvedEntryPath: assertUnderRoot(paths.root, join(componentRoot, component.entryPath)),
  };
  if (component.handoffPath == null) return entrypoint;
  return {
    ...entrypoint,
    handoffPath: component.handoffPath,
    resolvedHandoffPath: assertUnderRoot(paths.root, join(componentRoot, component.handoffPath)),
  };
}

/** Resolve one content-addressed installation; generation is only a runtime fence. */
export function planClosureDistributionGeneration(
  paths: ClosureStorePaths,
  generationInput: number,
  value: unknown,
  targetInput: string,
): ClosureDistributionGenerationPlan {
  const generation = normalizeGeneration(generationInput);
  const consumed = consumeClosureDistributionTarget(value, targetInput);
  if (consumed.manifest.identity.channel !== paths.channel) {
    throw new ClosureStoreError("Closure distribution channel does not match its Store");
  }
  const storeRoot = resolveDistributionInstallationRoot({
    digest: consumed.manifest.identity.digest,
    installationsRoot: paths.installationsRoot,
    root: paths.root,
    target: consumed.target.target,
    version: consumed.manifest.identity.version,
  });
  const required = {
    body: planDistributionComponent(
      paths,
      storeRoot,
      "body",
      consumed.target.required.body,
      consumed.manifest,
    ),
    launcher: planDistributionComponent(
      paths,
      storeRoot,
      "launcher",
      consumed.target.required.launcher,
      consumed.manifest,
    ),
    native: planDistributionComponent(
      paths,
      storeRoot,
      "native",
      consumed.target.required.native,
      consumed.manifest,
    ),
  };
  return Object.freeze({
    channel: paths.channel,
    generation,
    storeRoot,
    identity: consumed.manifest.identity,
    installationRoot: storeRoot,
    manifest: consumed.manifest,
    manifestPath: assertUnderRoot(paths.root, join(storeRoot, "closure.json")),
    namespace: paths.namespace,
    required: Object.freeze(required),
    requiredBlobPaths: Object.freeze(
      consumed.target.requiredBlobs.map((blob) => resolveDistributionBlobPath(paths, blob.digest)),
    ),
    resources: Object.freeze(consumed.target.resources.map((resource) => Object.freeze({
      artifact: resource.artifact,
      blobPath: resolveDistributionBlobPath(paths, resource.blob),
      id: resource.id,
      resourceRoot: assertUnderRoot(paths.root, join(
        paths.resourcesRoot,
        createClosureResourceIndexKey(resource.title, resource.treeDigest),
      )),
      title: resource.title,
      treeDigest: resource.treeDigest,
    }))),
    target: consumed.target.target,
  });
}

function normalizeRoot(value: string): string {
  if (value.length === 0 || value.includes("\0") || !isAbsolute(value)) {
    throw new ClosureStoreError(`Closure store root must be a non-empty absolute path: ${value}`);
  }
  return resolve(value);
}

function normalizeChannel(value: string): ReleaseChannel {
  if (!isReleaseChannel(value)) throw new ClosureStoreError(`unsupported Closure store channel: ${value}`);
  return value;
}

function normalizeStoreNamespace(value: string): string {
  try {
    return normalizeNamespace(value);
  } catch (error) {
    throw new ClosureStoreError(error instanceof Error ? error.message : String(error));
  }
}

export function assertUnderRoot(root: string, target: string): string {
  const normalized = resolve(target);
  if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) {
    throw new ClosureStoreError(`Closure store path escapes root: ${normalized}`);
  }
  return normalized;
}

export function resolveClosureStorePaths(request: ClosureStoreRequest): ClosureStorePaths {
  const root = normalizeRoot(request.root);
  const channel = normalizeChannel(request.channel);
  const namespace = normalizeStoreNamespace(request.namespace);
  const closureRoot = assertUnderRoot(root, join(root, "closure"));
  const channelRoot = assertUnderRoot(root, join(closureRoot, "channels", channel));
  const namespaceRoot = assertUnderRoot(root, join(channelRoot, "epochs", String(CLOSURE_STORE_EPOCH), "namespaces", namespace));
  const stateRoot = assertUnderRoot(root, join(namespaceRoot, "state"));
  return {
    bindingPath: assertUnderRoot(root, join(stateRoot, "binding.json")),
    blobsRoot: assertUnderRoot(root, join(channelRoot, "blobs")),
    channel,
    channelRoot,
    closureRoot,
    installationsRoot: assertUnderRoot(root, join(namespaceRoot, "installations")),
    namespace,
    namespaceRoot,
    resourcesRoot: assertUnderRoot(root, join(channelRoot, "resources")),
    root,
    stagingRoot: assertUnderRoot(root, join(namespaceRoot, "staging")),
    stateRoot,
    versionsRoot: assertUnderRoot(root, join(namespaceRoot, "versions")),
  };
}

export function sameBinding(left: ClosureBindingIdentity, right: ClosureBindingIdentity): boolean {
  return left.channel === right.channel
    && left.namespace === right.namespace
    && left.platform === right.platform
    && left.protocolVersion === right.protocolVersion
    && left.version === right.version
    && left.digest === right.digest;
}

function normalizeGeneration(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ClosureStoreError(`Closure generation must be a non-negative safe integer: ${String(value)}`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ClosureStoreError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) throw new ClosureStoreError(`${label} contains unsupported fields: ${extras.join(", ")}`);
}

function normalizeIsoString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new ClosureStoreError(`${label} must be an ISO timestamp`);
  }
  return value;
}

export function normalizeReleaseVersion(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new ClosureStoreError("Closure release version must be a non-empty trimmed string");
  }
  return value;
}

function normalizePointer(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureRuntimePointer {
  const pointer = requireRecord(value, "Closure runtime pointer");
  assertExactKeys(pointer, [
    "channel",
    "digest",
    "generation",
    "namespace",
    "protocolVersion",
    "target",
    "version",
  ], "Closure runtime pointer");
  const binding = validateClosureBindingIdentity({
    ...pointer,
    platform: pointer.target,
  }, expected);
  return {
    channel: binding.channel,
    digest: binding.digest,
    generation: normalizeGeneration(pointer.generation),
    namespace: binding.namespace,
    protocolVersion: binding.protocolVersion,
    target: binding.platform,
    version: binding.version,
  };
}

export function closureBindingIdentityFromRuntimePointer(
  pointer: ClosureRuntimePointer,
): ClosureBindingIdentity {
  return validateClosureBindingIdentity({
    channel: pointer.channel,
    digest: pointer.digest,
    namespace: pointer.namespace,
    platform: pointer.target,
    protocolVersion: pointer.protocolVersion,
    version: pointer.version,
  });
}

function normalizeCommittedBinding(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): CommittedClosureBinding {
  const committed = requireRecord(value, "Committed Closure binding");
  assertExactKeys(committed, ["releaseVersion", "standalone"], "Committed Closure binding");
  return {
    releaseVersion: normalizeReleaseVersion(committed.releaseVersion),
    standalone: normalizePointer(committed.standalone, expected),
  };
}

export function validateClosureBindingDescriptor(
  value: unknown,
  expected: Pick<ClosureStorePaths, "channel" | "namespace">,
): ClosureBindingDescriptor {
  const descriptor = requireRecord(value, "Closure binding descriptor");
  assertExactKeys(descriptor, [
    "channel",
    "committed",
    "namespace",
    "nextGeneration",
    "schemaVersion",
    "updatedAt",
  ], "Closure binding descriptor");
  if (descriptor.schemaVersion !== CLOSURE_BINDING_SCHEMA_VERSION) {
    throw new ClosureStoreError(`unsupported Closure binding schema: ${String(descriptor.schemaVersion)}`);
  }
  const channel = normalizeChannel(String(descriptor.channel));
  const namespace = normalizeStoreNamespace(String(descriptor.namespace));
  if (channel !== expected.channel || namespace !== expected.namespace) {
    throw new ClosureStoreError("Closure binding descriptor does not match its channel/namespace store");
  }
  const committed = descriptor.committed == null
    ? null
    : normalizeCommittedBinding(descriptor.committed, expected);
  const nextGeneration = normalizeGeneration(descriptor.nextGeneration);
  if (committed != null && committed.standalone.generation >= nextGeneration) {
    throw new ClosureStoreError("Closure nextGeneration must be greater than the committed generation");
  }
  return {
    channel,
    committed,
    namespace,
    nextGeneration,
    schemaVersion: CLOSURE_BINDING_SCHEMA_VERSION,
    updatedAt: normalizeIsoString(descriptor.updatedAt, "Closure binding updatedAt"),
  };
}

export function resolveClosureStoreVersionPaths(
  paths: ClosureStorePaths,
  binding: ClosureBindingIdentity,
): ClosureStoreVersionPaths {
  const identity = validateClosureBindingIdentity(binding, paths);
  const digest = identity.digest.slice("sha256:".length);
  const versionRoot = assertUnderRoot(paths.root, join(paths.versionsRoot, identity.version, digest));
  return {
    ...paths,
    archivePath: assertUnderRoot(paths.root, join(versionRoot, "closure.zip")),
    digest,
    inventoryPath: assertUnderRoot(paths.root, join(versionRoot, "inventory.json")),
    manifestPath: assertUnderRoot(paths.root, join(versionRoot, "manifest.json")),
    payloadRoot: assertUnderRoot(paths.root, join(versionRoot, "payload")),
    version: identity.version,
    versionRoot,
  };
}

export async function readRequiredJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new ClosureStoreError(`${label} is missing or unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

export async function readOptionalJson(path: string, label: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ClosureStoreError(`${label} is unreadable at ${path}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

export async function digestFile(path: string): Promise<{ digest: string; size: number }> {
  const metadata = await stat(path).catch(() => null);
  if (metadata == null || !metadata.isFile()) throw new ClosureStoreError(`Closure file is missing: ${path}`);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return { digest: `sha256:${hash.digest("hex")}`, size: metadata.size };
}

export async function verifyClosureDistributionBlob(
  paths: ClosureStorePaths,
  artifact: ClosureDistributionBlob,
): Promise<string> {
  const blobPath = resolveDistributionBlobPath(paths, artifact.digest);
  const actual = await digestFile(blobPath);
  if (actual.digest !== artifact.digest || actual.size !== artifact.size) {
    throw new ClosureStoreError("Closure distribution blob does not match its manifest");
  }
  return blobPath;
}

function assertDistributionPlanMatchesStore(
  paths: ClosureStorePaths,
  plan: ClosureDistributionGenerationPlan,
): void {
  if (plan.channel !== paths.channel || plan.namespace !== paths.namespace) {
    throw new ClosureStoreError("Closure distribution plan does not match its channel/namespace Store");
  }
  const expectedRoot = resolveDistributionInstallationRoot({
    digest: plan.identity.digest, installationsRoot: paths.installationsRoot, root: paths.root,
    target: plan.target, version: plan.identity.version,
  });
  if (plan.storeRoot !== expectedRoot || plan.installationRoot !== expectedRoot) {
    throw new ClosureStoreError("Closure distribution plan does not match its content-addressed Store root");
  }
  if (plan.manifestPath !== join(expectedRoot, "closure.json")) {
    throw new ClosureStoreError("Closure distribution plan manifest path is invalid");
  }
}

async function inspectMaterializedComponentTree(
  root: string,
  label: string,
): Promise<ClosureComponentTreeFile[]> {
  const pending = [root];
  const files: ClosureComponentTreeFile[] = [];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const metadata = await lstat(current).catch(() => null);
    if (metadata == null || !metadata.isDirectory()) {
      throw new ClosureStoreError(`materialized Closure ${label} component is missing`);
    }
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ClosureStoreError(`materialized Closure ${label} component contains a symlink`);
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        const inspected = await digestFile(entryPath);
        files.push({
          digest: inspected.digest as ClosureDigest,
          path: relative(root, entryPath).split(sep).join("/"),
          size: inspected.size,
        });
      } else {
        throw new ClosureStoreError(`materialized Closure ${label} component contains an unsupported entry`);
      }
    }
  }
  if (files.length === 0) {
    throw new ClosureStoreError(`materialized Closure ${label} component is empty`);
  }
  return files.sort((left, right) => compareName(left.path, right.path));
}

async function assertMaterializedEntrypoint(path: string, label: string): Promise<void> {
  const metadata = await lstat(path).catch(() => null);
  if (metadata == null || !metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ClosureStoreError(`materialized Closure ${label} entry is missing`);
  }
}

/** Verify a private staging tree and every required channel CAS blob. */
export async function verifyMaterializedClosureDistributionGeneration(
  paths: ClosureStorePaths,
  plan: ClosureDistributionGenerationPlan,
  materializedRootInput: string,
): Promise<StoredClosureDistributionVerification> {
  assertDistributionPlanMatchesStore(paths, plan);
  const materializedRoot = assertUnderRoot(paths.stagingRoot, materializedRootInput);
  if (materializedRoot === paths.stagingRoot) {
    throw new ClosureStoreError("materialized Closure generation must use an isolated staging child");
  }
  return await verifyClosureDistributionGenerationRoot(paths, plan, materializedRoot);
}

async function verifyClosureDistributionGenerationRoot(
  paths: ClosureStorePaths,
  plan: ClosureDistributionGenerationPlan,
  materializedRoot: string,
): Promise<StoredClosureDistributionVerification> {
  const expectedTopLevel = ["body", "closure.json", "launcher", "native"];
  const topLevel = (await readdir(materializedRoot, { withFileTypes: true }).catch(() => []))
    .map((entry) => entry.name)
    .sort(compareName);
  if (JSON.stringify(topLevel) !== JSON.stringify(expectedTopLevel)) {
    throw new ClosureStoreError("materialized Closure generation has an invalid top-level shape");
  }

  const normalizedManifest = validateClosureDistributionManifest(
    await readRequiredJson(join(materializedRoot, "closure.json"), "Closure distribution manifest"),
    sha256CanonicalDistribution,
  );
  if (JSON.stringify(normalizedManifest) !== JSON.stringify(plan.manifest)) {
    throw new ClosureStoreError("materialized Closure distribution manifest does not match its generation plan");
  }

  const required = Object.entries(plan.required) as Array<[
    keyof ClosureDistributionGenerationPlan["required"],
    ClosureDistributionComponentPlan | ClosureDistributionEntrypointPlan,
  ]>;
  const verifiedDigests = new Set<string>();
  for (const [name, component] of required) {
    const expectedBlobPath = resolveDistributionBlobPath(paths, component.artifact.digest);
    if (component.blobPath !== expectedBlobPath) {
      throw new ClosureStoreError(`Closure distribution ${name} blob path is invalid`);
    }
    if (!verifiedDigests.has(component.artifact.digest)) {
      try {
        await verifyClosureDistributionBlob(paths, component.artifact);
      } catch (error) {
        throw new ClosureStoreError(`Closure distribution ${name} blob does not match its manifest`, {
          cause: error,
        });
      }
      verifiedDigests.add(component.artifact.digest);
    }
    const componentRoot = join(materializedRoot, name);
    const files = await inspectMaterializedComponentTree(componentRoot, name);
    const treeDigest = createClosureComponentTreeDigest(files, sha256CanonicalDistribution);
    if (treeDigest !== component.treeDigest) {
      throw new ClosureStoreError(`materialized Closure ${name} component tree does not match its manifest`);
    }
    if ("entryPath" in component) {
      await assertMaterializedEntrypoint(join(componentRoot, component.entryPath), name);
    }
    if ("handoffPath" in component && typeof component.handoffPath === "string") {
      await assertMaterializedEntrypoint(join(componentRoot, component.handoffPath), `${name} handoff`);
    }
  }
  if (verifiedDigests.size !== new Set(plan.requiredBlobPaths).size) {
    throw new ClosureStoreError("Closure distribution required blob set does not match its components");
  }
  return Object.freeze({ materializedRoot, plan });
}

/** Read the digest-bound manifest even when its materialized components need repair. */
export async function readStoredClosureDistributionManifest(
  paths: ClosureStorePaths, pointerInput: ClosureRuntimePointer,
): Promise<ClosureDistributionManifest> {
  const pointer = normalizePointer(pointerInput, paths);
  const storeRoot = resolveDistributionInstallationRoot({
    digest: pointer.digest, installationsRoot: paths.installationsRoot, root: paths.root, target: pointer.target,
    version: pointer.version,
  });
  const manifest = validateClosureDistributionManifest(
    await readRequiredJson(join(storeRoot, "closure.json"), "Closure distribution manifest"), sha256CanonicalDistribution,
  );
  const plan = planClosureDistributionGeneration(paths, pointer.generation, manifest, pointer.target);
  if (
    plan.identity.channel !== pointer.channel
    || plan.identity.digest !== pointer.digest
    || plan.identity.protocolVersion !== pointer.protocolVersion
    || plan.identity.version !== pointer.version
  ) {
    throw new ClosureStoreError("committed Closure distribution identity does not match its installation");
  }
  return manifest;
}

/** Verify the immutable installation identity named by the runtime pointer. */
export async function verifyStoredClosureDistributionGeneration(
  paths: ClosureStorePaths, pointerInput: ClosureRuntimePointer,
): Promise<StoredClosureDistributionVerification> {
  const pointer = normalizePointer(pointerInput, paths);
  const manifest = await readStoredClosureDistributionManifest(paths, pointer);
  const plan = planClosureDistributionGeneration(paths, pointer.generation, manifest, pointer.target);
  const storeRoot = resolveDistributionInstallationRoot({
    digest: pointer.digest, installationsRoot: paths.installationsRoot, root: paths.root,
    target: pointer.target, version: pointer.version,
  });
  return await verifyClosureDistributionGenerationRoot(paths, plan, storeRoot);
}

export async function hasStoredClosureDistributionGeneration(
  paths: ClosureStorePaths, pointerInput: ClosureRuntimePointer,
): Promise<boolean> {
  const pointer = normalizePointer(pointerInput, paths);
  const manifestPath = join(resolveDistributionInstallationRoot({
    digest: pointer.digest, installationsRoot: paths.installationsRoot, root: paths.root,
    target: pointer.target, version: pointer.version,
  }), "closure.json");
  const metadata = await lstat(manifestPath).catch(() => null);
  return metadata?.isFile() === true && !metadata.isSymbolicLink();
}

/** Publish one verified generation and then advance the sole binding truth. */
export async function commitVerifiedClosureDistributionGeneration(
  paths: ClosureStorePaths,
  verification: StoredClosureDistributionVerification,
  releaseVersion: string,
): Promise<{
  committed: CommittedClosureBinding;
  descriptor: ClosureBindingDescriptor;
  verification: StoredClosureDistributionVerification;
}> {
  assertDistributionPlanMatchesStore(paths, verification.plan);
  const materializedRoot = assertUnderRoot(paths.stagingRoot, verification.materializedRoot);
  const current = await readClosureBindingDescriptor(paths);
  if (verification.plan.generation !== current.nextGeneration) {
    throw new ClosureStoreError("verified Closure generation is stale");
  }
  await rm(verification.plan.storeRoot, { force: true, recursive: true });
  await mkdir(dirname(verification.plan.storeRoot), { recursive: true });
  await rename(materializedRoot, verification.plan.storeRoot);

  const pointer: ClosureRuntimePointer = {
    channel: paths.channel,
    digest: verification.plan.identity.digest,
    generation: verification.plan.generation,
    namespace: paths.namespace,
    protocolVersion: verification.plan.identity.protocolVersion,
    target: verification.plan.target,
    version: verification.plan.identity.version,
  };
  const committed: CommittedClosureBinding = {
    releaseVersion: normalizeReleaseVersion(releaseVersion),
    standalone: pointer,
  };
  const descriptor: ClosureBindingDescriptor = {
    ...current,
    committed,
    nextGeneration: current.nextGeneration + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(paths.bindingPath, descriptor);
  return { committed, descriptor, verification };
}


export * from "./legacy-candidate.js";
