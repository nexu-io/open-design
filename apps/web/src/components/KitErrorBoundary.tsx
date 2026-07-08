// KitErrorBoundary — contains render-time exceptions in the design-kit /
// brand-preview subtree. Deleting a logo or feeding a malformed brand.json must
// never take down the whole SPA with a white screen; instead the boundary
// catches the throw and shows a recoverable "reload view" fallback. Pair it
// with the per-image onError handling in DesignKitView for full robustness.
//
// React error boundaries must be class components (no hooks), so the generic
// catch lives in `ErrorBoundary` and the translated fallback is supplied by the
// functional `KitErrorBoundary` wrapper.

import { Component, type ReactNode } from 'react';
import { useT } from '../i18n';
import { reportHandledException } from '../analytics/error-tracking';
import styles from './KitErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surface to the existing analytics sink; the UI still recovers locally.
    reportHandledException(error, 'design-kit-view render error');
  }

  private retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return this.props.fallback(this.retry);
    return this.props.children;
  }
}

export function KitErrorBoundary({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <ErrorBoundary
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
