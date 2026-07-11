// Dumb per-section review card for the design-system project tab's
// looks-good / needs-work review flow. Extracted verbatim from the former
// `DesignSystemProjectPanel.renderReviewCard` closure — props in, JSX out.
//
// NOTE: as of this extraction the review flow is not wired into the kit
// panel's render output (see the panel's own comment: "The Looks-good /
// Needs-work review flow is intentionally gone here — the kit is the single,
// on-brand view of the system."). This component and its owning hook
// (`useDesignSystemReviewCards`) are kept — not deleted — to stay
// behavior-preserving with the pre-extraction source, which defined this
// exact closure and never called it either.
import { Icon } from '../../../components/Icon';
import { DesignSystemInlinePreview } from './DesignSystemInlinePreview';
import {
  designSystemReviewAgentTaskLabel,
  designSystemReviewNeedsAttention,
  designSystemSectionEditableFile,
  designSystemSectionRunningNotice,
  designSystemSectionStatusClass,
  slugForTestId,
} from '../rules';
import type { ProjectFile } from '../../../types';
import type { DesignSystemProjectSectionReview, DesignSystemReviewDecision, TranslateFn } from '../types';

export interface DesignSystemReviewCardProps {
  projectId: string;
  item: DesignSystemProjectSectionReview;
  instanceId: string;
  defaultExpanded: boolean;
  fileByName: Map<string, ProjectFile>;
  t: TranslateFn;
  reviewDecisions: Record<string, DesignSystemReviewDecision>;
  expandedSections: Record<string, boolean>;
  feedbackSection: string | null;
  feedbackText: string;
  onOpenFile: (name: string) => void;
  onToggleSection: (instanceId: string) => void;
  onCollapseSection: (instanceId: string) => void;
  onMarkSectionReview: (
    sectionTitle: string,
    decision: DesignSystemReviewDecision,
  ) => void;
  onOpenNeedsWorkFeedback: (sectionTitle: string, expansionKey: string) => void;
  onCancelNeedsWorkFeedback: () => void;
  onSubmitNeedsWorkFeedback: (sectionTitle: string, sectionFiles: string[]) => void;
  onFeedbackTextChange: (value: string) => void;
}

export function DesignSystemReviewCard({
  projectId,
  item,
  instanceId,
  defaultExpanded,
  fileByName,
  t,
  reviewDecisions,
  expandedSections,
  feedbackSection,
  feedbackText,
  onOpenFile,
  onToggleSection,
  onCollapseSection,
  onMarkSectionReview,
  onOpenNeedsWorkFeedback,
  onCancelNeedsWorkFeedback,
  onSubmitNeedsWorkFeedback,
  onFeedbackTextChange,
}: DesignSystemReviewCardProps) {
  const {
    section,
    previewFile,
    reviewEntry,
    sectionActivity,
    changedAfterFeedback,
    sectionStatus,
    sectionStatusLabel,
  } = item;
  const needsAttention = designSystemReviewNeedsAttention(item);
  // A section the user marked "Looks good" is validated, so collapse it by
  // default to show it is done. Gate that on the current status, not just the
  // stored decision: when a section is regenerated after approval its status
  // moves back to needs-attention, and it has to reopen so the "review again"
  // notice and regenerated preview stay visible. Without the needsAttention guard a stale "looks-good" decision
  // keeps the regenerated section collapsed and the change is easy to miss.
  // The user can still re-expand with the chevron (expandedSections[instanceId]),
  // and an active agent run forces it open.
  const reviewedGood =
    !needsAttention && (reviewDecisions[section.title] ?? reviewEntry?.decision) === 'looks-good';
  const expanded =
    (expandedSections[instanceId] ?? (defaultExpanded && !reviewedGood)) || sectionActivity.running;
  const sectionSlug = slugForTestId(instanceId);
  const sectionAnchorId = `design-system-section-${sectionSlug}`;
  const editableFile = designSystemSectionEditableFile(section, previewFile, fileByName);
  return (
    <section
      id={sectionAnchorId}
      key={instanceId}
      className={[
        'ds-project-section',
        'ds-project-review-item',
        `ds-project-review-item--${item.previewDisplay}`,
        expanded ? 'is-expanded' : 'is-collapsed',
      ].join(' ')}
    >
      <div className="ds-project-section-head">
        {/* The trigger is a stretched button covering the whole head, so the
            entire row toggles. It is a sibling of the review action buttons
            (not a parent), so there are no nested interactive elements. The
            title below is display-only (pointer-events: none) and lets clicks
            fall through to this trigger. */}
        <button
          type="button"
          className="ds-project-section-head-trigger"
          aria-expanded={expanded}
          aria-label={t(expanded ? 'ds.reviewCollapseSection' : 'ds.reviewExpandSection', { title: section.title })}
          onClick={() => onToggleSection(instanceId)}
        />
        <span className="ds-project-section-title">
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={13} />
          <span>
            <strong>{section.title}</strong>
            <small>{section.subtitle}</small>
          </span>
          {!expanded ? (
            <span
              className={[
                'ds-project-section-state',
                'ds-project-section-dot',
                designSystemSectionStatusClass(sectionStatus),
              ].join(' ')}
              aria-label={sectionStatusLabel}
              title={sectionStatusLabel}
            >
              {needsAttention ? t('ds.reviewNeedsReview') : t('ds.reviewLooksGood')}
            </span>
          ) : null}
        </span>
        <div className="ds-project-review-actions" aria-label={t('ds.reviewActionsLabel', { title: section.title })}>
          <button
            type="button"
            className={`ghost success ${reviewDecisions[section.title] === 'looks-good' ? 'active' : ''}`}
            data-testid={`design-system-review-good-${slugForTestId(section.title)}`}
            onClick={() => {
              onMarkSectionReview(section.title, 'looks-good');
              // Collapse on validate, overriding any manual expand so the
              // section always tidies away once it is marked good.
              onCollapseSection(instanceId);
            }}
          >
            <Icon name="check" size={13} />
            {t('ds.reviewLooksGood')}
          </button>
          <button
            type="button"
            className={`ghost danger ${reviewDecisions[section.title] === 'needs-work' ? 'active' : ''}`}
            data-testid={`design-system-review-work-${slugForTestId(section.title)}`}
            onClick={() => onOpenNeedsWorkFeedback(section.title, instanceId)}
          >
            <Icon name="comment" size={13} />
            {t('ds.reviewNeedsWorkEllipsis')}
          </button>
          {editableFile ? (
            <button
              type="button"
              className="ghost compact"
              data-testid={`design-system-review-edit-${sectionSlug}`}
              title={t('ds.reviewEditFile', { file: editableFile.name })}
              onClick={() => onOpenFile(editableFile.name)}
            >
              <Icon name="edit" size={13} />
              {t('common.edit')}
            </button>
          ) : null}
          {feedbackSection === section.title ? (
            <form
              className="ds-project-feedback-popover"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitNeedsWorkFeedback(section.title, section.files);
              }}
            >
              <label htmlFor={`ds-feedback-${slugForTestId(section.title)}`}>
                {t('ds.reviewFeedbackLabel')}
              </label>
              <textarea
                id={`ds-feedback-${slugForTestId(section.title)}`}
                value={feedbackText}
                rows={3}
                placeholder={t('ds.reviewFeedbackPlaceholder', { title: section.title })}
                onChange={(event) => onFeedbackTextChange(event.target.value)}
                autoFocus
              />
              <div>
                <button
                  type="button"
                  className="ghost compact"
                  onClick={onCancelNeedsWorkFeedback}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="primary compact"
                  disabled={!feedbackText.trim()}
                >
                  {t('chat.send')}
                </button>
              </div>
            </form>
            ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="ds-project-section-body">
          {sectionActivity.running ? (
            <div className="ds-project-review-notice is-running">
              <Icon name="sparkles" size={14} />
              <span>{designSystemSectionRunningNotice(t, section, sectionActivity)}</span>
            </div>
          ) : changedAfterFeedback || sectionActivity.mutated ? (
            <div className="ds-project-review-notice">
              <Icon name="check" size={14} />
              <span>
                {changedAfterFeedback
                  ? t('ds.reviewChangedAfterFeedback')
                  : t('ds.reviewChangedDuringRun')}
              </span>
            </div>
          ) : null}
          {reviewEntry?.decision === 'needs-work' && reviewEntry.feedback ? (
            <div className="ds-project-last-feedback">
              <Icon name="comment" size={14} />
              <span>
                <strong>{t('ds.reviewLastFeedback')}</strong>
                <small>{reviewEntry.feedback}</small>
                {reviewEntry.agentTask ? (
                  <small>{designSystemReviewAgentTaskLabel(t, reviewEntry.agentTask)}</small>
                ) : null}
              </span>
            </div>
          ) : null}
          {previewFile ? (
            <div className="ds-project-inline-preview">
              <DesignSystemInlinePreview projectId={projectId} file={previewFile} />
            </div>
          ) : (
            <div className="ds-project-preview-placeholder">
              <Icon name="sparkles" size={16} />
              <span>{t('ds.previewGenerating')}</span>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
