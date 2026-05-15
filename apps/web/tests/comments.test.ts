import { describe, expect, it } from 'vitest';
import {
  buildBoardCommentAttachments,
  buildVisualAnnotationAttachment,
  commentsToAttachments,
  historyWithCommentAttachmentContext,
  liveSnapshotForComment,
  mergeAttachedComments,
  messageContentWithCommentAttachments,
  overlayBoundsFromSnapshot,
  removeAttachedComment,
  targetFromSnapshot,
} from '../src/comments';
import type { ChatMessage, PreviewComment } from '../src/types';

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

  it('builds grouped board payloads for pod selections', () => {
    const attachments = buildBoardCommentAttachments({
      target: {
        filePath: 'atlas.html',
        elementId: 'pod-1',
        selector: '[data-od-id="hero"], [data-od-id="chart"]',
        label: 'Hero and chart',
        text: 'Hero title Chart value',
        position: { x: 10, y: 20, width: 300, height: 200 },
        htmlHint: '<section data-od-id="hero">',
        selectionKind: 'pod',
        memberCount: 2,
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
      },
      notes: ['Tighten the hierarchy', 'Make the chart feel premium'],
    });

    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({
      selectionKind: 'pod',
      memberCount: 2,
      source: 'board-batch',
      comment: 'Tighten the hierarchy',
    });
    expect(messageContentWithCommentAttachments('', attachments)).toContain('memberCount: 2');
  });

  it('builds visual annotation payloads without requiring a selector', () => {
    const attachment = buildVisualAnnotationAttachment({
      order: 1,
      screenshotPath: 'uploads/drawing.png',
      markKind: 'stroke',
      note: '',
      bounds: { x: 12, y: 24, width: 140, height: 80 },
      target: {
        filePath: 'index.html',
        position: { x: 12, y: 24, width: 140, height: 80 },
      },
    });

    expect(attachment).toMatchObject({
      selectionKind: 'visual',
      screenshotPath: 'uploads/drawing.png',
      markKind: 'stroke',
      selector: '',
      comment: expect.stringContaining('red strokes'),
      intent: expect.stringContaining('red strokes'),
    });
    expect(messageContentWithCommentAttachments('', [attachment])).toContain('targetKind: visual');
    expect(messageContentWithCommentAttachments('', [attachment])).toContain('screenshot: uploads/drawing.png');
    expect(messageContentWithCommentAttachments('', [attachment])).toContain('markKind: stroke');
    expect(messageContentWithCommentAttachments('', [attachment])).not.toContain('selector: ');
  });

  it('keeps large queued board-note batches ordered in one send payload', () => {
    const notes = Array.from({ length: 8 }, (_, index) => `Note ${index + 1}`);
    const attachments = buildBoardCommentAttachments({
      target: {
        filePath: 'atlas.html',
        elementId: 'pod-2',
        selector: '[data-od-id="card"]',
        label: 'Card pod',
        text: 'Heading Body CTA',
        position: { x: 20, y: 30, width: 240, height: 160 },
        htmlHint: '<section data-od-id="card">',
        selectionKind: 'pod',
        memberCount: 3,
        podMembers: [
          {
            elementId: 'card-heading',
            selector: '[data-od-id="card-heading"]',
            label: 'h2.card-heading',
            text: 'Heading',
            position: { x: 24, y: 34, width: 100, height: 32 },
            htmlHint: '<h2 data-od-id="card-heading">',
          },
          {
            elementId: 'card-body',
            selector: '[data-od-id="card-body"]',
            label: 'p.card-body',
            text: 'Body',
            position: { x: 24, y: 72, width: 180, height: 48 },
            htmlHint: '<p data-od-id="card-body">',
          },
          {
            elementId: 'card-cta',
            selector: '[data-od-id="card-cta"]',
            label: 'button.card-cta',
            text: 'CTA',
            position: { x: 24, y: 128, width: 96, height: 32 },
            htmlHint: '<button data-od-id="card-cta">',
          },
        ],
      },
      notes,
    });

    expect(attachments).toHaveLength(8);
    expect(attachments.map((attachment) => attachment.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(attachments.map((attachment) => attachment.comment)).toEqual(notes);
    expect(messageContentWithCommentAttachments('', attachments)).toContain('8. pod-2');
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

  it('rehydrates saved free-pin markers from persisted comment position after iframe reload', () => {
    const saved = comment({
      elementId: 'pin-abc123',
      selector: '[data-od-pin="pin-abc123"]',
      label: 'pin',
      text: '',
      htmlHint: '',
      position: { x: 88, y: 144, width: 24, height: 24 },
    });

    expect(liveSnapshotForComment(saved, new Map())).toMatchObject({
      filePath: 'index.html',
      elementId: 'pin-abc123',
      selector: '[data-od-pin="pin-abc123"]',
      label: 'pin',
      position: { x: 88, y: 144, width: 24, height: 24 },
    });
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
