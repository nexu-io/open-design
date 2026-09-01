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

  describe('export-only artifact validation', () => {
    it('accepts a touched export artifact with a complete manifest when the declared entry is stale', async () => {
      // Regression: nexu-io/open-design#7580. The export-only fallback bypasses
      // the project-kind compatibility gate — a complete explicit manifest is
      // its own contract. A brand project with a stale HTML entry and a touched,
      // complete Markdown export should therefore report `valid`.
      const fixture = await projectFixture({
        'fitcv-brand-style-guide.html': '<!doctype html><title>Stale brand</title>',
        'fitcv-design-system-export.md': '# Design System Export',
        'fitcv-design-system-export.md.artifact.json': JSON.stringify({
          version: 1,
          kind: 'markdown-document',
          title: 'fitcv-design-system-export.md',
          entry: 'fitcv-design-system-export.md',
          renderer: 'markdown',
          status: 'complete',
          exports: ['md', 'html', 'pdf', 'zip'],
          metadata: {
            task: 'final-design-export-curation',
            source: 'fitcv-brand-style-guide.html',
          },
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['fitcv-design-system-export.md'],
          projectMetadata: {
            // brand is shown here; the key guarantee is that the project kind
            // is irrelevant for export candidates — a complete manifest is valid
            // on any project kind.
            kind: 'brand',
            entryFile: 'fitcv-brand-style-guide.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'fitcv-design-system-export.md',
        artifactKind: 'document',
      });
    });

    it('accepts a touched markdown export on a prototype project (project kind is irrelevant)', async () => {
      // Companion to the brand test above: the export-only path ignores
      // `acceptedDeliverableKinds`. A complete, explicit markdown-document
      // manifest is valid on a prototype project too — the manifest is
      // the deliverable's own contract, not a subordination to the
      // project's Home surface.
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Stale prototype</title>',
        'export.md': '# Export',
        'export.md.artifact.json': JSON.stringify({
          version: 1,
          kind: 'markdown-document',
          title: 'export.md',
          entry: 'export.md',
          renderer: 'markdown',
          status: 'complete',
          exports: ['md', 'html', 'pdf', 'zip'],
          metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['export.md'],
          projectMetadata: {
            kind: 'prototype',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'export.md',
        artifactKind: 'document',
      });
    });

    it('selects the first readable export candidate among multiple compatible ones', async () => {
      // Multiple touched export candidates: the loop returns the first readable
      // one. ListFiles order is deterministic for the same fixture, so the
      // alphabetically-first candidate (export-a.md) wins.
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Stale</title>',
        'export-b.md': '# Export B',
        'export-b.md.artifact.json': JSON.stringify({
          version: 1, kind: 'markdown-document', title: 'export-b.md',
          entry: 'export-b.md', renderer: 'markdown', status: 'complete',
          exports: ['md'], metadata: {},
        }),
        'export-a.md': '# Export A',
        'export-a.md.artifact.json': JSON.stringify({
          version: 1, kind: 'markdown-document', title: 'export-a.md',
          entry: 'export-a.md', renderer: 'markdown', status: 'complete',
          exports: ['md'], metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 2,
          touchedPaths: ['export-a.md', 'export-b.md'],
          projectMetadata: {
            kind: 'prototype',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        // Files are listed alphabetically; export-a.md wins as the first match.
        entryFile: 'export-a.md',
        artifactKind: 'document',
      });
    });

    it('accepts a markdown export on a project that does not constrain kinds (kind: other)', async () => {
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Stale</title>',
        'fitcv-design-system-export.md': '# Design System Export',
        'fitcv-design-system-export.md.artifact.json': JSON.stringify({
          version: 1,
          kind: 'markdown-document',
          title: 'fitcv-design-system-export.md',
          entry: 'fitcv-design-system-export.md',
          renderer: 'markdown',
          status: 'complete',
          exports: ['md', 'html', 'pdf', 'zip'],
          metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['fitcv-design-system-export.md'],
          projectMetadata: {
            kind: 'other',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'fitcv-design-system-export.md',
        artifactKind: 'document',
      });
    });

    it('still uses projectMetadata.entryFile when the prototype entry is touched', async () => {
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Updated prototype</title>',
        'export.md': '# Export',
        'export.md.artifact.json': JSON.stringify({
          version: 1,
          kind: 'markdown-document',
          title: 'export.md',
          entry: 'export.md',
          renderer: 'markdown',
          status: 'complete',
          exports: ['md'],
          metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 2,
          touchedPaths: ['index.html', 'export.md'],
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

    it('rejects when neither the prototype entry nor any export artifact was touched', async () => {
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Old entry</title>',
        'notes.txt': 'unrelated output',
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['notes.txt'],
          projectMetadata: {
            kind: 'prototype',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: false,
        validation: 'entry_not_touched',
        entryFile: 'index.html',
      });
    });

    it('rejects an export artifact whose manifest status is not complete', async () => {
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Stale prototype</title>',
        'export.md': '# Streaming Export',
        'export.md.artifact.json': JSON.stringify({
          version: 1,
          kind: 'markdown-document',
          title: 'export.md',
          entry: 'export.md',
          renderer: 'markdown',
          status: 'streaming',
          exports: ['md'],
          metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['export.md'],
          projectMetadata: {
            kind: 'other',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: false,
        validation: 'entry_not_touched',
        entryFile: 'index.html',
      });
    });

    it('maps unknown manifest kinds to file-extension kind in the result artifactKind field', async () => {
      // The manifest-kind → ProjectFileKind mapping only handles the common export
      // kinds. For other valid manifest kinds (in ALLOWED_KINDS but not mapped)
      // the result's `artifactKind` falls back to the file-extension kind, while
      // the validation itself still succeeds — export candidates bypass
      // acceptedKinds entirely.
      const fixture = await projectFixture({
        'index.html': '<!doctype html><title>Stale</title>',
        'export.md': '#',
        'export.md.artifact.json': JSON.stringify({
          version: 1,
          // code-snippet is in ALLOWED_KINDS but not in our mapping → falls back
          // to file-extension kind. The manifest still validates and the
          // export is accepted; only the reported artifactKind differs.
          kind: 'code-snippet',
          title: 'export.md',
          entry: 'export.md',
          renderer: 'markdown',
          status: 'complete',
          exports: ['md'],
          metadata: {},
        }),
      });

      await expect(
        validateRunDeliverable({
          ...fixture,
          runStatus: 'succeeded',
          artifactCount: 1,
          touchedPaths: ['export.md'],
          projectMetadata: {
            kind: 'prototype',
            entryFile: 'index.html',
          },
        }),
      ).resolves.toMatchObject({
        valid: true,
        validation: 'valid',
        entryFile: 'export.md',
        // Falls back to file-extension kind since 'code-snippet' is not mapped.
        artifactKind: 'text',
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
