import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { Icon } from './Icon';

interface Props {
  actions?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}

export const APP_CHROME_FILE_ACTIONS_ID = 'app-chrome-file-actions';

export function AppChromeHeader({ actions, children, onBack, backLabel }: Props) {
  const t = useT();
  const resolvedBackLabel = backLabel ?? t('project.backToProjects');

  return (
    <header className="app-chrome-header">
      <div className="app-chrome-traffic-space" aria-hidden />
      <div className="app-chrome-brand" aria-label={t('app.brand')}>
        <span className="app-chrome-mark" aria-hidden>
          <img src="/app-icon.svg" alt="" className="brand-mark-img" draggable={false} />
        </span>
        <span className="app-chrome-name">{t('app.brand')}</span>
      </div>
      {onBack ? (
        <button
          type="button"
          className="app-chrome-back"
          onClick={onBack}
          title={resolvedBackLabel}
          aria-label={resolvedBackLabel}
        >
          <Icon name="arrow-left" size={15} />
        </button>
      ) : null}
      {children ? <div className="app-chrome-content">{children}</div> : null}
      <div className="app-chrome-drag" aria-hidden />
      <div id={APP_CHROME_FILE_ACTIONS_ID} className="app-chrome-file-actions" />
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
      className="settings-icon-btn"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
    >
      <Icon name="settings" size={17} />
    </button>
  );
}
