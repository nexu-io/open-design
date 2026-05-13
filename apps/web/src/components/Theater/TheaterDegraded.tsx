import { useId } from 'react';
import { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import type { DegradedReason } from '@open-design/contracts/critique';

interface Props {
  reason: DegradedReason;
  adapter: string;
}

const REASON_KEY: Record<DegradedReason, keyof Dict> = {
  malformed_block: 'critiqueTheater.degradedReasonMalformed',
  oversize_block: 'critiqueTheater.degradedReasonOversize',
  adapter_unsupported: 'critiqueTheater.degradedReasonAdapter',
  protocol_version_mismatch: 'critiqueTheater.degradedReasonProtocol',
  missing_artifact: 'critiqueTheater.degradedReasonMissingArtifact',
};

/**
 * Surfaces a degraded run inside the Theater area. A degraded run means
 * the orchestrator could not score the artifact (the adapter didn't
 * speak the protocol, the block was malformed, etc.), so we render a
 * single explanatory chip in place of the live stage rather than a
 * dimmed-out panel that suggests "scoring in progress" forever.
 */
export function TheaterDegraded({ reason, adapter }: Props) {
  const t = useT();
  // Per-instance heading id so two chips on the same page (e.g. a
  // chat history that renders multiple completed runs) keep their
  // aria-labelledby references unambiguous. Lefarcen P3 on PR #1314.
  const headingId = useId();
  return (
    <section
      className="theater-degraded"
      role="status"
      data-reason={reason}
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="theater-degraded-heading">
        {t('critiqueTheater.degradedHeading')}
      </h3>
      <p className="theater-degraded-reason">
        {t(REASON_KEY[reason], { adapter })}
      </p>
    </section>
  );
}
