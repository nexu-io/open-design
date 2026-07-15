// Daemon-side core of the clipper page → Figma export: an `html` asset can
// carry a `metadata.figmaCapture` marker (which the web "Download Figma" action
// and `od library figma` gate on), and the OD Figma capture IR round-trips
// through the content-addressed sidecar next to the owned HTML object.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { migrateLibrary } from '../src/library-store.js';
import {
  registerLibraryAsset,
  resolveAssetElementSidecarPath,
  resolveAssetFigmaSidecarPath,
  writeElementSidecar,
  writeFigmaSidecar,
} from '../src/library.js';

let db: Database.Database;
let libraryDir: string;

beforeEach(async () => {
  db = new Database(':memory:');
  migrateLibrary(db);
  libraryDir = await mkdtemp(path.join(os.tmpdir(), 'od-library-figma-'));
});

afterEach(async () => {
  db.close();
  await rm(libraryDir, { recursive: true, force: true });
});

const IR = JSON.stringify({
  version: 1,
  source: { url: 'https://example.com/', title: 'Example', viewport: { width: 1280, height: 800 } },
  fonts: [{ family: 'Inter', styles: ['Regular'] }],
  root: { type: 'FRAME', name: 'body', x: 0, y: 0, width: 1280, height: 600 },
});

describe('library figma capture sidecar', () => {
  it('persists the figmaCapture marker on an html asset and round-trips the IR sidecar', async () => {
    const figmaMeta = { version: 1, size: Buffer.byteLength(IR, 'utf8'), nodeCount: 1 };
    const { asset, deduped } = await registerLibraryAsset({
      db,
      libraryDir,
      storage: 'owned',
      kind: 'html',
      mime: 'text/html',
      text: '<!doctype html><html><body><h1>Example</h1></body></html>',
      sourceUrl: 'https://example.com/',
      sourceTitle: 'Example',
      tags: ['page-capture'],
      metadata: { figmaCapture: figmaMeta },
      source: { sourceKind: 'clipper' },
    });

    expect(deduped).toBe(false);
    expect(asset.kind).toBe('html');
    expect(asset.metadata?.figmaCapture).toEqual(figmaMeta);

    // The IR sidecar lives next to the owned object and reads back verbatim.
    const wrote = await writeFigmaSidecar(libraryDir, asset.contentHash, IR);
    expect(wrote).toBe(true);
    const sidecar = resolveAssetFigmaSidecarPath(asset, libraryDir);
    expect(sidecar).toBeTruthy();
    expect(sidecar!.endsWith('.od-figma.json')).toBe(true);
    await expect(readFile(sidecar!, 'utf8')).resolves.toBe(IR);
  });

  it('round-trips the element-pick markup sidecar on a screenshot asset', async () => {
    const html = '<section class="hero"><h1>Title</h1></section>';
    const { asset } = await registerLibraryAsset({
      db,
      libraryDir,
      storage: 'owned',
      kind: 'image',
      mime: 'image/png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      tags: ['element', 'section'],
      metadata: { element: { tag: 'section', selector: 'section.hero', width: 800, height: 400, hasHtml: true } },
      source: { sourceKind: 'clipper' },
    });

    expect((asset.metadata?.element as { selector?: string } | undefined)?.selector).toBe('section.hero');
    expect(await writeElementSidecar(libraryDir, asset.contentHash, html)).toBe(true);
    const sidecar = resolveAssetElementSidecarPath(asset, libraryDir);
    expect(sidecar).toBeTruthy();
    expect(sidecar!.endsWith('.element.html')).toBe(true);
    await expect(readFile(sidecar!, 'utf8')).resolves.toBe(html);
    // The figma + element sidecars are distinct files for the same hash.
    expect(resolveAssetFigmaSidecarPath(asset, libraryDir)).not.toBe(sidecar);
  });

  it('has no sidecar path for a referenced (non-owned) asset', async () => {
    const { asset } = await registerLibraryAsset({
      db,
      libraryDir,
      storage: 'referenced',
      kind: 'image',
      mime: 'image/png',
      absPath: path.join(libraryDir, 'nope.png'),
      // referenced assets only need bytes for hashing; supply them inline.
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      source: { sourceKind: 'manual-upload' },
    });
    expect(resolveAssetFigmaSidecarPath(asset, libraryDir)).toBeNull();
  });
});
