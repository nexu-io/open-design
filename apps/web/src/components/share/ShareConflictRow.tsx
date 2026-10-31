import { useEffect, useRef, useState } from 'react';
import type { EntryIndexConflictDetails } from '@open-design/contracts';
import type { useT } from '../../i18n';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import { ShareButton } from './ShareButton';
import { ShareErrorRow } from './ShareErrorRow';
import styles from './ShareConflictRow.module.css';

const COPIED_FEEDBACK_MS = 2000;

/**
 * A share the daemon refuses because the page pulls in the project's root
 * index.html (`entry-index-conflict`). Shows why, and copies the daemon's
 * `agentPrompt` — a self-contained fix instruction for a coding agent. The
 * prompt text is never composed here; if the clipboard is unavailable it is
 * shown for manual selection instead.
 */
export function ShareConflictRow({ conflict, t }: {
  conflict: Pick<EntryIndexConflictDetails, 'referencedFrom' | 'suggestedName' | 'agentPrompt'>;
  t: ReturnType<typeof useT>;
}) {
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { setFeedback(null); }, [conflict.agentPrompt]);

  async function copyPrompt() {
    const copied = await copyToClipboard(conflict.agentPrompt);
    if (timer.current) clearTimeout(timer.current);
    setFeedback(copied ? 'copied' : 'failed');
    if (copied) timer.current = setTimeout(() => setFeedback(null), COPIED_FEEDBACK_MS);
  }

  return (
    <div className={styles.conflict}>
      <ShareErrorRow message={t('fileViewer.publishFileEntryIndexConflict', {
        from: conflict.referencedFrom,
        name: conflict.suggestedName,
      })} />
      <div className={styles.actions}>
        <ShareButton variant="soft" className={styles.copyAction} onClick={() => { void copyPrompt(); }}>
          {/* Both labels share one grid cell so the button keeps the wider
              width while "Copied" shows, instead of shrinking for a moment. */}
          <span className={styles.labelStack}>
            <span aria-hidden={feedback === 'copied'} className={feedback === 'copied' ? styles.hiddenLabel : undefined}>
              {t('fileViewer.copyFixForAgent')}
            </span>
            <span aria-hidden={feedback !== 'copied'} className={feedback === 'copied' ? undefined : styles.hiddenLabel}>
              {t('preview.shareCopied')}
            </span>
          </span>
        </ShareButton>
      </div>
      {feedback === 'failed' ? (
        <>
          <p className={styles.hint} role="status">{t('fileViewer.copyFixForAgentFailed')}</p>
          <pre className={styles.prompt}>{conflict.agentPrompt}</pre>
        </>
      ) : null}
    </div>
  );
}
