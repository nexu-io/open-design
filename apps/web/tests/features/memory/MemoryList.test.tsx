// @vitest-environment jsdom
//
// The saved-memory list is presentation over the entries/extractions hooks: the
// counts, the type-filter pills, the clear/refresh toolbar, and the unified card
// list. These pin the empty state, the filter/refresh/clear callbacks, and the
// extraction badge pluralization.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type MutableRefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntrySummary, MemoryExtractionRecord } from '@open-design/contracts';

import { MemoryList } from '../../../src/features/memory/components/MemoryList';
import { I18nProvider } from '../../../src/i18n';

function entry(over: Partial<MemoryEntrySummary> = {}): MemoryEntrySummary {
  return { id: 'e1', name: 'n', description: 'd', type: 'feedback', updatedAt: 1, ...over };
}
function record(over: Partial<MemoryExtractionRecord> = {}): MemoryExtractionRecord {
  return { id: 'r1', startedAt: 1, phase: 'success', userMessagePreview: 'm', ...over };
}

function renderList(props: Partial<Parameters<typeof MemoryList>[0]> = {}) {
  const onFilterChange = vi.fn();
  const onClearExtractions = vi.fn();
  const onRefreshExtractions = vi.fn();
  const handlers = {
    onOpenPreview: vi.fn(),
    onStartEdit: vi.fn(),
    onDeleteEntry: vi.fn(),
    onDeleteExtraction: vi.fn(),
  };
  const sectionRef = createRef<HTMLElement>() as MutableRefObject<HTMLElement | null>;
  const utils = render(
    <I18nProvider initial="en">
      <MemoryList
        sectionRef={sectionRef}
        entries={[entry()]}
        filtered={[entry()]}
        visibleExtractions={[]}
        filter="all"
        onFilterChange={onFilterChange}
        unifiedMemoryCount={1}
        onClearExtractions={onClearExtractions}
        onRefreshExtractions={onRefreshExtractions}
        isRefreshing={false}
        previewId={null}
        previewBody={null}
        nowClock={0}
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, onFilterChange, onClearExtractions, onRefreshExtractions, ...handlers };
}

afterEach(cleanup);

describe('MemoryList', () => {
  it('renders the empty state when nothing is visible', () => {
    renderList({ entries: [], filtered: [], unifiedMemoryCount: 0 });
    expect(screen.getByText('No memory yet.')).toBeInTheDocument();
  });

  it('fires onFilterChange for the "All" pill and a type pill', () => {
    const { onFilterChange } = renderList({ entries: [entry({ type: 'feedback' })] });
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(onFilterChange).toHaveBeenCalledWith('all');
    // The feedback type has a nonzero count, so its pill renders.
    fireEvent.click(screen.getByRole('button', { name: /Feedback/i }));
    expect(onFilterChange).toHaveBeenCalledWith('feedback');
  });

  it('shows clear/refresh only with extractions and wires both', () => {
    const { onClearExtractions, onRefreshExtractions } = renderList({
      visibleExtractions: [record()],
      unifiedMemoryCount: 2,
    });
    // Singular extraction badge.
    expect(screen.getByText(/1 extraction$/)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Clear all extraction history'));
    fireEvent.click(screen.getByTitle('Refresh'));
    expect(onClearExtractions).toHaveBeenCalled();
    expect(onRefreshExtractions).toHaveBeenCalled();
  });

  it('shows the refreshing label and disables refresh while a refresh is in flight', () => {
    renderList({ visibleExtractions: [record()], unifiedMemoryCount: 2, isRefreshing: true });
    expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    expect(screen.getByTitle('Refresh')).toBeDisabled();
  });

  it('pluralizes the extraction badge past one', () => {
    renderList({
      visibleExtractions: [record({ id: 'r1' }), record({ id: 'r2' })],
      unifiedMemoryCount: 3,
    });
    expect(screen.getByText(/2 extractions$/)).toBeInTheDocument();
  });

  it('keeps a zero-count type pill visible while it is the active filter', () => {
    // `project` has no entries, but because it is the active filter the pill
    // stays rendered (the `count === 0 && filter !== type` cull is skipped).
    renderList({ entries: [entry({ type: 'feedback' })], filter: 'project' });
    expect(screen.getByRole('button', { name: /Project/i })).toBeInTheDocument();
  });
});
