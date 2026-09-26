import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import styles from './SignedOutObservedShare.module.css';
import shareStyles from './ShareTab.module.css';
import { SharePublishedLinkControls } from './ShareTab';
import { CloudSignInTip } from '../CloudSignInTip';

/** Matches the signed-in panel's copied-feedback lifetime (design S3/S4-C: ~1.8s). */
const COPIED_FEEDBACK_MS = 1800;

/**
 * S13: only the previously observed public URL is visible; no project source
 * is mounted. The link block and update notice are the SAME components and
 * classes the signed-in ShareTab renders, so losing the session never changes
 * what a published link looks like — only the toggle dims and the notice's
 * action becomes "sign in to update".
 */
export function SignedOutObservedShare({ url, canUpdate, onLoginUpdateSuccess }: {
  url: string; canUpdate: boolean; onLoginUpdateSuccess: () => void;
}) {
  const t = useT();
  const [copying, setCopying] = useState(false);
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const resetTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  function showFeedback(next: 'copied' | 'failed') {
    setFeedback(next);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (next === 'copied') {
      resetTimer.current = window.setTimeout(() => {
        resetTimer.current = null;
        setFeedback(null);
      }, COPIED_FEEDBACK_MS);
    }
  }

  function copy() {
    if (copying) return;
    if (!navigator.clipboard?.writeText) { showFeedback('failed'); return; }
    setCopying(true);
    void navigator.clipboard.writeText(url).then(
      () => showFeedback('copied'),
      () => showFeedback('failed'),
    ).finally(() => setCopying(false));
  }

  return (
    <div className={styles.shell} role="status">
      <div className={styles.panel}>
        <h2 className={styles.title}>{t('fileViewer.share')}</h2>
        <div className={shareStyles.linkAccessHeading}>
          <div className={shareStyles.linkAccessRow}>
            <span className={shareStyles.linkAccessLabel}>{t('fileViewer.linkAccessTitle')}</span>
            <button type="button" role="switch" aria-checked="true" aria-label={t('fileViewer.linkAccessTitle')}
              className={`${shareStyles.linkAccessToggle} ${shareStyles.linkAccessToggleOn}`} disabled>
              <span className={shareStyles.linkAccessToggleThumb} aria-hidden="true" />
            </button>
          </div>
          <p className={shareStyles.linkAccessDescription}>{t('fileViewer.linkAccessDescription')}</p>
        </div>
        <SharePublishedLinkControls url={url} copying={copying} feedback={feedback} onCopy={copy} t={t} />
        {canUpdate ? <div className={shareStyles.updateNotice}>
          <p>{t('fileViewer.shareOutdatedSignInHint')}</p>
          <CloudSignInTip sharePrompt className={shareStyles.signInSecondaryAction} actionLabel={t('fileViewer.signInToUpdate')} onLoginSuccess={onLoginUpdateSuccess} />
        </div> : null}
      </div>
    </div>
  );
}
