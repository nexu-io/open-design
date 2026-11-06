export const PROJECT_SHARE_HISTORY_CHANGED_EVENT = 'od:project-share-history-changed';

/** Only a successful stop mutation can confirm one exact file as no longer active. */
export interface ConfirmedProjectShareStop {
  sourceFilePath: string;
  accountScope: string;
  generation: number;
}

export type ConfirmedProjectSharePublication = ConfirmedProjectShareStop;

/** Refresh for all mutations; scoped successful mutation receipts reconcile card feedback with lagging reads. */
export function notifyProjectShareHistoryChanged(projectId: string, confirmedStop?: ConfirmedProjectShareStop, confirmedPublication?: ConfirmedProjectSharePublication): void {
  window.dispatchEvent(new CustomEvent(PROJECT_SHARE_HISTORY_CHANGED_EVENT, {
    detail: { projectId, ...(confirmedStop ? { confirmedStop } : {}), ...(confirmedPublication ? { confirmedPublication } : {}) },
  }));
}
