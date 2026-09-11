// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from '../../../src/components/ChatComposer';
import { ANNOTATION_EVENT, type AnnotationAction } from '../../../src/components/PreviewDrawOverlay';
import { uploadProjectFiles } from '../../../src/providers/registry';
import { flushMounts, pressEnter } from '../../helpers/lexical-composer';

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
