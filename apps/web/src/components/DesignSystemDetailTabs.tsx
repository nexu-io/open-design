import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../i18n';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import type { WorkspaceResourceReadIdentity } from '../collab/workspace-identity';
import { workspaceResourceReadIdentityKey } from '../collab/workspace-identity';
import type { DesignKit } from '../runtime/design-kit';
import type { DesignSystemDetail, DesignSystemSummary } from '../types';
import { DesignKitView, type DesignKitModule, type DesignKitViewProps } from './DesignKitView';
import { DesignSystemLogo } from './DesignSystemLogo';
import { DesignSystemTheme } from './DesignSystemTheme';
import { useDesignSystemTokens } from './useDesignSystemTokens';
import styles from './DesignSystemDetailTabs.module.css';

const TABS = [
  { id: 'theme', label: 'ds.detailTheme' },
  { id: 'components', label: 'ds.detailComponents' },
  { id: 'graphics', label: 'ds.detailGraphics' },
  { id: 'guidelines', label: 'ds.detailGuidelines' },
] as const;
type Section = typeof TABS[number]['id'];
const MODULES: Record<Section, readonly DesignKitModule[]> = {
  theme: ['typography'],
  components: ['designSystem', 'assets'],
  graphics: ['logo', 'images'],
  guidelines: ['identity', 'voice', 'imageryLayout'],
};

interface Props {
  system: DesignSystemSummary;
  kit: DesignKit | null;
  packageInfo?: DesignSystemDetail['packageInfo'];
  body?: string;
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  backSlot: ReactNode;
  actionsSlot?: ReactNode;
  badgeSlot?: ReactNode;
  noticeSlot?: ReactNode;
  loadingSlot?: ReactNode;
  onEditClick?: DesignKitViewProps['onEditClick'];
}

export function DesignSystemDetailTabs({
  system, kit, packageInfo, body, resourceReadIdentity, backSlot, actionsSlot,
  badgeSlot, noticeSlot, loadingSlot, onEditClick,
}: Props) {
  const t = useT();
  const id = useId();
  const [active, setActive] = useState<Section>('theme');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const guidelinesHtml = useMemo(() => body ? renderMarkdownToSafeHtml(body) : '', [body]);
  const readGeneration = workspaceResourceReadIdentityKey(resourceReadIdentity);
  const tokens = useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity });
  const kitView = kit ? <DesignKitView key={active}
    kit={kit} workspaceContext={resourceReadIdentity?.context ?? null}
    workspaceReadGeneration={readGeneration} showHeader={false} showCover={false}
    modules={MODULES[active]} onEditClick={onEditClick}
    foundationTokens={active === 'theme' ? tokens : undefined}
    dataTestId={`design-kit-view-${system.id}`} /> : null;

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.identity}>
          {backSlot}
          <DesignSystemLogo system={system} resourceReadIdentity={resourceReadIdentity} enabled />
          <h1 className={styles.name}>{system.title}</h1>
          {badgeSlot}
        </div>
        <div className={styles.tabs} role="tablist" aria-label={t('ds.detailNavigation')}>
          {TABS.map((tab, index) => (
            <Button key={tab.id} ref={(node) => { tabRefs.current[index] = node; }}
              variant="ghost" role="tab" id={`${id}-${tab.id}`} aria-controls={`${id}-panel`}
              aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
              className={styles.tab} onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
                let next: number;
                if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = TABS.length - 1;
                else if (event.key === 'ArrowRight') next = (index + (rtl ? -1 : 1) + TABS.length) % TABS.length;
                else if (event.key === 'ArrowLeft') next = (index + (rtl ? 1 : -1) + TABS.length) % TABS.length;
                else return;
                event.preventDefault();
                setActive(TABS[next]!.id);
                tabRefs.current[next]?.focus();
              }}>
              {t(tab.label)}
            </Button>
          ))}
        </div>
        <div className={styles.actions}>{actionsSlot}</div>
      </header>
      {noticeSlot}
      <div key={active} className={styles.panel} role="tabpanel" id={`${id}-panel`}
        aria-labelledby={`${id}-${active}`} tabIndex={0} data-section={active}>
        {!kit ? loadingSlot : active === 'theme' ? (
          <>
            <DesignSystemTheme kit={kit} packageInfo={packageInfo} resourceReadIdentity={resourceReadIdentity} tokens={tokens} />
            {kitView}
          </>
        ) : active === 'components' ? (
          kit.system || kit.assets?.length ? kitView : <p className={styles.empty}>{t('ds.detailEmpty')}</p>
        ) : active === 'guidelines' && guidelinesHtml ? (
          <article className={styles.guidelines} dangerouslySetInnerHTML={{ __html: guidelinesHtml }} />
        ) : kitView}
      </div>
    </div>
  );
}
