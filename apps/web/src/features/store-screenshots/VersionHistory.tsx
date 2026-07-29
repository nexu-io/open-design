import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-design/components';
import type { StoreScreenshotVersion } from '@open-design/contracts';

import { useT } from '../../i18n';
import {
  fetchStoreScreenshotVersions,
  restoreStoreScreenshotVersion,
  type StoreScreenshotDocument,
} from './api';
import styles from './VersionHistory.module.css';

interface Props {
  projectId: string;
  currentVersion: number;
  onRestored: (document: StoreScreenshotDocument) => void;
}

export function VersionHistory({
  projectId,
  currentVersion,
  onRestored,
}: Props) {
  const t = useT();
  const [versions, setVersions] = useState<StoreScreenshotVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchStoreScreenshotVersions(projectId)
      .then((result) => {
        if (!cancelled) setVersions(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentVersion, projectId]);

  const handleRestore = async () => {
    if (restoreVersion === null || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const restored = await restoreStoreScreenshotVersion(projectId, restoreVersion);
      setRestoreVersion(null);
      onRestored(restored);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className={styles.history} aria-label={t('storeScreenshots.versionHistory')}>
      <h3>{t('storeScreenshots.versionHistory')}</h3>
      {loading ? <p>{t('common.loading')}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !error && versions.length === 0 ? (
        <p>{t('storeScreenshots.noVersions')}</p>
      ) : null}
      <ol>
        {versions.map((version) => (
          <li key={`${version.version}-${version.createdAt}`}>
            <div>
              <strong>{t('storeScreenshots.version', { n: version.version })}</strong>
              <span>{version.source}</span>
              <time dateTime={new Date(version.createdAt).toISOString()}>
                {new Date(version.createdAt).toLocaleString()}
              </time>
            </div>
            {version.version === currentVersion ? (
              <span className={styles.current}>{t('storeScreenshots.currentVersion')}</span>
            ) : (
              <Button
                variant="ghost"
                aria-label={t('storeScreenshots.restoreVersionNumber', { n: version.version })}
                onClick={() => setRestoreVersion(version.version)}
              >
                {t('storeScreenshots.restore')}
              </Button>
            )}
          </li>
        ))}
      </ol>

      {restoreVersion !== null ? (
        <Dialog
          role="alertdialog"
          ariaLabel={t('storeScreenshots.restoreConfirmTitle')}
          onClose={restoring ? undefined : () => setRestoreVersion(null)}
          closeOnEscape
          className={styles.confirmDialog}
        >
          <DialogHeader>
            <DialogTitle>{t('storeScreenshots.restoreConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p>
              {t('storeScreenshots.restoreConfirmBody', { n: restoreVersion })}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={restoring}
              onClick={() => setRestoreVersion(null)}
            >
              {t('storeScreenshots.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={restoring}
              onClick={() => void handleRestore()}
            >
              {restoring
                ? t('storeScreenshots.restoring')
                : t('storeScreenshots.restoreVersion')}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
    </section>
  );
}
