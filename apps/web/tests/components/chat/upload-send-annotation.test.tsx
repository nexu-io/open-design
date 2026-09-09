// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from '../../../src/components/ChatComposer';
import { ANNOTATION_EVENT, type AnnotationAction } from '../../../src/components/PreviewDrawOverlay';
import { uploadProjectFiles } from '../../../src/providers/registry';
import { composerText, flushMounts, pressEnter, typeAndSettle } from '../../helpers/lexical-composer';

vi.mock('../../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/registry')>(
    '../../../src/providers/registry',
  );
  return { ...actual, uploadProjectFiles: vi.fn() };
});

const upload = vi.mocked(uploadProjectFiles);
type Props = Parameters<typeof ChatComposer>[0];

function gate() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((open) => {
    resolve = open;
  });
  return {
    promise,
    open: () => resolve?.(),
  };
}

function result(name: string) {
  return {
    uploaded: [{ path: `uploads/${name}`, name, kind: 'image' as const, size: 1 }],
    failed: [],
  };
}

function mount(overrides: Partial<Props> = {}) {
  const onSend = vi.fn();
  const props: Props = {
    projectId: 'p1',
    projectFiles: [],
    streaming: false,
    onEnsureProject: async () => 'p1',
    onSend,
    onStop: vi.fn(),
    ...overrides,
  };
  const view = render(<ChatComposer {...props} />);
  return {
    onSend,
    update: (changes: Partial<Props>) => view.rerender(<ChatComposer {...props} {...changes} />),
  };
}

function pick(names: string[]) {
  fireEvent.change(screen.getByTestId('chat-file-input'), {
    target: { files: names.map((name) => new File(['x'], name, { type: 'image/png' })) },
  });
}

async function dispatchAnnotation(action: AnnotationAction, note: string) {
  const ack = vi.fn();
  await act(async () => {
    window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
      detail: { file: null, action, note, filePath: 'index.html', ack },
    }));
    await Promise.resolve();
  });
  await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
  return ack;
}

async function emitFileAnnotation(
  action: AnnotationAction,
  note: string,
  fileName: string,
  ack: ReturnType<typeof vi.fn>,
) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
      detail: {
        file: new File(['x'], fileName, { type: 'image/png' }),
        action,
        note,
        filePath: 'index.html',
        ack,
      },
    }));
    await Promise.resolve();
  });
}

async function dispatchFileAnnotation(action: AnnotationAction, note: string, fileName: string) {
  const ack = vi.fn();
  await emitFileAnnotation(action, note, fileName, ack);
  await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
  return ack;
}

async function settle(pending: ReturnType<typeof gate>) {
  await act(async () => {
    pending.open();
    await pending.promise;
  });
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, {
    createObjectURL: () => 'blob:local',
    revokeObjectURL: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('annotation upload/send readiness', () => {
  it('keeps retry available but disabled while a terminal annotation prepares', async () => {
    const annotationPending = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'failed.png' && upload.mock.calls.length === 1) {
        return {
          uploaded: [],
          failed: [{ name, error: 'boom' }],
          error: 'boom',
        };
      }
      if (name === 'annotation.png') await annotationPending.promise;
      return result(name);
    });
    mount();
    await flushMounts();
    pick(['failed.png']);
    const retry = await screen.findByTestId('staged-att-retry') as HTMLButtonElement;

    const annotationAck = vi.fn();
    await emitFileAnnotation('queue', 'Queued annotation', 'annotation.png', annotationAck);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    expect(retry.disabled).toBe(true);
    fireEvent.click(retry);
    expect(upload).toHaveBeenCalledTimes(2);

    await settle(annotationPending);
    await waitFor(() => expect(annotationAck).toHaveBeenCalledWith({ ok: true }));
    await waitFor(() => expect(retry.disabled).toBe(false));
    fireEvent.click(retry);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
  });

  it('rejects a direct send truthfully, then succeeds with the complete attachment set', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'slow.png') await slow.promise;
      return result(name);
    });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    const rejected = await dispatchAnnotation('send', 'Make this blue');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(onSend).not.toHaveBeenCalled();

    await settle(slow);
    const accepted = await dispatchAnnotation('send', 'Make this blue');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['fast.png', 'slow.png']);
  });

  it('rejects a streaming Mark send while an ordinary attachment is already preparing', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => {
      await slow.promise;
      return result(files[0]?.name ?? '');
    });
    const { onSend } = mount({ streaming: true });
    await flushMounts();
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchAnnotation('send', 'Do not stage this yet');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(onSend).not.toHaveBeenCalled();

    await settle(slow);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('rejects queue without consuming its note, then preserves queue metadata on retry', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => {
      await slow.promise;
      return result(files[0]?.name ?? '');
    });
    const { onSend } = mount({ initialDraft: 'Existing draft' });
    await flushMounts();
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchAnnotation('queue', 'Queued note');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(onSend).not.toHaveBeenCalled();

    await settle(slow);
    const accepted = await dispatchAnnotation('queue', 'Queued note');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Existing draft\nQueued note');
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({ queueOnly: true, entryFrom: 'mark' });
  });

  it('allows add-to-input while another attachment prepares but keeps normal send blocked', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => {
      await slow.promise;
      return result(files[0]?.name ?? '');
    });
    const { onSend } = mount();
    await flushMounts();
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const ack = await dispatchAnnotation('draft', 'Keep this note');
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(true);
    pressEnter();
    expect(onSend).not.toHaveBeenCalled();

    await settle(slow);
    await waitFor(() => expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(false));
    pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Keep this note');
  });

  it('keeps an accepted streaming send deferred until a later upload settles', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => {
      await slow.promise;
      return result(files[0]?.name ?? '');
    });
    const { onSend, update } = mount({ streaming: true });
    await flushMounts();

    const ack = await dispatchAnnotation('send', 'Send after streaming');
    expect(ack).toHaveBeenCalledWith({ ok: true });
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    update({ streaming: false });
    await act(async () => Promise.resolve());
    expect(onSend).not.toHaveBeenCalled();

    await settle(slow);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Send after streaming');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name)).toEqual(['slow.png']);
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({ entryFrom: 'mark' });
  });

  it('keeps overlapping annotation preparations owned until both settle', async () => {
    const first = gate();
    const second = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      await (name === 'first.png' ? first.promise : second.promise);
      return result(name);
    });
    const { onSend } = mount({ initialDraft: 'Use both annotations' });
    await flushMounts();
    const firstAck = vi.fn();
    const secondAck = vi.fn();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
        detail: {
          file: new File(['x'], 'first.png', { type: 'image/png' }),
          action: 'draft',
          note: 'First note',
          filePath: 'index.html',
          ack: firstAck,
        },
      }));
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
        detail: {
          file: new File(['x'], 'second.png', { type: 'image/png' }),
          action: 'draft',
          note: 'Second note',
          filePath: 'index.html',
          ack: secondAck,
        },
      }));
      await Promise.resolve();
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    await settle(first);
    await waitFor(() => expect(firstAck).toHaveBeenCalledWith({ ok: true }));
    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(true);

    await settle(second);
    await waitFor(() => expect(secondAck).toHaveBeenCalledWith({ ok: true }));
    await waitFor(() => expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(false));
    pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['first.png', 'second.png']);
  });

  it('rejects a non-streaming send before upload while a draft annotation prepares', async () => {
    const draftGate = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'draft.png') await draftGate.promise;
      return result(name);
    });
    const { onSend } = mount({ initialDraft: 'Existing draft' });
    await flushMounts();
    const draftAck = vi.fn();

    await emitFileAnnotation('draft', 'Draft annotation', 'draft.png', draftAck);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchFileAnnotation('send', 'Direct annotation', 'direct.png');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    await settle(draftGate);
    await waitFor(() => expect(draftAck).toHaveBeenCalledWith({ ok: true }));

    const accepted = await dispatchFileAnnotation('send', 'Direct annotation', 'direct.png');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[0]?.[0]).toBe('Existing draft\nDraft annotation\nDirect annotation');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['draft.png', 'direct.png']);
  });

  it('rejects queue before upload while a draft annotation prepares', async () => {
    const draftGate = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'draft.png') await draftGate.promise;
      return result(name);
    });
    const { onSend } = mount({ initialDraft: 'Existing draft' });
    await flushMounts();
    const draftAck = vi.fn();

    await emitFileAnnotation('draft', 'Draft annotation', 'draft.png', draftAck);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchFileAnnotation('queue', 'Queued annotation', 'queued.png');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    await settle(draftGate);
    await waitFor(() => expect(draftAck).toHaveBeenCalledWith({ ok: true }));

    const accepted = await dispatchFileAnnotation('queue', 'Queued annotation', 'queued.png');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[0]?.[0]).toBe('Existing draft\nDraft annotation\nQueued annotation');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['draft.png', 'queued.png']);
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({ queueOnly: true, entryFrom: 'mark' });
  });

  it('rejects a later draft before upload while a non-streaming send prepares', async () => {
    const sendGate = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'send.png') await sendGate.promise;
      return result(name);
    });
    const { onSend } = mount({ initialDraft: 'Existing draft' });
    await flushMounts();
    const sendAck = vi.fn();

    await emitFileAnnotation('send', 'Direct annotation', 'send.png', sendAck);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchFileAnnotation('draft', 'Later draft', 'later.png');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    await settle(sendGate);
    await waitFor(() => expect(sendAck).toHaveBeenCalledWith({ ok: true }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Existing draft\nDirect annotation');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['send.png']);

    const accepted = await dispatchFileAnnotation('draft', 'Later draft', 'later.png');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    expect(upload).toHaveBeenCalledTimes(2);
    pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[1]?.[0]).toBe('Later draft');
    expect(onSend.mock.calls[1]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['later.png']);
  });

  it('rejects a second direct send before upload while the first send prepares', async () => {
    const firstGate = gate();
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]?.name ?? '';
      if (name === 'first.png') await firstGate.promise;
      return result(name);
    });
    const { onSend } = mount();
    await flushMounts();
    const firstAck = vi.fn();

    await emitFileAnnotation('send', 'First direct annotation', 'first.png', firstAck);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const rejected = await dispatchFileAnnotation('send', 'Second direct annotation', 'second.png');
    expect(rejected).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();

    await settle(firstGate);
    await waitFor(() => expect(firstAck).toHaveBeenCalledWith({ ok: true }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('First direct annotation');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['first.png']);

    const accepted = await dispatchFileAnnotation('send', 'Second direct annotation', 'second.png');
    expect(accepted).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]?.[0]).toBe('Second direct annotation');
    expect(onSend.mock.calls[1]?.[1].map((item: { name: string }) => item.name))
      .toEqual(['second.png']);
  });

  it.each([
    ['send', false],
    ['queue', true],
  ] as const)('sends the current draft after a slow %s annotation upload', async (action, queueOnly) => {
    // Given
    const uploadGate = gate();
    upload.mockImplementation(async (_id, files) => {
      await uploadGate.promise;
      return result(files[0]?.name ?? '');
    });
    const { onSend } = mount({ initialDraft: 'Draft A' });
    await flushMounts();
    const ack = vi.fn();
    await emitFileAnnotation(action, 'Annotation note', 'mark.png', ack);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    // When
    await typeAndSettle('Draft B');
    await settle(uploadGate);

    // Then
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Draft B\nAnnotation note');
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({
      entryFrom: 'mark',
      ...(queueOnly ? { queueOnly: true } : {}),
    });
    await waitFor(() => expect(ack).toHaveBeenCalledWith({ ok: true }));
  });

  it('keeps terminal preparation reserved until send admission settles', async () => {
    // Given
    const admissionGate = gate();
    upload.mockImplementation(async (_id, files) => result(files[0]?.name ?? ''));
    const onSend = vi.fn(() => admissionGate.promise);
    mount({ initialDraft: 'Retain this draft', onSend });
    await flushMounts();
    const firstAck = vi.fn();
    await emitFileAnnotation('send', 'First note', 'first.png', firstAck);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(firstAck).not.toHaveBeenCalled();

    // When
    const secondAck = await dispatchFileAnnotation('queue', 'Second note', 'second.png');
    pick(['ordinary.png']);
    await act(async () => Promise.resolve());

    // Then
    expect(secondAck).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(composerText()).toBe('Retain this draft');
    expect(firstAck).not.toHaveBeenCalled();

    await settle(admissionGate);
    await waitFor(() => expect(firstAck).toHaveBeenCalledWith({ ok: true }));
  });

  it('rejects a terminal annotation before upload while ordinary send admission is pending', async () => {
    // Given
    const admissionGate = gate();
    upload.mockImplementation(async (_id, files) => result(files[0]?.name ?? ''));
    const onSend = vi.fn(() => admissionGate.promise);
    mount({ initialDraft: 'Ordinary pending draft', onSend });
    await flushMounts();
    pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    // When
    const ack = await dispatchFileAnnotation('send', 'Do not upload', 'duplicate.png');

    // Then
    expect(ack).toHaveBeenCalledWith({ ok: false, message: 'Uploading files…' });
    expect(upload).not.toHaveBeenCalled();
    expect(composerText()).toBe('Ordinary pending draft');

    await settle(admissionGate);
  });

  it('ACKs restore-draft as rejected and preserves composer context', async () => {
    // Given
    upload.mockImplementation(async (_id, files) => result(files[0]?.name ?? ''));
    const onClearQuotes = vi.fn();
    const onSend = vi.fn<Props['onSend']>(async (): Promise<'restore-draft'> => 'restore-draft');
    mount({
      initialDraft: 'Existing draft',
      onClearQuotes,
      onSend,
      quotes: [{ id: 'quote-1', text: 'Quoted context', messageId: 'message-1' }],
    });
    await flushMounts();

    // When
    const ack = await dispatchFileAnnotation('send', 'Annotation note', 'restore.png');

    // Then
    expect(ack).toHaveBeenCalledWith({ ok: false, message: 'Annotation send failed. Please try again.' });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0]?.[0]).toContain('Existing draft\nAnnotation note');
    expect(onSend.mock.calls[0]?.[1].map((item: { name: string }) => item.name)).toEqual(['restore.png']);
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({
      entryFrom: 'mark',
      quotes: [{ id: 'quote-1', text: 'Quoted context', messageId: 'message-1' }],
    });
    expect(onClearQuotes).not.toHaveBeenCalled();
    expect(composerText()).toBe('Existing draft');
  });

  it('ACKs rejected admission as failed and preserves composer context', async () => {
    // Given
    upload.mockImplementation(async (_id, files) => result(files[0]?.name ?? ''));
    const onClearQuotes = vi.fn();
    const onSend = vi.fn<Props['onSend']>(async () => {
      throw new Error('admission rejected');
    });
    mount({
      initialDraft: 'Existing draft',
      onClearQuotes,
      onSend,
      quotes: [{ id: 'quote-1', text: 'Quoted context', messageId: 'message-1' }],
    });
    await flushMounts();

    // When
    const ack = await dispatchFileAnnotation('queue', 'Queued note', 'reject.png');

    // Then
    expect(ack).toHaveBeenCalledWith({ ok: false, message: 'Annotation send failed. Please try again.' });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onClearQuotes).not.toHaveBeenCalled();
    expect(composerText()).toBe('Existing draft');
  });

  it.each([
    ['send', false],
    ['queue', true],
  ] as const)('preserves no-upload %s behavior', async (action, queueOnly) => {
    const { onSend } = mount({ initialDraft: 'Existing draft' });
    await flushMounts();

    const ack = await dispatchAnnotation(action, 'Annotation note');

    expect(ack).toHaveBeenCalledWith({ ok: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Existing draft\nAnnotation note');
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({ entryFrom: 'mark', ...(queueOnly ? { queueOnly: true } : {}) });
  });

  it('preserves no-upload streaming deferral', async () => {
    const { onSend, update } = mount({ streaming: true });
    await flushMounts();

    const ack = await dispatchAnnotation('send', 'Deferred note');
    expect(ack).toHaveBeenCalledWith({ ok: true });
    expect(onSend).not.toHaveBeenCalled();

    update({ streaming: false });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[0]).toBe('Deferred note');
    expect(onSend.mock.calls[0]?.[3]).toMatchObject({ entryFrom: 'mark' });
  });
});
