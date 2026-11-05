import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { ensureWorkspaceArtifactForPath } from '../src/chat-artifacts/store.js';
import { snapshotProjectArtifacts, diffRunArtifacts } from '../src/run-artifact-fs.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
// Deliberately RED witness, not an acceptance test or same-bytes workaround.
// Native Agents write cwd directly; no strong lifecycle hook observes this
// sequence. Do not "fix" by reminting on hash/mtime/inode or watcher events.
it('BLOCKED: native Agent unlink + identical recreate must not inherit the original UUID', () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-agent-lifetime-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
  const file = path.join(root, 'a.html');
  fs.writeFileSync(file, '<h1>identical</h1>');
  const first = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'a.html', kind: 'html' });
  const before = snapshotProjectArtifacts(root);
  fs.unlinkSync(file);
  fs.writeFileSync(file, '<h1>identical</h1>');
  const diff = diffRunArtifacts(before, snapshotProjectArtifacts(root));
  expect(diff.created).toBe(0); // Run boundary sees a path in both snapshots, not the destructive operation.
  const replacement = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'a.html', kind: 'html' });
  expect(replacement.id).not.toBe(first.id);
});
