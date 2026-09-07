import { createHash } from 'node:crypto';
import { mkdtemp, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SkillDiscoveryMaterializationError,
  materializeVerifiedSkillDiscoveryResources,
  skillDiscoveryMaterializationAlias,
} from '../src/skill-discovery/materialize.js';

function resource(relativePath: string, text: string, mode = 0o644) {
  const bytes = Buffer.from(text, 'utf8');
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return { relativePath, bytes, digest, size: bytes.byteLength, mode };
}

describe('Skill discovery materialization', () => {
  it('publishes verified bytes below a project-private relative root', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-discovery-stage-'));
    const alias = skillDiscoveryMaterializationAlias({
      id: 'web-clone',
      candidateDigest: `sha256:${'a'.repeat(64)}`,
    });
    const receipt = await materializeVerifiedSkillDiscoveryResources({
      cwd,
      alias,
      resources: [resource('scripts/run.sh', '#!/bin/sh\n', 0o755)],
    });
    expect(receipt.materializedRoot).toBe(`.od-skills/${alias}`);
    expect(receipt.resources).toEqual([expect.objectContaining({ relativePath: 'scripts/run.sh' })]);
    expect(await readFile(path.join(cwd, receipt.materializedRoot!, 'scripts/run.sh'), 'utf8'))
      .toBe('#!/bin/sh\n');
  });

  it('fails closed before replacing a safe package when bytes drift', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-discovery-stage-'));
    await expect(materializeVerifiedSkillDiscoveryResources({
      cwd,
      alias: 'discovered-test-aaaaaaaaaaaa',
      resources: [{ ...resource('asset.txt', 'trusted'), digest: `sha256:${'0'.repeat(64)}` }],
    })).rejects.toBeInstanceOf(SkillDiscoveryMaterializationError);
  });

  it('materializes official template previews while keeping the 512 KiB file bound', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-discovery-template-'));
    const preview = resource('example.webp', 'x'.repeat(417_378));
    const receipt = await materializeVerifiedSkillDiscoveryResources({
      cwd,
      alias: 'discovered-image-event-poster-aaaaaaaaaaaa',
      resources: [preview],
    });
    expect(await readFile(path.join(cwd, receipt.materializedRoot!, 'example.webp')))
      .toEqual(preview.bytes);
    await expect(materializeVerifiedSkillDiscoveryResources({
      cwd,
      alias: 'discovered-image-event-poster-aaaaaaaaaaaa',
      resources: [resource('example.webp', 'x'.repeat(512 * 1024 + 1))],
    })).rejects.toBeInstanceOf(SkillDiscoveryMaterializationError);
    expect(await readFile(path.join(cwd, receipt.materializedRoot!, 'example.webp')))
      .toEqual(preview.bytes);
  });

  it('refuses a symbolic staging root', async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'od-discovery-stage-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'od-discovery-outside-'));
    await symlink(outside, path.join(cwd, '.od-skills'));
    await expect(materializeVerifiedSkillDiscoveryResources({
      cwd,
      alias: 'discovered-test-aaaaaaaaaaaa',
      resources: [resource('asset.txt', 'trusted')],
    })).rejects.toBeInstanceOf(SkillDiscoveryMaterializationError);
  });
});
