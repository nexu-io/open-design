import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Canvas, type FabricObject } from 'fabric';
import {
  platformSpecs,
  storeScreenshotTemplates,
  type StoreScreenshotChangeSet,
} from '@launch-studio/store-screenshot';
import { Input, Select, Textarea } from '@open-design/components';

import { useT } from '../../i18n';
import type {
  StoreScreenshotDocument,
  StoreScreenshotPlatform,
} from './api';
import { storeScreenshotAssetRawUrl } from './api';
import {
  fabricObjectToTextOperation,
  fabricObjectToTransformOperation,
  storeScreenshotPageToFabricObjects,
} from './fabric-adapter';
import styles from './StoreScreenshotEditor.module.css';

interface Props {
  projectId: string;
  document: StoreScreenshotDocument;
  page: StoreScreenshotDocument['pages'][number];
  platform: StoreScreenshotPlatform;
  onPreviewChangeSet: (changeSet: StoreScreenshotChangeSet) => void;
}

const EDITOR_WIDTH = 360;

export function StoreScreenshotEditor({
  projectId,
  document,
  page,
  platform,
  onPreviewChangeSet,
}: Props) {
  const t = useT();
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [headline, setHeadline] = useState(page.overrides[platform]?.headline ?? page.headline);
  const [body, setBody] = useState(page.overrides[platform]?.body ?? page.body ?? '');
  const [assetError, setAssetError] = useState(false);
  const locks = useMemo(() => new Set(page.lockedFields), [page.lockedFields]);
  const templateColors = storeScreenshotTemplates[page.templateId].colors;
  const visible = !(page.overrides[platform]?.hidden ?? page.hidden ?? false);
  const { width, height } = platformSpecs[platform].size;
  const editorHeight = Math.round(EDITOR_WIDTH * height / width);

  useEffect(() => {
    setHeadline(page.overrides[platform]?.headline ?? page.headline);
    setBody(page.overrides[platform]?.body ?? page.body ?? '');
  }, [page, platform]);

  useEffect(() => {
    const element = canvasElementRef.current;
    if (!element) return;
    const canvas = new Canvas(element, {
      width: EDITOR_WIDTH,
      height: editorHeight,
      selection: false,
      preserveObjectStacking: true,
    });
    let active = true;
    setAssetError(false);

    const handleObjectModified = ({ target }: { target?: FabricObject }) => {
      if (!target || locks.has('layout')) return;
      const operation = fabricObjectToTransformOperation(page.id, target);
      if (operation) emitChange(operation);
    };
    const handleTextEditingExited = ({ target }: { target: FabricObject }) => {
      const operation = fabricObjectToTextOperation(page.id, platform, target);
      if (!operation || locks.has(operation.field)) return;
      emitChange(operation);
    };
    canvas.on('object:modified', handleObjectModified);
    canvas.on('text:editing:exited', handleTextEditingExited);
    const assetUrl = page.screenshotAssetId
      ? storeScreenshotAssetRawUrl(projectId, page.screenshotAssetId)
      : undefined;
    void storeScreenshotPageToFabricObjects(
      document,
      page,
      platform,
      EDITOR_WIDTH,
      assetUrl,
    ).then((objects) => {
      if (!active) return;
      canvas.add(...objects);
      canvas.renderAll();
    }).catch(() => {
      if (active) setAssetError(true);
    });

    return () => {
      active = false;
      canvas.off('object:modified', handleObjectModified);
      canvas.off('text:editing:exited', handleTextEditingExited);
      void canvas.dispose();
    };

    function emitChange(operation: StoreScreenshotChangeSet['operations'][number]) {
      onPreviewChangeSet({
        baseVersion: document.version,
        operations: [operation],
      });
    }
  }, [
    document,
    editorHeight,
    locks,
    onPreviewChangeSet,
    page,
    platform,
    projectId,
  ]);

  const emit = (operation: StoreScreenshotChangeSet['operations'][number]) => {
    onPreviewChangeSet({
      baseVersion: document.version,
      operations: [operation],
    });
  };
  const emitText = (field: 'headline' | 'body', value: string) => {
    if (locks.has(field)) return;
    const current = field === 'headline'
      ? page.overrides[platform]?.headline ?? page.headline
      : page.overrides[platform]?.body ?? page.body ?? '';
    if (value === current) return;
    emit({ op: 'setText', pageId: page.id, field, value, platform });
  };
  const emitColor = (
    field: 'background' | 'accent' | 'text',
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    if (locks.has('layout')) return;
    emit({ op: 'setColor', pageId: page.id, field, value: event.target.value });
  };

  return (
    <div className={styles.editor}>
      <div className={styles.canvasStage}>
        <canvas
          ref={canvasElementRef}
          width={EDITOR_WIDTH}
          height={editorHeight}
          aria-label={t('storeScreenshots.editorCanvas')}
          data-testid="store-screenshot-editor-canvas"
        />
        {assetError ? <p className={styles.assetError} role="alert">{t('storeScreenshots.previewFailed')}</p> : null}
      </div>

      <aside className={styles.inspector} aria-label={t('storeScreenshots.editorInspector')}>
        <label className={styles.field}>
          <span>{t('storeScreenshots.headline')}</span>
          <Input
            aria-label={t('storeScreenshots.headline')}
            value={headline}
            disabled={locks.has('headline')}
            onChange={(event) => setHeadline(event.target.value)}
            onBlur={() => emitText('headline', headline)}
          />
        </label>

        <label className={styles.field}>
          <span>{t('storeScreenshots.body')}</span>
          <Textarea
            aria-label={t('storeScreenshots.body')}
            value={body}
            disabled={locks.has('body')}
            onChange={(event) => setBody(event.target.value)}
            onBlur={() => emitText('body', body)}
          />
        </label>

        <fieldset className={styles.colorFields} disabled={locks.has('layout')}>
          <legend>{t('storeScreenshots.colors')}</legend>
          {([
            ['background', 'storeScreenshots.backgroundColor'],
            ['accent', 'storeScreenshots.accentColor'],
            ['text', 'storeScreenshots.textColor'],
          ] as const).map(([field, key]) => (
            <label key={field} className={styles.colorField}>
              <span>{t(key)}</span>
              <Input
                type="color"
                aria-label={t(key)}
                value={page.colors?.[field] ?? templateColors[field]}
                onChange={(event) => emitColor(field, event)}
              />
            </label>
          ))}
        </fieldset>

        <label className={styles.field}>
          <span>{t('storeScreenshots.productScreenshot')}</span>
          <Select
            aria-label={t('storeScreenshots.productScreenshot')}
            value={page.screenshotAssetId ?? ''}
            disabled={locks.has('screenshot') || document.assets.length === 0}
            onChange={(event) => {
              if (!event.target.value || locks.has('screenshot')) return;
              emit({
                op: 'setAsset',
                pageId: page.id,
                assetId: event.target.value,
              });
            }}
          >
            <option value="">{t('storeScreenshots.noAsset')}</option>
            {document.assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.id}</option>
            ))}
          </Select>
        </label>

        <label className={styles.checkboxField}>
          <Input
            type="checkbox"
            aria-label={t('storeScreenshots.visibleOnPlatform')}
            checked={visible}
            disabled={locks.has('layout')}
            onChange={(event) => {
              if (locks.has('layout')) return;
              emit({
                op: 'setVisibility',
                pageId: page.id,
                visible: event.target.checked,
                platform,
              });
            }}
          />
          <span>{t('storeScreenshots.visibleOnPlatform')}</span>
        </label>

        {page.lockedFields.length > 0 ? (
          <p className={styles.lockNotice}>{t('storeScreenshots.lockedFieldsNotice')}</p>
        ) : null}
      </aside>
    </div>
  );
}
