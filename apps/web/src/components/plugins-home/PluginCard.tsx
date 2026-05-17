// Single plugin card rendered inside the plugins-home grid.
//
// Each card is a hero preview tile + a small metadata footer. The
// hero region adapts to the plugin type (image / video poster,
// sandboxed HTML iframe, design-system patch, plain text) — the
// classifier in `./preview.ts` picks the right surface and the
// shared `PreviewSurface` switchboard mounts it lazily so a
// 350-tile grid stays cheap.
//
// Hover reveals an overlay with the plugin description, tag chips,
// and primary actions (Use / Details), so the resting state stays
// gallery-clean while the active state surfaces everything the user
// needs to commit.

import { useMemo, useState } from 'react';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { PluginShareAction } from '../../state/projects';
import { Icon } from '../Icon';
import { PreviewSurface } from './cards/PreviewSurface';
import { inferPluginPreview } from './preview';
import type { PluginUseAction } from './useActions';

interface Props {
  record: InstalledPluginRecord;
  isActive: boolean;
  isPending: boolean;
  pendingAny: boolean;
  pendingShareAction?: { pluginId: string; action: PluginShareAction } | null;
  isFeatured: boolean;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
  onShareAction?: (
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) => void;
}

const MAX_VISIBLE_TAGS = 3;

export function PluginCard({
  record,
  isActive,
  isPending,
  pendingAny,
  pendingShareAction = null,
  isFeatured,
  onUse,
  onOpenDetails,
  onShareAction,
}: Props) {
  const [useMenuOpen, setUseMenuOpen] = useState(false);
  const preview = useMemo(() => inferPluginPreview(record), [record]);
  const description = record.manifest?.description ?? '';
  const tags = useMemo(
    () =>
      (record.manifest?.tags ?? [])
        .filter((t) => !NOISE_TAGS.has(t.toLowerCase()))
        .slice(0, MAX_VISIBLE_TAGS),
    [record.manifest?.tags],
  );
  const hasQuery = Boolean(record.manifest?.od?.useCase?.query);
  const sharePendingAction =
    pendingShareAction?.pluginId === record.id ? pendingShareAction.action : null;
  const shareBusy = sharePendingAction !== null;
  const useDisabled = isPending || pendingAny || shareBusy;

  function pickUseAction(action: PluginUseAction) {
    setUseMenuOpen(false);
    onUse(record, action);
  }

  return (
    <article
      role="listitem"
      className={[
        'plugins-home__card',
        `plugins-home__card--${preview.kind}`,
        onShareAction ? 'plugins-home__card--shareable' : '',
        isActive ? 'is-active' : '',
        isFeatured ? 'is-featured' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-plugin-id={record.id}
      data-preview-kind={preview.kind}
      {...(isFeatured ? { 'data-featured': 'true' } : {})}
    >
      <PreviewSurface
        pluginId={record.id}
        pluginTitle={record.title}
        preview={preview}
      />

      <div className="plugins-home__card-overlay">
        <div className="plugins-home__card-overlay-top">
          <span className={`plugins-home__trust trust-${record.trust}`}>
            {record.trust}
          </span>
          {isFeatured ? (
            <span className="plugins-home__overlay-featured" aria-hidden>
              <Icon name="star" size={11} />
            </span>
          ) : null}
        </div>
        <div className="plugins-home__card-overlay-body">
          <span className="plugins-home__overlay-title" title={record.title}>
            {record.title}
          </span>
          {description ? (
            <p className="plugins-home__overlay-desc">{description}</p>
          ) : null}
          {tags.length > 0 ? (
            <div className="plugins-home__overlay-tags">
              {tags.map((t) => (
                <span key={t} className="plugins-home__overlay-tag">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="plugins-home__overlay-actions">
          <div className="plugins-home__overlay-actions-main">
            <button
              type="button"
              className="plugins-home__action plugins-home__action--secondary"
              onClick={() => onOpenDetails(record)}
              aria-label={`View details for ${record.title}`}
              data-testid={`plugins-home-details-${record.id}`}
            >
              <Icon name="eye" size={12} />
              <span>Details</span>
            </button>
            <div
              className={`plugins-home__use-menu${hasQuery ? ' has-options' : ''}`}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setUseMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="plugins-home__action plugins-home__action--primary plugins-home__use-main"
                onClick={() => pickUseAction('use')}
                disabled={useDisabled}
                aria-busy={isPending ? 'true' : undefined}
                data-testid={`plugins-home-use-${record.id}`}
              >
                {isPending ? 'Applying…' : 'Use'}
              </button>
              {hasQuery ? (
                <>
                  <button
                    type="button"
                    className="plugins-home__action plugins-home__action--primary plugins-home__use-toggle"
                    onClick={() => setUseMenuOpen((open) => !open)}
                    disabled={useDisabled}
                    aria-haspopup="menu"
                    aria-expanded={useMenuOpen}
                    aria-label={`Choose how to use ${record.title}`}
                    data-testid={`plugins-home-use-menu-${record.id}`}
                  >
                    <Icon name="chevron-down" size={13} />
                  </button>
                  {useMenuOpen ? (
                    <div
                      className="plugins-home__use-menu-list"
                      role="menu"
                      aria-label={`Use options for ${record.title}`}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="plugins-home__use-menu-item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickUseAction('use')}
                        data-testid={`plugins-home-use-context-${record.id}`}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="plugins-home__use-menu-item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickUseAction('use-with-query')}
                        data-testid={`plugins-home-use-with-query-${record.id}`}
                      >
                        Use with query
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {onShareAction ? (
            <div
              className="plugins-home__share-actions"
              aria-label={`Share ${record.title}`}
            >
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary plugins-home__action--compact"
                onClick={() => onShareAction(record, 'publish-github')}
                disabled={pendingAny || shareBusy}
                aria-busy={sharePendingAction === 'publish-github' ? 'true' : undefined}
                aria-label={`Publish ${record.title} as a GitHub repository`}
                title="Publish plugin as a GitHub repository"
                data-testid={`plugins-home-publish-github-${record.id}`}
              >
                <Icon
                  name={sharePendingAction === 'publish-github' ? 'spinner' : 'github'}
                  size={12}
                />
                <span>{sharePendingAction === 'publish-github' ? 'Starting…' : 'Publish'}</span>
              </button>
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary plugins-home__action--compact"
                onClick={() => onShareAction(record, 'contribute-open-design')}
                disabled={pendingAny || shareBusy}
                aria-busy={sharePendingAction === 'contribute-open-design' ? 'true' : undefined}
                aria-label={`Contribute ${record.title} to Open Design`}
                title="Contribute plugin to Open Design with a pull request"
                data-testid={`plugins-home-contribute-open-design-${record.id}`}
              >
                <Icon
                  name={sharePendingAction === 'contribute-open-design' ? 'spinner' : 'share'}
                  size={12}
                />
                <span>{sharePendingAction === 'contribute-open-design' ? 'Starting…' : 'Contribute'}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="plugins-home__card-foot">
        <span className="plugins-home__card-title" title={record.title}>
          {isFeatured ? (
            <Icon
              name="star"
              size={11}
              className="plugins-home__card-featured-mark"
            />
          ) : null}
          {record.title}
        </span>
        <span className={`plugins-home__trust trust-${record.trust}`}>
          {record.trust}
        </span>
      </div>
    </article>
  );
}

const NOISE_TAGS = new Set<string>([
  'first-party',
  'third-party',
  'phase-1',
  'phase-7',
  'untitled',
  'plugin',
]);
