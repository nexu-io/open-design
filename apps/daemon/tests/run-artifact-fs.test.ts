import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import {
  createRunArtifactBaselines,
  diffRunArtifacts,
  isManifestBackedArtifactPath,
  primaryArtifactChangeForRun,
  snapshotProjectArtifacts,
  snapshotProjectArtifactsAsync,
} from '../src/run-artifact-fs.js';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'od-artifact-fs-'));
}

test('the async snapshot preserves the synchronous snapshot contract', async () => {
  const root = tmpProject();
  fs.mkdirSync(path.join(root, 'nested'), { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<html>page</html>');
  fs.writeFileSync(path.join(root, 'nested', 'styles.css'), 'body {}');
  fs.writeFileSync(path.join(root, 'nested', 'notes.txt'), 'not tracked');
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.html'), '<html>ignored</html>');

  assert.deepEqual(
    await snapshotProjectArtifactsAsync(root),
    snapshotProjectArtifacts(root),
  );
});

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
    touchedPaths: [page],
    contentCreated: 0,
    contentModified: 1,
    contentTouched: 1,
    contentTouchedPaths: [page],
    renderDependencyTouched: 0,
    renderDependencyTouchedPaths: [],
    supportingMediaTouched: 0,
    filesWritten: 1,
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
    touchedPaths: [path.join(root, 'a.html'), path.join(root, 'b.png')],
    contentCreated: 1,
    contentModified: 1,
    contentTouched: 2,
    contentTouchedPaths: [path.join(root, 'a.html'), path.join(root, 'b.png')],
    renderDependencyTouched: 0,
    renderDependencyTouchedPaths: [],
    supportingMediaTouched: 1,
    filesWritten: 2,
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
    touchedPaths: [],
    contentCreated: 0,
    contentModified: 0,
    contentTouched: 0,
    contentTouchedPaths: [],
    renderDependencyTouched: 0,
    renderDependencyTouchedPaths: [],
    supportingMediaTouched: 0,
    filesWritten: 1, // …but it IS a written file
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

test('non-artifact files and ignored dirs do not count as artifacts', () => {
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
    touchedPaths: [],
    contentCreated: 0,
    contentModified: 0,
    contentTouched: 0,
    contentTouchedPaths: [],
    renderDependencyTouched: 0,
    renderDependencyTouchedPaths: [],
    supportingMediaTouched: 0,
    // notes.txt IS a written file; node_modules stays ignored entirely.
    filesWritten: 1,
  });
});

test('an md-only delivery reports files_written while artifact_count stays 0', () => {
  // The blind spot that motivated files_written_count: a run whose deliverable
  // is a markdown brief (e.g. `PROMPTS.md`) looked identical to a pure chat
  // turn because markdown is not an artifact extension.
  const root = tmpProject();
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'PROMPTS.md'), '# nine premium backgrounds');
  const afterCreate = snapshotProjectArtifacts(root);
  const createDiff = diffRunArtifacts(before, afterCreate);
  assert.equal(createDiff.touched, 0, 'md never counts as an artifact');
  assert.equal(createDiff.filesWritten, 1);

  // A later run that only EDITS the md still reports its write.
  fs.writeFileSync(path.join(root, 'PROMPTS.md'), '# nine premium backgrounds — revised');
  const editDiff = diffRunArtifacts(afterCreate, snapshotProjectArtifacts(root));
  assert.equal(editDiff.touched, 0);
  assert.equal(editDiff.filesWritten, 1);
});

test('a manifest-backed markdown artifact counts as created/modified (fixes #7579)', () => {
  // An export-only run that delivers `fitcv-design-system-export.md` next to
  // a valid `.artifact.json` sidecar used to report `artifactCount: 0` and
  // `validation: no_artifact`, because the markdown extension is not in
  // `ARTIFACT_EXTENSIONS`. With the manifest-backed check, a `.md` (or
  // `.docx`) file with a sidecar counts as an artifact and edits roll into
  // the `modified` bucket.
  const root = tmpProject();
  const before = snapshotProjectArtifacts(root);

  const mdPath = path.join(root, 'fitcv-design-system-export.md');
  fs.writeFileSync(mdPath, '# export v1\n');
  fs.writeFileSync(
    path.join(mdPath + '.artifact.json'),
    JSON.stringify({
      version: 1,
      kind: 'markdown-document',
      title: 'fitcv export',
      entry: 'fitcv-design-system-export.md',
      renderer: 'markdown',
      status: 'complete',
      exports: ['md', 'html', 'pdf', 'zip'],
    }),
  );

  const afterCreate = snapshotProjectArtifacts(root);
  const createDiff = diffRunArtifacts(before, afterCreate, root);
  assert.equal(createDiff.created, 1, 'manifest-backed md counts as created');
  assert.equal(createDiff.touched, 1);
  assert.deepEqual(createDiff.touchedPaths, [mdPath]);
  // Both the md and its sidecar are written during the run, so filesWritten
  // reflects both writes (the sidecar is not itself an artifact, but it is a
  // real filesystem write that happened during the run).
  assert.equal(createDiff.filesWritten, 2);

  // A later run that only EDITS the markdown still records the write.
  fs.writeFileSync(mdPath, '# export v2 — refined tokens');
  const afterEdit = snapshotProjectArtifacts(root);
  const editDiff = diffRunArtifacts(afterCreate, afterEdit, root);
  assert.equal(editDiff.modified, 1);
  assert.equal(editDiff.touched, 1);
});

test('markdown without a manifest sidecar is still filesWritten only (no artifact_count)', () => {
  // Backwards-compat: a `.md` deliverable without a sidecar must not
  // suddenly start counting as an artifact. Issue #7579 explicitly says the
  // predicate should be manifest-aware, not extension-aware.
  const root = tmpProject();
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(path.join(root, 'PROMPTS.md'), '# nine premium backgrounds');
  const after = snapshotProjectArtifacts(root);
  const diff = diffRunArtifacts(before, after, root);

  assert.equal(diff.touched, 0, 'manifest-less md must not count as artifact');
  assert.equal(diff.filesWritten, 1);
});

test('a malformed manifest sidecar does not promote its markdown to an artifact', () => {
  // The sidecar exists, so a naive "file with sibling `.artifact.json` is
  // manifest-backed" check would mark the `.md` as an artifact. The
  // canonical `parsePersistedManifest` validator must reject non-version-1
  // / missing-renderer / missing-exports / unknown-kind manifests.
  const root = tmpProject();
  const mdPath = path.join(root, 'broken-export.md');
  fs.writeFileSync(mdPath, '# broken');
  fs.writeFileSync(mdPath + '.artifact.json', '{"version": 2, "kind": "markdown-document"}');
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(mdPath, '# broken — revised');
  const after = snapshotProjectArtifacts(root);
  const diff = diffRunArtifacts(before, after, root);

  assert.equal(diff.touched, 0, 'invalid manifest must not turn md into an artifact');
  assert.equal(diff.filesWritten, 1);
});

test('a manifest-backed markdown in a nested directory still counts as an artifact (fixes #7579)', () => {
  // First-pass review caught `path.basename(filePath)` discarding the
  // directory: `reports/export.md` would probe `<root>/export.md.artifact.json`
  // instead of `<root>/reports/export.md.artifact.json`. The fix derives the
  // sidecar from the artifact's native absolute path; this test pins that
  // behaviour so a future refactor cannot regress it.
  const root = tmpProject();
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  const before = snapshotProjectArtifacts(root);

  const mdPath = path.join(root, 'reports', 'export.md');
  fs.writeFileSync(mdPath, '# nested export\n');
  fs.writeFileSync(
    mdPath + '.artifact.json',
    JSON.stringify({
      version: 1,
      kind: 'markdown-document',
      title: 'nested export',
      entry: 'export.md',
      renderer: 'markdown',
      status: 'complete',
      exports: ['md', 'html', 'pdf', 'zip'],
    }),
  );

  const after = snapshotProjectArtifacts(root);
  const diff = diffRunArtifacts(before, after, root);

  assert.equal(diff.created, 1, 'nested manifest-backed md counts as created');
  assert.equal(diff.touched, 1);
  assert.deepEqual(diff.touchedPaths, [mdPath]);
});

test('an unknown-kind manifest does not promote its markdown to an artifact', () => {
  // The canonical `parsePersistedManifest` rejects unknown `kind` values;
  // issue #7579's "only valid manifest-backed files" requirement means a
  // sidecar with `{ version: 1, kind: "junk", entry: "x.md" }` must not
  // contribute to artifact analytics.
  const root = tmpProject();
  const mdPath = path.join(root, 'junk-export.md');
  fs.writeFileSync(mdPath, '# junk');
  fs.writeFileSync(
    mdPath + '.artifact.json',
    JSON.stringify({
      version: 1,
      kind: 'junk',
      title: 'junk',
      entry: 'junk-export.md',
      renderer: 'markdown',
      status: 'complete',
      exports: ['md'],
    }),
  );
  const before = snapshotProjectArtifacts(root);

  fs.writeFileSync(mdPath, '# junk — revised');
  const after = snapshotProjectArtifacts(root);
  const diff = diffRunArtifacts(before, after, root);

  assert.equal(diff.touched, 0, 'unknown kind must not promote md to artifact');
  assert.equal(diff.filesWritten, 1);
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

test('v4 ignores a timestamp-only rewrite while the legacy counter remains compatible', () => {
  const root = tmpProject();
  const page = path.join(root, 'index.html');
  fs.writeFileSync(page, '<html>stable</html>');
  const before = snapshotProjectArtifacts(root);
  const stat = fs.statSync(page);
  fs.utimesSync(page, stat.atimeMs / 1000, (stat.mtimeMs + 2_000) / 1000);
  const after = snapshotProjectArtifacts(root);

  const diff = diffRunArtifacts(before, after);
  assert.equal(diff.touched, 1, 'legacy artifact_count retains timestamp semantics');
  assert.equal(diff.contentTouched, 0, 'v4 changed_file_count requires content change');
});

test('a CSS-only visible edit modifies the primary HTML artifact without inflating artifact_count', () => {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'index.html'), '<link rel="stylesheet" href="styles.css">');
  const css = path.join(root, 'styles.css');
  fs.writeFileSync(css, 'body { color: red; }');
  const before = snapshotProjectArtifacts(root);
  fs.writeFileSync(css, 'body { color: blue; }');
  const after = snapshotProjectArtifacts(root);
  const diff = diffRunArtifacts(before, after);

  assert.equal(diff.touched, 0, 'CSS remains outside the legacy artifact_count file set');
  assert.equal(diff.renderDependencyTouched, 1);
  assert.equal(primaryArtifactChangeForRun({
    diff,
    projectKind: 'prototype',
    hadExistingArtifacts: true,
    interactionMode: 'design',
    clarificationRequested: false,
  }), 'modified');
});

test('first generation is created even when the run edits a pre-seeded HTML file', () => {
  const root = tmpProject();
  const page = path.join(root, 'index.html');
  fs.writeFileSync(page, '<html>seed</html>');
  const before = snapshotProjectArtifacts(root);
  fs.writeFileSync(page, '<html>generated result</html>');
  const diff = diffRunArtifacts(before, snapshotProjectArtifacts(root));

  assert.equal(primaryArtifactChangeForRun({
    diff,
    projectKind: 'prototype',
    hadExistingArtifacts: false,
    interactionMode: 'design',
    clarificationRequested: false,
  }), 'created');
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

test('Windows-style backslash paths still resolve a nested manifest sidecar', () => {
  // First-pass review caught `classifyPath` (forward slashes) being passed
  // to the manifest predicate, whose containment guard uses native separators
  // from `rootDir`. On Windows the sidecar would be probed with forward
  // slashes but the prefix would be backslashes, so every nested
  // manifest-backed .md silently failed containment.
  //
  // The predicate now accepts an injected `pathModule`/`fsModule` so the
  // Windows acceptance path can be exercised without a real Windows host.
  // We separate POSIX (real filesystem, real path) from win32 (real containment
  // logic, mock filesystem) to keep each test fast and platform-correct.
  const root = tmpProject();

  // ── POSIX baseline: create a real sidecar, verify predicate accepts it ──
  // Use path.join throughout so the filesystem path matches the probe path.
  fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
  const posixSidecar = path.join(root, 'reports', 'export.md.artifact.json');
  const posixMd = path.join(root, 'reports', 'export.md');
  fs.writeFileSync(posixSidecar,
    JSON.stringify({
      version: 1,
      kind: 'markdown-document',
      title: 'export',
      entry: 'export.md',
      renderer: 'markdown',
      status: 'complete',
      exports: ['md', 'html', 'pdf', 'zip'],
    }));
  assert.equal(
    isManifestBackedArtifactPath(posixMd, root),
    true,
    'POSIX baseline: sidecar next to md is recognized',
  );

  // ── Windows acceptance: mock filesystem so backslash paths can be tested ──
  // On POSIX we cannot create a file with backslashes in its name, but we CAN
  // exercise the containment logic with path.win32 and a mock fsModule that
  // returns valid sidecar content. This reproduces the exact shape a Windows
  // daemon produces at run-finish: a native backslash root and filePath, and
  // a sidecar that the predicate reads. Before the fix the predicate would
  // have normalized filePath to forward slashes before the containment check,
  // which would have failed on Windows. With native path injection, containment
  // passes on either platform.
  const winRoot = path.win32.join(root, 'reports');
  const winFile = path.win32.join(winRoot, 'export.md');
  const mockFs = {
    readFileSync(_p: string) {
      // Verify the predicate is actually reading the backslash sidecar path.
      assert.ok(_p.endsWith('\\export.md.artifact.json'),
        `fsModule called with backslash sidecar: ${_p}`);
      return JSON.stringify({
        version: 1,
        kind: 'markdown-document',
        title: 'export',
        entry: 'export.md',
        renderer: 'markdown',
        status: 'complete',
        exports: ['md', 'html', 'pdf', 'zip'],
      });
    },
  };
  assert.equal(
    isManifestBackedArtifactPath(winFile, winRoot, { pathModule: path.win32, fsModule: mockFs as unknown as typeof fs }),
    true,
    'Windows acceptance: win32 path + backslash containment + mock fs reads sidecar',
  );

  // ── Mixed-separator rejection ─────────────────────────────────────────
  // A backslash filePath against a forward-slash rootDir (or vice versa) must
  // be rejected. This is the exact shape the pre-fix code produced when
  // `diffRunArtifacts` passed `classifyPath` (always forward slashes) alongside
  // a native `rootDir` (backslashes on Windows).
  const mixedRoot = '/tmp';
  const winShapedFile = path.win32.join('C:\\proj', 'reports', 'export.md');
  assert.equal(
    isManifestBackedArtifactPath(winShapedFile, mixedRoot, { pathModule: path.win32 }),
    false,
    'regression: mixed-separator root must be rejected',
  );
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
    touchedPaths: [],
    contentCreated: 0,
    contentModified: 0,
    contentTouched: 0,
    contentTouchedPaths: [],
    renderDependencyTouched: 0,
    renderDependencyTouchedPaths: [],
    supportingMediaTouched: 0,
    filesWritten: 0,
  });
});
