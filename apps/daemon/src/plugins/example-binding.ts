import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';

import type { ProjectExampleBinding, ProjectMetadata } from '@open-design/contracts';

/**
 * Upper bound for the example manifest the daemon digests at bind time.
 *
 * Matches `MAX_SKILL_MANIFEST_BYTES` in
 * `strategies/od-next/frozen-skill-package.ts`: a manifest this read accepts
 * but capture would later refuse is a binding that can never be honoured.
 */
const MAX_EXAMPLE_MANIFEST_BYTES = 256 * 1024;

export class InvalidProjectExampleBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectExampleBindingError';
  }
}

/**
 * Digest the SKILL.md the example card would contribute as a user-selected
 * Skill.
 *
 * SKILL.md — not `open-design.json` — is deliberately the pinned artifact:
 * these are the exact bytes `captureFrozenSkillPackageFromSources` will read
 * at run start, so the recorded digest is the one that can actually be
 * reproduced there. An example with no SKILL.md has nothing to carry into
 * `session_skills`, and is rejected rather than bound to nothing.
 */
export async function digestExampleSkillManifest(
  pluginFsPath: string,
): Promise<string> {
  const manifestPath = path.join(pluginFsPath, 'SKILL.md');
  let handle;
  try {
    handle = await open(manifestPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    throw new InvalidProjectExampleBindingError(
      'example plugin has no readable SKILL.md to carry as a Skill',
    );
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new InvalidProjectExampleBindingError(
        'example plugin SKILL.md is not a regular file',
      );
    }
    if (stat.size > MAX_EXAMPLE_MANIFEST_BYTES) {
      throw new InvalidProjectExampleBindingError(
        'example plugin SKILL.md exceeds its byte limit',
      );
    }
    const bytes = Buffer.alloc(stat.size);
    let read = 0;
    while (read < stat.size) {
      const { bytesRead } = await handle.read(bytes, read, stat.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    if (read !== stat.size) {
      throw new InvalidProjectExampleBindingError(
        'example plugin SKILL.md changed while it was being read',
      );
    }
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  } finally {
    await handle.close();
  }
}

export function createProjectExampleBinding(input: {
  pluginId: string;
  pluginSource: string;
  manifestSourceDigest: string;
  boundAt?: number;
}): ProjectExampleBinding {
  return {
    schemaVersion: 1,
    provenance: 'example_card',
    pluginId: input.pluginId,
    pluginSource: input.pluginSource,
    manifestSourceDigest: input.manifestSourceDigest,
    boundAt: input.boundAt ?? Date.now(),
  };
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

/**
 * Read the daemon-owned example binding, or null when the stored value is not
 * one this daemon would have written.
 *
 * Mirrors `readVerifiedProjectStrategyBinding`, with one deliberate
 * difference: the strategy binding re-derives its task profile from project
 * metadata and rejects a binding that disagrees, whereas an example binding
 * has no metadata-derivable counterpart to check against. Its authority comes
 * from the two facts recorded here — the exact `pluginSource` the record is
 * re-resolved through at run start, and the `manifestSourceDigest` capture has
 * to reproduce from disk. This function is therefore a shape gate only, and
 * must not be treated as proof that the example still exists.
 */
export function readVerifiedProjectExampleBinding(
  metadata: ProjectMetadata | null | undefined,
): ProjectExampleBinding | null {
  const binding = metadata?.exampleBinding;
  if (!binding || typeof binding !== 'object') return null;
  if (
    binding.schemaVersion !== 1
    || binding.provenance !== 'example_card'
    || typeof binding.pluginId !== 'string'
    || !binding.pluginId.trim()
    || typeof binding.pluginSource !== 'string'
    || !binding.pluginSource.trim()
    || typeof binding.manifestSourceDigest !== 'string'
    || !SHA256_DIGEST.test(binding.manifestSourceDigest)
    || typeof binding.boundAt !== 'number'
    || !Number.isFinite(binding.boundAt)
  ) return null;
  return binding;
}
