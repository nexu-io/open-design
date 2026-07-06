// @vitest-environment jsdom
//
// The extraction-history card renders a phase pill, title/meta, an optional
// failure explanation, the written-entry chips, and a delete action. These pin
// the written-id chips (each opens the preview) and the failed-with-error
// branch, plus the delete callback.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryExtractionRecord } from '@open-design/contracts';

import { MemoryExtractionCard } from '../../../src/features/memory/components/MemoryExtractionCard';
import { I18nProvider } from '../../../src/i18n';

function record(over: Partial<MemoryExtractionRecord> = {}): MemoryExtractionRecord {
  return {
    id: 'r1',
    startedAt: 1_000,
    phase: 'success',
    userMessagePreview: 'a saved fact',
    ...over,
  };
}

function renderCard(over: Partial<MemoryExtractionRecord> = {}) {
  const onOpenPreview = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <I18nProvider initial="en">
      <MemoryExtractionCard
        record={record(over)}
        nowClock={5_000}
        onOpenPreview={onOpenPreview}
        onDelete={onDelete}
      />
    </I18nProvider>,
  );
  return { ...utils, onOpenPreview, onDelete };
}

afterEach(cleanup);

describe('MemoryExtractionCard', () => {
  it('renders a written-id chip per entry and opens its preview on click', () => {
    const { onOpenPreview } = renderCard({ writtenIds: ['user_role', 'feedback_tests'] });
    const roleChip = screen.getByTitle('user_role');
    const testsChip = screen.getByTitle('feedback_tests');
    expect(roleChip).toBeInTheDocument();
    expect(testsChip).toBeInTheDocument();
    fireEvent.click(roleChip);
    expect(onOpenPreview).toHaveBeenCalledWith('user_role');
  });

  it('renders the failure explanation for a failed record with an error', () => {
    renderCard({ phase: 'failed', error: 'quota_exceeded' });
    expect(document.querySelector('.memory-extraction-failure')).not.toBeNull();
  });

  it('wires the delete action', () => {
    const { onDelete } = renderCard();
    fireEvent.click(screen.getByLabelText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('r1');
  });
});
