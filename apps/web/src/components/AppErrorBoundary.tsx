// AppErrorBoundary — last-resort boundary around the whole SPA. Any render-time
// throw outside a narrower boundary (FileViewer parsing, deck bridge messages,
// i18n edges) must degrade to a recoverable reload prompt instead of a white
// screen — the invariant KitErrorBoundary already applies to its subtree.
//
// Recovery is a full page reload, not an in-place retry: state that survived
// the crash may itself be the cause, and reloading also re-runs the bootstrap
// path that restores the last-good project snapshot.

import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './AppErrorBoundary.module.css';

export function AppErrorBoundary({
  children,
  onRetry,
}: {
  children: ReactNode;
  /** Test seam; defaults to a full page reload. */
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <ErrorBoundary
      context="app render error"
      fallback={() => (
        <div className={styles.appError} role="alert" data-testid="app-error-boundary">
          <p className={styles.appErrorText}>{t('ds.kitErrorTitle')}</p>
          <button
            type="button"
            className={styles.appErrorRetry}
            onClick={onRetry ?? (() => window.location.reload())}
          >
            {t('ds.kitErrorRetry')}
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
