import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getProjectCommentReadState,
  insertProject,
  markProjectCommentsRead,
  openDatabase,
} from '../src/db.js';

let directory = '';
afterEach(() => {
  closeDatabase();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
  directory = '';
});

function database() {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-read-'));
  const db = openDatabase(directory, { dataDir: directory });
  insertProject(db, { id: 'project-1', name: 'Project', createdAt: 1, updatedAt: 1 });
  return db;
}

describe('project comment read state', () => {
  it('is monotonic, viewer-scoped, and survives a real close/reopen', () => {
    const db = database();
    expect(markProjectCommentsRead(db, 'project-1', 'ws:member-a', 100)).toEqual({ projectId: 'project-1', lastReadAt: 100 });
    expect(markProjectCommentsRead(db, 'project-1', 'ws:member-a', 50)).toEqual({ projectId: 'project-1', lastReadAt: 100 });
    expect(getProjectCommentReadState(db, 'project-1', 'ws:member-b')).toEqual({ projectId: 'project-1' });
    closeDatabase();
    const reopened = openDatabase(directory, { dataDir: directory });
    expect(getProjectCommentReadState(reopened, 'project-1', 'ws:member-a')).toEqual({ projectId: 'project-1', lastReadAt: 100 });
  });
});
