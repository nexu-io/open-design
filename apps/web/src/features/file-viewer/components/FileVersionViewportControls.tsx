// Dumb viewport-preset toggle group for the file-version modal's preview.
import { RemixIcon } from '../../../components/RemixIcon';
import { PREVIEW_VIEWPORT_PRESETS } from '../constants';
import { previewViewportIcon } from '../rules';
import type { PreviewViewportId, TranslateFn } from '../types';

export function FileVersionViewportControls({
  viewport,
  onViewport,
  t,
}: {
  viewport: PreviewViewportId;
  onViewport: (viewport: PreviewViewportId) => void;
  t: TranslateFn;
}) {
  return (
    <div className="file-version-viewport-toggle" role="group" aria-label={t('fileViewer.viewportAria')}>
      {PREVIEW_VIEWPORT_PRESETS.map((preset) => {
        const selected = viewport === preset.id;
        const label = t(preset.titleKey);
        return (
          <button
            key={preset.id}
            type="button"
            className={`file-version-viewport-button od-tooltip${selected ? ' active' : ''}`}
            aria-label={label}
            aria-pressed={selected}
            title={label}
            data-tooltip={label}
            data-tooltip-placement="bottom"
            onClick={() => onViewport(preset.id)}
          >
            <RemixIcon name={previewViewportIcon(preset.id)} size={14} />
          </button>
        );
      })}
    </div>
  );
}
