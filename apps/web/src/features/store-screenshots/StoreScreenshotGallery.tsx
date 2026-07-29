import type { CSSProperties } from 'react';

import type {
  StoreScreenshotDocument,
  StoreScreenshotPlatform,
} from './api';
import styles from './StoreScreenshotWorkspace.module.css';

interface Props {
  document: StoreScreenshotDocument;
  platform: StoreScreenshotPlatform;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  pageLabel: (pageNumber: number) => string;
}

function visiblePageContent(
  page: StoreScreenshotDocument['pages'][number],
  platform: StoreScreenshotPlatform,
): { headline: string; body?: string } {
  const override = page.overrides[platform];
  return {
    headline: override?.headline ?? page.headline,
    body: override?.body ?? page.body,
  };
}

function pageStyle(
  page: StoreScreenshotDocument['pages'][number],
): CSSProperties {
  return {
    background: page.colors?.background ?? '#ffffff',
    color: page.colors?.text ?? '#18181b',
    '--store-screenshot-accent': page.colors?.accent ?? '#6366f1',
  } as CSSProperties;
}

export function StoreScreenshotGallery({
  document,
  platform,
  selectedPageId,
  onSelectPage,
  pageLabel,
}: Props) {
  const pages = document.pages
    .filter((page) => !(page.overrides[platform]?.hidden ?? page.hidden ?? false))
    .sort((left, right) => left.order - right.order);

  return (
    <>
      <div className={styles.gallery} role="list">
        {pages.map((page, index) => {
          const content = visiblePageContent(page, platform);
          const selected = page.id === selectedPageId;
          return (
            <button
              key={page.id}
              type="button"
              role="listitem"
              className={`${styles.card}${selected ? ` ${styles.cardSelected}` : ''}`}
              data-testid="store-screenshot-card"
              aria-label={pageLabel(index + 1)}
              aria-pressed={selected}
              onClick={() => onSelectPage(page.id)}
            >
              <span className={styles.cardCanvas} style={pageStyle(page)}>
                <span className={styles.cardCopy}>
                  <strong>{content.headline}</strong>
                  {content.body ? <span>{content.body}</span> : null}
                </span>
                <span className={styles.deviceFrame} aria-hidden="true">
                  <span className={styles.deviceCamera} />
                  <span className={styles.deviceScreen}>
                    <span className={styles.appMark}>
                      {document.product.name.trim().slice(0, 1).toUpperCase() || 'A'}
                    </span>
                    <span className={styles.screenLineStrong} />
                    <span className={styles.screenLine} />
                    <span className={styles.screenLineShort} />
                    <span className={styles.screenPanel} />
                  </span>
                </span>
              </span>
              <span className={styles.cardCaption}>{pageLabel(index + 1)}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.thumbnailRail} aria-label={pageLabel(0)}>
        {pages.map((page, index) => {
          const content = visiblePageContent(page, platform);
          const selected = page.id === selectedPageId;
          return (
            <button
              key={page.id}
              type="button"
              className={`${styles.thumbnail}${selected ? ` ${styles.thumbnailSelected}` : ''}`}
              aria-label={pageLabel(index + 1)}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onSelectPage(page.id)}
            >
              <span className={styles.thumbnailPreview} style={pageStyle(page)}>
                <span>{content.headline}</span>
              </span>
              <span>{index + 1}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
