import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  diffRunArtifacts,
  snapshotProjectArtifacts,
} from '../src/run-artifact-fs.js';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'od-artifact-fs-'));
}

test('a second-round edit of an existing artifact counts as touched, not zero', () => {
  const root = tmpProject();
  const page = path.join(root, 'index.html');
  fs.writeFileSync(page, '<html>v1</html>');

  // Snapshot as it stood at the start of round 2.
  const before = snapshotProjectArtifacts(root);
  assert.equal(before.size, 1);

  // Round 2 EDITS the same file — directory still holds exactly one file.
  fs.writeFileSync(page, '<html>v2 — substantially edited content</html>');
  const after = snapshotProjectArtifacts(root);
  assert.equal(after.size, 1, 'file count is unchanged by an edit');

  assert.deepEqual(diffRunArtifacts(before, after), {
    created: 0,
    modified: 1,
    touched: 1,
    designSystemCreated: false,
    previewModuleCount: 0,
  });
});

test('created vs modified are reported separately and sum into touched', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'a.html'), '<html>a</html>');
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'a.html'), '<html>a edited longer</html>'); // modify
  fs.writeFileSync(path.join(root, 'b.png'), 'PNGDATA'); // create
  const after = snapshotProjectArtifacts(root);

  assert.deepEqual(diffRunArtifacts(before, after), {
    created: 1,
    modified: 1,
    touched: 2,
    designSystemCreated: false,
    previewModuleCount: 0,
  });
});

test('a touched DESIGN.md sets designSystemCreated but not artifact_count', () => {
  const root = tmpProject();
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# brand v1');
  const afterCreate = snapshotProjectArtifacts(root);
  assert.deepEqual(diffRunArtifacts(before, afterCreate), {
    created: 0, // DESIGN.md is not an artifact extension
    modified: 0,
    touched: 0,
    designSystemCreated: true,
    previewModuleCount: 0,
  });

  // Editing it on a later round still flags the design-system signal.
  fs.writeFileSync(path.join(root, 'DESIGN.md'), '# brand v2 — refined tokens');
  const afterEdit = snapshotProjectArtifacts(root);
  assert.equal(diffRunArtifacts(afterCreate, afterEdit).designSystemCreated, true);
});

test('preview modules are counted and also count as artifacts', () => {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'preview', 'colors.html'), '<html>colors</html>');
  fs.writeFileSync(path.join(root, 'preview', 'typography.html'), '<html>type</html>');
  const after = snapshotProjectArtifacts(root);

  const diff = diffRunArtifacts(before, after);
  assert.equal(diff.previewModuleCount, 2);
  // Preview modules are .html artifacts too, so they also land in touched.
  assert.equal(diff.touched, 2);
  assert.equal(diff.created, 2);
});

test('non-artifact files and ignored dirs do not count', () => {
  const root = tmpProject();
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'notes.txt'), 'just text'); // not an artifact ext
  fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'dep.html'), '<html>dep</html>');
  const after = snapshotProjectArtifacts(root);

  assert.deepEqual(diffRunArtifacts(before, after), {
    created: 0,
    modified: 0,
    touched: 0,
    designSystemCreated: false,
    previewModuleCount: 0,
  });
});

test('a no-op turn (no file writes) reports zero', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'page.html'), '<html>stable</html>');
  const before = snapshotProjectArtifacts(root);
  const after = snapshotProjectArtifacts(root);

  assert.deepEqual(diffRunArtifacts(before, after), {
    created: 0,
    modified: 0,
    touched: 0,
    designSystemCreated: false,
    previewModuleCount: 0,
  });
});
