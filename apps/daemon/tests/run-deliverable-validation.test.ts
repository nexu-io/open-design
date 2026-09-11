import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  inferBaselineHtmlEntry,
  validateProjectDeliverable,
  validateRunDeliverable,
} from '../src/run-deliverable-validation.js';

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

describe('linked prototype page delivery (OPEND-2887)', () => {
  it('accepts a touched page reachable from the unchanged canonical entry', async () => {
    const fixture = await projectFixture({
      'index.html': '<a href="pages/catalog.html?edition=1#plants">Catalog</a>',
      'pages/catalog.html': '<title>Catalog</title>',
    });
    await expect(validateRunDeliverable({
      ...fixture, runStatus: 'succeeded', artifactCount: 1,
      touchedPaths: ['pages/catalog.html'],
      projectMetadata: { kind: 'prototype', entryFile: 'index.html' },
    })).resolves.toMatchObject({ valid: true, entryFile: 'index.html' });
  });

  it('follows nested local navigation without accepting a disconnected page', async () => {
    const fixture = await projectFixture({
      'index.html': '<a href="pages/catalog.html">Catalog</a>',
      'pages/catalog.html': '<a href="../index.html">Home</a><a href="plants.html">Plants</a>',
      'pages/plants.html': '<title>Plants</title>',
      'unrelated.html': '<title>Unrelated</title>',
    });
    const input = {
      ...fixture, runStatus: 'succeeded' as const, artifactCount: 1,
      projectMetadata: { kind: 'prototype' as const, entryFile: 'index.html' },
    };
    await expect(validateRunDeliverable({ ...input, touchedPaths: ['pages/plants.html'] }))
      .resolves.toMatchObject({ valid: true });
    await expect(validateRunDeliverable({ ...input, touchedPaths: ['unrelated.html'] }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_not_touched' });
  });
});

describe('prototype delivery boundaries', () => {
  it('keeps the pre-run homepage when a linked index.html is created', async () => {
    const fixture = await projectFixture({
      'landing.html': '<a href="index.html">Catalog</a>',
      'index.html': '<title>Catalog</title>',
    });
    const input = {
      ...fixture, runStatus: 'succeeded' as const, artifactCount: 1,
      touchedPaths: ['index.html'], baselineEntryFile: 'landing.html',
    };
    await expect(validateRunDeliverable({ ...input, projectMetadata: { kind: 'prototype' } }))
      .resolves.toMatchObject({ valid: true, entryFile: 'landing.html', linkedPage: 'index.html' });
    await expect(validateRunDeliverable({ ...input, projectMetadata: { kind: 'prototype', entryFile: 'index.html' } }))
      .resolves.toEqual({ valid: true, validation: 'valid', entryFile: 'index.html', artifactKind: 'html' });
  });

  it('binds a unique pre-run HTML entry, without guessing among existing pages', () => {
    const root = path.resolve('fixture-project');
    expect(inferBaselineHtmlEntry(root, [path.join(root, 'landing.html')])).toBe('landing.html');
    expect(inferBaselineHtmlEntry(root, [path.join(root, 'landing.html'), path.join(root, 'catalog.html')])).toBeUndefined();
    expect(inferBaselineHtmlEntry(root, [path.join(root, 'index.html'), path.join(root, 'catalog.html')])).toBe('index.html');
  });

  it('retains the observed entry when a second page is added, but cannot replace a stale declared entry', async () => {
    const fixture = await projectFixture({
      'landing.html': '<a href="catalog.html">Catalog</a>', 'catalog.html': '<title>Catalog</title>',
    });
    const baseInput = { ...fixture, runStatus: 'succeeded' as const, artifactCount: 1 };
    const input = { ...baseInput,
      touchedPaths: ['catalog.html'], baselineEntryFile: 'landing.html' };
    await expect(validateRunDeliverable({ ...input, projectMetadata: { kind: 'prototype' } }))
      .resolves.toMatchObject({ valid: true, entryFile: 'landing.html', linkedPage: 'catalog.html' });
    await expect(validateRunDeliverable({ ...input, projectMetadata: { kind: 'prototype', entryFile: 'missing.html' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_missing' });
    await expect(validateRunDeliverable({ ...input, artifactCount: 0, touchedPaths: [], projectMetadata: { kind: 'prototype' } }))
      .resolves.toMatchObject({ valid: false, validation: 'no_artifact' });
    await expect(validateRunDeliverable({ ...baseInput, touchedPaths: input.touchedPaths, projectMetadata: { kind: 'prototype' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_missing' });
    await expect(validateRunDeliverable({ ...baseInput, baselineEntryFile: input.baselineEntryFile, projectMetadata: { kind: 'prototype' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_missing' });
    await expect(validateRunDeliverable({ ...input, projectMetadata: { kind: 'template' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_missing' });
  });

  it.each([
    '<a href="https://example.com/catalog.html">Remote</a>',
    '<a href="//example.com/catalog.html">Remote</a>',
    '<base href="https://example.com/"><a href="catalog.html">Remote base</a>',
    '<!-- <a href="catalog.html">Comment</a> -->',
    `<script>const html = '<a href="catalog.html">Not markup</a>';</script>`,
  ])('does not treat external URLs or inert text as delivery: %s', async (entry) => {
    const fixture = await projectFixture({ 'index.html': entry, 'catalog.html': '<title>Catalog</title>' });
    await expect(validateRunDeliverable({ ...fixture, runStatus: 'succeeded', artifactCount: 1,
      touchedPaths: ['catalog.html'], projectMetadata: { kind: 'prototype', entryFile: 'index.html' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_not_touched' });
  });

  it('resolves local base URLs and URL-encoded page names', async () => {
    const fixture = await projectFixture({
      'index.html': '<base href="/pages/"><a href="plant%20guide.html">Guide</a>',
      'pages/plant guide.html': '<title>Guide</title>',
    });
    await expect(validateRunDeliverable({ ...fixture, runStatus: 'succeeded', artifactCount: 1,
      touchedPaths: ['pages/plant guide.html'], projectMetadata: { kind: 'prototype', entryFile: 'index.html' } }))
      .resolves.toMatchObject({ valid: true });
  });

  it('declines navigation evidence that exceeds the page read budget', async () => {
    const fixture = await projectFixture({
      'index.html': '<a href="catalog.html">Catalog</a>' + ' '.repeat(512 * 1024),
      'catalog.html': '<title>Catalog</title>',
    });
    await expect(validateRunDeliverable({ ...fixture, runStatus: 'succeeded', artifactCount: 1,
      touchedPaths: ['catalog.html'], projectMetadata: { kind: 'prototype', entryFile: 'index.html' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_not_touched' });
  });

  it.skipIf(process.platform === 'win32')('never reads a linked page through a symlink outside the project', async () => {
    const fixture = await projectFixture({ 'index.html': '<a href="catalog.html">Catalog</a>' });
    const external = await projectFixture({ 'outside.html': '<title>Outside</title>' });
    await fs.symlink(path.join(external.projectsRoot, external.projectId, 'outside.html'),
      path.join(fixture.projectsRoot, fixture.projectId, 'catalog.html'));
    await expect(validateRunDeliverable({ ...fixture, runStatus: 'succeeded', artifactCount: 1,
      touchedPaths: ['catalog.html'], projectMetadata: { kind: 'prototype', entryFile: 'index.html' } }))
      .resolves.toMatchObject({ valid: false, validation: 'entry_not_touched' });
  });
});


// A completed project can be presented after a later run that writes nothing.
// Keep this project-state check separate from the strict run acceptance gate.
describe('project deliverable validation', () => {
  it('resolves the entry a run did not touch this round', async () => {
    const fixture = await projectFixture({
      'qingdao-travel-guide.html': '<!doctype html><title>Done</title>',
    });
    const metadata = { kind: 'deck' as const };

    await expect(validateRunDeliverable({
      ...fixture,
      runStatus: 'succeeded',
      artifactCount: 0,
      touchedPaths: [],
      projectMetadata: metadata,
    })).resolves.toMatchObject({ valid: false, validation: 'no_artifact' });

    await expect(validateProjectDeliverable({ ...fixture, projectMetadata: metadata }))
      .resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'qingdao-travel-guide.html',
        artifactKind: 'html',
      });
  });

  it('still refuses a project with no compatible entry', async () => {
    const fixture = await projectFixture({ 'notes.md': '# nothing runnable' });
    await expect(validateProjectDeliverable({
      ...fixture,
      projectMetadata: { kind: 'deck' },
    })).resolves.toMatchObject({ valid: false, validation: 'type_mismatch' });
  });

  it('still refuses a declared entry that is gone', async () => {
    const fixture = await projectFixture({
      'other.html': '<!doctype html><title>Not the entry</title>',
    });
    await expect(validateProjectDeliverable({
      ...fixture,
      projectMetadata: { kind: 'deck', entryFile: 'index.html' },
    })).resolves.toMatchObject({ valid: false, validation: 'entry_missing' });
  });

  it('refuses a project it cannot identify', async () => {
    const fixture = await projectFixture({ 'index.html': '<!doctype html>' });
    await expect(validateProjectDeliverable({
      projectsRoot: fixture.projectsRoot,
      projectId: null,
      projectMetadata: { kind: 'deck' },
    })).resolves.toMatchObject({ valid: false, validation: 'project_missing' });
  });
});
