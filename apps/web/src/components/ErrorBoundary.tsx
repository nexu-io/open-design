// ErrorBoundary — generic render-time exception boundary. React error
// boundaries must be class components (no hooks), so the catch lives here and
// callers supply a translated fallback via the functional wrapper.

import { Component, type ReactNode } from 'react';
import { reportHandledException } from '../analytics/error-tracking';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (retry: () => void) => ReactNode;
  /** Label reported to the analytics sink, e.g. 'design-kit-view render error'. */
  context: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surface to the existing analytics sink; the UI still recovers locally.
    reportHandledException(error, this.props.context);
  }

  private retry = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return this.props.fallback(this.retry);
    return this.props.children;
  }
}
