// KitErrorBoundary — contains render-time exceptions in the design-kit /
// brand-preview subtree. Deleting a logo or feeding a malformed brand.json must
// never take down the whole SPA with a white screen; instead the boundary
// catches the throw and shows a recoverable "reload view" fallback. Pair it
// with the per-image onError handling in DesignKitView for full robustness.
//
// React error boundaries must be class components (no hooks), so the generic
// catch lives in `ErrorBoundary` and the translated fallback is supplied by the
// functional `KitErrorBoundary` wrapper.

import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './KitErrorBoundary.module.css';

export function KitErrorBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ErrorBoundary
      context="design-kit-view render error"
      fallback={(retry) => (
        <div className={styles.kitError} role="alert" data-testid="kit-error-boundary">
          <p className={styles.kitErrorText}>{t('ds.kitErrorTitle')}</p>
          <button type="button" className={styles.kitErrorRetry} onClick={retry}>
            {t('ds.kitErrorRetry')}
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
