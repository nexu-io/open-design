import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import styles from './SignedOutObservedShare.module.css';
import { SharePublishedLinkControls } from './ShareTab';
import { SharePanelHeader } from './SharePanelHeader';
import { LinkAccessRow } from './LinkAccessRow';
import { ShareNoticeRow } from './ShareNoticeRow';
import { ShareSignInButton } from './ShareSignInButton';


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
        <SharePanelHeader title={t('fileViewer.share')} size="lg" />
        <LinkAccessRow
          label={t('fileViewer.linkAccessTitle')}
          description={t('fileViewer.linkAccessDescription')}
          checked
          disabled
        />
        <SharePublishedLinkControls url={url} copying={copying} feedback={feedback} onCopy={copy} t={t} />
        {canUpdate ? (
          <ShareNoticeRow
            message={t('fileViewer.shareOutdatedSignInHint')}
            action={
              <ShareSignInButton variant="soft" actionLabel={t('fileViewer.signInToUpdate')} onLoginSuccess={onLoginUpdateSuccess} />
            }
          />
        ) : null}
      </div>
    </div>
  );
}
