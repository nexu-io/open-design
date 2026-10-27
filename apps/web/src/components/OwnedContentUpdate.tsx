import { useEffect, useId, useState } from 'react';
import type { OwnedProjectContentUpdate, OwnedProjectContentUpdateRequest } from '@open-design/contracts';
import { Button, Dialog, DialogDescription, DialogFooter, DialogTitle } from '@open-design/components';
import { useT } from '../i18n';
import styles from './OwnedContentUpdate.module.css';

export function OwnedContentUpdate({ update, request }: {
  update: OwnedProjectContentUpdate | null;
  request: (input: OwnedProjectContentUpdateRequest) => Promise<OwnedProjectContentUpdate | null>;
}) {
  const t = useT();
  const title = useId();
  const [dontPrompt, setDontPrompt] = useState(false);
  const [working, setWorking] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  useEffect(() => { setDontPrompt(false); setRequestFailed(false); }, [update?.state === 'confirmation_required']);
  const downloading = working || update?.state === 'downloading';
  const message = requestFailed || update?.state === 'failed'
    ? t('collab.contentUpdate.failed')
    : update?.state === 'busy' ? t('collab.contentUpdate.busy')
      : update?.state === 'unsupported' ? t('collab.contentUpdate.unsupported') : null;
  async function act(input: OwnedProjectContentUpdateRequest) {
    if (working) return;
    setWorking(true); setRequestFailed(false);
    try { await request(input); }
    catch { setRequestFailed(true); }
    finally { setWorking(false); }
  }
  const dismiss = () => void act({ action: 'dismiss', version: update?.latestVersion ?? undefined, dontPromptFor24h: dontPrompt });
  const pending = update?.latestVersion != null && update.latestVersion > (update.localVersion ?? -1);
  const canOffer = pending && ['ignored', 'suppressed', 'busy', 'failed'].includes(update?.state ?? '');
  return (
    <div className={styles.controls} data-testid="owned-content-update">
      {downloading ? (
        <Button size="sm" variant="ghost" disabled>{t('collab.contentUpdate.updating')}</Button>
      ) : canOffer ? (
        // A skipped/silenced or failed update remains available for explicit confirmation.
        <Button size="sm" variant="ghost" className={styles.available}
          onClick={() => void act({ action: 'check', manual: true })}>
          <span className={styles.dot} aria-hidden />
          {t('collab.contentUpdate.available')}
        </Button>
      ) : null}
      {update?.promptSuppressedUntil ? (
        <Button size="sm" variant="ghost" disabled={downloading}
          onClick={() => void act({ action: 'reset-preference' })}>
          {t('collab.contentUpdate.askAgain')}
        </Button>
      ) : null}
      {message ? <span className={styles.error} role="alert" title={message}>{message}</span> : null}
      {update?.state === 'confirmation_required' && update.latestVersion != null ? (
        <Dialog role="alertdialog" className={styles.dialog} ariaLabelledBy={title}
          onClose={working ? undefined : dismiss} closeOnEscape={!working}>
          <DialogTitle id={title}>{t('collab.contentUpdate.title')}</DialogTitle>
          <DialogDescription>{t('collab.contentUpdate.description')}</DialogDescription>
          <label className={styles.preference}>
            <input type="checkbox" checked={dontPrompt} disabled={working}
              onChange={event => setDontPrompt(event.target.checked)} />
            {t('collab.contentUpdate.dontPrompt')}
          </label>
          <DialogFooter className={styles.footer}>
            <Button variant="secondary" disabled={working} onClick={dismiss}>
              {t('collab.contentUpdate.later')}
            </Button>
            <Button variant="primary" disabled={working}
              onClick={() => void act({ action: 'accept', version: update.latestVersion!, dontPromptFor24h: dontPrompt })}>
              {t('collab.contentUpdate.replace')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </div>
  );
}
