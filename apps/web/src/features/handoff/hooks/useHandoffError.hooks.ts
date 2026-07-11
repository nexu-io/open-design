// Feature-local hook for the menu's single error line. Shared across the
// editors cluster (launch failures) and the CLI cluster (copy failures) so
// both the zero-editors fallback and the full dropdown render the same
// message from one place. Pure UI state with no transport, so it needs no
// injected port; the orchestrator injects `setError`/`clearError` into the
// clusters that raise it, keeping those hooks decoupled from this one.
import { useCallback, useState } from 'react';

export interface HandoffErrorController {
  error: string | null;
  setError: (message: string | null) => void;
  clearError: () => void;
}

export function useHandoffError(): HandoffErrorController {
  const [error, setErrorState] = useState<string | null>(null);

  const setError = useCallback((message: string | null) => {
    setErrorState(message);
  }, []);
  const clearError = useCallback(() => setErrorState(null), []);

  return { error, setError, clearError };
}
