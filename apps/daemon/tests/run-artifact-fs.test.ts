import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  createRunArtifactBaselines,
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

test('a same-size rewrite with a preserved mtime is still detected (content hash)', () => {
  // The pathological edit: equal byte length AND the timestamp reset to its
  // original value. size + mtime alone cannot tell this apart, so the content
  // hash must catch it — otherwise an edit-only turn would silently report 0.
  const root = tmpProject();
  const page = path.join(root, 'index.html');
  fs.writeFileSync(page, '<html>AAAA</html>');
  const { atimeMs, mtimeMs } = fs.statSync(page);
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(page, '<html>BBBB</html>'); // same byte length, different content
  fs.utimesSync(page, atimeMs / 1000, mtimeMs / 1000); // pin timestamp back to original
  const after = snapshotProjectArtifacts(root);

  const diff = diffRunArtifacts(before, after);
  assert.equal(diff.modified, 1, 'same-size, same-mtime rewrite must be caught by the content hash');
  assert.equal(diff.touched, 1);
});

test('Windows-style backslash paths still classify preview modules and DESIGN.md', () => {
  // On Windows, snapshot keys come back with backslashes (path.join). The diff
  // must normalize separators before the slash-only preview / design-system
  // helpers, or those signals silently report false on Windows project runs.
  // (Built by hand because the test host is POSIX and can't produce \\ keys.)
  const fp = { size: 10, mtimeMs: 1, hash: 'h' };
  const before = new Map();
  const after = new Map([
    ['C:\\proj\\DESIGN.md', { ...fp }],
    ['C:\\proj\\preview\\colors.html', { ...fp }],
    ['C:\\proj\\index.html', { ...fp }],
  ]);

  const diff = diffRunArtifacts(before, after);
  assert.equal(diff.designSystemCreated, true, 'DESIGN.md must be detected on Windows paths');
  assert.equal(diff.previewModuleCount, 1, 'preview/*.html must be detected on Windows paths');
  // index.html + preview/colors.html are artifacts; DESIGN.md is not.
  assert.equal(diff.created, 2);
});

test('contended same-cwd runs are flagged so the caller skips the whole-tree diff', () => {
  // The daemon allows overlapping runs; a whole-tree snapshot diff cannot tell
  // which concurrent run wrote a file. The registry must mark BOTH overlapping
  // runs in a shared cwd as contended, while leaving distinct-cwd runs clean.
  const reg = createRunArtifactBaselines();
  const empty = new Map();

  reg.remember('A', '/proj-1', empty);
  reg.remember('B', '/proj-1', empty); // overlaps A in the same cwd
  reg.remember('C', '/proj-2', empty); // different cwd, no overlap

  const a = reg.take('A');
  const b = reg.take('B');
  const c = reg.take('C');
  assert.equal(a?.contended, true, 'the earlier run is retroactively marked contended');
  assert.equal(b?.contended, true, 'the later overlapping run is marked contended');
  assert.equal(c?.contended, false, 'a distinct-cwd run stays uncontended');
  // take() removes the entry — a second take is empty.
  assert.equal(reg.take('A'), undefined);
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
