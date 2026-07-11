// Wired viewport-preset dropdown for the artifact preview toolbar. Dismisses
// on an outside pointerdown or Escape via the injected dismiss port.
import { useId } from 'react';
import { Icon } from '../../../components/Icon';
import { RemixIcon } from '../../../components/RemixIcon';
import { useWiredPreviewViewportMenu } from '../hooks/usePreviewViewportMenu.hooks';
import { PREVIEW_VIEWPORT_PRESETS } from '../constants';
import { previewViewportIcon } from '../rules';
import type { PreviewViewportId, TranslateFn } from '../types';

export function PreviewViewportControls({
  viewport,
  onViewport,
  t,
  tabIndex,
}: {
  viewport: PreviewViewportId;
  onViewport: (viewport: PreviewViewportId) => void;
  t: TranslateFn;
  tabIndex?: number;
}) {
  const { open, setOpen, menuRef } = useWiredPreviewViewportMenu();
  const listboxId = useId();
  const activePreset =
    PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === viewport) ?? PREVIEW_VIEWPORT_PRESETS[0]!;

  return (
    <div className="viewer-viewport-switcher" ref={menuRef}>
      <button
        type="button"
        className={`viewer-action viewer-viewport-trigger${open ? '' : ' od-tooltip'}`}
        aria-label={t('fileViewer.viewportAria')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        title={t(activePreset.titleKey)}
        data-tooltip={open ? undefined : t(activePreset.titleKey)}
        data-tooltip-placement="bottom"
        tabIndex={tabIndex}
        onClick={() => setOpen(!open)}
      >
        <RemixIcon
          name={previewViewportIcon(activePreset.id)}
          size={14}
          className="viewer-viewport-icon"
        />
        <span>{t(activePreset.labelKey)}</span>
        <RemixIcon name="arrow-down-s-line" size={14} />
      </button>
      {open ? (
        <div className="viewer-viewport-menu" id={listboxId} role="listbox" aria-label={t('fileViewer.viewportAria')}>
          {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
            const selected = viewport === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`viewer-viewport-menu-item${selected ? ' active' : ''}`}
                role="option"
                aria-selected={selected}
                title={t(preset.titleKey)}
                onClick={() => {
                  onViewport(preset.id);
                  setOpen(false);
                }}
              >
                <span className="viewer-viewport-menu-label">
                  <RemixIcon name={previewViewportIcon(preset.id)} size={14} />
                  <span>{t(preset.labelKey)}</span>
                </span>
                {selected ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
