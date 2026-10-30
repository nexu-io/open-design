import type { Ref } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useI18n } from '../i18n';
import type { EntryHomeView } from '../router';
import { Icon } from './Icon';
import { NavButton } from './entry-nav-rail/RailNavButton';
import styles from './PrimaryNavigationRail.module.css';

interface Props {
  view: EntryHomeView | null;
  context: WorkspaceCollabContext | null;
  onHome: () => void;
  onViewChange: (view: EntryHomeView) => void;
  homeActive?: boolean;
  hidePersonalProjects?: boolean;
  placement?: 'flow' | 'overlay';
  testIdPrefix?: 'entry-nav' | 'project-nav';
  accountHostRef?: Ref<HTMLDivElement>;
  onOpenSettings?: () => void;
  settingsActive?: boolean;
}
/** The Home icon rail is shared by entry, project, and settings surfaces. */
export function PrimaryNavigationRail({
  view,
  context,
  onHome,
  onViewChange,
  homeActive = view === 'home',
  hidePersonalProjects = false,
  placement = 'flow',
  testIdPrefix = 'entry-nav',
  accountHostRef,
  onOpenSettings,
  settingsActive = false,
}: Props) {
  const { t } = useI18n();
  const homeLabel = t('entry.navRecents');
  return (
    <nav
      className={`entry-destinations primary-navigation-rail ${styles.rail}${placement === 'overlay' ? ` project-destinations ${styles.overlay}` : ''}`}
      aria-label={t('entry.primaryNavAria')}
    >
      <NavButton iconOnly active={homeActive} ariaLabel={homeLabel} label={homeLabel} title={homeLabel} onClick={onHome} testId={`${testIdPrefix}-home`}>
        <Icon name={homeActive ? 'home-filled' : 'home'} size={18} />
      </NavButton>
      <DestinationModules hidePersonalProjects={hidePersonalProjects} context={context} view={view} onViewChange={onViewChange} testIdPrefix={testIdPrefix}
        onOpenSettings={onOpenSettings} settingsActive={settingsActive} />
      <div className={styles.footer} data-testid="primary-navigation-footer">
        {accountHostRef ? <div ref={accountHostRef} className={styles.accountHost} data-testid="primary-navigation-account-host" /> : null}
      </div>
    </nav>
  );
}

function DestinationModules({
  hidePersonalProjects,
  context,
  view,
  onViewChange,
  testIdPrefix,
  onOpenSettings,
  settingsActive,
}: {
  onOpenSettings?: () => void;
  settingsActive: boolean;
  context: WorkspaceCollabContext | null;
  view: EntryHomeView | null;
  onViewChange: (view: EntryHomeView) => void;
  testIdPrefix: 'entry-nav' | 'project-nav';
  hidePersonalProjects: boolean;
}) {
  const { t } = useI18n();
  const isTeam = context?.workspaceType === 'team';
  return (
    <div className={`entry-destinations__modules ${styles.modules}`}>
      <NavButton
        iconOnly
        active={view === 'community'}
        ariaLabel={t('pluginsHome.title')}
        label={t('pluginsHome.title')}
        title={t('pluginsHome.title')}
        onClick={() => onViewChange('community')}
        testId={`${testIdPrefix}-community`}
      >
        <Icon name={view === 'community' ? 'orbit-filled' : 'orbit'} size={16} />
      </NavButton>
      {context && !hidePersonalProjects ? (
        <NavButton
          iconOnly
          active={view === 'drafts'}
          ariaLabel={t('entry.navDrafts')}
          label={t('workspaceSwitcher.draftsTooltip')}
          title={t('workspaceSwitcher.draftsTooltip')}
          onClick={() => onViewChange('drafts')}
          testId={`${testIdPrefix}-drafts`}
        >
          <Icon name="layout-grid-2" size={16} />
        </NavButton>
      ) : null}
      {isTeam ? (
        <NavButton
          iconOnly
          active={view === 'all-projects'}
          ariaLabel={t('entry.navAllProjects')}
          label={t('workspaceSwitcher.allProjectsTooltip')}
          title={t('workspaceSwitcher.allProjectsTooltip')}
          onClick={() => onViewChange('all-projects')}
          testId={`${testIdPrefix}-all-projects`}
        >
          <Icon name="grid" size={16} />
        </NavButton>
      ) : null}
      <NavButton
        iconOnly
        active={view === 'design-systems'}
        ariaLabel={t('entry.navDesignSystems')}
        label={t('entry.navDesignSystems')}
        title={t('entry.navDesignSystems')}
        onClick={() => onViewChange('design-systems')}
        testId={`${testIdPrefix}-design-systems`}
      >
        <Icon name={view === 'design-systems' ? 'palette-filled' : 'palette'} size={16} />
      </NavButton>
      <NavButton
        iconOnly
        active={view === 'plugins'}
        ariaLabel={t('entry.navPlugins')}
        label={t('entry.navPlugins')}
        title={t('entry.navPlugins')}
        onClick={() => onViewChange('plugins')}
        testId={`${testIdPrefix}-plugins`}
      >
        <Icon name={view === 'plugins' ? 'integrations-filled' : 'puzzle'} size={16} />
      </NavButton>
      {/* Directly under 插件 (per product): at the rail's foot it sat a whole
          screen away from the destinations it belongs with. */}
      {onOpenSettings ? <NavButton iconOnly active={settingsActive}
        ariaLabel={t('entry.accountSettings')} label={t('entry.accountSettings')}
        title={t('entry.accountSettings')} onClick={() => onOpenSettings()} testId="entry-settings-button">
        <Icon name={settingsActive ? 'settings-filled' : 'settings'} size={16} />
      </NavButton> : null}
    </div>
  );
}
