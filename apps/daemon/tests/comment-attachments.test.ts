import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  closeDatabase,
  deleteConversation,
  deletePreviewComment,
  deleteProject,
  insertConversation,
  insertProject,
  listMessages,
  listPreviewComments,
  openDatabase,
  updatePreviewCommentStatus,
  upsertMessage,
  upsertPreviewComment,
} from '../src/db.js';
import {
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
} from '../src/server.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('preview comment persistence', () => {
  it('keeps critique migration wired while adding pod columns on a fresh database', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comments-'));
    const db = openDatabase(tempDir);

    const previewColumns = db
      .prepare(`PRAGMA table_info(preview_comments)`)
      .all()
      .map((column: { name: string }) => column.name);
    const critiqueTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='critique_runs'`)
      .get() as { name?: string } | undefined;

    expect(previewColumns).toEqual(
      expect.arrayContaining(['selection_kind', 'member_count', 'pod_members_json']),
    );
    expect(critiqueTable?.name).toBe('critique_runs');
  });

  it('upserts the latest comment by conversation, file, and element', () => {
    const db = seededDb();
    const first = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', text: 'Old title' }),
      note: 'Shorten this',
    });
    const second = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', text: 'New title' }),
      note: 'Make it more specific',
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) throw new Error('comment upsert failed');
    expect(second.id).toBe(first.id);
    expect(second.note).toBe('Make it more specific');
    expect(second.text).toBe('New title');
    expect(listPreviewComments(db, 'project-1', 'conversation-1')).toHaveLength(1);
  });

  it('patches status and deletes comments', () => {
    const db = seededDb();
    const saved = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({}),
      note: 'Fix this',
    });

    expect(saved).not.toBeNull();
    if (!saved) throw new Error('comment upsert failed');
    expect(updatePreviewCommentStatus(db, 'project-1', 'conversation-1', saved.id, 'applying')?.status)
      .toBe('applying');
    expect(deletePreviewComment(db, 'project-1', 'conversation-1', saved.id)).toBe(true);
    expect(listPreviewComments(db, 'project-1', 'conversation-1')).toEqual([]);
  });

  it('cascades comments when conversations or projects are deleted', () => {
    const db = seededDb();
    upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title' }),
      note: 'Fix title',
    });
    deleteConversation(db, 'conversation-1');
    expect(listPreviewComments(db, 'project-1', 'conversation-1')).toEqual([]);

    insertConversation(db, {
      id: 'conversation-2',
      projectId: 'project-1',
      title: 'Second',
      createdAt: 1,
      updatedAt: 1,
    });
    upsertPreviewComment(db, 'project-1', 'conversation-2', {
      target: target({ elementId: 'chart' }),
      note: 'Fix chart',
    });
    deleteProject(db, 'project-1');
    expect(listPreviewComments(db, 'project-1', 'conversation-2')).toEqual([]);
  });

  it('persists comment attachments on user messages', () => {
    const db = seededDb();
    const attachment = commentAttachment({ id: 'c1', elementId: 'hero-title' });

    upsertMessage(db, 'conversation-1', {
      id: 'message-1',
      role: 'user',
      content: '',
      commentAttachments: [attachment],
    });

    expect(listMessages(db, 'conversation-1')[0]?.commentAttachments).toEqual([attachment]);
  });
});

describe('preview comment agent payload', () => {
  it('accepts empty visible text when comment attachments are present', () => {
    const normalized = normalizeCommentAttachments([
      commentAttachment({
        id: 'c1',
        comment: 'Make the headline shorter',
        currentText: 'A very long headline '.repeat(20),
        htmlHint: `<h1>${'x'.repeat(240)}</h1>`,
      }),
    ]);

    const hint = renderCommentAttachmentHint(normalized);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.currentText.length).toBeLessThanOrEqual(160);
    expect(normalized[0]?.htmlHint.length).toBeLessThanOrEqual(180);
    expect(hint).toContain('<attached-preview-comments>');
    expect(hint).toContain('file: index.html');
    expect(hint).toContain('selector: [data-od-id="hero-title"]');
    expect(hint).toContain('comment: Make the headline shorter');
  });

  it('renders pod attachments with grouped member context', () => {
    const normalized = normalizeCommentAttachments([
      commentAttachment({
        id: 'pod-1',
        selectionKind: 'pod',
        memberCount: 99,
        selector: '[data-od-id="hero"], [data-od-id="chart"]',
        label: 'Hero and chart',
        podMembers: [
          {
            elementId: 'hero',
            selector: '[data-od-id="hero"]',
            label: 'section.hero',
            text: 'Hero title',
            position: { x: 10, y: 20, width: 200, height: 100 },
            htmlHint: '<section data-od-id="hero">',
          },
          {
            elementId: 'chart',
            selector: '[data-od-id="chart"]',
            label: 'section.chart',
            text: 'Chart value',
            position: { x: 120, y: 80, width: 190, height: 120 },
            htmlHint: '<section data-od-id="chart">',
          },
        ],
      }),
    ]);

    const hint = renderCommentAttachmentHint(normalized);

    expect(hint).toContain('targetKind: pod');
    expect(hint).toContain('memberCount: 2');
    expect(normalized[0]?.memberCount).toBe(2);
    expect(hint).toContain('member.1: hero | section.hero | [data-od-id="hero"]');
  });
});

function seededDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comments-'));
  const db = openDatabase(tempDir);
  insertProject(db, {
    id: 'project-1',
    name: 'Project',
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, {
    id: 'conversation-1',
    projectId: 'project-1',
    title: 'Chat',
    createdAt: 1,
    updatedAt: 1,
  });
  return db;
}

function target(patch: Record<string, unknown>) {
  return {
    filePath: 'index.html',
    elementId: 'hero-title',
    selector: '[data-od-id="hero-title"]',
    label: 'h1.hero-title',
    text: 'Current title',
    position: { x: 10, y: 20, width: 300, height: 80 },
    htmlHint: '<h1 data-od-id="hero-title">',
    ...patch,
  };
}

function commentAttachment(patch: Record<string, unknown>) {
  return {
    id: 'c1',
    order: 1,
    filePath: 'index.html',
    elementId: 'hero-title',
    selector: '[data-od-id="hero-title"]',
    label: 'h1.hero-title',
    comment: 'Comment',
    currentText: 'Current title',
    pagePosition: { x: 10, y: 20, width: 300, height: 80 },
    htmlHint: '<h1 data-od-id="hero-title">',
    ...patch,
  };
}
