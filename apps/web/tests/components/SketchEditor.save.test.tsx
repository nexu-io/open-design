// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
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

  it('hides the checkmark when dirty becomes true after a successful save', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = renderEditor({ dirty: true, onSave });

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().querySelector('svg')).not.toBeNull();

    // Parent updates dirty=false after successful save, then dirty=true when user draws again
    rerender(
      <SketchEditor
        items={[]}
        onItemsChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={false}
      />,
    );

    rerender(
      <SketchEditor
        items={[]}
        onItemsChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={true}
      />,
    );

    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('hides the checkmark when save fails if success indicator is still visible', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    renderEditor({ dirty: true, onSave });

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().textContent).not.toBe('common.save');

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().textContent).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('has an aria-label matching the default save state', () => {
    renderEditor();
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('has an aria-label when dirty is true', () => {
    renderEditor({ dirty: true });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('has an aria-label showing saving state while saving', () => {
    renderEditor({ saving: true, dirty: true });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saving');
  });

  it('has an aria-label showing saved state after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    const btn = saveButton();
    expect(btn.getAttribute('aria-label')).toBe('sketch.saved');
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('reverts the aria-label to default after saved indicator expires', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saved');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('keeps the aria-label as default when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
  });

  it('shows the default aria-label when dirty becomes true after a successful save', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn().mockResolvedValue(true);
    const { rerender } = renderEditor({ dirty: true, onSave });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(saveButton().getAttribute('aria-label')).toBe('sketch.saved');
    rerender(
      <SketchEditor
        items={[]}
        onItemsChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={false}
      />,
    );
    rerender(
      <SketchEditor
        items={[]}
        onItemsChange={noop}
        onSave={onSave}
        fileName="test.sketch.json"
        dirty={true}
      />,
    );
    expect(saveButton().getAttribute('aria-label')).toBe('common.save');
    expect(saveButton().querySelector('svg')).toBeNull();
  });

  it('keeps the text modal open on backdrop click so draft text is preserved', () => {
    const { container } = renderEditor();

    fireEvent.click(screen.getByTitle('sketch.toolText'));
    fireEvent.pointerDown(container.querySelector('canvas') as HTMLCanvasElement, {
      pointerId: 1,
      clientX: 40,
      clientY: 60,
    });

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Draft note' } });
    fireEvent.click(container.querySelector('.modal-backdrop') as HTMLElement);

    expect(screen.getByDisplayValue('Draft note')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'sketch.textModalTitle' })).toBeTruthy();
  });
});
