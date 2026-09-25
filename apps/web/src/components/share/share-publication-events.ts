export const PROJECT_SHARE_HISTORY_CHANGED_EVENT = 'od:project-share-history-changed';

/** Only a successful stop mutation can confirm one exact file as no longer active. */
export interface ConfirmedProjectShareStop {
  sourceFilePath: string;
  accountScope: string;
  generation: number;
}

/** Refresh for all mutations; an optional scoped stop receipt removes stale active feedback during a failed refresh. */
export function notifyProjectShareHistoryChanged(projectId: string, confirmedStop?: ConfirmedProjectShareStop): void {
  window.dispatchEvent(new CustomEvent(PROJECT_SHARE_HISTORY_CHANGED_EVENT, {
    detail: { projectId, ...(confirmedStop ? { confirmedStop } : {}) },
  }));
}
