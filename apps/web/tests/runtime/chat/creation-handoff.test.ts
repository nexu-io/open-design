import { describe, expect, it } from 'vitest';

import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import {
  attachmentLocalPreviewUrl,
  creationHandoffAttachments,
  creationHandoffMessages,
} from '../../../src/runtime/chat/creation-handoff';

const identity = { agentId: 'claude', agentName: 'Claude' };

describe('creation hand-off turn (OPEND-3334)', () => {
  it('is the turn handleSend first paints: a user message and a running, empty assistant placeholder', () => {
    const messages = creationHandoffMessages({ prompt: 'Draft the onboarding', identity, at: 1_000 });
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[0]).toMatchObject({ content: 'Draft the onboarding', createdAt: 1_000 });
    expect(messages[1]).toMatchObject({
      content: '',
      events: [],
      runStatus: 'running',
      startedAt: 1_000,
      agentId: 'claude',
      agentName: 'Claude',
    });
  });

  it('draws no user message when there is neither a prompt nor a file', () => {
    const messages = creationHandoffMessages({ prompt: '', identity, at: 1 });
    expect(messages.map((message) => message.role)).toEqual(['assistant']);
  });

  it('previews staged images locally and keeps same-named files apart', () => {
    const files = [
      new File(['a'], 'mood.png', { type: 'image/png' }),
      new File(['b'], 'mood.png', { type: 'image/png' }),
      new File(['c'], 'brief.txt', { type: 'text/plain' }),
    ];
    const attachments = creationHandoffAttachments(files, ['blob:1', 'blob:2', null]);
    expect(new Set(attachments.map((attachment) => attachment.path)).size).toBe(3);
    expect(attachments.map((attachment) => attachment.kind)).toEqual(['image', 'image', 'file']);
    expect(attachments.map(attachmentLocalPreviewUrl)).toEqual(['blob:1', 'blob:2', null]);
    expect(attachments.map((attachment) => attachment.order)).toEqual([0, 1, 2]);
  });

  it('falls back to the document card for an image that has no preview', () => {
    const [attachment] = creationHandoffAttachments(
      [new File(['a'], 'mood.png', { type: 'image/png' })],
      [null],
    );
    expect(attachment?.kind).toBe('file');
  });
});

describe('creation hand-off turn · execution record', () => {
  it('opens the same running, empty shell a just-sent real turn opens', () => {
    const [, assistant] = creationHandoffMessages({ prompt: 'x', identity, at: 1 });
    const blocks = buildTurnBlocks({
      events: assistant!.events ?? [],
      runStatus: assistant!.runStatus,
      startedAtMs: assistant!.startedAt,
    });
    const shells = blocks.filter((block) => block.kind === 'shell');
    expect(shells).toHaveLength(1);
    expect(shells[0]).toMatchObject({ status: 'running', items: [] });
  });
});
