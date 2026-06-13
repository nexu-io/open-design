import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
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

function tableColumnNames(rows: unknown[]): string[] {
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || !('name' in row) || typeof row.name !== 'string') {
      throw new Error('expected PRAGMA table_info row with string name');
    }
    return row.name;
  });
}

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
      .all();
    const critiqueTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='critique_runs'`)
      .get() as { name?: string } | undefined;

    expect(tableColumnNames(previewColumns)).toEqual(
      expect.arrayContaining(['selection_kind', 'member_count', 'pod_members_json', 'slide_index', 'slide_key']),
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

  it('round-trips image attachments through save and list (echo bug #regression)', () => {
    const db = seededDb();
    const saved = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title' }),
      note: 'Match this reference',
      attachments: [
        { path: 'uploads/ref-a.png', name: 'ref-a.png' },
        { path: 'uploads/ref-b.png', name: 'ref-b.png' },
      ],
    });
    expect(saved).not.toBeNull();
    if (!saved) throw new Error('comment upsert failed');
    // Attachments survive the save itself...
    expect(saved.attachments).toEqual([
      { path: 'uploads/ref-a.png', name: 'ref-a.png' },
      { path: 'uploads/ref-b.png', name: 'ref-b.png' },
    ]);
    // ...and the re-fetch (the "回显" path that previously dropped images).
    const [listed] = listPreviewComments(db, 'project-1', 'conversation-1');
    expect(listed?.attachments).toEqual([
      { path: 'uploads/ref-a.png', name: 'ref-a.png' },
      { path: 'uploads/ref-b.png', name: 'ref-b.png' },
    ]);
  });

  it('preserves image attachments when updating an existing comment without new files', () => {
    const db = seededDb();
    const first = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title' }),
      note: 'Match this reference',
      attachments: [
        { path: 'uploads/ref-a.png', name: 'ref-a.png' },
      ],
    });
    const second = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title' }),
      note: 'Still match this reference',
    });

    expect(first?.id).toBe(second?.id);
    expect(second?.attachments).toEqual([
      { path: 'uploads/ref-a.png', name: 'ref-a.png' },
    ]);
  });

  it('lists preview comments in creation order even when older comments are updated later', () => {
    const db = seededDb();
    const first = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title' }),
      note: 'Created first',
    });
    const second = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-subtitle' }),
      note: 'Created second',
    });
    if (!first || !second) throw new Error('comment upsert failed');

    db.prepare(`UPDATE preview_comments SET created_at = ?, updated_at = ? WHERE id = ?`).run(10, 100, first.id);
    db.prepare(`UPDATE preview_comments SET created_at = ?, updated_at = ? WHERE id = ?`).run(20, 20, second.id);

    expect(listPreviewComments(db, 'project-1', 'conversation-1').map((comment) => comment.note)).toEqual([
      'Created first',
      'Created second',
    ]);
  });

  it('defaults attachments to an empty array when none are provided', () => {
    const db = seededDb();
    const saved = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({}),
      note: 'No images here',
    });
    expect(saved?.attachments).toEqual([]);
  });

  it('keeps the same deck element on different slides as distinct comments', () => {
    const db = seededDb();
    const firstSlide = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', slideIndex: 0, text: 'Slide one title' }),
      note: 'Fix slide one',
    });
    const secondSlide = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', slideIndex: 1, text: 'Slide two title' }),
      note: 'Fix slide two',
    });
    const firstSlideEdit = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', slideIndex: 0, text: 'Updated slide one title' }),
      note: 'Revise slide one',
    });

    expect(firstSlide).not.toBeNull();
    expect(secondSlide).not.toBeNull();
    expect(firstSlideEdit).not.toBeNull();
    if (!firstSlide || !secondSlide || !firstSlideEdit) throw new Error('comment upsert failed');
    expect(secondSlide.id).not.toBe(firstSlide.id);
    expect(firstSlideEdit.id).toBe(firstSlide.id);
    const comments = listPreviewComments(db, 'project-1', 'conversation-1');
    expect(comments).toHaveLength(2);
    expect(comments.map((comment) => comment.slideIndex).sort()).toEqual([0, 1]);
    expect(comments.find((comment) => comment.slideIndex === 0)?.note).toBe('Revise slide one');
    expect(comments.find((comment) => comment.slideIndex === 1)?.note).toBe('Fix slide two');
  });

  it('migrates legacy preview comments into a slide-aware conflict key', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comments-'));
    const odDir = path.join(tempDir, '.od');
    fs.mkdirSync(odDir, { recursive: true });
    const legacyDb = new Database(path.join(odDir, 'app.sqlite'));
    legacyDb.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        skill_id TEXT,
        design_system_id TEXT,
        pending_prompt TEXT,
        metadata_json TEXT,
        custom_instructions TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE preview_comments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        element_id TEXT NOT NULL,
        selector TEXT NOT NULL,
        label TEXT NOT NULL,
        text TEXT NOT NULL,
        position_json TEXT NOT NULL,
        html_hint TEXT NOT NULL,
        selection_kind TEXT,
        member_count INTEGER,
        pod_members_json TEXT,
        style_json TEXT,
        slide_index INTEGER,
        note TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(project_id, conversation_id, file_path, element_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);
    legacyDb.prepare(
      `INSERT INTO projects
         (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project', 1, 1);
    legacyDb.prepare(
      `INSERT INTO conversations
         (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conversation-1', 'project-1', 'Chat', 1, 1);
    legacyDb.prepare(
      `INSERT INTO preview_comments
         (id, project_id, conversation_id, file_path, element_id, selector, label,
          text, position_json, html_hint, selection_kind, slide_index, note, status,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'legacy-slide-0',
      'project-1',
      'conversation-1',
      'index.html',
      'hero-title',
      '[data-od-id="hero-title"]',
      'h1.hero-title',
      'Legacy slide one',
      JSON.stringify({ x: 10, y: 20, width: 300, height: 80 }),
      '<h1 data-od-id="hero-title">',
      'element',
      0,
      'Legacy note',
      'open',
      1,
      1,
    );
    legacyDb.close();

    const db = openDatabase(tempDir);
    const table = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'preview_comments'`)
      .get() as { sql?: string } | undefined;
    expect(table?.sql).toMatch(/slide_key INTEGER NOT NULL DEFAULT -1/);
    expect(table?.sql).toMatch(/UNIQUE\(project_id, conversation_id, file_path, element_id, slide_key\)/);
    expect(listPreviewComments(db, 'project-1', 'conversation-1')[0]?.slideIndex).toBe(0);

    const secondSlide = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', slideIndex: 1, text: 'Slide two title' }),
      note: 'Fix slide two',
    });
    const firstSlideEdit = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'hero-title', slideIndex: 0, text: 'Updated slide one title' }),
      note: 'Revise slide one',
    });

    expect(secondSlide?.id).not.toBe('legacy-slide-0');
    expect(firstSlideEdit?.id).toBe('legacy-slide-0');
    const comments = listPreviewComments(db, 'project-1', 'conversation-1');
    expect(comments).toHaveLength(2);
    expect(comments.find((comment) => comment.slideIndex === 0)?.note).toBe('Revise slide one');
    expect(comments.find((comment) => comment.slideIndex === 1)?.note).toBe('Fix slide two');
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

  it('persists user message session mode and plugin context snapshot', () => {
    const db = seededDb();
    const appliedPluginSnapshot = {
      snapshotId: 'snap-1',
      pluginId: 'deck-plugin',
      pluginVersion: '1.0.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: {},
      resolvedContext: {
        items: [
          {
            kind: 'asset',
            path: 'template.json',
            label: 'template.json',
          },
        ],
      },
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 1,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
      pluginTitle: 'Deck Plugin',
    };

    upsertMessage(db, 'conversation-1', {
      id: 'message-1',
      role: 'user',
      content: 'make the deck',
      sessionMode: 'design',
      runContext: {
        workspaceItems: [
          {
            id: 'browser:tab-1',
            kind: 'browser',
            label: 'Dribbble',
            tabId: 'tab-1',
            url: 'https://dribbble.com/',
          },
        ],
      },
      appliedPluginSnapshot,
    });

    expect(listMessages(db, 'conversation-1')[0]).toMatchObject({
      sessionMode: 'design',
      runContext: {
        workspaceItems: [
          {
            id: 'browser:tab-1',
            kind: 'browser',
            label: 'Dribbble',
            tabId: 'tab-1',
            url: 'https://dribbble.com/',
          },
        ],
      },
      appliedPluginSnapshot,
    });
  });

  it('persists assistant feedback on messages', () => {
    const db = seededDb();
    const feedback = {
      rating: 'positive' as const,
      reasonCodes: ['matched_request', 'other'],
      customReason: 'The output was ready to present.',
      reasonsSubmittedAt: 1_700_000_000_400,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_500,
    };

    upsertMessage(db, 'conversation-1', {
      id: 'message-1',
      role: 'assistant',
      content: 'Done',
      feedback,
    });

    expect(listMessages(db, 'conversation-1')[0]?.feedback).toEqual(feedback);
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
    // The hard-scope sentence IS the behavior change. Assert its key phrases
    // so a future edit that softens or drops the directive lights the suite
    // red instead of silently re-opening the over-broad edit bug.
    expect(hint).toContain('Hard scope: change ONLY');
    expect(hint).toContain('Do NOT modify sibling sub-pages, parent layout, global CSS, design tokens, or unrelated rules');
    expect(hint).toContain('ask the user before proceeding');
  });

  it('keeps image attachments in saved comment payloads without requiring a note', () => {
    const normalized = normalizeCommentAttachments([
      commentAttachment({
        id: 'c1',
        comment: '',
        imageAttachments: [
          { path: 'uploads/reference.png', name: 'reference.png' },
        ],
      }),
    ]);

    const hint = renderCommentAttachmentHint(normalized);

    expect(normalized[0]).toMatchObject({
      comment: 'Use the attached image as the comment reference.',
      imageAttachments: [{ path: 'uploads/reference.png', name: 'reference.png' }],
    });
    expect(hint).toContain('imageAttachments: 1');
    expect(hint).toContain('image.1: uploads/reference.png | reference.png');
  });

  it('omits comment text from context when the UI sends it as the task query', () => {
    const normalized = normalizeCommentAttachments([
      commentAttachment({
        id: 'c1',
        comment: '',
        commentContext: 'query',
      }),
    ]);

    const hint = renderCommentAttachmentHint(normalized);

    expect(normalized[0]).toMatchObject({ comment: '', commentContext: 'query' });
    expect(hint).toContain('selector: [data-od-id="hero-title"]');
    expect(hint).not.toContain('comment:');
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

  it('normalizes visual annotation attachments without a selector', () => {
    const normalized = normalizeCommentAttachments([
      commentAttachment({
        id: 'visual-1',
        elementId: 'visual-mark-1',
        selector: '',
        label: 'Marked screenshot region',
        comment: '',
        selectionKind: 'visual',
        screenshotPath: 'uploads/drawing.png',
        markKind: 'stroke',
        intent: 'The screenshot has red strokes that identify the visual region the user wants changed.',
      }),
    ]);

    const hint = renderCommentAttachmentHint(normalized);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      selectionKind: 'visual',
      screenshotPath: 'uploads/drawing.png',
      markKind: 'stroke',
      comment: expect.stringContaining('red strokes'),
    });
    expect(hint).toContain('targetKind: visual');
    expect(hint).toContain('screenshot: uploads/drawing.png');
    expect(hint).toContain('markKind: stroke');
    expect(hint).toContain('marked region');
    expect(hint).not.toContain('selector: ');
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
