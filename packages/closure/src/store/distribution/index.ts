import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  createClosureComponentTreeDigest,
  resolveClosureDistributionTarget,
  validateClosureDistributionManifest,
  type ClosureComponentTreeFile,
  type ClosureDigest,
  type ClosureDistributionBlob,
  type ClosureDistributionEntrypointComponent,
  type ClosureDistributionIdentity,
  type ClosureDistributionLauncherComponent,
  type ClosureDistributionManifest,
  type ClosureChannel,
  type ResolvedClosureDistributionTarget,
} from "../../protocol/index.js";
import {
  ClosureStoreError,
  assertUnderRoot,
  digestFile,
  normalizeGeneration,
  normalizePointer,
  readRequiredJson,
  type ClosureBindingDescriptor,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type ClosureReleaseBinding,
} from "../binding.js";
import { compareName, readClosureBindingDescriptor } from "../legacy-candidate.js";
import { publishPreparedClosureBinding } from "../runtime.js";
import { resolveDistributionInstallationRoot } from "./paths.js";

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
  startup: "blocking" | "lazy";
  title: string;
  treeDigest: ClosureDigest;
}>;

export type ClosureDistributionGenerationPlan = Readonly<{
  channel: ClosureChannel;
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

function sha256CanonicalDistribution(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Consume one sealed distribution graph without selecting a release or
 * exposing Store layout. Materialization may stage the returned target, but a
 * later Store preparation still publishes the generation atomically.
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
      startup: resource.startup,
      title: resource.title,
      treeDigest: resource.treeDigest,
    }))),
    target: consumed.target.target,
  });
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
    throw new ClosureStoreError("stored Closure distribution identity does not match its installation");
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

/** Publish verified bytes as a prepared generation without changing launch authority. */
export async function prepareVerifiedClosureDistributionGeneration(
  paths: ClosureStorePaths,
  verification: StoredClosureDistributionVerification,
  releaseVersion: string,
): Promise<{
  prepared: ClosureReleaseBinding;
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
  const descriptor = await publishPreparedClosureBinding(paths, pointer, releaseVersion);
  const prepared = descriptor.prepared;
  if (prepared == null) throw new ClosureStoreError("prepared Closure binding was not published");
  return { prepared, descriptor, verification };
}

