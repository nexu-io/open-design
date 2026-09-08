// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChatComposer } from '../../../src/components/ChatComposer';
import { ANNOTATION_EVENT } from '../../../src/components/PreviewDrawOverlay';
import { uploadProjectFiles } from '../../../src/providers/registry';
import { flushMounts, pressEnter } from '../../helpers/lexical-composer';

vi.mock('../../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/registry')>('../../../src/providers/registry');
  return { ...actual, uploadProjectFiles: vi.fn() };
});
const upload = vi.mocked(uploadProjectFiles);
type Props = Parameters<typeof ChatComposer>[0];
const file = (name: string) => new File(['x'], name, { type: 'image/png' });
const result = (name: string) => ({ uploaded: [{ path: `uploads/${name}`, name, kind: 'image' as const, size: 1 }], failed: [] });
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}
function mount(overrides: Partial<Props> = {}) {
  const onSend = vi.fn();
  const props: Props = { projectId: 'p1', projectFiles: [], streaming: false, onEnsureProject: async () => 'p1', onSend, onStop: vi.fn(), ...overrides };
  const view = render(<ChatComposer {...props} />);
  return { onSend, ...view, update: (changes: Partial<Props>) => view.rerender(<ChatComposer {...props} {...changes} />) };
}
const pick = (names: string[]) => fireEvent.change(screen.getByTestId('chat-file-input'), { target: { files: names.map(file) } });
const send = () => screen.getByTestId('chat-send') as HTMLButtonElement;
async function ready(name: string) {
  await waitFor(() => expect(screen.getByTestId('staged-attachments').querySelector(`img[src*="uploads%2F${name}"]`) ?? screen.getByTestId('staged-attachments').querySelector(`img[src*="uploads/${name}"]`)).toBeTruthy());
}
async function settle(g: ReturnType<typeof gate>) {
  await act(async () => { g.resolve(); await g.promise; });
}
beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(Object.create(URL), URL, { createObjectURL: () => 'blob:local', revokeObjectURL: () => {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe('Deep upload/send contract', () => {
  it.each(['click', 'enter'])('holds partial batch for %s, then sends original order', async (method) => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => { if (files[0]!.name === 'slow.png') await slow.promise; return result(files[0]!.name); });
    const { onSend } = mount();
    await flushMounts();
    pick(['slow.png', 'fast.png']);
    await ready('fast.png');
    if (method === 'click') fireEvent.click(send()); else pressEnter();
    await act(async () => { await Promise.resolve(); });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().disabled).toBe(true);
    await settle(slow);
    await waitFor(() => expect(send().disabled).toBe(false));
    if (method === 'click') fireEvent.click(send()); else pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]![1].map((a: {name: string}) => a.name)).toEqual(['slow.png', 'fast.png']);
  });

  it('holds a text draft while its only attachment uploads', async () => {
    const slow = gate();
    upload.mockImplementation(async () => { await slow.promise; return result('slow.png'); });
    const { onSend } = mount({ initialDraft: 'Please use this image' });
    await flushMounts();
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    pressEnter();
    await act(async () => { await Promise.resolve(); });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().disabled).toBe(true);
    await settle(slow);
    await waitFor(() => expect(send().disabled).toBe(false));
  });

  it('holds a retry even after the original batch settled', async () => {
    const retryGate = gate();
    let attempts = 0;
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]!.name;
      if (name === 'retry.png') { attempts++; if (attempts === 1) return { uploaded: [], failed: [{ name }], error: 'offline' }; await retryGate.promise; }
      return result(name);
    });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'retry.png']);
    fireEvent.click(await screen.findByTestId('staged-att-retry'));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    pressEnter();
    await act(async () => { await Promise.resolve(); });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().disabled).toBe(true);
    await settle(retryGate);
    await waitFor(() => expect(send().disabled).toBe(false));
  });

  it('settling the original batch cannot release an active retry', async () => {
    const slow = gate();
    const retry = gate();
    let attempts = 0;
    upload.mockImplementation(async (_id, files) => {
      const name = files[0]!.name;
      if (name === 'retry.png') {
        attempts += 1;
        if (attempts === 1) return { uploaded: [], failed: [{ name }], error: 'offline' };
        await retry.promise;
      }
      if (name === 'slow.png') await slow.promise;
      return result(name);
    });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'retry.png', 'slow.png']);
    fireEvent.click(await screen.findByTestId('staged-att-retry'));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
    await settle(slow);
    await ready('slow.png');
    expect(attempts).toBe(2);
    expect(send().disabled).toBe(true);
    pressEnter();
    await act(async () => { await Promise.resolve(); });
    expect(onSend).not.toHaveBeenCalled();
    await settle(retry);
    await waitFor(() => expect(send().disabled).toBe(false));
  });

  it('admits only one retry while project readiness is resolving', async () => {
    const ensureGate = gate();
    const onEnsureProject = vi.fn(async () => {
      if (onEnsureProject.mock.calls.length === 1) return 'p1';
      await ensureGate.promise;
      return 'p1';
    });
    let attempts = 0;
    upload.mockImplementation(async (_id, files) => {
      attempts += 1;
      if (attempts === 1) {
        return { uploaded: [], failed: [{ name: files[0]!.name }], error: 'offline' };
      }
      return result(files[0]!.name);
    });
    mount({ projectId: null, onEnsureProject });
    await flushMounts();
    pick(['retry.png']);
    const retryButton = await screen.findByTestId('staged-att-retry');
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    await act(async () => { await Promise.resolve(); });
    expect(onEnsureProject).toHaveBeenCalledTimes(2);
    await settle(ensureGate);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });

  it('allows successful files after another file fails', async () => {
    upload.mockImplementation(async (_id, files) => {
      if (files[0]!.name === 'bad.png') throw new Error('offline');
      return result(files[0]!.name);
    });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'bad.png']);
    await screen.findByTestId('staged-att-retry');
    await waitFor(() => expect(send().disabled).toBe(false));
    fireEvent.click(send());
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]![1].map((a: {name: string}) => a.name)).toEqual(['fast.png']);
    expect(screen.getByTestId('staged-att-retry')).toBeTruthy();
  });

  it('removing the last pending card permits send without waiting for its request', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => { if (files[0]!.name === 'slow.png') await slow.promise; return result(files[0]!.name); });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'slow.png']);
    await ready('fast.png');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload of slow.png' }));
    expect(screen.queryByRole('button', { name: 'Cancel upload of slow.png' })).toBeNull();
    expect(send().disabled).toBe(false);
    fireEvent.click(send());
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await settle(slow);
    expect(screen.queryByTestId('staged-attachments')).toBeNull();
  });

  it('an overlapping completed batch cannot unlock an older pending batch', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => { if (files[0]!.name === 'slow.png') await slow.promise; return result(files[0]!.name); });
    mount({ initialDraft: 'Use both' });
    await flushMounts();
    pick(['slow.png']);
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    pick(['fast.png']);
    await ready('fast.png');
    expect(send().disabled).toBe(true);
    await settle(slow);
    await waitFor(() => expect(send().disabled).toBe(false));
  });

  it('external pending cards block text, and removal restores send', async () => {
    const { onSend, update } = mount({ initialDraft: 'Home handoff', externalPendingUploads: [{ id: 'home-1', name: 'slow.png', kind: 'image', order: 0, state: 'uploading' }] });
    await flushMounts();
    pressEnter();
    await act(async () => { await Promise.resolve(); });
    expect(onSend).not.toHaveBeenCalled();
    expect(send().disabled).toBe(true);
    update({ externalPendingUploads: [] });
    await waitFor(() => expect(send().disabled).toBe(false));
  });

  it('external failed cards do not permanently block a text draft', async () => {
    const { onSend } = mount({ initialDraft: 'Home handoff', externalPendingUploads: [{ id: 'home-1', name: 'bad.png', kind: 'image', order: 0, state: 'failed' }] });
    await flushMounts();
    expect(send().disabled).toBe(false);
    pressEnter();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  });

  it('annotation direct-send must not consume a partial staged batch', async () => {
    const slow = gate();
    upload.mockImplementation(async (_id, files) => { if (files[0]!.name === 'slow.png') await slow.promise; return result(files[0]!.name); });
    const { onSend } = mount();
    await flushMounts();
    pick(['fast.png', 'slow.png']);
    await ready('fast.png');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, { detail: { note: 'Make this blue', action: 'send', filePath: 'index.html', ack: () => {} } }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSend).not.toHaveBeenCalled();
    await settle(slow);
  });
});
