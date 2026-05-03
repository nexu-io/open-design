import { describe, expect, it } from 'vitest';
import {
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  liveSnapshotForComment,
  mergeAttachedComments,
  messageContentWithCommentAttachments,
  overlayBoundsFromSnapshot,
  removeAttachedComment,
  targetFromSnapshot,
} from './comments';
import type { ChatMessage, PreviewComment } from './types';

describe('preview comment attachment helpers', () => {
  it('builds compact target context from an iframe snapshot', () => {
    const target = targetFromSnapshot({
      filePath: 'index.html',
      elementId: 'hero-title',
      selector: '[data-od-id="hero-title"]',
      label: 'h1.hero-title',
      text: `  ${'Title '.repeat(80)}  `,
      htmlHint: `<h1 class="hero-title" data-od-id="hero-title">${'x'.repeat(240)}</h1>`,
      position: { x: 10.4, y: 20.5, width: 300.2, height: 88.8 },
    });

    expect(target.text.length).toBeLessThanOrEqual(160);
    expect(target.htmlHint.length).toBeLessThanOrEqual(180);
    expect(target.position).toEqual({ x: 10, y: 21, width: 300, height: 89 });
  });

  it('creates ordered compact send payloads from attached comments', () => {
    const attachments = commentsToAttachments([
      comment({ id: 'c1', elementId: 'hero-title', note: 'Shorten this title' }),
      comment({ id: 'c2', elementId: 'chart', note: 'Make it feel real' }),
    ]);

    expect(attachments).toMatchObject([
      { id: 'c1', order: 1, elementId: 'hero-title', comment: 'Shorten this title' },
      { id: 'c2', order: 2, elementId: 'chart', comment: 'Make it feel real' },
    ]);
  });

  it('updates and removes attached comments by saved comment id', () => {
    const first = comment({ id: 'c1', elementId: 'hero-title', note: 'Original' });
    const updated = comment({ id: 'c1', elementId: 'hero-title', note: 'Updated' });
    const chart = comment({ id: 'c2', elementId: 'chart', note: 'Fix chart' });

    const merged = mergeAttachedComments([first, chart], updated);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.note).toBe('Updated');

    const remaining = removeAttachedComment(merged, 'c1');
    expect(commentsToAttachments(remaining)).toEqual([
      expect.objectContaining({ id: 'c2', elementId: 'chart' }),
    ]);
  });

  it('converts iframe snapshot bounds into scaled overlay bounds', () => {
    expect(overlayBoundsFromSnapshot({
      filePath: 'index.html',
      elementId: 'hero-title',
      selector: '[data-od-id="hero-title"]',
      label: 'h1.hero-title',
      text: '',
      htmlHint: '',
      position: { x: 10, y: 20, width: 120, height: 40 },
    }, 1.25)).toEqual({
      left: 12.5,
      top: 25,
      width: 150,
      height: 50,
    });
  });

  it('only resolves saved markers from live snapshots for the same file', () => {
    const saved = comment({ filePath: 'index.html', elementId: 'hero-title' });
    const snapshots = new Map([
      ['hero-title', {
        filePath: 'index.html',
        elementId: 'hero-title',
        selector: '[data-od-id="hero-title"]',
        label: 'h1.hero-title',
        text: '',
        htmlHint: '',
        position: { x: 1, y: 2, width: 3, height: 4 },
      }],
    ]);

    expect(liveSnapshotForComment(saved, snapshots)?.elementId).toBe('hero-title');
    expect(liveSnapshotForComment(comment({ filePath: 'other.html' }), snapshots)).toBeNull();
  });

  it('serializes selected comments into API-mode prompt context without visible input', () => {
    const attachments = commentsToAttachments([
      comment({ id: 'c1', elementId: 'hero-title', note: 'Only shorten this title' }),
    ]);

    const content = messageContentWithCommentAttachments('', attachments);

    expect(content).toContain('(No extra typed instruction.)');
    expect(content).toContain('<attached-preview-comments>');
    expect(content).toContain('selector: [data-od-id="hero-title"]');
    expect(content).toContain('comment: Only shorten this title');
  });

  it('adds hidden comment context only to the current user message sent to API providers', () => {
    const attachments = commentsToAttachments([
      comment({ id: 'c1', elementId: 'hero-title', note: 'Make it bolder' }),
    ]);
    const history: ChatMessage[] = [
      {
        id: 'old',
        role: 'user',
        content: 'Previous request',
        createdAt: 0,
        commentAttachments: attachments,
      },
      {
        id: 'u1',
        role: 'user',
        content: '',
        createdAt: 1,
        commentAttachments: attachments,
      },
      {
        id: 'a1',
        role: 'assistant',
        content: 'Ready',
        createdAt: 2,
        commentAttachments: attachments,
      },
    ];

    const next = historyWithCommentAttachmentContext(history, 'u1');

    expect(next[0]?.content).toBe('Previous request');
    expect(next[1]?.content).toContain('<attached-preview-comments>');
    expect(next[1]?.content).toContain('comment: Make it bolder');
    expect(next[2]?.content).toBe('Ready');
    expect(history[1]?.content).toBe('');
  });
});

function comment(patch: Partial<PreviewComment>): PreviewComment {
  return {
    id: 'c1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    filePath: 'index.html',
    elementId: 'hero-title',
    selector: '[data-od-id="hero-title"]',
    label: 'h1.hero-title',
    text: 'Current title',
    position: { x: 1, y: 2, width: 3, height: 4 },
    htmlHint: '<h1 data-od-id="hero-title">',
    note: 'Comment',
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  };
}
