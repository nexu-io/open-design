// @vitest-environment jsdom
//
// The saved-memory card is pure presentation: it renders a title/description,
// a preview disclosure whose open/closed state is owned by the orchestrator,
// and edit/delete actions. These pin the description-fallback branch, the three
// preview-body states (loading / empty / rendered), and the action callbacks.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntrySummary } from '@open-design/contracts';

import { MemoryEntryCard } from '../../../src/features/memory/components/MemoryEntryCard';
import { I18nProvider } from '../../../src/i18n';

function entry(over: Partial<MemoryEntrySummary> = {}): MemoryEntrySummary {
  return {
    id: 'e1',
    name: 'Prefers dark mode',
    description: 'A saved preference',
    type: 'feedback',
    updatedAt: 1_000,
    ...over,
  };
}

function renderCard(props: Partial<Parameters<typeof MemoryEntryCard>[0]> = {}) {
  const onOpenPreview = vi.fn();
  const onStartEdit = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <I18nProvider initial="en">
      <MemoryEntryCard
        entry={entry()}
        previewId={null}
        previewBody={null}
        onOpenPreview={onOpenPreview}
        onStartEdit={onStartEdit}
        onDelete={onDelete}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, onOpenPreview, onStartEdit, onDelete };
}

afterEach(cleanup);

describe('MemoryEntryCard', () => {
  it('falls back to an em dash when the entry has no description', () => {
    renderCard({ entry: entry({ description: '' }) });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('wires the preview / edit / delete actions to their callbacks', () => {
    const { onOpenPreview, onStartEdit, onDelete } = renderCard();
    fireEvent.click(screen.getByTitle('Preview'));
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onOpenPreview).toHaveBeenCalledWith('e1');
    expect(onStartEdit).toHaveBeenCalledWith('e1');
    expect(onDelete).toHaveBeenCalledWith('e1');
  });

  it('shows a loading line while the preview body is still null and open', () => {
    renderCard({ previewId: 'e1', previewBody: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an em-dash hint when the open preview body is empty', () => {
    renderCard({ previewId: 'e1', previewBody: '' });
    // The empty-body branch renders a hint em dash inside the open preview.
    expect(document.querySelector('.library-preview .hint')?.textContent).toBe('—');
  });

  it('renders the markdown body when the open preview has content', () => {
    renderCard({ previewId: 'e1', previewBody: 'Hello **world**' });
    expect(document.querySelector('.library-preview-body')).not.toBeNull();
    expect(screen.getByText('world')).toBeInTheDocument();
  });
});
