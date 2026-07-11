// Browser-side bridge resolving the app chrome's file-actions slot, so a
// viewer can portal its present/share/download button row into the shared
// header instead of rendering its own toolbar row. Lives in providers/
// because it touches `document`; slice hooks reach it through an injected
// port so they stay DOM-free and unit-testable.
import { APP_CHROME_FILE_ACTIONS_ID, APP_CHROME_FILE_ACTIONS_SELECTOR } from '../../components/AppChromeHeader';

export function resolveChromeActionsHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(APP_CHROME_FILE_ACTIONS_SELECTOR)
    ?? document.getElementById(APP_CHROME_FILE_ACTIONS_ID);
}
