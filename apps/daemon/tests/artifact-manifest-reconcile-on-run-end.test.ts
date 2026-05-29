// @ts-nocheck
// Verifies the run-end artifact manifest reconciliation added for #2893:
// when a chat run writes HTML via write_file (no artifactManifest) and then
// terminates, the close-handler reconciliation should create the missing
// .artifact.json sidecar so the file appears in the artifact panel.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { reconcileHtmlArtifactManifest, writeProjectFile } from '../src/projects.js';

const PROJECT_ID = 'reconcile-test';
let tempDir = null;
let projectsRoot = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  projectsRoot = null;
});

function setup() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-reconcile-'));
  const db = openDatabase(tempDir);
  insertProject(db, { id: PROJECT_ID, name: 'Reconcile Test', createdAt: 1, updatedAt: 1 });
  projectsRoot = path.join(tempDir, 'projects');
  fs.mkdirSync(path.join(projectsRoot, PROJECT_ID), { recursive: true });
  return { db };
}

describe('run-end artifact manifest reconciliation (#2893)', () => {
  it('creates a manifest sidecar for an HTML file written without artifactManifest', async () => {
    setup();

    // Simulate agent writing HTML via write_file (no artifactManifest param)
    await writeProjectFile(projectsRoot, PROJECT_ID, 'output.html', '<h1>Hello</h1>');

    const sidecarPath = path.join(projectsRoot, PROJECT_ID, 'output.html.artifact.json');
    // Before reconciliation: no sidecar exists
    expect(fs.existsSync(sidecarPath)).toBe(false);

    // Simulate the reconciliation step from the child.on('close') handler
    const dir = path.join(projectsRoot, PROJECT_ID);
    const files = fs.readdirSync(dir);
    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      if (ext !== '.html' && ext !== '.htm') continue;
      await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, name);
    }

    // After reconciliation: sidecar exists with inferred metadata
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    expect(manifest.kind).toBe('html');
    expect(manifest.entry).toBe('output.html');
    expect(manifest.status).toBe('complete');
    expect(manifest.metadata?.inferred).toBe(true);
    expect(manifest.metadata?.reconciled).toBe(true);
  });

  it('does not overwrite an existing manifest sidecar', async () => {
    setup();

    // Agent wrote HTML WITH an explicit manifest (create_artifact path)
    await writeProjectFile(projectsRoot, PROJECT_ID, 'deck.html', '<p>pitch</p>', {
      artifactManifest: {
        version: 1,
        kind: 'deck',
        title: 'My Deck',
        entry: 'deck.html',
        renderer: 'deck-html',
        status: 'complete',
        exports: ['html', 'pdf'],
      },
    });

    const sidecarPath = path.join(projectsRoot, PROJECT_ID, 'deck.html.artifact.json');
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const original = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    expect(original.kind).toBe('deck');
    expect(original.title).toBe('My Deck');

    // Reconciliation should NOT overwrite the existing manifest
    await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, 'deck.html');
    const after = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    expect(after.kind).toBe('deck');
    expect(after.title).toBe('My Deck');
    expect(after.metadata?.inferred).toBeUndefined();
  });

  it('ignores non-HTML files', async () => {
    setup();

    await writeProjectFile(projectsRoot, PROJECT_ID, 'README.md', '# notes\n');

    // Reconciliation should not create a manifest for .md files
    const dir = path.join(projectsRoot, PROJECT_ID);
    const files = fs.readdirSync(dir);
    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      if (ext !== '.html' && ext !== '.htm') continue;
      await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, name);
    }

    const sidecarPath = path.join(projectsRoot, PROJECT_ID, 'README.md.artifact.json');
    expect(fs.existsSync(sidecarPath)).toBe(false);
  });

  it('handles missing project directory gracefully', async () => {
    setup();
    // reconcileHtmlArtifactManifest should return null for non-existent files
    const result = await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, 'missing.html');
    expect(result).toBeNull();
  });

  it('reconciles .htm files as well', async () => {
    setup();

    await writeProjectFile(projectsRoot, PROJECT_ID, 'page.htm', '<p>page</p>');

    const sidecarPath = path.join(projectsRoot, PROJECT_ID, 'page.htm.artifact.json');
    expect(fs.existsSync(sidecarPath)).toBe(false);

    await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, 'page.htm');

    expect(fs.existsSync(sidecarPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
    expect(manifest.kind).toBe('html');
    expect(manifest.entry).toBe('page.htm');
  });

  it('skips pre-existing HTML files whose mtime is before the run start (imported-folder guard)', async () => {
    setup();

    // Pre-existing file: write it, then backdate its mtime to before the run
    await writeProjectFile(projectsRoot, PROJECT_ID, 'old-index.html', '<p>old</p>');
    const oldPath = path.join(projectsRoot, PROJECT_ID, 'old-index.html');
    const pastTime = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(oldPath, pastTime, pastTime);

    // Run starts here — record the timestamp before the run writes files
    const runStartTimeMs = Date.now();

    // File written during the run
    await writeProjectFile(projectsRoot, PROJECT_ID, 'new-output.html', '<p>new</p>');

    // Simulate the close-handler reconciliation with mtime filter
    const dir = path.join(projectsRoot, PROJECT_ID);
    const files = fs.readdirSync(dir);
    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      if (ext !== '.html' && ext !== '.htm') continue;
      const st = fs.statSync(path.join(dir, name));
      if (st.mtimeMs < runStartTimeMs) continue;
      await reconcileHtmlArtifactManifest(projectsRoot, PROJECT_ID, name);
    }

    // Pre-existing file should NOT have a sidecar
    expect(fs.existsSync(path.join(dir, 'old-index.html.artifact.json'))).toBe(false);
    // New file should have a sidecar
    expect(fs.existsSync(path.join(dir, 'new-output.html.artifact.json'))).toBe(true);
  });
});
