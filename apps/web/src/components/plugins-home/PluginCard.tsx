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
import { VisuallyHidden } from '@open-design/components';
import type { InstalledPluginRecord } from '@open-design/contracts';
import { useI18n } from '../../i18n';
import type { PluginShareAction } from '../../state/projects';
import { Icon } from '../Icon';
import { TrustBadge } from '../TrustBadge';
import { PreviewSurface } from './cards/PreviewSurface';
import { canDuplicatePluginPreview } from './duplicate';
import { localizePluginDescription, localizePluginTitle } from './localization';
import { inferPluginPreview } from './preview';
import type { PluginUseAction } from './useActions';

interface Props {
  record: InstalledPluginRecord;
  isActive: boolean;
  isPending: boolean;
  pendingAny: boolean;
  isDuplicatePending: boolean;
  pendingDuplicateAny: boolean;
  pendingShareAction?: { pluginId: string; action: PluginShareAction } | null;
  isFeatured: boolean;
  // Saved collection (rich layout only — the gallery tile has no save UI).
  isSaved: boolean;
  onSave: (record: InstalledPluginRecord) => void;
  onUse: (record: InstalledPluginRecord, action: PluginUseAction) => void;
  onDuplicate?: (record: InstalledPluginRecord) => void;
  onOpenDetails: (record: InstalledPluginRecord) => void;
  onShareAction?: (
    record: InstalledPluginRecord,
    action: PluginShareAction,
  ) => void;
  // 'rich' (default) keeps the hover-overlay metadata card. 'gallery'
  // is the minimal live-preview tile: a top bar (dot + name + open
  // fullscreen) over an eagerly-rendered example.html iframe.
  layout?: 'rich' | 'gallery';
}

const MAX_VISIBLE_TAGS = 3;

export function PluginCard({
  record,
  isActive,
  isPending,
  pendingAny,
  isDuplicatePending,
  pendingDuplicateAny,
  pendingShareAction = null,
  isFeatured,
  isSaved,
  onSave,
  onUse,
  onDuplicate,
  onOpenDetails,
  onShareAction,
  layout = 'rich',
}: Props) {
  const { locale, t } = useI18n();
  const [useMenuOpen, setUseMenuOpen] = useState(false);
  // Tiles prefer the cheap pre-baked hover-pan clip; the detail modal still
  // opens the live interactive page (it calls inferPluginPreview without this).
  const preview = useMemo(() => inferPluginPreview(record, { preferBaked: true }), [record]);
  const title = localizePluginTitle(locale, record);
  const description = localizePluginDescription(locale, record);
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
  const canDuplicate = Boolean(onDuplicate) && canDuplicatePluginPreview(record);
  const duplicateDisabled = isDuplicatePending || pendingDuplicateAny || pendingAny || shareBusy;

  function pickUseAction(action: PluginUseAction) {
    setUseMenuOpen(false);
    onUse(record, action);
  }

  if (layout === 'gallery') {
    // Live-preview tile: a macOS-window-style bar (status dot + plugin
    // name) over an eagerly-rendered example.html iframe. The whole tile
    // opens the detail surface.
    // Decks render a fixed 16:9 stage; tag them so the gallery preview uses a
    // 16:9 frame instead of the tall scroll-preview viewport (which would
    // letterbox the stage and show a dark band above/below the slide).
    const odMode = (record.manifest?.od as { mode?: unknown } | undefined)?.mode;
    return (
      <article
        role="listitem"
        className={[
          'plugins-home__card',
          'plugins-home__card--gallery',
          `plugins-home__card--${preview.kind}`,
          isActive ? 'is-active' : '',
          isFeatured ? 'is-featured' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-plugin-id={record.id}
        data-preview-kind={preview.kind}
        {...(typeof odMode === 'string' ? { 'data-od-mode': odMode } : {})}
        {...(isFeatured ? { 'data-featured': 'true' } : {})}
        // Mouse convenience: clicking anywhere on the tile opens details.
        // Keyboard/AT users get a real, announced control via the title
        // button below — the tile itself stays a non-interactive listitem
        // so screen readers don't announce a bare "listitem" as actionable.
        onClick={() => onOpenDetails(record)}
      >
        <div className="plugins-home__gallery-bar">
          <span className="plugins-home__gallery-dot" aria-hidden />
          <button
            type="button"
            className="plugins-home__gallery-name"
            title={title}
            aria-label={t('pluginCard.detailsAria', { title })}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(record);
            }}
            // The accessible, focusable control that opens the detail modal;
            // also the e2e/visual hook equivalent to the rich card's Details.
            data-testid={`plugins-home-details-${record.id}`}
          >
            {title}
          </button>
        </div>
        <div className="plugins-home__gallery-frame">
          <PreviewSurface
            pluginId={record.id}
            pluginTitle={title}
            preview={preview}
            eager
          />
          <div className="plugins-home__gallery-actions">
            <button
              type="button"
              className="plugins-home__action plugins-home__action--primary"
              onClick={(event) => {
                event.stopPropagation();
                pickUseAction('use');
              }}
              disabled={useDisabled}
              aria-busy={isPending ? 'true' : undefined}
              data-testid={`plugins-home-use-${record.id}`}
            >
              <Icon name={isPending ? 'spinner' : 'play'} size={12} />
              <span>{isPending ? t('pluginCard.applying') : t('pluginCard.use')}</span>
            </button>
            {canDuplicate ? (
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicate?.(record);
                }}
                disabled={duplicateDisabled}
                aria-busy={isDuplicatePending ? 'true' : undefined}
                aria-label={t('pluginCard.duplicateAria', { title })}
                data-testid={`plugins-home-duplicate-${record.id}`}
              >
                <Icon name={isDuplicatePending ? 'spinner' : 'copy'} size={12} />
                <span>{isDuplicatePending ? t('pluginCard.duplicating') : t('pluginCard.duplicate')}</span>
              </button>
            ) : null}
          </div>
        </div>
      </article>
    );
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
        pluginTitle={title}
        preview={preview}
      />

      <div className="plugins-home__card-overlay">
        <div className="plugins-home__card-overlay-top">
          <TrustBadge trust={record.trust} variant="overlay" />
          {isFeatured ? (
            <span className="plugins-home__overlay-featured" aria-hidden>
              <Icon name="star" size={11} />
            </span>
          ) : null}
        </div>
        <div className="plugins-home__card-overlay-body">
          <span className="plugins-home__overlay-title" title={title}>
            {title}
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
              aria-label={t('pluginCard.detailsAria', { title })}
              data-testid={`plugins-home-details-${record.id}`}
            >
              <Icon name="eye" size={12} />
              <span>{t('pluginCard.details')}</span>
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
                {isPending ? t('pluginCard.applying') : t('pluginCard.use')}
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
                    aria-label={t('pluginCard.chooseUseAria', { title })}
                    data-testid={`plugins-home-use-menu-${record.id}`}
                  >
                    <Icon name="chevron-down" size={13} />
                  </button>
                  {useMenuOpen ? (
                    <div
                      className="plugins-home__use-menu-list"
                      role="menu"
                      aria-label={t('pluginCard.useOptionsAria', { title })}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="plugins-home__use-menu-item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickUseAction('use')}
                        data-testid={`plugins-home-use-context-${record.id}`}
                      >
                        {t('pluginCard.use')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="plugins-home__use-menu-item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => pickUseAction('use-with-query')}
                        data-testid={`plugins-home-use-with-query-${record.id}`}
                      >
                        {t('pluginCard.useWithQuery')}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
            {canDuplicate ? (
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary"
                onClick={() => onDuplicate?.(record)}
                disabled={duplicateDisabled}
                aria-busy={isDuplicatePending ? 'true' : undefined}
                aria-label={t('pluginCard.duplicateAria', { title })}
                data-testid={`plugins-home-duplicate-${record.id}`}
              >
                <Icon name={isDuplicatePending ? 'spinner' : 'copy'} size={12} />
                <span>{isDuplicatePending ? t('pluginCard.duplicating') : t('pluginCard.duplicate')}</span>
              </button>
            ) : null}
          </div>
          {onShareAction ? (
            <div
              className="plugins-home__share-actions"
              aria-label={t('pluginCard.shareAria', { title })}
            >
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary plugins-home__action--compact"
                onClick={() => onShareAction(record, 'publish-github')}
                disabled={pendingAny || shareBusy}
                aria-busy={sharePendingAction === 'publish-github' ? 'true' : undefined}
                aria-label={t('pluginCard.publishAria', { title })}
                title={t('pluginCard.publishTitle')}
                data-testid={`plugins-home-publish-github-${record.id}`}
              >
                <Icon
                  name={sharePendingAction === 'publish-github' ? 'spinner' : 'github'}
                  size={12}
                />
                <span>{sharePendingAction === 'publish-github' ? t('pluginCard.starting') : t('pluginCard.publish')}</span>
              </button>
              <button
                type="button"
                className="plugins-home__action plugins-home__action--secondary plugins-home__action--compact"
                onClick={() => onShareAction(record, 'contribute-open-design')}
                disabled={pendingAny || shareBusy}
                aria-busy={sharePendingAction === 'contribute-open-design' ? 'true' : undefined}
                aria-label={t('pluginCard.contributeAria', { title })}
                title={t('pluginCard.contributeTitle')}
                data-testid={`plugins-home-contribute-open-design-${record.id}`}
              >
                <Icon
                  name={sharePendingAction === 'contribute-open-design' ? 'spinner' : 'share'}
                  size={12}
                />
                <span>{sharePendingAction === 'contribute-open-design' ? t('pluginCard.starting') : t('pluginCard.contribute')}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="plugins-home__card-foot">
        <button
          type="button"
          className={[
            'plugins-home__card-save',
            isSaved ? 'is-saved' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onSave(record)}
          aria-pressed={isSaved}
          aria-label={isSaved
            ? t('pluginCard.savedAria', { title })
            : t('pluginCard.saveAria', { title })}
          title={isSaved ? t('pluginCard.saved') : t('common.save')}
          data-testid={`plugins-home-save-${record.id}`}
        >
          <Icon name={isSaved ? 'check' : 'star'} size={12} />
          <VisuallyHidden>{isSaved ? t('pluginCard.saved') : t('common.save')}</VisuallyHidden>
        </button>
        <span className="plugins-home__card-title" title={title}>
          <span className="plugins-home__card-title-text">{title}</span>
        </span>
        <TrustBadge trust={record.trust} />
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
