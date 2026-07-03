import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  exportToBlob,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useI18n, type Locale } from '../i18n';
import { Icon } from './Icon';
import { Toast } from './Toast';
import { readDefaultSketchToolColor } from './sketch-colors';
import {
  emptySketchScene,
  sanitizeExcalidrawAppState,
  sketchSceneHasContent,
  type ExcalidrawSketchScene,
  type SketchItem,
} from './sketch-model';

const SAVED_VISIBLE_MS = 2000;
const EXPORTED_IMAGE_MIME_TYPE = 'image/png';

interface SketchSceneChangeOptions {
  markDirty?: boolean;
  discardLegacyItems?: boolean;
}

interface SketchExportedImageResult {
  fileName: string;
}

type SketchExportImageResult = boolean | void | SketchExportedImageResult;

interface SketchToastState {
  message: string;
  details?: string | null;
  tone: 'default' | 'success' | 'error' | 'loading';
  actionFileName?: string;
}

type SketchTooltipLabelKey =
  | 'mainMenu'
  | 'lock'
  | 'hand'
  | 'selection'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'text'
  | 'image'
  | 'eraser'
  | 'frame'
  | 'embeddable'
  | 'laser'
  | 'moreTools';

type SketchTooltipLabels = Record<SketchTooltipLabelKey, string>;

interface Props {
  scene: ExcalidrawSketchScene;
  legacyItems?: SketchItem[];
  hasPreservedRawItems?: boolean;
  onSceneChange: (scene: ExcalidrawSketchScene, options?: SketchSceneChangeOptions) => void;
  onClear?: () => void;
  onSave: (scene?: ExcalidrawSketchScene) => Promise<boolean | void> | boolean | void;
  onExportImage?: (
    base64: string,
    fileName: string,
    scene: ExcalidrawSketchScene,
  ) => Promise<SketchExportImageResult> | SketchExportImageResult;
  onOpenExportedImage?: (fileName: string) => void;
  saving?: boolean;
  dirty?: boolean;
  savedAt?: number;
  fileName: string;
}

export function SketchEditor({
  scene,
  legacyItems = [],
  hasPreservedRawItems = false,
  onSceneChange,
  onClear,
  onSave,
  onExportImage,
  onOpenExportedImage,
  saving = false,
  dirty = false,
  savedAt,
  fileName,
}: Props) {
  const { t, locale } = useI18n();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [theme, setTheme] = useState(readExcalidrawTheme);
  const [toast, setToast] = useState<SketchToastState | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSceneChangeRef = useLatestRef(onSceneChange);
  const onClearRef = useLatestRef(onClear);
  const onSaveRef = useLatestRef(onSave);
  const onExportImageRef = useLatestRef(onExportImage);
  const onOpenExportedImageRef = useLatestRef(onOpenExportedImage);
  const sceneRef = useLatestRef(scene);
  const fileNameRef = useLatestRef(fileName);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const skipHydrationChangeRef = useRef(true);
  const lastContentSignatureRef = useRef<string | null>(null);
  const editorInstanceKey = `${fileName}:${resetNonce}`;
  const previousEditorInstanceKeyRef = useRef<string | null>(null);
  const initialDataRef = useRef<{
    key: string;
    value: ExcalidrawInitialDataState;
  } | null>(null);

  if (previousEditorInstanceKeyRef.current !== editorInstanceKey) {
    previousEditorInstanceKeyRef.current = editorInstanceKey;
    skipHydrationChangeRef.current = true;
    lastContentSignatureRef.current = null;
  }

  let initialDataEntry = initialDataRef.current;
  if (!initialDataEntry || initialDataEntry.key !== editorInstanceKey) {
    initialDataEntry = {
      key: editorInstanceKey,
      value: buildInitialData(scene, legacyItems, fileName),
    };
    initialDataRef.current = initialDataEntry;
  }
  const initialData = initialDataEntry.value;

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readExcalidrawTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => setTheme(readExcalidrawTheme());
    media?.addEventListener('change', handleSystemThemeChange);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (dirty) {
      clearTimeout(savedTimerRef.current);
      setShowSaved(false);
    }
  }, [dirty]);

  useEffect(() => {
    if (!savedAt || dirty || saving) return;
    setShowSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
  }, [dirty, savedAt, saving]);

  const sketchTooltipLabels = useMemo<SketchTooltipLabels>(() => ({
    mainMenu: t('sketch.tooltipMainMenu'),
    lock: t('sketch.tooltipLock'),
    hand: t('sketch.tooltipHand'),
    selection: t('sketch.tooltipSelection'),
    rectangle: t('sketch.tooltipRectangle'),
    diamond: t('sketch.tooltipDiamond'),
    ellipse: t('sketch.tooltipEllipse'),
    arrow: t('sketch.tooltipArrow'),
    line: t('sketch.tooltipLine'),
    freedraw: t('sketch.tooltipFreedraw'),
    text: t('sketch.tooltipText'),
    image: t('sketch.tooltipImage'),
    eraser: t('sketch.tooltipEraser'),
    frame: t('sketch.tooltipFrame'),
    embeddable: t('sketch.tooltipEmbeddable'),
    laser: t('sketch.tooltipLaser'),
    moreTools: t('sketch.tooltipMoreTools'),
  }), [t]);

  const closeActiveSketchDialog = useCallback(() => {
    apiRef.current?.updateScene({ appState: { openDialog: null } });
  }, []);

  useEffect(() => {
    const root = canvasWrapRef.current;
    if (!root) return;

    let frame: number | null = null;
    const applyEnhancements = () => {
      frame = null;
      applySketchEditorTooltips(root, sketchTooltipLabels);
      applySketchDomI18nOverrides(root, locale);
      applySketchContextMenuSimplification(root, root);
      applySketchContextMenuSimplification(document.body, root);
      rewriteExcalidrawUnableToEmbedToasts(root, sketchTooltipLabels.embeddable);
      rewriteExcalidrawUnableToEmbedToasts(document.body, sketchTooltipLabels.embeddable);
      enhanceSketchExcalidrawPortals(locale, closeActiveSketchDialog);
    };
    const scheduleEnhancements = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(applyEnhancements);
    };
    scheduleEnhancements();

    const observer = new MutationObserver(scheduleEnhancements);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!document.querySelector('.od-sketch-modal .Modal')) return;
      event.preventDefault();
      event.stopPropagation();
      closeActiveSketchDialog();
    };
    const handleCommandEnter = (event: KeyboardEvent) => {
      handleSketchPortalCommandEnter(event);
    };
    document.addEventListener('keydown', handleEscape, true);
    document.addEventListener('keydown', handleCommandEnter, true);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('keydown', handleCommandEnter, true);
    };
  }, [closeActiveSketchDialog, locale, sketchTooltipLabels]);

  const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, appState, files) => {
    const contentSignature = sceneContentSignature(elements, appState, files);
    if (skipHydrationChangeRef.current) {
      skipHydrationChangeRef.current = false;
      lastContentSignatureRef.current = contentSignature;
      return;
    }
    if (lastContentSignatureRef.current === contentSignature) return;
    lastContentSignatureRef.current = contentSignature;

    onSceneChangeRef.current(sceneFromExcalidraw(elements, appState, files), {
      markDirty: true,
      discardLegacyItems: true,
    });
  }, [onSceneChangeRef]);

  const currentScene = useCallback((): ExcalidrawSketchScene => {
    const api = apiRef.current;
    if (!api) return sceneRef.current;
    return sceneFromExcalidraw(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
    );
  }, [sceneRef]);

  const handleClear = useCallback(() => {
    if (onClearRef.current) {
      onClearRef.current();
    } else {
      onSceneChangeRef.current(emptySketchScene(fileNameRef.current), {
        markDirty: true,
        discardLegacyItems: true,
      });
    }
    setResetNonce((value) => value + 1);
  }, [fileNameRef, onClearRef, onSceneChangeRef]);

  const handleSave = useCallback(async () => {
    const ok = await onSaveRef.current(currentScene());
    if (ok === false) {
      clearTimeout(savedTimerRef.current);
      setShowSaved(false);
      return;
    }
    setShowSaved(true);
    setToast({
      message: t('sketch.saved'),
      tone: 'success',
    });
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
  }, [currentScene, onSaveRef, t]);

  const handleExportImage = useCallback(async () => {
    const exportHandler = onExportImageRef.current;
    if (!exportHandler || exporting) return;
    const exportedScene = currentScene();
    const exportedElements = exportedScene.elements.filter(isNonDeletedExcalidrawElement) as Parameters<typeof exportToBlob>[0]['elements'];
    const exportedAppState = {
      ...sanitizeExcalidrawAppState(exportedScene.appState),
      exportBackground: true,
      viewBackgroundColor: typeof exportedScene.appState?.viewBackgroundColor === 'string'
        ? exportedScene.appState.viewBackgroundColor
        : '#ffffff',
    } as Parameters<typeof exportToBlob>[0]['appState'];
    setExporting(true);
    try {
      const blob = await exportToBlob({
        elements: exportedElements,
        appState: exportedAppState,
        files: exportedScene.files as Parameters<typeof exportToBlob>[0]['files'],
        mimeType: EXPORTED_IMAGE_MIME_TYPE,
        exportPadding: 16,
      });
      const base64 = await blobToBase64(blob);
      const requestedFileName = exportedImageFileName(fileNameRef.current);
      const result = await exportHandler(base64, requestedFileName, exportedScene);
      if (result === false) return;
      const savedFileName = exportedImageResultFileName(result, requestedFileName);
      setToast({
        message: t('fileViewer.exportImageSaved'),
        details: savedFileName,
        tone: 'success',
        actionFileName: savedFileName,
      });
    } catch (err) {
      console.warn('[SketchEditor] export image failed', err);
      alert(t('common.exportImageFailed'));
    } finally {
      setExporting(false);
    }
  }, [currentScene, exporting, fileNameRef, onExportImageRef, t]);

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const renderTopRightUI = useCallback<NonNullable<ExcalidrawProps['renderTopRightUI']>>(() => {
    const state = saving ? 'saving' : dirty ? 'dirty' : 'saved';
    const label = saving
      ? t('sketch.saving')
      : dirty
        ? t('sketch.tooltipDirty')
        : t('sketch.saved');
    return (
      <div className="sketch-excalidraw-actions" data-testid="sketch-save-state">
        <span className={`sketch-save-state is-${state}`} role="status" aria-live="polite">
          <Icon
            name={saving ? 'spinner' : dirty ? 'alert-triangle' : 'check'}
            size={12}
            className={saving ? 'icon-spin' : undefined}
          />
          <span>{label}</span>
        </span>
      </div>
    );
  }, [dirty, saving, t]);

  const excalidrawUIOptions = useMemo<ExcalidrawProps['UIOptions']>(() => ({
    canvasActions: {
      saveToActiveFile: false,
      loadScene: false,
      toggleTheme: false,
      saveAsImage: false,
      export: false,
    },
    tools: {
      image: true,
    },
  }), []);

  const canClear = sketchSceneHasContent(scene) || legacyItems.length > 0 || hasPreservedRawItems;
  const canSave = dirty || sketchSceneHasContent(scene) || legacyItems.length > 0 || hasPreservedRawItems;

  const renderMainMenu = useCallback(() => (
    <MainMenu>
      <MainMenu.Item
        data-testid="sketch-menu-save"
        icon={showSaved ? <Icon name="check" size={16} /> : undefined}
        onClick={() => void handleSave()}
        disabled={saving || !canSave}
        aria-label={saving ? t('sketch.saving') : showSaved ? t('sketch.saved') : t('common.save')}
      >
        {saving ? t('sketch.saving') : showSaved ? t('sketch.saved') : t('common.save')}
      </MainMenu.Item>
      {onExportImage ? (
        <MainMenu.Item
          data-testid="sketch-menu-export-image"
          icon={<Icon name="download" size={16} />}
          onClick={() => void handleExportImage()}
          disabled={exporting || !sketchSceneHasContent(scene)}
          aria-label={exporting ? t('fileViewer.exportImageSaving') : t('common.exportImage')}
        >
          {exporting ? t('fileViewer.exportImageSaving') : t('common.exportImage')}
        </MainMenu.Item>
      ) : null}
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.Item
        data-testid="sketch-menu-clear"
        icon={<Icon name="trash" size={16} />}
        onClick={handleClear}
        disabled={!canClear}
      >
        {t('sketch.clear')}
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  ), [
    canClear,
    canSave,
    exporting,
    handleClear,
    handleExportImage,
    handleSave,
    onExportImage,
    saving,
    scene,
    showSaved,
    t,
  ]);

  return (
    <div className="sketch-editor">
      <div ref={canvasWrapRef} className="sketch-canvas-wrap sketch-excalidraw-wrap" data-testid="sketch-excalidraw-editor">
        <Excalidraw
          key={editorInstanceKey}
          initialData={initialData}
          excalidrawAPI={handleExcalidrawAPI}
          onChange={handleChange}
          langCode={excalidrawLangCode(locale)}
          theme={theme}
          detectScroll={false}
          handleKeyboardGlobally={false}
          autoFocus
          name={fileName}
          UIOptions={excalidrawUIOptions}
          renderTopRightUI={renderTopRightUI}
          validateEmbeddable={validateSketchEmbeddableUrl}
        >
          {renderMainMenu()}
        </Excalidraw>
      </div>
      {toast ? (
        <Toast
          message={toast.message}
          details={toast.details}
          tone={toast.tone}
          ttlMs={toast.actionFileName ? 5000 : 2200}
          actionLabel={toast.actionFileName ? t('workspace.openFile') : undefined}
          onAction={toast.actionFileName ? () => {
            const fileNameToOpen = toast.actionFileName;
            if (!fileNameToOpen) return;
            onOpenExportedImageRef.current?.(fileNameToOpen);
            setToast(null);
          } : undefined}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

function buildInitialData(
  scene: ExcalidrawSketchScene,
  legacyItems: SketchItem[],
  fileName: string,
): ExcalidrawInitialDataState {
  const convertedLegacyElements = legacyItems.length > 0
    ? convertLegacySketchItemsToExcalidrawElements(legacyItems)
    : null;
  const initialElements = convertedLegacyElements ?? scene.elements;
  return {
    elements: initialElements as ExcalidrawInitialDataState['elements'],
    appState: {
      ...sanitizeExcalidrawAppState(scene.appState),
      name: fileName,
      currentItemStrokeColor: readDefaultSketchToolColor(),
      viewBackgroundColor: typeof scene.appState?.viewBackgroundColor === 'string'
        ? scene.appState.viewBackgroundColor
        : '#ffffff',
    } as ExcalidrawInitialDataState['appState'],
    files: scene.files as ExcalidrawInitialDataState['files'],
    scrollToContent: initialElements.length > 0,
  };
}

function sceneFromExcalidraw(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): ExcalidrawSketchScene {
  return {
    elements: cloneJson<unknown[]>(elements, []),
    appState: sanitizeExcalidrawAppState(cloneJson<Record<string, unknown> | null>(appState as unknown, null)),
    files: cloneJson<Record<string, unknown>>(files, {}),
  };
}

function isNonDeletedExcalidrawElement(element: unknown): boolean {
  return Boolean(
    element &&
    typeof element === 'object' &&
    (element as { isDeleted?: unknown }).isDeleted !== true,
  );
}

function exportedImageFileName(fileName: string): string {
  const slash = fileName.lastIndexOf('/');
  const baseName = slash >= 0 ? fileName.slice(slash + 1) : fileName;
  const stem = baseName.replace(/\.sketch\.json$/i, '') || 'sketch';
  return `${stem}.png`;
}

function exportedImageResultFileName(result: SketchExportImageResult, fallback: string): string {
  if (result && typeof result === 'object' && typeof result.fileName === 'string') {
    return result.fileName;
  }
  return fallback;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read exported image'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function sceneContentSignature(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): string {
  const elementSignature = elements.map((element) => {
    if (typeof element.version === 'number') {
      return [
        element.id,
        element.version,
        element.versionNonce,
        element.isDeleted ? 1 : 0,
      ].join(':');
    }
    return stableJsonStringify(element);
  }).join('|');
  const fileSignature = Object.keys(files).sort().map((id) => {
    const file = files[id];
    if (!file || typeof file !== 'object') return id;
    const record = file as Record<string, unknown>;
    const dataURL = record.dataURL;
    return [
      id,
      record.mimeType ?? '',
      record.created ?? '',
      typeof dataURL === 'string' ? dataURL.length : 0,
    ].join(':');
  }).join('|');
  const viewBackgroundColor = typeof appState.viewBackgroundColor === 'string'
    ? appState.viewBackgroundColor
    : '';
  return `${elementSignature}\n${fileSignature}\n${viewBackgroundColor}`;
}

function stableJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(sortJsonValue(value));
  } catch {
    return '';
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortJsonValue(record[key]);
    return acc;
  }, {});
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function convertLegacySketchItemsToExcalidrawElements(items: SketchItem[]): unknown[] {
  const skeletons: unknown[] = [];
  for (const item of items) {
    if (item.kind === 'rect') {
      const x = Math.min(item.x, item.x + item.w);
      const y = Math.min(item.y, item.y + item.h);
      skeletons.push({
        type: 'rectangle',
        x,
        y,
        width: Math.abs(item.w),
        height: Math.abs(item.h),
        strokeColor: item.color,
        backgroundColor: 'transparent',
        strokeWidth: item.size,
        roughness: 1,
      });
      continue;
    }
    if (item.kind === 'arrow') {
      skeletons.push({
        type: 'arrow',
        x: item.x1,
        y: item.y1,
        points: [[0, 0], [item.x2 - item.x1, item.y2 - item.y1]],
        strokeColor: item.color,
        backgroundColor: 'transparent',
        strokeWidth: item.size,
        endArrowhead: 'arrow',
        roughness: 1,
      });
      continue;
    }
    if (item.kind === 'text') {
      skeletons.push({
        type: 'text',
        x: item.x,
        y: item.y - item.size,
        text: item.text,
        fontSize: Math.max(12, item.size),
        strokeColor: item.color,
        backgroundColor: 'transparent',
      });
      continue;
    }
    if (item.points.length === 0) continue;
    const origin = item.points[0]!;
    skeletons.push({
      type: 'line',
      x: origin.x,
      y: origin.y,
      points: item.points.map((point) => [point.x - origin.x, point.y - origin.y]),
      strokeColor: item.color,
      backgroundColor: 'transparent',
      strokeWidth: item.size,
      roughness: 1,
    });
  }

  try {
    return convertToExcalidrawElements(skeletons as never[], { regenerateIds: true }) as unknown[];
  } catch {
    return [];
  }
}

function excalidrawLangCode(locale: Locale): string {
  const map: Record<Locale, string> = {
    'en': 'en',
    'id': 'id-ID',
    'de': 'de-DE',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'pt-BR': 'pt-BR',
    'es-ES': 'es-ES',
    'ru': 'ru-RU',
    'fa': 'fa-IR',
    'ar': 'ar-SA',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'pl': 'pl-PL',
    'hu': 'hu-HU',
    'fr': 'fr-FR',
    'uk': 'uk-UA',
    'tr': 'tr-TR',
    'th': 'th-TH',
    'it': 'it-IT',
  };
  return map[locale] ?? 'en';
}

const SKETCH_TOOLTIP_TARGETS: Array<{
  selector: string;
  target?: 'closest-label';
  label: SketchTooltipLabelKey;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}> = [
  { selector: '[data-testid="main-menu-trigger"]', label: 'mainMenu', placement: 'bottom' },
  { selector: '[data-testid="toolbar-lock"]', target: 'closest-label', label: 'lock', placement: 'bottom' },
  { selector: '[data-testid="toolbar-hand"]', target: 'closest-label', label: 'hand', placement: 'bottom' },
  { selector: '[data-testid="toolbar-selection"]', target: 'closest-label', label: 'selection', placement: 'bottom' },
  { selector: '[data-testid="toolbar-rectangle"]', target: 'closest-label', label: 'rectangle', placement: 'bottom' },
  { selector: '[data-testid="toolbar-diamond"]', target: 'closest-label', label: 'diamond', placement: 'bottom' },
  { selector: '[data-testid="toolbar-ellipse"]', target: 'closest-label', label: 'ellipse', placement: 'bottom' },
  { selector: '[data-testid="toolbar-arrow"]', target: 'closest-label', label: 'arrow', placement: 'bottom' },
  { selector: '[data-testid="toolbar-line"]', target: 'closest-label', label: 'line', placement: 'bottom' },
  { selector: '[data-testid="toolbar-freedraw"]', target: 'closest-label', label: 'freedraw', placement: 'bottom' },
  { selector: '[data-testid="toolbar-text"]', target: 'closest-label', label: 'text', placement: 'bottom' },
  { selector: '[data-testid="toolbar-image"]', target: 'closest-label', label: 'image', placement: 'bottom' },
  { selector: '[data-testid="toolbar-eraser"]', target: 'closest-label', label: 'eraser', placement: 'bottom' },
  { selector: '[data-testid="toolbar-frame"]', target: 'closest-label', label: 'frame', placement: 'bottom' },
  { selector: '[data-testid="toolbar-embeddable"]', target: 'closest-label', label: 'embeddable', placement: 'bottom' },
  { selector: '[data-testid="toolbar-laser"]', target: 'closest-label', label: 'laser', placement: 'bottom' },
  { selector: '.App-toolbar__extra-tools-trigger', label: 'moreTools', placement: 'bottom' },
];

export function applySketchEditorTooltips(root: HTMLElement, labels: SketchTooltipLabels): void {
  const decorated = new Set<HTMLElement>();
  for (const entry of SKETCH_TOOLTIP_TARGETS) {
    for (const trigger of Array.from(root.querySelectorAll<HTMLElement>(entry.selector))) {
      const target = entry.target === 'closest-label'
        ? trigger.closest<HTMLElement>('label')
        : trigger;
      if (!target || decorated.has(target)) continue;

      const label = normalizeTooltipLabel(labels[entry.label]);
      if (!label) continue;

      // Drive ONLY the shared TooltipLayer (`.od-tooltip[data-tooltip]`): it
      // renders a single styled, viewport-aware bubble and suppresses the
      // native browser `title` on hover. Painting our own
      // `data-od-sketch-tooltip` ::after or a redundant `title` on top of it is
      // what produced the duplicate white + black tooltips.
      setTooltipAttribute(target, 'data-tooltip', label);
      setTooltipAttribute(target, 'data-tooltip-placement', entry.placement ?? 'bottom');
      if (!target.classList.contains('od-tooltip')) target.classList.add('od-tooltip');
      setTooltipAttribute(trigger, 'aria-label', label);
      decorated.add(target);
    }
  }
}

function normalizeTooltipLabel(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function setTooltipAttribute(target: HTMLElement, name: string, value: string): void {
  if (target.getAttribute(name) === value) return;
  target.setAttribute(name, value);
}

const SKETCH_CONTEXT_MENU_ACTION_ORDER = ['copy', 'paste', 'copyAsPng', 'copyAsSvg'] as const;
const SKETCH_CONTEXT_MENU_KNOWN_ACTIONS = new Set<string>([
  ...SKETCH_CONTEXT_MENU_ACTION_ORDER,
  'addToLibrary',
  'bringForward',
  'bringToFront',
  'copyStyles',
  'cut',
  'delete',
  'duplicate',
  'flipHorizontal',
  'flipVertical',
  'lock',
  'pasteStyles',
  'sendBackward',
  'sendToBack',
  'toggleGrid',
]);
const SKETCH_CONTEXT_MENU_ALLOWED_ACTIONS = new Set<string>(SKETCH_CONTEXT_MENU_ACTION_ORDER);
const SKETCH_CONTEXT_MENU_MARGIN = 8;

export function applySketchContextMenuSimplification(root: HTMLElement, viewportRoot: HTMLElement = root): void {
  for (const menu of Array.from(root.querySelectorAll<HTMLUListElement>('ul.context-menu'))) {
    const popover = menu.closest<HTMLElement>('.popover') ?? menu.parentElement;
    if (!popover) continue;
    const hasSketchAction = Array.from(menu.querySelectorAll<HTMLLIElement>('li[data-testid]')).some((item) => (
      SKETCH_CONTEXT_MENU_KNOWN_ACTIONS.has(item.getAttribute('data-testid') ?? '')
    ));
    if (!hasSketchAction) continue;

    menu.classList.add('od-sketch-context-menu');
    popover.classList.add('od-sketch-context-popover');

    const allowedByAction = new Map<string, HTMLLIElement>();
    for (const child of Array.from(menu.children)) {
      if (child instanceof HTMLHRElement) {
        child.remove();
        continue;
      }
      if (!(child instanceof HTMLLIElement)) continue;
      const actionName = child.getAttribute('data-testid') ?? '';
      if (!SKETCH_CONTEXT_MENU_ALLOWED_ACTIONS.has(actionName)) {
        child.remove();
        continue;
      }
      allowedByAction.set(actionName, child);
    }

    const orderedItems = SKETCH_CONTEXT_MENU_ACTION_ORDER
      .map((actionName) => allowedByAction.get(actionName))
      .filter((item): item is HTMLLIElement => Boolean(item));
    if (orderedItems.length === 0) {
      popover.remove();
      continue;
    }
    // Only touch the DOM when the order is actually wrong. This runs on every
    // MutationObserver tick, and re-`appendChild`-ing nodes that are already in
    // place detaches and re-inserts them each frame. Because those mutations
    // re-trigger the observer, an unconditional reorder becomes a self-sustaining
    // per-frame churn that cancels the in-flight pointer interaction, making the
    // menu items impossible to click.
    const currentItems = Array.from(menu.children).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement,
    );
    const alreadyOrdered = currentItems.length === orderedItems.length
      && currentItems.every((item, index) => item === orderedItems[index]);
    if (!alreadyOrdered) {
      for (const item of orderedItems) menu.appendChild(item);
    }

    clampSketchContextPopover(popover, viewportRoot);
  }
}

function clampSketchContextPopover(popover: HTMLElement, viewportRoot: HTMLElement): void {
  const viewportRect = viewportRoot.getBoundingClientRect();
  const rect = popover.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  let nextLeft = Number.parseFloat(popover.style.left || `${rect.left}`);
  let nextTop = Number.parseFloat(popover.style.top || `${rect.top}`);
  if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) return;

  const maxRight = viewportRect.right - SKETCH_CONTEXT_MENU_MARGIN;
  const minLeft = viewportRect.left + SKETCH_CONTEXT_MENU_MARGIN;
  const maxBottom = viewportRect.bottom - SKETCH_CONTEXT_MENU_MARGIN;
  const minTop = viewportRect.top + SKETCH_CONTEXT_MENU_MARGIN;

  if (rect.right > maxRight) nextLeft -= rect.right - maxRight;
  if (rect.left < minLeft) nextLeft += minLeft - rect.left;
  if (rect.bottom > maxBottom) nextTop -= rect.bottom - maxBottom;
  if (rect.top < minTop) nextTop += minTop - rect.top;

  if (nextLeft !== Number.parseFloat(popover.style.left || 'NaN')) popover.style.left = `${Math.max(0, Math.round(nextLeft))}px`;
  if (nextTop !== Number.parseFloat(popover.style.top || 'NaN')) popover.style.top = `${Math.max(0, Math.round(nextTop))}px`;
}

const SKETCH_TEXT_OVERRIDE_ATTRS = ['title', 'aria-label', 'placeholder'] as const;

const ZH_CN_SKETCH_TEXT_OVERRIDES: Record<string, string> = {
  Close: '关闭',
  Generate: '生成',
  'Wrap selection in frame': '将选区包裹为画框',
  'Copy to clipboard as PNG': '复制为 PNG 到剪贴板',
  'Copy to clipboard as SVG': '复制为 SVG 到剪贴板',
  'Copy link to object': '复制对象链接',
  'Link to object': '链接到对象',
  'Add link': '新建链接',
  'Edit link': '编辑链接',
  'Edit embeddable link': '编辑嵌入链接',
  'Copy link': '复制链接',
  'Copy styles': '复制样式',
  'Paste styles': '粘贴样式',
  'Bring forward': '上移一层',
  'Send backward': '下移一层',
  'Send to back': '置于底层',
  'Bring to front': '置于顶层',
  Duplicate: '复制',
  Lock: '锁定',
  Unlock: '解锁',
  'Lock all': '全部锁定',
  'Unlock all': '全部解锁',
  'Flip horizontal': '水平翻转',
  'Flip vertical': '垂直翻转',
  'Select all elements in frame': '选择画框内所有元素',
  'Remove all elements from frame': '从画框中移除所有元素',
  'Frame tool': '画框工具',
  'Web Embed': '嵌入网页',
  'Mermaid to Excalidraw': 'Mermaid 转 Excalidraw',
  'Mermaid To Excalidraw': 'Mermaid 转 Excalidraw',
  'Mermaid syntax': 'Mermaid 语法',
  Preview: '预览',
  Mermaid: 'Mermaid',
  'Text to diagram': '文本转图表',
  'Currently we use Mermaid as a middle step, so you\'ll get best results if you describe a diagram, workflow, flow chart, and similar.': '当前会先通过 Mermaid 中间步骤生成；描述图表、工作流、流程图等内容时效果最好。',
  'View as Mermaid': '以 Mermaid 查看',
  'Write Mermaid diagram defintion here...': '在这里输入 Mermaid 图表定义...',
  'Write Mermaid diagram definition here...': '在这里输入 Mermaid 图表定义...',
  Insert: '插入',
};

const ZH_TW_SKETCH_TEXT_OVERRIDES: Record<string, string> = {
  ...ZH_CN_SKETCH_TEXT_OVERRIDES,
  Close: '關閉',
  Generate: '生成',
  'Wrap selection in frame': '將選取範圍包裹為畫框',
  'Copy to clipboard as PNG': '複製為 PNG 到剪貼簿',
  'Copy to clipboard as SVG': '複製為 SVG 到剪貼簿',
  'Copy link to object': '複製物件連結',
  'Link to object': '連結到物件',
  'Add link': '新增連結',
  'Edit link': '編輯連結',
  'Edit embeddable link': '編輯嵌入連結',
  'Copy link': '複製連結',
  'Copy styles': '複製樣式',
  'Paste styles': '貼上樣式',
  'Bring forward': '上移一層',
  'Send backward': '下移一層',
  'Send to back': '置於底層',
  'Bring to front': '置於頂層',
  Duplicate: '複製',
  Lock: '鎖定',
  Unlock: '解鎖',
  'Lock all': '全部鎖定',
  'Unlock all': '全部解鎖',
  'Flip horizontal': '水平翻轉',
  'Flip vertical': '垂直翻轉',
  'Select all elements in frame': '選取畫框內所有元素',
  'Remove all elements from frame': '從畫框中移除所有元素',
  'Frame tool': '畫框工具',
  'Web Embed': '嵌入網頁',
  'Mermaid to Excalidraw': 'Mermaid 轉 Excalidraw',
  'Mermaid To Excalidraw': 'Mermaid 轉 Excalidraw',
  'Mermaid syntax': 'Mermaid 語法',
  Preview: '預覽',
  'Text to diagram': '文字轉圖表',
  'Currently we use Mermaid as a middle step, so you\'ll get best results if you describe a diagram, workflow, flow chart, and similar.': '目前會先透過 Mermaid 中間步驟生成；描述圖表、工作流程、流程圖等內容時效果最好。',
  'View as Mermaid': '以 Mermaid 檢視',
  'Write Mermaid diagram defintion here...': '在這裡輸入 Mermaid 圖表定義...',
  'Write Mermaid diagram definition here...': '在這裡輸入 Mermaid 圖表定義...',
  Insert: '插入',
};

function sketchTextOverrides(locale: Locale): Record<string, string> | null {
  if (locale === 'zh-CN') return ZH_CN_SKETCH_TEXT_OVERRIDES;
  if (locale === 'zh-TW') return ZH_TW_SKETCH_TEXT_OVERRIDES;
  return null;
}

function applySketchDomI18nOverrides(root: ParentNode, locale: Locale): void {
  const overrides = sketchTextOverrides(locale);
  if (!overrides || typeof document === 'undefined') return;
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = textWalker.nextNode();
  while (node) {
    const next = translateSketchTextValue(node.nodeValue ?? '', overrides);
    if (next !== null && next !== node.nodeValue) node.nodeValue = next;
    node = textWalker.nextNode();
  }
  const elements = root instanceof Element
    ? [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    : Array.from(root.querySelectorAll<HTMLElement>('*'));
  for (const element of elements) {
    for (const attr of SKETCH_TEXT_OVERRIDE_ATTRS) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const next = translateSketchTextValue(value, overrides);
      if (next !== null && next !== value) element.setAttribute(attr, next);
    }
  }
}

function translateSketchTextValue(value: string, overrides: Record<string, string>): string | null {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const leading = match?.[1] ?? '';
  const core = match?.[2] ?? value;
  const trailing = match?.[3] ?? '';
  const normalized = core.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const exact = overrides[normalized];
  if (exact) return `${leading}${exact}${trailing}`;
  for (const [source, replacement] of Object.entries(overrides)) {
    for (const separator of [' — ', ' - ', ': ']) {
      if (normalized.startsWith(`${source}${separator}`)) {
        return `${leading}${replacement}${normalized.slice(source.length)}${trailing}`;
      }
    }
  }
  return null;
}

function rewriteExcalidrawUnableToEmbedToasts(root: HTMLElement, replacement: string): void {
  const normalizedReplacement = normalizeTooltipLabel(replacement);
  if (!normalizedReplacement) return;
  for (const messageNode of Array.from(root.querySelectorAll<HTMLElement>('.Toast__message'))) {
    const current = normalizeTooltipLabel(messageNode.textContent);
    if (!current || current === normalizedReplacement || !isExcalidrawUnableToEmbedToast(current)) continue;
    messageNode.textContent = normalizedReplacement;
    messageNode.closest<HTMLElement>('.Toast')?.setAttribute('data-od-embed-toast-rewritten', 'true');
  }
}

function isExcalidrawUnableToEmbedToast(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes('embedding this url is currently not allowed')) return true;
  if (message.includes('目前不允许嵌入此网址') || message.includes('目前不允許嵌入此網址')) return true;
  return lower.includes('github')
    && (lower.includes('issue') || lower.includes('whitelist') || message.includes('白名单') || message.includes('白名單'));
}

function enhanceSketchExcalidrawPortals(locale: Locale, onClose: () => void): void {
  for (const portal of Array.from(document.querySelectorAll<HTMLElement>('.excalidraw-modal-container'))) {
    portal.classList.add('od-sketch-modal');
    portal.classList.toggle('od-sketch-help-modal', Boolean(portal.querySelector('.HelpDialog__header')));
    applySketchDomI18nOverrides(portal, locale);
    for (const content of Array.from(portal.querySelectorAll<HTMLElement>('.Modal__content'))) {
      removeSketchMermaidShortcutHints(content);
      let close = content.querySelector<HTMLButtonElement>(':scope > .od-sketch-dialog-close');
      if (!close) {
        close = document.createElement('button');
        close.type = 'button';
        close.className = 'od-sketch-dialog-close';
        close.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        });
        content.appendChild(close);
      }
      const label = sketchTextOverrides(locale)?.Close ?? 'Close';
      close.setAttribute('aria-label', label);
      close.setAttribute('title', label);
    }
  }
}

function removeSketchMermaidShortcutHints(content: HTMLElement): void {
  const insertButton = findSketchMermaidInsertButton(content);
  if (!insertButton) return;
  for (const hint of Array.from(insertButton.querySelectorAll('kbd'))) {
    hint.remove();
  }
  for (const hint of Array.from(content.querySelectorAll('.ttd-dialog-submit-shortcut'))) {
    hint.remove();
  }
}

function handleSketchPortalCommandEnter(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey) || event.altKey) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const portal = target.closest<HTMLElement>('.od-sketch-modal');
  const content = target.closest<HTMLElement>('.Modal__content');
  if (!portal || !content || !portal.contains(content)) return;
  if (!content.querySelector('textarea')) return;

  const insertButton = findSketchMermaidInsertButton(content);
  if (!insertButton || insertButton.disabled || insertButton.getAttribute('aria-disabled') === 'true') return;

  event.preventDefault();
  event.stopPropagation();
  insertButton.click();
}

function findSketchMermaidInsertButton(content: HTMLElement): HTMLButtonElement | null {
  const dialogText = normalizeTooltipLabel(content.textContent);
  if (!dialogText || !/Mermaid/i.test(dialogText)) return null;
  for (const button of Array.from(content.querySelectorAll<HTMLButtonElement>('button'))) {
    const label = normalizeTooltipLabel(button.textContent) ?? normalizeTooltipLabel(button.getAttribute('aria-label'));
    if (!label) continue;
    if (/^(Insert|插入)(\s|$|→)/i.test(label)) return button;
  }
  return null;
}

function validateSketchEmbeddableUrl(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function readExcalidrawTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function cloneJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return fallback;
  }
}
