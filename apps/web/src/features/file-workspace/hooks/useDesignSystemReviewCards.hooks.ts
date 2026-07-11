// Feature-local hook for the design-system project tab's per-section review
// cluster (looks-good / needs-work decisions + the needs-work feedback
// popover). No transport — every mutation is local state plus the optional
// `onReviewDecision`/`onNeedsWork` callbacks the orchestrator wires to its own
// project-metadata persistence, so this hook takes no port.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { ProjectMetadata } from '../../../types';
import type { DesignSystemReviewAgentTask, DesignSystemReviewDecision, DesignSystemReviewDetails } from '../types';

export interface DesignSystemReviewCardsController {
  reviewDecisions: Record<string, DesignSystemReviewDecision>;
  expandedSections: Record<string, boolean>;
  setExpandedSections: Dispatch<SetStateAction<Record<string, boolean>>>;
  feedbackSection: string | null;
  feedbackText: string;
  setFeedbackText: (value: string) => void;
  markSectionReview: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
  toggleSection: (sectionTitle: string) => void;
  openNeedsWorkFeedback: (sectionTitle: string, expansionKey: string) => void;
  cancelNeedsWorkFeedback: () => void;
  submitNeedsWorkFeedback: (sectionTitle: string, sectionFiles: string[]) => void;
}

export interface DesignSystemReviewCardsParams {
  editable: boolean;
  designSystemReview?: ProjectMetadata['designSystemReview'];
  onNeedsWork?: (
    sectionTitle: string,
    feedback: string,
    files: string[],
  ) => DesignSystemReviewAgentTask | void;
  onReviewDecision?: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) => void;
}

export function useDesignSystemReviewCards(
  params: DesignSystemReviewCardsParams,
): DesignSystemReviewCardsController {
  const { editable, designSystemReview, onNeedsWork, onReviewDecision } = params;
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, DesignSystemReviewDecision>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [feedbackSection, setFeedbackSection] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  useEffect(() => {
    const next: Record<string, DesignSystemReviewDecision> = {};
    for (const [sectionTitle, entry] of Object.entries(designSystemReview ?? {})) {
      next[sectionTitle] = entry.decision;
    }
    setReviewDecisions(next);
  }, [designSystemReview]);

  function markSectionReview(
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
    details?: DesignSystemReviewDetails,
  ) {
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: decision }));
    onReviewDecision?.(sectionTitle, decision, details);
    if (decision === 'looks-good' && feedbackSection === sectionTitle) {
      setFeedbackSection(null);
      setFeedbackText('');
    }
  }

  function toggleSection(sectionTitle: string) {
    setExpandedSections((current) => ({
      ...current,
      [sectionTitle]: !(current[sectionTitle] ?? false),
    }));
  }

  function openNeedsWorkFeedback(sectionTitle: string, expansionKey: string) {
    if (!editable) return;
    setReviewDecisions((current) => ({ ...current, [sectionTitle]: 'needs-work' }));
    setExpandedSections((current) => ({ ...current, [expansionKey]: true }));
    setFeedbackSection(sectionTitle);
    setFeedbackText('');
  }

  function cancelNeedsWorkFeedback() {
    setFeedbackSection(null);
    setFeedbackText('');
  }

  function submitNeedsWorkFeedback(sectionTitle: string, sectionFiles: string[]) {
    const feedback = feedbackText.trim();
    if (!feedback) return;
    const agentTask = onNeedsWork?.(sectionTitle, feedback, sectionFiles);
    markSectionReview(sectionTitle, 'needs-work', {
      feedback,
      files: sectionFiles,
      ...(agentTask ? { agentTask } : {}),
    });
    setFeedbackSection(null);
    setFeedbackText('');
  }

  return {
    reviewDecisions,
    expandedSections,
    setExpandedSections,
    feedbackSection,
    feedbackText,
    setFeedbackText,
    markSectionReview,
    toggleSection,
    openNeedsWorkFeedback,
    cancelNeedsWorkFeedback,
    submitNeedsWorkFeedback,
  };
}
