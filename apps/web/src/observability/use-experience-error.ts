import { useEffect } from 'react';
import { reportExperienceFailure } from './experience-diagnostics';

/** Observes an existing visible error state without transmitting its text. */
export function useExperienceError(error: unknown, surface: string, projectId?: string): void {
  useEffect(() => {
    if (!error) return;
    reportExperienceFailure({ category: 'operation_failure', surface, errorCode: surface,
      ...(projectId ? { projectId } : {}) });
  }, [error, surface, projectId]);
}
