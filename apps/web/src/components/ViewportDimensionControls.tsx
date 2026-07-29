import { useEffect, useState } from 'react';
import { Button, Input } from '@open-design/components';

import { useT } from '../i18n';
import { RemixIcon } from './RemixIcon';
import {
  PREVIEW_VIEWPORT_MAX_SIZE,
  PREVIEW_VIEWPORT_MIN_SIZE,
  customPreviewViewport,
  isFixedPreviewViewport,
  isValidPreviewViewportDimension,
  previewViewportPreset,
  swapPreviewViewportOrientation,
  type PreviewViewport,
} from './preview-viewports';
import styles from './ViewportDimensionControls.module.css';

export function ViewportDimensionControls({
  onViewport,
  viewport,
}: {
  onViewport: (viewport: PreviewViewport) => void;
  viewport: PreviewViewport;
}) {
  const t = useT();
  const fallback = previewViewportPreset('desktop-1440');
  const [width, setWidth] = useState(String(viewport.width ?? fallback.width));
  const [height, setHeight] = useState(String(viewport.height ?? fallback.height));

  useEffect(() => {
    setWidth(String(viewport.width ?? fallback.width));
    setHeight(String(viewport.height ?? fallback.height));
  }, [fallback.height, fallback.width, viewport.height, viewport.width]);

  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const valid = isValidPreviewViewportDimension(parsedWidth)
    && isValidPreviewViewportDimension(parsedHeight);

  function applyCustomViewport() {
    if (!valid) return;
    onViewport(customPreviewViewport(parsedWidth, parsedHeight));
  }

  function swapOrientation() {
    if (!isFixedPreviewViewport(viewport)) return;
    const swapped = swapPreviewViewportOrientation(viewport);
    setWidth(String(swapped.width));
    setHeight(String(swapped.height));
    onViewport(swapped);
  }

  return (
    <form
      className={styles.controls}
      onSubmit={(event) => {
        event.preventDefault();
        applyCustomViewport();
      }}
    >
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel} aria-hidden>W</span>
          <Input
            aria-label={t('fileViewer.viewportWidth')}
            className={styles.input}
            inputMode="numeric"
            max={PREVIEW_VIEWPORT_MAX_SIZE}
            min={PREVIEW_VIEWPORT_MIN_SIZE}
            onChange={(event) => setWidth(event.target.value)}
            step={1}
            type="number"
            value={width}
          />
        </label>
        <span className={styles.separator} aria-hidden>×</span>
        <label className={styles.field}>
          <span className={styles.fieldLabel} aria-hidden>H</span>
          <Input
            aria-label={t('fileViewer.viewportHeight')}
            className={styles.input}
            inputMode="numeric"
            max={PREVIEW_VIEWPORT_MAX_SIZE}
            min={PREVIEW_VIEWPORT_MIN_SIZE}
            onChange={(event) => setHeight(event.target.value)}
            step={1}
            type="number"
            value={height}
          />
        </label>
        <Button
          aria-label={t('fileViewer.viewportSwapOrientation')}
          className={styles.swapButton}
          disabled={!isFixedPreviewViewport(viewport)}
          size="icon"
          title={t('fileViewer.viewportSwapOrientation')}
          type="button"
          variant="ghost"
          onClick={swapOrientation}
        >
          <RemixIcon name="aspect-ratio-line" size={14} />
        </Button>
      </div>
      <Button
        aria-label={t('fileViewer.viewportApplyCustom')}
        className={styles.applyButton}
        disabled={!valid}
        type="submit"
        variant="primary"
      >
        {t('fileViewer.viewportApplyCustom')}
      </Button>
    </form>
  );
}
