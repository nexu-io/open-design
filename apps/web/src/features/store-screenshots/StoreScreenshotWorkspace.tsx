import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@open-design/components';
import type { GenerateStoreScreenshotPlanRequest } from '@open-design/contracts';

import { Icon } from '../../components/Icon';
import { useT } from '../../i18n';
import {
  exportStoreScreenshots,
  fetchStoreScreenshotDocument,
  generateStoreScreenshots,
  validateStoreScreenshotDocument,
  type StoreScreenshotDocument,
  type StoreScreenshotPlatform,
} from './api';
import { StoreScreenshotGallery } from './StoreScreenshotGallery';
import styles from './StoreScreenshotWorkspace.module.css';

interface Props {
  projectId: string;
  aiGenerationEnabled?: boolean;
  byokProvider?: GenerateStoreScreenshotPlanRequest['byokProvider'];
}

type ValidationState =
  | { status: 'idle' | 'checking' }
  | { status: 'ready' }
  | { status: 'issues' }
  | { status: 'unavailable' };

export function StoreScreenshotWorkspace({
  projectId,
  aiGenerationEnabled = false,
  byokProvider,
}: Props) {
  const t = useT();
  const [document, setDocument] = useState<StoreScreenshotDocument | null>(null);
  const [platform, setPlatform] = useState<StoreScreenshotPlatform>('appStore');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    setDocument(null);
    void fetchStoreScreenshotDocument(projectId)
      .then((nextDocument) => {
        if (cancelled) return;
        setDocument(nextDocument);
        setSelectedPageId(nextDocument.pages[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, loadAttempt]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    setValidation({ status: 'checking' });
    void validateStoreScreenshotDocument(projectId, [platform])
      .then((result) => {
        if (cancelled) return;
        setValidation({ status: result.valid ? 'ready' : 'issues' });
      })
      .catch(() => {
        if (!cancelled) setValidation({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, [document, platform, projectId]);

  const validationLabel = useMemo(() => {
    switch (validation.status) {
      case 'ready':
        return t('storeScreenshots.validationReady');
      case 'issues':
        return t('storeScreenshots.validationIssues');
      case 'unavailable':
        return t('storeScreenshots.validationUnavailable');
      case 'idle':
      case 'checking':
        return t('storeScreenshots.validationChecking');
    }
  }, [t, validation.status]);

  const handleGenerate = useCallback(async () => {
    if (!aiGenerationEnabled || generating) return;
    setGenerating(true);
    setActionError(null);
    try {
      await generateStoreScreenshots(projectId, {
        ...(byokProvider ? { byokProvider } : {}),
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerating(false);
    }
  }, [aiGenerationEnabled, byokProvider, generating, projectId]);

  const handleExport = useCallback(async () => {
    if (exporting || validation.status !== 'ready') return;
    setExporting(true);
    setActionError(null);
    try {
      await exportStoreScreenshots(projectId, { platforms: [platform] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  }, [exporting, platform, projectId, validation.status]);

  if (loadError) {
    return (
      <section className={styles.workspace} data-testid="store-screenshot-workspace">
        <div className={styles.errorState}>
          <Icon name="alert-triangle" size={20} />
          <p>{t('storeScreenshots.loadFailed')}</p>
          <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
            {t('storeScreenshots.retry')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace} data-testid="store-screenshot-workspace">
      <header className={styles.header}>
        <div className={styles.headingGroup}>
          <h2>{t('storeScreenshots.workspaceTitle')}</h2>
          <span
            className={`${styles.validation} ${styles[`validation_${validation.status}`]}`}
            role="status"
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {validationLabel}
          </span>
        </div>

        <div className={styles.actions}>
          <Button
            variant="ghost"
            disabled={!document || !aiGenerationEnabled || generating}
            onClick={() => void handleGenerate()}
          >
            <Icon name="sparkles" size={14} />
            {generating
              ? t('storeScreenshots.generating')
              : t('storeScreenshots.generate')}
          </Button>
          <Button
            variant="primary"
            disabled={!document || exporting || validation.status !== 'ready'}
            onClick={() => void handleExport()}
          >
            <Icon name="download" size={14} />
            {exporting ? t('storeScreenshots.exporting') : t('storeScreenshots.export')}
          </Button>
        </div>
      </header>

      <div className={styles.platformTabs} role="tablist" aria-label={t('storeScreenshots.platformAria')}>
        {([
          ['appStore', 'storeScreenshots.appStore'],
          ['googlePlay', 'storeScreenshots.googlePlay'],
        ] as const).map(([value, labelKey]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={platform === value}
            className={`${styles.platformTab}${platform === value ? ` ${styles.platformTabSelected}` : ''}`}
            onClick={() => setPlatform(value)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {!aiGenerationEnabled ? (
        <div className={styles.providerNotice}>
          <Icon name="info" size={14} />
          <span>{t('storeScreenshots.providerRequired')}</span>
        </div>
      ) : null}

      {actionError ? <p className={styles.actionError} role="alert">{actionError}</p> : null}

      <div className={styles.content}>
        {document ? (
          <StoreScreenshotGallery
            document={document}
            platform={platform}
            selectedPageId={selectedPageId}
            onSelectPage={setSelectedPageId}
            pageLabel={(pageNumber) => (
              pageNumber === 0
                ? t('storeScreenshots.thumbnailRail')
                : t('storeScreenshots.page', { n: pageNumber })
            )}
          />
        ) : (
          <div className={styles.loadingGrid} aria-label={t('common.loading')}>
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className={styles.loadingCard} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
