// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesignSystemReviewCard } from '../../../src/features/file-workspace/components/DesignSystemReviewCard';
import type {
  DesignSystemProjectSectionReview,
  DesignSystemReviewDecision,
} from '../../../src/features/file-workspace/types';

const t = ((key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

function makeItem(over: Partial<DesignSystemProjectSectionReview> = {}): DesignSystemProjectSectionReview {
  return {
    section: { title: 'Colors', subtitle: 'Palette', files: ['brand.json'], category: 'Colors' },
    previewFile: null,
    previewDisplay: 'specimen',
    reviewEntry: undefined,
    sectionActivity: { running: false, mutated: false, errored: false, phase: 'idle', touchedFiles: [] },
    changedAfterFeedback: false,
    sectionStatus: 'needs-review',
    sectionStatusLabel: 'Needs review',
    reviewTimeLabel: null,
    ...over,
  };
}

function renderCard(over: Partial<Parameters<typeof DesignSystemReviewCard>[0]> = {}) {
  const onOpenFile = vi.fn();
  const onToggleSection = vi.fn();
  const onCollapseSection = vi.fn();
  const onMarkSectionReview = vi.fn();
  const onOpenNeedsWorkFeedback = vi.fn();
  const onCancelNeedsWorkFeedback = vi.fn();
  const onSubmitNeedsWorkFeedback = vi.fn();
  const onFeedbackTextChange = vi.fn();
  const utils = render(
    <DesignSystemReviewCard
      projectId="proj1"
      item={makeItem()}
      instanceId="Colors"
      defaultExpanded
      fileByName={new Map()}
      t={t}
      reviewDecisions={{} as Record<string, DesignSystemReviewDecision>}
      expandedSections={{}}
      feedbackSection={null}
      feedbackText=""
      onOpenFile={onOpenFile}
      onToggleSection={onToggleSection}
      onCollapseSection={onCollapseSection}
      onMarkSectionReview={onMarkSectionReview}
      onOpenNeedsWorkFeedback={onOpenNeedsWorkFeedback}
      onCancelNeedsWorkFeedback={onCancelNeedsWorkFeedback}
      onSubmitNeedsWorkFeedback={onSubmitNeedsWorkFeedback}
      onFeedbackTextChange={onFeedbackTextChange}
      {...over}
    />,
  );
  return {
    ...utils,
    onOpenFile,
    onToggleSection,
    onCollapseSection,
    onMarkSectionReview,
    onOpenNeedsWorkFeedback,
    onCancelNeedsWorkFeedback,
    onSubmitNeedsWorkFeedback,
    onFeedbackTextChange,
  };
}

afterEach(cleanup);

describe('DesignSystemReviewCard', () => {
  it('renders the section title and subtitle', () => {
    renderCard();
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByText('Palette')).toBeInTheDocument();
  });

  it('marks looks-good and collapses the section on click', () => {
    const { onMarkSectionReview, onCollapseSection } = renderCard();
    fireEvent.click(screen.getByTestId('design-system-review-good-colors'));
    expect(onMarkSectionReview).toHaveBeenCalledWith('Colors', 'looks-good');
    expect(onCollapseSection).toHaveBeenCalledWith('Colors');
  });

  it('opens the needs-work feedback popover', () => {
    const { onOpenNeedsWorkFeedback } = renderCard();
    fireEvent.click(screen.getByTestId('design-system-review-work-colors'));
    expect(onOpenNeedsWorkFeedback).toHaveBeenCalledWith('Colors', 'Colors');
  });

  it('renders the feedback form when feedbackSection matches and submits trimmed text', () => {
    const { onSubmitNeedsWorkFeedback } = renderCard({ feedbackSection: 'Colors', feedbackText: 'fix it' });
    fireEvent.submit(screen.getByRole('button', { name: 'chat.send' }).closest('form')!);
    expect(onSubmitNeedsWorkFeedback).toHaveBeenCalledWith('Colors', ['brand.json']);
  });

  it('collapses by default when the stored decision is looks-good', () => {
    renderCard({
      item: makeItem({ sectionStatus: 'approved' }),
      reviewDecisions: { Colors: 'looks-good' } as Record<string, DesignSystemReviewDecision>,
    });
    expect(screen.getByRole('button', { name: /ds.reviewExpandSection/ })).toBeInTheDocument();
  });

  it('force-expands while the section activity is running', () => {
    renderCard({
      item: makeItem({ sectionStatus: 'approved', sectionActivity: { running: true, mutated: false, errored: false, phase: 'writing', touchedFiles: [] } }),
      reviewDecisions: { Colors: 'looks-good' } as Record<string, DesignSystemReviewDecision>,
      defaultExpanded: false,
    });
    expect(screen.getByRole('button', { name: /ds.reviewCollapseSection/ })).toBeInTheDocument();
  });
});
