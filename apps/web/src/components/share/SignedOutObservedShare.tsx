import { useState } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import styles from './SignedOutObservedShare.module.css';
import shareStyles from './ShareTab.module.css';
import { CloudSignInTip } from '../CloudSignInTip';

/** Only the previously observed public URL is visible; no project source is mounted. */
export function SignedOutObservedShare({ url, canUpdate, onLoginUpdateSuccess }: {
  url: string; canUpdate: boolean; onLoginUpdateSuccess: () => void;
}) {
  const t = useT();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
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
        <code className={styles.url}>{url}</code>
        <Button type="button" className={styles.copy} onClick={() => {
          if (!navigator.clipboard?.writeText) { setCopyState('failed'); return; }
          void navigator.clipboard.writeText(url).then(
            () => setCopyState('copied'),
            () => setCopyState('failed'),
          );
        }}>
          {copyState === 'copied' ? t('fileViewer.copied') : t('fileViewer.copyShareLink')}
        </Button>
        {copyState === 'failed' ? <p role="alert">{t('fileViewer.copyLinkManually')}</p> : null}
        {canUpdate ? <div className={styles.updateNotice}>
          <p>{t('fileViewer.shareOutdatedSignInHint')}</p>
          <CloudSignInTip sharePrompt className={styles.signInAction} actionLabel={t('fileViewer.signInToUpdate')} onLoginSuccess={onLoginUpdateSuccess} />
        </div> : null}
      </div>
    </div>
  );
}
