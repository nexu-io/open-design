import { useMemo, useState } from 'react';
import {
  applyChangeSet,
  storeScreenshotTemplates,
  type StoreScreenshotChangeSet,
  type StoreScreenshotPage,
} from '@launch-studio/store-screenshot';
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-design/components';

import { useT } from '../../i18n';
import {
  applyStoreScreenshotChangeSet,
  type StoreScreenshotDocument,
} from './api';
import styles from './ChangeSetReview.module.css';

interface Props {
  projectId: string;
  document: StoreScreenshotDocument;
  changeSet: StoreScreenshotChangeSet;
  affectedPageIds: string[];
  onApplied: (document: StoreScreenshotDocument) => void;
  onCancel: () => void;
}

interface PageDifference {
  id: string;
  pageNumber: number;
  before?: StoreScreenshotPage;
  after?: StoreScreenshotPage;
  changed: boolean;
}

export function ChangeSetReview({
  projectId,
  document,
  changeSet,
  affectedPageIds,
  onApplied,
  onCancel,
}: Props) {
  const t = useT();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => {
    try {
      return {
        document: applyChangeSet(document, changeSet),
        error: null,
      };
    } catch (cause) {
      return {
        document: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [changeSet, document]);
  const differences = useMemo(
    () => buildDifferences(document, preview.document, affectedPageIds),
    [affectedPageIds, document, preview.document],
  );
  const hasEffectiveChanges = differences.some(({ changed }) => changed);

  const handleApply = async () => {
    if (!hasEffectiveChanges || applying || preview.error) return;
    setApplying(true);
    setError(null);
    try {
      onApplied(await applyStoreScreenshotChangeSet(projectId, changeSet));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      ariaLabel={t('storeScreenshots.reviewChanges')}
      onClose={applying ? undefined : onCancel}
      closeOnEscape
      className={styles.dialog}
    >
      <DialogHeader>
        <DialogTitle>{t('storeScreenshots.reviewChanges')}</DialogTitle>
      </DialogHeader>
      <DialogBody className={styles.body}>
        {preview.error ? (
          <p className={styles.error} role="alert">
            {t('storeScreenshots.previewFailed')}: {preview.error}
          </p>
        ) : (
          <>
            <p className={styles.summary}>
              {t('storeScreenshots.reviewSummary', { n: differences.length })}
            </p>
            {!hasEffectiveChanges ? (
              <p className={styles.lockNotice} role="status">
                {t('storeScreenshots.lockedChangesPreserved')}
              </p>
            ) : null}
            <div className={styles.differences}>
              {differences.map((difference) => (
                <article key={difference.id} className={styles.difference}>
                  <div className={styles.previewColumn}>
                    <span className={styles.previewLabel}>
                      {t('storeScreenshots.pageBefore', { n: difference.pageNumber })}
                    </span>
                    <PagePreview page={difference.before} />
                  </div>
                  <div className={styles.previewColumn}>
                    <span className={styles.previewLabel}>
                      {t('storeScreenshots.pageAfter', { n: difference.pageNumber })}
                    </span>
                    <PagePreview page={difference.after} />
                  </div>
                  {!difference.changed && hasEffectiveChanges ? (
                    <span className={styles.unchanged}>
                      {t('storeScreenshots.lockedChangesPreserved')}
                    </span>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" disabled={applying} onClick={onCancel}>
          {t('storeScreenshots.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={!hasEffectiveChanges || applying || Boolean(preview.error)}
          onClick={() => void handleApply()}
        >
          {applying
            ? t('storeScreenshots.applyingChanges')
            : t('storeScreenshots.applyChanges')}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function PagePreview({ page }: { page?: StoreScreenshotPage }) {
  const t = useT();
  if (!page) {
    return <div className={styles.emptyPreview}>{t('storeScreenshots.pageMissing')}</div>;
  }
  const colors = {
    ...storeScreenshotTemplates[page.templateId].colors,
    ...page.colors,
  };
  return (
    <div
      className={styles.pagePreview}
      style={{
        background: colors.background,
        color: colors.text,
      }}
    >
      <strong>{page.headline}</strong>
      {page.body ? <span>{page.body}</span> : null}
      <span
        className={styles.previewDevice}
        style={{ background: colors.accent }}
        aria-hidden="true"
      />
    </div>
  );
}

function buildDifferences(
  beforeDocument: StoreScreenshotDocument,
  afterDocument: StoreScreenshotDocument | null,
  affectedPageIds: string[],
): PageDifference[] {
  const ids = affectedPageIds.length > 0
    ? affectedPageIds
    : Array.from(new Set([
        ...beforeDocument.pages.map(({ id }) => id),
        ...(afterDocument?.pages.map(({ id }) => id) ?? []),
      ]));
  return ids.map((id, index) => {
    const before = beforeDocument.pages.find((page) => page.id === id);
    const after = afterDocument?.pages.find((page) => page.id === id);
    return {
      id,
      pageNumber: (before?.order ?? after?.order ?? index) + 1,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      changed: JSON.stringify(before) !== JSON.stringify(after),
    };
  });
}
