import { useState } from 'react';
import styles from './DesignSignatureStrip.module.css';
import { useDesignSignatureStripEnabled } from './hooks/useDesignSignatureStripEnabled';
import { useDesignSignatureDiff } from './hooks/useDesignSignatureDiff';
import { useI18n } from '../../i18n';
import { StripCollapsed } from './StripCollapsed';
import { StripExpanded } from './StripExpanded';

/**
 * Opt-in, collapsed-by-default strip on the preview surface. Leads with the
 * plain-language "what changed since last version" diff (issue #4359 / Eli's
 * Discord direction); the per-strand signature is demoted to an expandable
 * "Why" detail. Computes in-browser via the contracts engine, no round-trip.
 */
export function DesignSignatureStrip({
  artifactHtml,
  artifactId,
}: {
  artifactHtml: string | null | undefined;
  artifactId: string;
}) {
  const enabled = useDesignSignatureStripEnabled();
  const [expanded, setExpanded] = useState(false);
  const { signature, diff } = useDesignSignatureDiff(artifactHtml, artifactId);
  const { t } = useI18n();

  if (!enabled || !signature) return null;

  return (
    <div className={styles.strip} aria-label={t('designSignature.ariaLabel')}>
      <StripCollapsed
        fingerprint={signature.fingerprint}
        diff={diff}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      <div className={`accordion-collapsible${expanded ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <StripExpanded signature={signature} diff={diff} />
        </div>
      </div>
    </div>
  );
}
