import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Button } from '@open-design/components';
import type {
  GenerateStoreScreenshotPlanRequest,
  StoreScreenshotJob,
} from '@open-design/contracts';
import type { StoreScreenshotChangeSet } from '@launch-studio/store-screenshot';

import { Icon } from '../../components/Icon';
import { useT } from '../../i18n';
import {
  exportStoreScreenshots,
  fetchStoreScreenshotJob,
  fetchStoreScreenshotDocument,
  generateStoreScreenshots,
  previewStoreScreenshotChangeSet,
  storeScreenshotJobDownloadUrl,
  validateStoreScreenshotDocument,
  type StoreScreenshotDocument,
  type StoreScreenshotPlatform,
} from './api';
import { StoreScreenshotGallery } from './StoreScreenshotGallery';
import { StoreScreenshotEditor } from './StoreScreenshotEditor';
import { ChangeSetReview } from './ChangeSetReview';
import { VersionHistory } from './VersionHistory';
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

type WorkspaceMode = 'gallery' | 'editor' | 'versions';

interface ChangeReviewState {
  changeSet: StoreScreenshotChangeSet;
  affectedPageIds: string[];
}

const ALL_PAGE_LOCKS = [
  'headline',
  'body',
  'template',
  'screenshot',
  'layout',
] as const;

const JOB_POLL_INTERVAL_MS = 1_000;
const MAX_CONSECUTIVE_JOB_POLL_FAILURES = 3;
const EXPORT_PLATFORMS = ['appStore', 'googlePlay'] as const satisfies readonly StoreScreenshotPlatform[];

function jobIsPending(job: StoreScreenshotJob | null): job is StoreScreenshotJob {
  return job?.status === 'queued' || job?.status === 'running';
}

function terminalJobError(job: StoreScreenshotJob): string | null {
  if (job.status !== 'failed' && job.status !== 'interrupted') return null;
  return job.error?.message ?? 'Store screenshot job failed';
}

interface JobPollState {
  jobId: string | null;
  failedAttempts: number;
  error: string | null;
  manualRetryRequested: boolean;
}

function useStoreScreenshotJobPolling(
  projectId: string,
  job: StoreScreenshotJob | null,
  updateJob: Dispatch<SetStateAction<StoreScreenshotJob | null>>,
  setActionError: Dispatch<SetStateAction<string | null>>,
) {
  const [pollState, setPollState] = useState<JobPollState>({
    jobId: null,
    failedAttempts: 0,
    error: null,
    manualRetryRequested: false,
  });
  const activePollState = pollState.jobId === job?.id
    ? pollState
    : {
        jobId: job?.id ?? null,
        failedAttempts: 0,
        error: null,
        manualRetryRequested: false,
      };

  useEffect(() => {
    if (!jobIsPending(job)) return;
    if (
      activePollState.failedAttempts >= MAX_CONSECUTIVE_JOB_POLL_FAILURES
      && !activePollState.manualRetryRequested
    ) {
      return;
    }

    let cancelled = false;
    const delay = activePollState.manualRetryRequested
      ? 0
      : JOB_POLL_INTERVAL_MS * (2 ** activePollState.failedAttempts);
    const timer = window.setTimeout(() => {
      void fetchStoreScreenshotJob(projectId, job.id)
        .then((nextJob) => {
          if (cancelled) return;
          updateJob(nextJob);
          setPollState({
            jobId: nextJob.id,
            failedAttempts: 0,
            error: null,
            manualRetryRequested: false,
          });
          const failure = terminalJobError(nextJob);
          if (failure) setActionError(failure);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPollState((current) => ({
            jobId: job.id,
            failedAttempts: (
              current.jobId === job.id
                ? current.failedAttempts
                : 0
            ) + 1,
            error: error instanceof Error ? error.message : String(error),
            manualRetryRequested: false,
          }));
        });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activePollState.failedAttempts,
    activePollState.manualRetryRequested,
    job,
    projectId,
    setActionError,
    updateJob,
  ]);

  const retry = useCallback(() => {
    if (!jobIsPending(job)) return;
    setPollState((current) => ({
      jobId: job.id,
      failedAttempts: 0,
      error: current.jobId === job.id ? current.error : null,
      manualRetryRequested: true,
    }));
  }, [job]);

  return {
    error: activePollState.error,
    retry,
    retrying: activePollState.manualRetryRequested,
  };
}

export function StoreScreenshotWorkspace({
  projectId,
  aiGenerationEnabled = false,
  byokProvider,
}: Props) {
  const t = useT();
  const [document, setDocument] = useState<StoreScreenshotDocument | null>(null);
  const [platform, setPlatform] = useState<StoreScreenshotPlatform>('appStore');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('gallery');
  const [changeReview, setChangeReview] = useState<ChangeReviewState | null>(null);
  const [previewSubmitting, setPreviewSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [generateJob, setGenerateJob] = useState<StoreScreenshotJob | null>(null);
  const [exportJob, setExportJob] = useState<StoreScreenshotJob | null>(null);
  const [generateSubmitting, setGenerateSubmitting] = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const reviewedGenerateJobIdRef = useRef<string | null>(null);
  const generating = generateSubmitting || jobIsPending(generateJob);
  const exporting = exportSubmitting || jobIsPending(exportJob);
  const generatePolling = useStoreScreenshotJobPolling(
    projectId,
    generateJob,
    setGenerateJob,
    setActionError,
  );
  const exportPolling = useStoreScreenshotJobPolling(
    projectId,
    exportJob,
    setExportJob,
    setActionError,
  );

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
    void validateStoreScreenshotDocument(projectId, [...EXPORT_PLATFORMS])
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
  }, [document, projectId]);

  useEffect(() => {
    if (
      generateJob?.type !== 'generate'
      || generateJob.status !== 'done'
      || reviewedGenerateJobIdRef.current === generateJob.id
      || !generateJob.result
      || !('preview' in generateJob.result)
      || generateJob.result.preview.changeSet.operations.length === 0
    ) {
      return;
    }
    reviewedGenerateJobIdRef.current = generateJob.id;
    setChangeReview(generateJob.result.preview);
  }, [generateJob]);

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
    setGenerateSubmitting(true);
    setActionError(null);
    try {
      const job = await generateStoreScreenshots(projectId, {
        ...(byokProvider ? { byokProvider } : {}),
      });
      setGenerateJob(job);
      const failure = terminalJobError(job);
      if (failure) setActionError(failure);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerateSubmitting(false);
    }
  }, [aiGenerationEnabled, byokProvider, generating, projectId]);

  const handleExport = useCallback(async () => {
    if (exporting || validation.status !== 'ready') return;
    setExportSubmitting(true);
    setActionError(null);
    try {
      const job = await exportStoreScreenshots(projectId, { platforms: [...EXPORT_PLATFORMS] });
      setExportJob(job);
      const failure = terminalJobError(job);
      if (failure) setActionError(failure);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setExportSubmitting(false);
    }
  }, [exporting, platform, projectId, validation.status]);

  const selectedPage = document?.pages.find(({ id }) => id === selectedPageId)
    ?? document?.pages[0]
    ?? null;
  const selectedPageIndex = selectedPage && document
    ? [...document.pages]
        .sort((left, right) => left.order - right.order)
        .findIndex(({ id }) => id === selectedPage.id)
    : -1;

  const requestChangeReview = useCallback(async (
    changeSet: StoreScreenshotChangeSet,
  ) => {
    if (previewSubmitting) return;
    setPreviewSubmitting(true);
    setActionError(null);
    try {
      setChangeReview(await previewStoreScreenshotChangeSet(projectId, changeSet));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewSubmitting(false);
    }
  }, [previewSubmitting, projectId]);

  const reviewOperation = (
    operation: StoreScreenshotChangeSet['operations'][number],
  ) => {
    if (!document) return;
    void requestChangeReview({
      baseVersion: document.version,
      operations: [operation],
    });
  };

  const handleDocumentUpdated = (nextDocument: StoreScreenshotDocument) => {
    setDocument(nextDocument);
    setChangeReview(null);
    setGenerateJob(null);
    setSelectedPageId((current) => (
      nextDocument.pages.some(({ id }) => id === current)
        ? current
        : nextDocument.pages[0]?.id ?? null
    ));
  };

  const addPage = () => {
    if (!document) return;
    const id = nextPageId(document);
    const orderedPages = [...document.pages].sort((left, right) => left.order - right.order);
    const lastPage = orderedPages.at(-1);
    reviewOperation({
      op: 'insertPage',
      ...(lastPage ? { afterPageId: lastPage.id } : {}),
      page: {
        id,
        order: document.pages.length,
        templateId: selectedPage?.templateId ?? 'minimal-center',
        headline: document.product.features[document.pages.length] ?? document.product.name,
        ...(document.product.summary ? { body: document.product.summary } : {}),
        overrides: {},
        lockedFields: [],
      },
    });
  };

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
            disabled={!selectedPage || mode === 'versions'}
            onClick={() => setMode(mode === 'editor' ? 'gallery' : 'editor')}
          >
            {mode === 'editor'
              ? t('storeScreenshots.closeEditor')
              : t('storeScreenshots.fineEdit')}
          </Button>
          <Button
            variant="ghost"
            disabled={!document}
            onClick={() => setMode(mode === 'versions' ? 'gallery' : 'versions')}
          >
            {mode === 'versions'
              ? t('storeScreenshots.closeVersions')
              : t('storeScreenshots.versionHistory')}
          </Button>
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

      <div className={styles.feedbackRow}>
        {!aiGenerationEnabled ? (
          <div className={styles.providerNotice}>
            <Icon name="info" size={14} />
            <span>{t('storeScreenshots.providerRequired')}</span>
          </div>
        ) : null}
        {actionError ? (
          <p className={styles.actionError} role="alert">{actionError}</p>
        ) : null}
        {generatePolling.error ? (
          <div className={styles.pollError} role="alert">
            <span>{generatePolling.error}</span>
            <Button
              variant="ghost"
              disabled={generatePolling.retrying}
              onClick={generatePolling.retry}
            >
              {t('storeScreenshots.retry')}
            </Button>
          </div>
        ) : null}
        {exportPolling.error ? (
          <div className={styles.pollError} role="alert">
            <span>{exportPolling.error}</span>
            <Button
              variant="ghost"
              disabled={exportPolling.retrying}
              onClick={exportPolling.retry}
            >
              {t('storeScreenshots.retry')}
            </Button>
          </div>
        ) : null}
        {generateJob?.status === 'done' ? (
          <div className={styles.jobNotice} role="status">
            <Icon name="check" size={14} />
            <span>{t('storeScreenshots.generationReadyForPreview')}</span>
          </div>
        ) : null}
        {exportJob?.status === 'done' ? (
          <div className={styles.jobNotice} role="status">
            <Icon name="check" size={14} />
            <span>{t('storeScreenshots.exportReady')}</span>
            {exportJob.type === 'export' && exportJob.result && 'manifest' in exportJob.result ? (
              <span>{t('storeScreenshots.exportFilesValidated', { n: exportJob.result.manifest.files.length })}</span>
            ) : null}
            <a
              className={styles.downloadLink}
              href={storeScreenshotJobDownloadUrl(projectId, exportJob.id)}
              download="store-screenshots.zip"
            >
              {t('storeScreenshots.downloadZip')}
            </a>
          </div>
        ) : null}
      </div>

      {document && mode === 'gallery' ? (
        <div className={styles.pageActions} aria-label={t('storeScreenshots.pageActions')}>
          <Button variant="ghost" disabled={previewSubmitting} onClick={addPage}>
            {t('storeScreenshots.addPage')}
          </Button>
          <Button
            variant="ghost"
            disabled={!selectedPage || previewSubmitting}
            onClick={() => selectedPage && reviewOperation({
              op: 'duplicatePage',
              pageId: selectedPage.id,
            })}
          >
            {t('storeScreenshots.duplicatePage')}
          </Button>
          <Button
            variant="ghost"
            disabled={!selectedPage || selectedPageIndex <= 0 || previewSubmitting}
            onClick={() => selectedPage && reviewOperation({
              op: 'movePage',
              pageId: selectedPage.id,
              toIndex: selectedPageIndex - 1,
            })}
          >
            {t('storeScreenshots.movePageLeft')}
          </Button>
          <Button
            variant="ghost"
            disabled={
              !selectedPage
              || !document
              || selectedPageIndex >= document.pages.length - 1
              || previewSubmitting
            }
            onClick={() => selectedPage && reviewOperation({
              op: 'movePage',
              pageId: selectedPage.id,
              toIndex: selectedPageIndex + 1,
            })}
          >
            {t('storeScreenshots.movePageRight')}
          </Button>
          <Button
            variant="ghost"
            disabled={!selectedPage || previewSubmitting}
            onClick={() => selectedPage && reviewOperation({
              op: 'setLocks',
              pageId: selectedPage.id,
              fields: selectedPage.lockedFields.length === ALL_PAGE_LOCKS.length
                ? []
                : [...ALL_PAGE_LOCKS],
            })}
          >
            {selectedPage?.lockedFields.length === ALL_PAGE_LOCKS.length
              ? t('storeScreenshots.unlockPage')
              : t('storeScreenshots.lockPage')}
          </Button>
          <Button
            variant="ghost"
            disabled={!selectedPage || document.pages.length <= 1 || previewSubmitting}
            onClick={() => selectedPage && reviewOperation({
              op: 'deletePage',
              pageId: selectedPage.id,
            })}
          >
            {t('storeScreenshots.deletePage')}
          </Button>
        </div>
      ) : null}

      <div
        className={`${styles.content}${mode === 'gallery' ? '' : ` ${styles.contentSingle}`}`}
      >
        {document && mode === 'gallery' ? (
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
        ) : document && mode === 'editor' && selectedPage ? (
          <StoreScreenshotEditor
            projectId={projectId}
            document={document}
            page={selectedPage}
            platform={platform}
            onPreviewChangeSet={(changeSet) => void requestChangeReview(changeSet)}
          />
        ) : document && mode === 'versions' ? (
          <VersionHistory
            projectId={projectId}
            currentVersion={document.version}
            onRestored={(nextDocument) => {
              handleDocumentUpdated(nextDocument);
              setMode('gallery');
            }}
          />
        ) : (
          <div className={styles.loadingGrid} aria-label={t('common.loading')}>
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className={styles.loadingCard} />
            ))}
          </div>
        )}
      </div>

      {document && changeReview ? (
        <ChangeSetReview
          projectId={projectId}
          document={document}
          changeSet={changeReview.changeSet}
          affectedPageIds={changeReview.affectedPageIds}
          onApplied={handleDocumentUpdated}
          onCancel={() => setChangeReview(null)}
        />
      ) : null}
    </section>
  );
}

function nextPageId(document: StoreScreenshotDocument): string {
  const prefix = `page-${document.version}-${document.pages.length + 1}`;
  let id = prefix;
  let suffix = 1;
  while (document.pages.some((page) => page.id === id)) {
    suffix += 1;
    id = `${prefix}-${suffix}`;
  }
  return id;
}
