import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import {
  bindClosureCandidateIdentity,
  validateClosureCandidateManifest,
  type ClosureCandidateManifest,
} from '@open-design/closure-proto';
import {
  commitStoredClosureCandidate,
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  resolveClosureStoreVersionPaths,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
  type ClosureStoreVersionPaths,
} from '@open-design/closure-store';
import extractZip from 'extract-zip';

type ClosureBuildReport = {
  archivePath?: unknown;
  inventoryPath?: unknown;
  manifest?: unknown;
  manifestPath?: unknown;
};

export type PackagedClosureBuildFixture = {
  archivePath: string;
  inventoryPath: string;
  manifest: ClosureCandidateManifest;
  manifestPath: string;
};

export type PackagedClosureFixture = {
  manifest: ClosureCandidateManifest;
  pointer: ClosureRuntimePointer;
  storePaths: ClosureStorePaths;
  versionPaths: ClosureStoreVersionPaths;
};

export async function readPackagedClosureBuildFixture(input: {
  buildJsonPath: string;
  channel: string;
  expectedPlatform: string;
  workspaceRoot: string;
}): Promise<PackagedClosureBuildFixture> {
  const buildJsonPath = resolveInputPath(input.workspaceRoot, input.buildJsonPath);
  const report = JSON.parse(await readFile(buildJsonPath, 'utf8')) as ClosureBuildReport;
  const manifestPath = requireReportPath(report.manifestPath, 'manifestPath', input.workspaceRoot);
  const manifest = validateClosureCandidateManifest(
    report.manifest ?? JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );
  if (manifest.identity.channel !== input.channel) {
    throw new Error(`Closure channel mismatch: expected ${input.channel}, got ${manifest.identity.channel}`);
  }
  if (manifest.identity.platform !== input.expectedPlatform) {
    throw new Error(`Closure platform mismatch: expected ${input.expectedPlatform}, got ${manifest.identity.platform}`);
  }
  return {
    archivePath: requireReportPath(report.archivePath, 'archivePath', input.workspaceRoot),
    inventoryPath: requireReportPath(report.inventoryPath, 'inventoryPath', input.workspaceRoot),
    manifest,
    manifestPath,
  };
}

export async function readCommittedPackagedClosureFixture(input: {
  buildJsonPath: string;
  channel: string;
  expectedPlatform: string;
  installationRoot: string;
  namespace: string;
  workspaceRoot: string;
}): Promise<PackagedClosureFixture> {
  const source = await readPackagedClosureBuildFixture(input);
  const storePaths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const binding = bindClosureCandidateIdentity(source.manifest.identity, input.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(storePaths, binding);
  const descriptor = await readClosureBindingDescriptor(storePaths);
  const pointer = descriptor.committed?.standalone;
  if (
    pointer == null
    || pointer.channel !== binding.channel
    || pointer.digest !== binding.digest
    || pointer.namespace !== binding.namespace
    || pointer.platform !== binding.platform
    || pointer.protocolVersion !== binding.protocolVersion
    || pointer.version !== binding.version
  ) {
    throw new Error('product did not commit the expected Standalone Closure binding');
  }
  return {
    manifest: source.manifest,
    pointer,
    storePaths,
    versionPaths,
  };
}

export async function resetPackagedClosureFixture(input: {
  channel: string;
  installationRoot: string;
  namespace: string;
}): Promise<void> {
  const paths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  await rm(paths.namespaceRoot, { force: true, recursive: true });
}

/**
 * Release-only bridge for committed-binding acceptance.
 *
 * The release lane has already built and validated the immutable Closure. This
 * helper materializes those exact bytes into the one product Store and commits
 * the binding so a real installed shell can prove attach/fail-closed behavior.
 * It deliberately does not discover or download remote metadata; that update
 * policy belongs to PR8.
 */
export async function seedPackagedClosureFixture(input: {
  buildJsonPath: string;
  channel: string;
  expectedPlatform: string;
  installationRoot: string;
  namespace: string;
  workspaceRoot: string;
}): Promise<PackagedClosureFixture> {
  const source = await readPackagedClosureBuildFixture(input);
  const { archivePath, inventoryPath, manifest, manifestPath } = source;
  const storePaths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const binding = bindClosureCandidateIdentity(manifest.identity, input.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(storePaths, binding);
  await rm(versionPaths.versionRoot, { force: true, recursive: true });
  await mkdir(versionPaths.versionRoot, { recursive: true });
  await Promise.all([
    copyFile(archivePath, versionPaths.archivePath),
    copyFile(inventoryPath, versionPaths.inventoryPath),
    copyFile(manifestPath, versionPaths.manifestPath),
  ]);
  await extractZip(versionPaths.archivePath, { dir: versionPaths.payloadRoot });
  const committed = await commitStoredClosureCandidate(
    storePaths,
    binding,
    manifest.identity.version,
  );
  return {
    manifest,
    pointer: committed.committed.standalone,
    storePaths,
    versionPaths,
  };
}

/**
 * Adds a newer committed candidate with the same immutable bytes and then
 * damages only its entrypoint. The next shell boot must fail visibly without
 * selecting or restoring another generation.
 */
export async function activateBrokenClosureSuccessor(
  fixture: PackagedClosureFixture,
): Promise<PackagedClosureFixture> {
  const version = bumpCountedVersion(fixture.manifest.identity.version);
  const manifest: ClosureCandidateManifest = {
    ...fixture.manifest,
    artifact: {
      ...fixture.manifest.artifact,
      url: replaceVersionInUrl(
        fixture.manifest.artifact.url,
        fixture.manifest.identity.version,
        version,
      ),
    },
    identity: { ...fixture.manifest.identity, version },
  };
  const binding = bindClosureCandidateIdentity(manifest.identity, fixture.storePaths.namespace);
  const versionPaths = resolveClosureStoreVersionPaths(fixture.storePaths, binding);
  await rm(versionPaths.versionRoot, { force: true, recursive: true });
  await mkdir(versionPaths.versionRoot, { recursive: true });
  await Promise.all([
    copyFile(fixture.versionPaths.archivePath, versionPaths.archivePath),
    copyFile(fixture.versionPaths.inventoryPath, versionPaths.inventoryPath),
    writeFile(versionPaths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  ]);
  await cp(fixture.versionPaths.payloadRoot, versionPaths.payloadRoot, {
    force: false,
    recursive: true,
  });
  const committed = await commitStoredClosureCandidate(
    fixture.storePaths,
    binding,
    version,
  );
  await writeFile(
    join(versionPaths.payloadRoot, manifest.artifact.entryPath),
    'throw new Error("release smoke damaged Closure successor");\n',
    'utf8',
  );
  return {
    manifest,
    pointer: committed.committed.standalone,
    storePaths: fixture.storePaths,
    versionPaths,
  };
}

export async function readPackagedClosureFixtureRuntime(
  fixture: Pick<PackagedClosureFixture, 'storePaths'>,
) {
  return await readClosureBindingDescriptor(fixture.storePaths);
}

function requireReportPath(value: unknown, label: string, workspaceRoot: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Closure build report ${label} must be a non-empty path`);
  }
  return resolveInputPath(workspaceRoot, value);
}

function resolveInputPath(workspaceRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(workspaceRoot, value);
}

function bumpCountedVersion(version: string): string {
  const match = /^(.*[.-](?:beta|betas|prerelease|preview))\.(\d+)$/.exec(version);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`Closure fault fixture requires a counted version: ${version}`);
  }
  return `${match[1]}.${Number(match[2]) + 1}`;
}

function replaceVersionInUrl(url: string, current: string, next: string): string {
  return url.includes(current) ? url.replaceAll(current, next) : url;
}
