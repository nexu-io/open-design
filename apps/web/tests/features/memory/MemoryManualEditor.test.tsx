// @vitest-environment jsdom
//
// The manual editor renders the "Add manually" summary + New button, a transient
// flash pill, and the create/edit form (starters, name/type/desc/body, save).
// These pin the New/cancel/save callbacks, the starter prefill, the type-select
// change, the field edits, the save-disabled-when-name-blank guard, and the
// flash pill (which suppresses the pathCopied kind).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MemoryManualEditor } from '../../../src/features/memory/components/MemoryManualEditor';
import type { DraftEntry } from '../../../src/features/memory/types';
import { I18nProvider } from '../../../src/i18n';

function renderEditor(props: Partial<Parameters<typeof MemoryManualEditor>[0]> = {}) {
  const cbs = {
    onEditingChange: vi.fn(),
    onStartNew: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
  };
  const editorRef = createRef<HTMLDivElement>() as MutableRefObject<HTMLDivElement | null>;
  const editorNameRef = createRef<HTMLInputElement>() as MutableRefObject<HTMLInputElement | null>;
  const utils = render(
    <I18nProvider initial="en">
      <MemoryManualEditor
        editing={null}
        busy={false}
        editorRef={editorRef}
        editorNameRef={editorNameRef}
        flash={null}
        {...cbs}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, ...cbs };
}

const newDraft: DraftEntry = { name: '', description: '', type: 'user', body: '' };

afterEach(cleanup);

describe('MemoryManualEditor', () => {
  it('fires onStartNew from the New button when idle', () => {
    const { onStartNew } = renderEditor({ editing: null });
    fireEvent.click(screen.getByRole('button', { name: /New memory/ }));
    expect(onStartNew).toHaveBeenCalled();
  });

  it('shows a flash pill for a non-pathCopied kind', () => {
    renderEditor({ flash: { kind: 'created', key: 1 } });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('suppresses the flash pill for the pathCopied kind', () => {
    renderEditor({ flash: { kind: 'pathCopied', key: 1 } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('prefills the draft from a starter chip and reports type/name edits', () => {
    const { onEditingChange } = renderEditor({ editing: newDraft });
    // Starters only render for a new (id-less) draft.
    const starters = screen.getAllByRole('button').filter((b) =>
      b.className.includes('filter-pill'),
    );
    fireEvent.click(starters[0]!);
    expect(onEditingChange).toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('e.g. UI preferences'), {
      target: { value: 'My name' },
    });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'project' } });
    expect(onEditingChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'project' }));
  });

  it('reports description and body edits', () => {
    const { onEditingChange } = renderEditor({ editing: { ...newDraft, name: 'X' } });

    fireEvent.change(screen.getByPlaceholderText('One sentence — what is this memory about?'), {
      target: { value: 'New description' },
    });
    expect(onEditingChange).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'New description' }),
    );

    fireEvent.change(screen.getByPlaceholderText(/Rule one/), {
      target: { value: 'New body' },
    });
    expect(onEditingChange).toHaveBeenCalledWith(expect.objectContaining({ body: 'New body' }));
  });

  it('disables save while the draft name is blank and enables it once filled', () => {
    const { rerender } = renderEditor({ editing: newDraft });
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    rerender(
      <I18nProvider initial="en">
        <MemoryManualEditor
          editing={{ ...newDraft, name: 'Filled' }}
          onEditingChange={vi.fn()}
          onStartNew={vi.fn()}
          onCancel={vi.fn()}
          onSave={vi.fn()}
          busy={false}
          editorRef={createRef<HTMLDivElement>() as MutableRefObject<HTMLDivElement | null>}
          editorNameRef={createRef<HTMLInputElement>() as MutableRefObject<HTMLInputElement | null>}
          flash={null}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Create' })).not.toBeDisabled();
  });

  it('wires cancel and shows Save for an existing entry', () => {
    const { onCancel } = renderEditor({ editing: { id: 'e1', ...newDraft, name: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
