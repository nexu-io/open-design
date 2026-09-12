import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { RemixIcon } from './RemixIcon';

interface Props {
  actions?: ReactNode;
  children?: ReactNode;
  fileActionsBefore?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  showTrafficSpace?: boolean;
}

export const APP_CHROME_FILE_ACTIONS_ID = 'app-chrome-file-actions';
export const APP_CHROME_FILE_ACTIONS_SELECTOR = '[data-app-chrome-file-actions="true"]';
/* Slot inside the workspace row's view switcher, immediately after 预览: the
   open viewer portals its 代码 control here (per product) so render and source
   sit side by side at the top instead of one level down in the preview
   toolbar. Rendered by FileWorkspace; see FileViewer's `viewTabsHost`. */
export const APP_CHROME_VIEW_TABS_ID = 'app-chrome-view-tabs';
export const APP_CHROME_VIEW_TABS_SELECTOR = '[data-app-chrome-view-tabs="true"]';
/* Slot inside the workspace row's tab strip, immediately BEFORE the file tabs:
   the open viewer portals its 桌面端/平板/手机 viewport switcher here (per
   product) so the device you are previewing at reads next to the page it
   belongs to, instead of one level down in the preview toolbar. Rendered by
   FileWorkspace; see FileViewer's `tabLeadHost`. */
export const APP_CHROME_TAB_LEAD_ID = 'app-chrome-tab-lead';
export const APP_CHROME_TAB_LEAD_SELECTOR = '[data-app-chrome-tab-lead="true"]';
/* Slot inside the ACTIVE page tab, ahead of its name: the open viewer portals
   its Reload in here (per product) so the control and the page it reloads read
   as one chip instead of two neighbours. Only the active tab renders it, which
   is what keeps the id unique. Rendered by FileWorkspace's `Tab`; see
   FileViewer's `tabActionHost`. */
export const APP_CHROME_TAB_ACTION_ID = 'app-chrome-tab-action';
export const APP_CHROME_TAB_ACTION_SELECTOR = '[data-app-chrome-tab-action="true"]';

export function AppChromeHeader({
  actions,
  children,
  fileActionsBefore,
  onBack,
  backLabel,
  showTrafficSpace = true,
}: Props) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t('project.backToProjects');

  return (
    <header className="app-chrome-header">
      {showTrafficSpace ? <div className="app-chrome-traffic-space" aria-hidden /> : null}
      {onBack ? (
        <button
          type="button"
          className="app-chrome-back od-tooltip"
          onClick={onBack}
          title={resolvedBackLabel}
          data-tooltip={resolvedBackLabel}
          data-tooltip-placement="bottom"
          aria-label={resolvedBackLabel}
        >
          <RemixIcon name="arrow-left-line" size={16} />
        </button>
      ) : null}
      {children ? <div className="app-chrome-content">{children}</div> : null}
      <div className="app-chrome-drag" aria-hidden />
      {fileActionsBefore ? <div className="app-chrome-file-actions-before">{fileActionsBefore}</div> : null}
      <div
        id={APP_CHROME_FILE_ACTIONS_ID}
        className="app-chrome-file-actions"
        data-app-chrome-file-actions="true"
      />
      {actions ? <div className="app-chrome-actions">{actions}</div> : null}
    </header>
  );
}

export function SettingsIconButton({
  onClick,
  title,
  ariaLabel,
}: {
  onClick: () => void;
  title: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className="settings-icon-btn od-tooltip"
      onClick={onClick}
      title={title}
      data-tooltip={title}
      data-tooltip-placement="bottom"
      aria-label={ariaLabel}
    >
      <RemixIcon name="settings-line" size={18} />
    </button>
  );
}
