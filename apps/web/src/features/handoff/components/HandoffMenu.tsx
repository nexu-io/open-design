// The dropdown itself: the Editor/CLI tab bar, the compact project-path copy
// row (visible on both tabs), the active tab's panel, and the shared error
// line. Rendered only while `open` is true (the orchestrator gates the
// mount).
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { HostEditor, HostEditorId } from '@open-design/contracts';
import { useT } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { PROJECT_PATH_COPY_ID } from '../constants';
import type { CliTarget, FrameworkId, FrameworkTarget, HandoffTab } from '../types';
import { HandoffEditorPanel } from './HandoffEditorPanel';
import { HandoffCliPanel } from './HandoffCliPanel';

interface Props {
  activeTab: HandoffTab;
  onTabChange: (tab: HandoffTab) => void;
  projectDir?: string | null;
  copiedCliId: string | null;
  copyBusy: string | null;
  onCopyProjectPath: () => void;
  error: string | null;
  available: HostEditor[];
  unavailable: HostEditor[];
  busy: HostEditorId | null;
  onLaunchEditor: (editor: HostEditor) => void;
  availableCliTargets: CliTarget[];
  unavailableCliTargets: CliTarget[];
  selectedFramework: FrameworkTarget;
  onCopyCli: (cli: CliTarget) => void;
  onChooseFramework: (id: FrameworkId) => void;
  onAmrWebsiteClick: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

export function HandoffMenu({
  activeTab,
  onTabChange,
  projectDir,
  copiedCliId,
  copyBusy,
  onCopyProjectPath,
  error,
  available,
  unavailable,
  busy,
  onLaunchEditor,
  availableCliTargets,
  unavailableCliTargets,
  selectedFramework,
  onCopyCli,
  onChooseFramework,
  onAmrWebsiteClick,
}: Props) {
  const t = useT();
  const pathCopied = copiedCliId === PROJECT_PATH_COPY_ID;

  return (
    <div className="handoff-menu" role="dialog" aria-label={t('handoff.optionsAria')} data-testid="handoff-menu">
      <div className="handoff-menu-tabs" role="tablist" aria-label={t('handoff.optionsAria')}>
        <button
          type="button"
          className={`handoff-menu-tab${activeTab === 'editor' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'editor'}
          onClick={() => onTabChange('editor')}
        >
          {t('handoff.editorSection')}
        </button>
        <button
          type="button"
          className={`handoff-menu-tab${activeTab === 'cli' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'cli'}
          onClick={() => onTabChange('cli')}
        >
          {t('handoff.cliSection')}
        </button>
      </div>
      <div className="handoff-path-row" data-testid="handoff-project-path">
        <button
          type="button"
          className={`handoff-path-button${pathCopied ? ' copied' : ''}`}
          onClick={onCopyProjectPath}
          disabled={copyBusy === PROJECT_PATH_COPY_ID || !projectDir}
          title={projectDir ?? t('handoff.projectPathUnavailable')}
          aria-label={pathCopied ? t('handoff.copied') : t('designFiles.copyPath')}
        >
          <span className="handoff-path-button-main">
            <span className="handoff-path-button-icon" aria-hidden>
              <Icon name={pathCopied ? 'check' : 'copy'} size={13} />
            </span>
            <span className="handoff-path-button-label">
              {pathCopied ? t('handoff.copied') : t('designFiles.copyPath')}
            </span>
          </span>
        </button>
      </div>
      {activeTab === 'editor' ? (
        <HandoffEditorPanel
          available={available}
          unavailable={unavailable}
          busy={busy}
          onLaunch={onLaunchEditor}
        />
      ) : (
        <HandoffCliPanel
          availableCliTargets={availableCliTargets}
          unavailableCliTargets={unavailableCliTargets}
          copiedCliId={copiedCliId}
          copyBusy={copyBusy}
          selectedFramework={selectedFramework}
          onCopyCli={onCopyCli}
          onChooseFramework={onChooseFramework}
          onAmrWebsiteClick={onAmrWebsiteClick}
        />
      )}
      {error ? (
        <>
          <div className="handoff-menu-divider" />
          <div className="handoff-menu-error">{error}</div>
        </>
      ) : null}
    </div>
  );
}
