import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import {
  validateClosureDistributionManifest,
  type ClosureDistributionManifest,
} from '@open-design/closure-proto';
import {
  readClosureBindingDescriptor,
  resolveClosureStorePaths,
  type ClosureBindingDescriptor,
  type ClosureRuntimePointer,
  type ClosureStorePaths,
} from '@open-design/closure-store';
import {
  applyClosureDistributionUpdate,
  ensureClosureResource,
  type ClosureDistributionReleaseCandidate,
} from '@open-design/closure-update';

export type PackagedStandaloneDistributionFixture = {
  ensuredResource: Readonly<{ id: string; path: string; reused: boolean; title: string }> | null;
  manifest: ClosureDistributionManifest;
  pointer: ClosureRuntimePointer;
  releaseVersion: string;
  storePaths: ClosureStorePaths;
};

function digestCanonical(value: string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function resolveInput(workspaceRoot: string, value: string): string {
  return isAbsolute(value) ? value : resolve(workspaceRoot, value);
}

export async function commitPackagedStandaloneDistributionFixture(input: {
  blobRoots: readonly string[];
  channel: string;
  installationRoot: string;
  manifestPath: string;
  namespace: string;
  releaseVersion: string;
  shellType: string;
  shellVersion: string;
  target: string;
  workspaceRoot: string;
}): Promise<PackagedStandaloneDistributionFixture> {
  const manifest = validateClosureDistributionManifest(
    JSON.parse(await readFile(resolveInput(input.workspaceRoot, input.manifestPath), 'utf8')) as unknown,
    digestCanonical,
  );
  if (manifest.identity.channel !== input.channel || manifest.required.targets[input.target] == null) {
    throw new Error(`Standalone distribution does not contain ${input.channel}/${input.target}`);
  }
  const seedRoot = await mkdtemp(join(tmpdir(), 'od-standalone-distribution-seed-'));
  try {
    const seedBlobs = join(seedRoot, input.channel, 'blobs');
    for (const root of input.blobRoots) {
      await cp(resolveInput(input.workspaceRoot, root), seedBlobs, { force: false, recursive: true });
    }
    const paths = resolveClosureStorePaths({
      channel: input.channel,
      namespace: input.namespace,
      root: input.installationRoot,
    });
    const candidate: ClosureDistributionReleaseCandidate = {
      manifest,
      releaseVersion: input.releaseVersion,
      target: input.target,
    };
    const result = await applyClosureDistributionUpdate({
      candidate,
      paths,
      repository: { localSeeds: [{ root: seedRoot }], remoteOrigins: [], schemaVersion: 1 },
      shellType: input.shellType,
      shellVersion: input.shellVersion,
    });
    if (result.state !== 'committed' && result.reason !== 'already-committed') {
      throw new Error(`Standalone distribution fixture was not committed: ${result.state}/${result.reason}`);
    }
    const pointer = (await readClosureBindingDescriptor(paths)).committed?.standalone;
    if (pointer == null || pointer.digest !== manifest.identity.digest || pointer.target !== input.target) {
      throw new Error('Standalone distribution fixture committed an unexpected binding');
    }
    const firstResource = manifest.resources[0];
    const ensuredResource = firstResource == null
      ? null
      : await ensureClosureResource({
          id: firstResource.id,
          manifest,
          paths,
          repository: { localSeeds: [{ root: seedRoot }], remoteOrigins: [], schemaVersion: 1 },
          target: input.target,
        });
    return { ensuredResource, manifest, pointer, releaseVersion: input.releaseVersion, storePaths: paths };
  } finally {
    await rm(seedRoot, { force: true, recursive: true });
  }
}

export async function readPackagedStandaloneDistributionFixture(input: {
  blobRoots: readonly string[];
  channel: string;
  installationRoot: string;
  manifestPath: string;
  namespace: string;
  releaseVersion: string;
  target: string;
  workspaceRoot: string;
}): Promise<PackagedStandaloneDistributionFixture> {
  const manifest = validateClosureDistributionManifest(
    JSON.parse(await readFile(resolveInput(input.workspaceRoot, input.manifestPath), 'utf8')) as unknown,
    digestCanonical,
  );
  if (manifest.identity.channel !== input.channel || manifest.required.targets[input.target] == null) {
    throw new Error(`Standalone distribution does not contain ${input.channel}/${input.target}`);
  }
  const paths = resolveClosureStorePaths({
    channel: input.channel,
    namespace: input.namespace,
    root: input.installationRoot,
  });
  const pointer = (await readClosureBindingDescriptor(paths)).committed?.standalone;
  if (pointer == null || pointer.digest !== manifest.identity.digest || pointer.target !== input.target) {
    throw new Error('Installed Shell did not commit the expected embedded Standalone distribution');
  }

  const seedRoot = await mkdtemp(join(tmpdir(), 'od-standalone-distribution-read-'));
  try {
    const seedBlobs = join(seedRoot, input.channel, 'blobs');
    for (const root of input.blobRoots) {
      await cp(resolveInput(input.workspaceRoot, root), seedBlobs, { force: false, recursive: true });
    }
    const firstResource = manifest.resources[0];
    const ensuredResource = firstResource == null
      ? null
      : await ensureClosureResource({
          id: firstResource.id,
          manifest,
          paths,
          repository: { localSeeds: [{ root: seedRoot }], remoteOrigins: [], schemaVersion: 1 },
          target: input.target,
        });
    return { ensuredResource, manifest, pointer, releaseVersion: input.releaseVersion, storePaths: paths };
  } finally {
    await rm(seedRoot, { force: true, recursive: true });
  }
}

export async function damagePackagedStandaloneDistributionFixture(
  fixture: PackagedStandaloneDistributionFixture,
): Promise<void> {
  await writeFile(
    join(fixture.storePaths.generationsRoot, String(fixture.pointer.generation), 'body', 'bootloader.mjs'),
    'throw new Error("release smoke damaged Standalone generation");\n',
    'utf8',
  );
}

export async function readPackagedStandaloneDistributionBinding(
  fixture: PackagedStandaloneDistributionFixture,
): Promise<ClosureBindingDescriptor> {
  return await readClosureBindingDescriptor(fixture.storePaths);
}
