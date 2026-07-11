import type { AutomationEvolutionProposal } from '@open-design/contracts';

import { Icon } from '../../../components/Icon';
import { proposalActionLabel, proposalTargetLabel } from '../rules';
import type { TranslateFn } from '../types';

export function ProposalsSection({
  proposals,
  proposalBusyId,
  onReview,
  t,
}: {
  proposals: AutomationEvolutionProposal[];
  proposalBusyId: string | null;
  onReview: (id: string, action: 'apply' | 'reject') => void;
  t: TranslateFn;
}) {
  if (proposals.length === 0) return null;

  return (
    <section className="automations-saved" aria-label={t('automations.proposalsAria')}>
      <div className="automations-section-head">
        <div>
          <h2 className="automations-section__label">{t('automations.proposalsTitle')}</h2>
          <p className="automations-section__sub">{t('automations.proposalsSub')}</p>
        </div>
        <span className="automations-section__meta">{t('automations.proposalsPending', { n: proposals.length })}</span>
      </div>
      <ul className="automations-saved__list">
        {proposals.map((proposal) => {
          const isBusy = proposalBusyId === proposal.id;
          return (
            <li key={proposal.id} className="automation-row">
              <div className="automation-row__main">
                <span className="automation-row__icon">
                  <Icon name={proposal.targetKind === 'design-system' ? 'sliders' : 'sparkles'} size={15} />
                </span>
                <span className="automation-row__content">
                  <span className="automation-row__title">{proposal.title}</span>
                  <span className="automation-row__meta">
                    <span>{proposalTargetLabel(proposal.targetKind, t)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{proposalActionLabel(proposal.action, t)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{proposal.reviewPolicy}</span>
                  </span>
                  <span className="automation-row__prompt">{proposal.summary}</span>
                  {proposal.patch.diffSummary ? (
                    <span className="automation-row__last-run">{proposal.patch.diffSummary}</span>
                  ) : null}
                </span>
              </div>
              <div className="automation-row__actions">
                <button
                  type="button"
                  className="automation-row__btn"
                  onClick={() => onReview(proposal.id, 'apply')}
                  disabled={isBusy}
                >
                  <Icon name="check" size={12} />
                  <span>{t('automations.apply')}</span>
                </button>
                <button
                  type="button"
                  className="automation-row__btn automation-row__btn--danger"
                  onClick={() => onReview(proposal.id, 'reject')}
                  disabled={isBusy}
                >
                  {t('automations.reject')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
