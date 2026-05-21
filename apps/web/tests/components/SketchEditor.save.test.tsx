// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { SketchEditor } from '../../src/components/SketchEditor';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const noop = () => {};

function renderEditor(overrides: Partial<Parameters<typeof SketchEditor>[0]> = {}) {
  return render(
    <SketchEditor
      items={[]}
      onItemsChange={noop}
      onSave={noop}
      fileName="test.sketch.json"
      {...overrides}
    />,
  );
}

function saveButton(): HTMLButtonElement {
  return document.querySelector('button.primary') as HTMLButtonElement;
}

describe('SketchEditor save', () => {
  it('shows the Save label by default', () => {
    renderEditor({ dirty: true });
    expect(saveButton().textContent).toBe('common.save');
  });

  it('shows the saving label when saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().textContent).toBe('sketch.saving');
  });

  it('disables the button while saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().disabled).toBe(true);
  });

  it('disables the button when nothing is editable', () => {
    renderEditor({ items: [], dirty: false, hasPreservedRawItems: false });
    expect(saveButton().disabled).toBe(true);
  });

  it('enables the button when there are items', () => {
    renderEditor({
      items: [{ kind: 'pen', points: [{ x: 10, y: 20 }], color: '#000', size: 2 }],
    });
    expect(saveButton().disabled).toBe(false);
  });

  it('enables the button when dirty', () => {
    renderEditor({ dirty: true });
    expect(saveButton().disabled).toBe(false);
  });

  it('enables the button when there are preserved raw items', () => {
    renderEditor({ hasPreservedRawItems: true });
    expect(saveButton().disabled).toBe(false);
  });

  it('calls onSave when clicked', () => {
    const onSave = vi.fn();
    renderEditor({ dirty: true, onSave });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the checkmark icon after save completes', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const btn = saveButton();
    expect(btn.textContent).not.toBe('common.save');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.disabled).toBe(false);
  });

  it('reverts to the Save label after the saved indicator expires', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });

    expect(saveButton().textContent).not.toBe('common.save');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().disabled).toBe(false);
  });

  it('does not show the checkmark when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });
});
