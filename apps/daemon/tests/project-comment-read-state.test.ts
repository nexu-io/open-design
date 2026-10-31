import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDatabase,
  getProjectCommentReadState,
  getFileCommentReadState,
  markFileCommentsSeen,
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

it('acknowledges exact displayed rows across files, delayed arrivals and competing windows', () => {
  const db = database();
  db.prepare("INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES ('c','project-1','Comments',1,1)").run();
  const add = (id: string, file: string, created: number) => db.prepare(`INSERT INTO preview_comments
    (id,project_id,conversation_id,file_path,element_id,selector,label,text,position_json,html_hint,note,status,created_at,updated_at)
    VALUES (?,'project-1','c',?,'h','h','h','','{}','','Review','open',?,?)`).run(id,file,created,created);
  add('a','a.html',100); add('b','b.html',50);
  expect(markFileCommentsSeen(db,'project-1','viewer','a.html',['a','b','missing']).seenCommentIds).toEqual(['a']);
  expect(getFileCommentReadState(db,'project-1','viewer','b.html').seenCommentIds).toEqual([]);
  add('late','a.html',20);
  expect(getFileCommentReadState(db,'project-1','viewer','a.html').seenCommentIds).toEqual(['a']);
  markFileCommentsSeen(db,'project-1','viewer','a.html',['late']);
  expect(markFileCommentsSeen(db,'project-1','viewer','a.html',['a']).seenCommentIds.sort()).toEqual(['a','late']);
  expect(getFileCommentReadState(db,'project-1','other-viewer','a.html').seenCommentIds).toEqual([]);
  closeDatabase();
  const reopened = openDatabase(directory, {dataDir: directory});
  expect(getFileCommentReadState(reopened,'project-1','viewer','a.html').seenCommentIds.sort()).toEqual(['a','late']);
});
