// Lovart-style left navigation rail for the entry view.
//
// Renders a narrow icon-only column. The first slot is the brand
// logo, which doubles as the Home destination: clicking it always
// navigates to home, and it carries the active `aria-current="page"`
// treatment when the home view is showing, so we do not need a
// separate Home button in the primary nav group. Primary actions
// (new project, projects, automations, design systems) follow.
// Secondary platform items (plugins, integrations) live in the footer
// section alongside the help launcher — they are accessible but visually
// de-emphasised relative to the daily-use primary destinations.
// Language switching and other account-scoped controls live behind the
// floating settings cog in the top-right corner of the main content.

import type { ReactNode } from 'react';
import { EntryHelpMenu } from './EntryHelpMenu';
import { Icon } from './Icon';
import { UpdaterPopup } from './UpdaterPopup';
import { useT } from '../i18n';

export type EntryView =
  | 'home'
  | 'onboarding'
  | 'projects'
  | 'tasks'
  | 'plugins'
  | 'design-systems'
  | 'integrations'
  // Multi-CLI fan-out side-by-side review. Surfaces every fanoutGroupId
  // bucket from /api/runs/fanout-groups so the user can compare outputs
  // and pick a winner.
  | 'compare'
  // Brand-component browser. Reads /api/components which scans every
  // built-in design system's components.html for class selectors.
  | 'components'
  // Welcome / feature tour. Distinct from the existing 'onboarding'
  // view (which is the BYOK/agent config wizard).
  | 'welcome'
  // Skill builder — write a new SKILL.md and save it to user-skills/.
  | 'agent-builder'
  | 'ship-readiness'
  | 'theme-lab';

interface Props {
  view: EntryView;
  onViewChange: (view: EntryView) => void;
  onNewProject: () => void;
}

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  tooltip: string;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}

function NavButton({ active, ariaLabel, tooltip, onClick, testId, children }: NavButtonProps) {
  return (
    <button
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      data-tooltip={tooltip}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {children}
    </button>
  );
}

export function EntryNavRail({ view, onViewChange, onNewProject }: Props) {
  const t = useT();
  const brandLabel = t('app.brand');
  const homeLabel = t('entry.navHome');
  const isHome = view === 'home';
  const logoTooltip = isHome ? brandLabel : `${brandLabel} · ${homeLabel}`;

  return (
    <nav className="entry-nav-rail" aria-label="Primary">
      <div className="entry-nav-rail__group">
        <button
          type="button"
          className={`entry-nav-rail__logo${isHome ? ' is-active' : ''}`}
          onClick={() => onViewChange('home')}
          aria-label={brandLabel}
          aria-current={isHome ? 'page' : undefined}
          data-tooltip={logoTooltip}
          data-testid="entry-nav-logo"
        >
          <img
            src="/app-icon.svg"
            alt=""
            className="entry-nav-rail__logo-img"
            draggable={false}
          />
        </button>
        <UpdaterPopup />
        <NavButton
          ariaLabel={t('entry.navNewProject')}
          tooltip={t('entry.navNewProject')}
          onClick={onNewProject}
          testId="entry-nav-new-project"
        >
          <Icon name="plus" size={18} />
        </NavButton>
        <NavButton
          active={view === 'projects'}
          ariaLabel={t('entry.navProjects')}
          tooltip={t('entry.navProjects')}
          onClick={() => onViewChange('projects')}
          testId="entry-nav-projects"
        >
          <Icon name="folder" size={18} />
        </NavButton>
        <NavButton
          active={view === 'tasks'}
          ariaLabel={t('entry.navTasks')}
          tooltip={t('entry.navTasks')}
          onClick={() => onViewChange('tasks')}
          testId="entry-nav-tasks"
        >
          <Icon name="kanban" size={18} />
        </NavButton>
        <NavButton
          active={view === 'design-systems'}
          ariaLabel={t('entry.navDesignSystems')}
          tooltip={t('entry.navDesignSystems')}
          onClick={() => onViewChange('design-systems')}
          testId="entry-nav-design-systems"
        >
          <Icon name="palette" size={18} />
        </NavButton>
        <NavButton
          active={view === 'compare'}
          ariaLabel={t('entry.navCompare')}
          tooltip={t('entry.navCompare')}
          onClick={() => onViewChange('compare')}
          testId="entry-nav-compare"
        >
          <Icon name="grid" size={18} />
        </NavButton>
        <NavButton
          active={view === 'components'}
          ariaLabel={t('entry.navComponents')}
          tooltip={t('entry.navComponents')}
          onClick={() => onViewChange('components')}
          testId="entry-nav-components"
        >
          <Icon name="file-code" size={18} />
        </NavButton>
        <NavButton
          active={view === 'theme-lab'}
          ariaLabel="Image to theme"
          tooltip="Image to theme"
          onClick={() => onViewChange('theme-lab')}
          testId="entry-nav-theme-lab"
        >
          <Icon name="image" size={18} />
        </NavButton>
        <NavButton
          active={view === 'ship-readiness'}
          ariaLabel="Ship readiness"
          tooltip="Ship readiness"
          onClick={() => onViewChange('ship-readiness')}
          testId="entry-nav-ship-readiness"
        >
          <Icon name="check" size={18} />
        </NavButton>
      </div>
      <div className="entry-nav-rail__footer">
        <div className="entry-nav-rail__divider" role="separator" />
        <NavButton
          active={view === 'plugins'}
          ariaLabel="Plugins"
          tooltip="Plugins"
          onClick={() => onViewChange('plugins')}
          testId="entry-nav-plugins"
        >
          <Icon name="grid" size={18} />
        </NavButton>
        <NavButton
          active={view === 'integrations'}
          ariaLabel={t('entry.navIntegrations')}
          tooltip={t('entry.navIntegrations')}
          onClick={() => onViewChange('integrations')}
          testId="entry-nav-integrations"
        >
          <Icon name="link" size={18} />
        </NavButton>
        <EntryHelpMenu />
      </div>
    </nav>
  );
}
