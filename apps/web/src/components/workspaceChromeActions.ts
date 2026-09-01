export const WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID = 'workspace-chrome-account-actions';

export function workspaceChromeAccountActionsHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.getElementById(WORKSPACE_CHROME_ACCOUNT_ACTIONS_ID);
}
