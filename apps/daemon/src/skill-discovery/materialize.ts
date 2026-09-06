import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { OfficialSkillDiscoveryMaterializationV1 } from '@open-design/contracts';

import { SKILLS_CWD_ALIAS } from '../cwd-aliases.js';

const PORTABLE_RELATIVE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILES = 32;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

export interface VerifiedSkillDiscoveryResource {
  relativePath: string;
  bytes: Uint8Array;
  digest: string;
  size: number;
  mode: number;
}

export class SkillDiscoveryMaterializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillDiscoveryMaterializationError';
  }
}

/** Stable, project-private package name without leaking the official source path. */
export function skillDiscoveryMaterializationAlias(input: {
  id: string;
  candidateDigest: string;
}): string {
  if (!CANONICAL_ID.test(input.id) || !SHA256.test(input.candidateDigest)) {
    throw new SkillDiscoveryMaterializationError('Skill materialization identity is invalid.');
  }
  return `discovered-${input.id}-${input.candidateDigest.slice('sha256:'.length, 19)}`;
}

/**
 * Atomically publish an already verified resource package below the Agent
 * process cwd. This runs inside the `od tools skills load` CLI, keeping every
 * project-path write in the Agent's filesystem authority domain.
 */
export async function materializeVerifiedSkillDiscoveryResources(input: {
  cwd: string;
  alias: string;
  resources: readonly VerifiedSkillDiscoveryResource[];
}): Promise<OfficialSkillDiscoveryMaterializationV1> {
  if (!path.isAbsolute(input.cwd)) {
    throw new SkillDiscoveryMaterializationError('Project cwd must be absolute.');
  }
  if (!CANONICAL_ID.test(input.alias)) {
    throw new SkillDiscoveryMaterializationError('Skill materialization alias is invalid.');
  }
  if (input.resources.length > MAX_FILES) {
    throw new SkillDiscoveryMaterializationError(`Skill package exceeds ${MAX_FILES} resources.`);
  }

  const resources = validateResources(input.resources);
  if (resources.length === 0) {
    return { materializedRoot: null, resources: [] };
  }

  const aliasRoot = path.join(input.cwd, SKILLS_CWD_ALIAS);
  const rootState = await lstat(aliasRoot).catch(() => null);
  if (rootState && (rootState.isSymbolicLink() || !rootState.isDirectory())) {
    throw new SkillDiscoveryMaterializationError(
      'The project Skill staging root is occupied by an unsafe entry.',
    );
  }
  await mkdir(aliasRoot, { recursive: true });

  const nonce = randomUUID();
  const target = path.join(aliasRoot, input.alias);
  const staged = path.join(aliasRoot, `.${input.alias}.staging-${nonce}`);
  const backup = path.join(aliasRoot, `.${input.alias}.previous-${nonce}`);
  let targetMoved = false;
  try {
    await mkdir(staged, { recursive: false });
    for (const resource of resources) {
      const destination = path.join(staged, ...resource.relativePath.split('/'));
      const relativeCheck = path.relative(staged, destination);
      if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
        throw new SkillDiscoveryMaterializationError('Skill resource escaped its staging root.');
      }
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, resource.bytes, { flag: 'wx' });
      await chmod(destination, resource.mode & 0o777);
    }

    const current = await lstat(target).catch(() => null);
    if (current) {
      if (current.isSymbolicLink() || !current.isDirectory()) {
        throw new SkillDiscoveryMaterializationError(
          'The selected Skill staging destination is occupied by an unsafe entry.',
        );
      }
      await rename(target, backup);
      targetMoved = true;
    }
    try {
      await rename(staged, target);
    } catch (error) {
      if (targetMoved) await rename(backup, target).catch(() => {});
      throw error;
    }
    if (targetMoved) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(staged, { recursive: true, force: true }).catch(() => {});
    throw error instanceof SkillDiscoveryMaterializationError
      ? error
      : new SkillDiscoveryMaterializationError(
        `Failed to stage selected Skill resources: ${error instanceof Error ? error.message : String(error)}`,
      );
  }

  return {
    materializedRoot: `${SKILLS_CWD_ALIAS}/${input.alias}`,
    resources: resources.map(({ relativePath, digest, size }) => ({
      relativePath,
      digest,
      size,
    })),
  };
}

function validateResources(
  values: readonly VerifiedSkillDiscoveryResource[],
): VerifiedSkillDiscoveryResource[] {
  const result: VerifiedSkillDiscoveryResource[] = [];
  const paths = new Set<string>();
  let packageBytes = 0;
  for (const value of values) {
    if (!PORTABLE_RELATIVE_PATH.test(value.relativePath) || paths.has(value.relativePath)) {
      throw new SkillDiscoveryMaterializationError(
        `Skill resource path ${value.relativePath || '<empty>'} is invalid or duplicated.`,
      );
    }
    const bytes = Buffer.from(value.bytes);
    if (bytes.byteLength !== value.size || bytes.byteLength > MAX_FILE_BYTES) {
      throw new SkillDiscoveryMaterializationError(
        `Skill resource ${value.relativePath} size does not match its verified roster.`,
      );
    }
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    if (!SHA256.test(value.digest) || digest !== value.digest) {
      throw new SkillDiscoveryMaterializationError(
        `Skill resource ${value.relativePath} digest does not match its verified roster.`,
      );
    }
    if (!Number.isInteger(value.mode) || value.mode < 0 || value.mode > 0o7777) {
      throw new SkillDiscoveryMaterializationError(
        `Skill resource ${value.relativePath} mode is invalid.`,
      );
    }
    packageBytes += bytes.byteLength;
    if (packageBytes > MAX_PACKAGE_BYTES) {
      throw new SkillDiscoveryMaterializationError(
        `Skill package exceeds ${MAX_PACKAGE_BYTES} bytes.`,
      );
    }
    paths.add(value.relativePath);
    result.push({ ...value, bytes });
  }
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'));
}
