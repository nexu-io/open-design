import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { validateRunDeliverable } from '../src/run-deliverable-validation.js';

const temporaryRoots: string[] = [];

async function projectFixture(
  files: Record<string, string>,
): Promise<{ projectsRoot: string; projectId: string }> {
  const projectsRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'od-deliverable-validation-'),
  );
  temporaryRoots.push(projectsRoot);
  const projectId = 'project-1';
  const projectRoot = path.join(projectsRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(projectRoot, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  return { projectsRoot, projectId };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

describe('run deliverable validation', () => {
  it('accepts a readable entry whose file kind matches the project kind', async () => {
    const fixture = await projectFixture({
      'index.html': '<!doctype html><title>Ready</title>',
    });

    await expect(
      validateRunDeliverable({
        ...fixture,
        runStatus: 'succeeded',
        artifactCount: 1,
        projectMetadata: {
          kind: 'prototype',
          entryFile: 'index.html',
        },
      }),
    ).resolves.toMatchObject({
      valid: true,
      validation: 'valid',
      entryFile: 'index.html',
      artifactKind: 'html',
    });
  });

  it('rejects a stale declared entry even when an unrelated artifact was touched', async () => {
    const fixture = await projectFixture({
      'notes.txt': 'unrelated run output',
    });

    await expect(
      validateRunDeliverable({
        ...fixture,
        runStatus: 'succeeded',
        artifactCount: 1,
        projectMetadata: {
          kind: 'prototype',
          entryFile: 'index.html',
        },
      }),
    ).resolves.toEqual({
      valid: false,
      validation: 'entry_missing',
    });
  });

  it('rejects an old declared entry when this run only touched another artifact', async () => {
    const fixture = await projectFixture({
      'index.html': '<!doctype html><title>Old entry</title>',
      'other.html': '<!doctype html><title>Unrelated output</title>',
    });

    await expect(
      validateRunDeliverable({
        ...fixture,
        runStatus: 'succeeded',
        artifactCount: 1,
        touchedPaths: ['other.html'],
        projectMetadata: {
          kind: 'prototype',
          entryFile: 'index.html',
        },
      }),
    ).resolves.toMatchObject({
      valid: false,
      validation: 'entry_not_touched',
      entryFile: 'index.html',
      artifactKind: 'html',
    });
  });

  it('rejects a readable entry whose file kind does not match the project kind', async () => {
    const fixture = await projectFixture({
      'index.html': '<!doctype html><title>Wrong kind</title>',
    });

    await expect(
      validateRunDeliverable({
        ...fixture,
        runStatus: 'succeeded',
        artifactCount: 1,
        projectMetadata: {
          kind: 'image',
          entryFile: 'index.html',
        },
      }),
    ).resolves.toMatchObject({
      valid: false,
      validation: 'type_mismatch',
      entryFile: 'index.html',
      artifactKind: 'html',
    });
  });

  // Issue: a HyperFrames run delivered an editable root `index.html`, the run
  // succeeded, and delivery validation still reported `type_mismatch` — which
  // the OD Next coordinator turns into `od_next_canonical_deliverable_invalid`
  // and surfaces to the user as "The strategy task could not continue."
  //
  // HyperFrames is an HTML-to-video renderer: the composition HTML *is* the
  // authored deliverable and the MP4 is a render of it. The project rides on
  // `kind: 'video'` only because that is the Home surface it was created from.
  describe('hyperframes projects', () => {
    const hyperFramesMetadata = {
      kind: 'video' as const,
      intent: 'hyperframes' as const,
      videoModel: 'hyperframes-html',
    };

    it('accepts the authored composition html as the canonical deliverable', async () => {
      // Mirrors the real project layout: the scaffolded composition lives in a
      // dot-directory, which `listFiles` skips, so the root `index.html` the
      // agent writes is the only candidate delivery validation can ever see.
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Kinetic typography opener</title>',
        '.hyperframes-cache/opener/hyperframes.json': '{}',
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['index.html'],
          projectMetadata: hyperFramesMetadata,
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'index.html',
        artifactKind: 'html',
      });
    });

    it('accepts a rendered mp4 for the same project', async () => {
      const fixture = await projectFixture({
        'opener.mp4': 'not-really-an-mp4',
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['opener.mp4'],
          projectMetadata: hyperFramesMetadata,
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'opener.mp4',
        artifactKind: 'video',
      });
    });

    it('still rejects html for a generative video project', async () => {
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Not a video</title>',
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['index.html'],
          projectMetadata: { kind: 'video', videoModel: 'fal/veo-3' },
        }),
      ).resolves.toMatchObject({
        valid: false,
        validation: 'type_mismatch',
        entryFile: 'index.html',
        artifactKind: 'html',
      });
    });
  });

  it('does not promote a Studio route or pre-existing file without a run artifact', async () => {
    const fixture = await projectFixture({
      'index.html': '<!doctype html><title>Old artifact</title>',
    });

    await expect(
      validateRunDeliverable({
        ...fixture,
        runStatus: 'succeeded',
        artifactCount: 0,
        projectMetadata: {
          kind: 'prototype',
          entryFile: 'index.html',
        },
      }),
    ).resolves.toEqual({
      valid: false,
      validation: 'no_artifact',
    });
  });
});
