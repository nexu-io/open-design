import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  AgentInfo,
  ChatAttachment,
  PreviewComment,
  PreviewCommentTarget,
} from '@open-design/contracts';
import type { TrackingArtifactKind } from '@open-design/contracts/analytics';
import type { ProjectFile } from '../../types';
import { useProjectCollabContext } from '../../collab/collab-context';
import { appendResourceQuery } from '../../collab/workspace-identity';
import { projectFileUrl } from '../../providers/registry';
import { copyToClipboard } from '../../lib/copy-to-clipboard';
import {
  APP_CHROME_FILE_ACTIONS_ID,
  APP_CHROME_FILE_ACTIONS_SELECTOR,
  WORKSPACE_CANVAS_TOOLBAR_ID,
  WORKSPACE_CANVAS_TOOLBAR_SELECTOR,
} from '../AppChromeHeader';
import { STAGE_ATTACHMENT_EVENT, type StageAttachmentEventDetail } from '../ChatComposer';
import { HandoffButton } from '../HandoffButton';
import { RemixIcon } from '../RemixIcon';
import { CAMPAIGN_META, CAMPAIGN_ORDER, fallbackMeta, type ImageCardMeta } from './campaign-mock';
import { justifiedLayout, ratioToNumber } from './justified-layout';
import styles from './ImageCanvas.module.css';

/**
 * The workspace surface for image projects (`metadata.kind === 'image'`).
 *
 * An image project's artifact is the set of pictures, not a document you open
 * one at a time — so this replaces the generic single-file viewer with a
 * canvas: a justified grid of everything produced, a focus view with a
 * thumbnail rail for stepping through, and per-image actions.
 *
 * Product-review prototype. The descriptive layer (title / model / resolution)
 * is hard-coded in `campaign-mock.ts`, and 再次生成 fakes a run by re-adding an
 * existing picture after a delay — no generation backend is called. Comments
 * are the real thing: they go through the same `onSavePreviewComment` path the
 * HTML canvas uses.
 */

export interface ImageCanvasProps {
  projectId: string;
  files: ProjectFile[];
  previewComments?: PreviewComment[];
  onSavePreviewComment?: (
    target: PreviewCommentTarget,
    note: string,
    attachAfterSave: boolean,
    images?: File[],
    commentId?: string,
  ) => Promise<PreviewComment | null>;
  onRemovePreviewComment?: (commentId: string) => Promise<boolean>;
  /** Handoff needs the same context the file viewer hands it. */
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  artifactId?: string | null;
  artifactKind?: TrackingArtifactKind | null;
  metricsConsent?: boolean;
  installationId?: string | null;
  viewerOnly?: boolean;
}

interface CanvasItem {
  /** Project file name — the identity of a card. */
  id: string;
  index: string;
  file: ProjectFile;
  meta: ImageCardMeta;
  /** Set once the browser decodes the image; overrides the fixture ratio. */
  measuredRatio?: number;
}

/** A pin the user dropped but hasn't sent yet. Coordinates are % of the image box. */
interface DraftPin {
  key: string;
  x: number;
  y: number;
  note: string;
}

type ViewMode = 'grid' | 'focus';

function itemsFromFiles(files: ProjectFile[]): CanvasItem[] {
  const images = files.filter((file) => file.kind === 'image');
  const known = CAMPAIGN_ORDER.filter((name) => images.some((file) => file.name === name));
  const rest = images
    .filter((file) => !CAMPAIGN_ORDER.includes(file.name))
    .map((file) => file.name);
  const ordered = [...known, ...rest];
  return ordered.flatMap((name, i) => {
    const file = images.find((candidate) => candidate.name === name);
    if (!file) return [];
    return [{
      id: name,
      index: String(i + 1).padStart(2, '0'),
      file,
      meta: CAMPAIGN_META[name] ?? fallbackMeta(name),
    }];
  });
}

export function ImageCanvas({
  projectId,
  files,
  previewComments,
  onSavePreviewComment,
  onRemovePreviewComment,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind,
  metricsConsent,
  installationId,
  viewerOnly,
}: ImageCanvasProps) {
  const { workspaceContext } = useProjectCollabContext();
  const [mode, setMode] = useState<ViewMode>('grid');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const [commenting, setCommenting] = useState(false);
  const [draftPins, setDraftPins] = useState<DraftPin[]>([]);
  const [activePinKey, setActivePinKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [quotedToast, setQuotedToast] = useState(false);
  /** Fake 再次生成 in flight: a placeholder card while the "model" works. */
  const [rerunning, setRerunning] = useState<{ from: string; ratio: number } | null>(null);
  const [extraCards, setExtraCards] = useState<Array<{ id: string; sourceId: string }>>([]);

  const baseItems = useMemo(() => itemsFromFiles(files), [files]);
  const items = useMemo(() => {
    // 再次生成 output: a new card that re-shows an existing picture. Real
    // generation would write a new file; the demo keeps it client-side so the
    // canvas can show "a new one every time, originals never overwritten".
    const derived = extraCards.flatMap((card, i) => {
      const source = baseItems.find((item) => item.id === card.sourceId);
      if (!source) return [];
      return [{
        ...source,
        id: card.id,
        index: String(baseItems.length + i + 1).padStart(2, '0'),
        meta: { ...source.meta, title: `${source.meta.title} · 重出` },
      }];
    });
    return [...baseItems, ...derived];
  }, [baseItems, extraCards]);

  const withRatio = useMemo(
    () => items.map((item) => ({
      ...item,
      ratio: measured[item.id] ?? ratioToNumber(item.meta.ratio),
    })),
    [items, measured],
  );

  const current = withRatio.find((item) => item.id === currentId) ?? withRatio[0] ?? null;

  useEffect(() => {
    if (currentId && items.some((item) => item.id === currentId)) return;
    setCurrentId(items[0]?.id ?? null);
  }, [currentId, items]);

  const srcFor = useCallback(
    (item: CanvasItem) => appendResourceQuery(
      projectFileUrl(projectId, item.file.name, workspaceContext),
      `v=${Math.round(item.file.mtime)}`,
    ),
    [projectId, workspaceContext],
  );

  const onImageDecoded = useCallback((id: string, width: number, height: number) => {
    if (!width || !height) return;
    setMeasured((prev) => (prev[id] ? prev : { ...prev, [id]: width / height }));
  }, []);

  // ---- justified grid ----------------------------------------------------
  // Measured through a ref callback rather than an effect: the grid only
  // exists once the project's files have arrived, and an effect keyed on
  // render state would have already run (against no node) by then, leaving the
  // solver stuck at width 0.
  const gridObserverRef = useRef<ResizeObserver | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const attachGrid = useCallback((node: HTMLDivElement | null) => {
    gridObserverRef.current?.disconnect();
    gridObserverRef.current = null;
    if (!node) return;
    // contentRect is the padding-excluded box — exactly the width a row fills.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setGridWidth(entry.contentRect.width);
    });
    observer.observe(node);
    gridObserverRef.current = observer;
    const style = getComputedStyle(node);
    setGridWidth(
      node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    );
  }, []);
  useEffect(() => () => gridObserverRef.current?.disconnect(), []);

  const gridRatios = useMemo(() => {
    const ratios = withRatio.map((item) => item.ratio);
    return rerunning ? [...ratios, rerunning.ratio] : ratios;
  }, [withRatio, rerunning]);
  const boxes = useMemo(
    () => justifiedLayout(gridRatios, gridWidth),
    [gridRatios, gridWidth],
  );

  // ---- focus view: wheel steps through the set ---------------------------
  const stageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode !== 'focus') return;
    const node = stageRef.current;
    if (!node) return;
    let cooling = false;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8 || cooling) return;
      event.preventDefault();
      cooling = true;
      window.setTimeout(() => { cooling = false; }, 220);
      const index = withRatio.findIndex((item) => item.id === current?.id);
      if (index < 0) return;
      const next = event.deltaY > 0 ? index + 1 : index - 1;
      const target = withRatio[Math.max(0, Math.min(withRatio.length - 1, next))];
      if (target) setCurrentId(target.id);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [mode, withRatio, current?.id]);

  // Leaving focus view drops an unfinished pin session.
  useEffect(() => {
    if (mode === 'focus') return;
    setCommenting(false);
    setDraftPins([]);
    setActivePinKey(null);
  }, [mode]);

  const openFocus = useCallback((id: string) => {
    setCurrentId(id);
    setMode('focus');
  }, []);

  // ---- comments ----------------------------------------------------------
  const savedPins = useMemo(
    () => (previewComments ?? []).filter((comment) => comment.filePath === current?.id),
    [previewComments, current?.id],
  );

  const dropPin = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!commenting) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || y < 0 || x > 100 || y > 100) return;
    const key = `draft-${Date.now().toString(36)}`;
    setDraftPins((prev) => [...prev, { key, x, y, note: '' }]);
    setActivePinKey(key);
  }, [commenting]);

  const sendPins = useCallback(async () => {
    if (!onSavePreviewComment || !current) return;
    const ready = draftPins.filter((pin) => pin.note.trim());
    if (ready.length === 0) return;
    setSending(true);
    try {
      for (const pin of ready) {
        // Image pins carry percentage coordinates rather than the viewport
        // pixels an HTML pin stores — there is no DOM here to re-anchor
        // against, so the picture's own box is the only stable frame.
        const pinId = `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const target: PreviewCommentTarget = {
          filePath: current.id,
          elementId: pinId,
          selector: `[data-od-pin="${pinId}"]`,
          label: 'pin',
          text: '',
          position: { x: pin.x, y: pin.y, width: 0, height: 0 },
          htmlHint: '',
        };
        await onSavePreviewComment(target, pin.note.trim(), false);
      }
      setDraftPins([]);
      setActivePinKey(null);
      setCommenting(false);
    } finally {
      setSending(false);
    }
  }, [onSavePreviewComment, current, draftPins]);

  // ---- 再次生成 (mocked) ---------------------------------------------------
  const rerun = useCallback(() => {
    if (!current || rerunning) return;
    const source = current;
    setRerunning({ from: source.id, ratio: source.ratio });
    setMode('grid');
    window.setTimeout(() => {
      setExtraCards((prev) => [
        ...prev,
        { id: `rerun-${Date.now().toString(36)}`, sourceId: source.id },
      ]);
      setRerunning(null);
    }, 2200);
  }, [current, rerunning]);

  // ---- chrome portals ----------------------------------------------------
  // The canvas lives in the same workspace row every other file surface uses:
  // view controls in the row's leading slot, file actions (share / download /
  // handoff) in its trailing slot. Rendering them inside the canvas instead
  // would drop them from the chrome the rest of the app shares.
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    setToolbarHost(
      document.querySelector<HTMLElement>(WORKSPACE_CANVAS_TOOLBAR_SELECTOR)
      ?? document.getElementById(WORKSPACE_CANVAS_TOOLBAR_ID),
    );
    setActionsHost(
      document.querySelector<HTMLElement>(APP_CHROME_FILE_ACTIONS_SELECTOR)
      ?? document.getElementById(APP_CHROME_FILE_ACTIONS_ID),
    );
  }, []);

  // 引用该图: hand the picture to the composer as an attachment. The file
  // already lives in the project, so this is the same staging event the design
  // browser's "add to chat" capture fires — no upload, no copy.
  const quoteCurrent = useCallback(() => {
    if (!current) return;
    const attachment: ChatAttachment = {
      path: current.file.path ?? current.file.name,
      name: current.file.name,
      kind: 'image',
      size: current.file.size,
    };
    window.dispatchEvent(
      new CustomEvent<StageAttachmentEventDetail>(STAGE_ATTACHMENT_EVENT, {
        detail: { attachments: [attachment] },
      }),
    );
    setQuotedToast(true);
    window.setTimeout(() => setQuotedToast(false), 1800);
  }, [current]);

  const shareCurrent = useCallback(async () => {
    if (!current) return;
    await copyToClipboard(new URL(srcFor(current), window.location.origin).toString());
    setCopiedToast(true);
    window.setTimeout(() => setCopiedToast(false), 1800);
  }, [current, srcFor]);

  if (withRatio.length === 0) {
    return (
      <div className={styles.empty}>
        这个项目还没有图片。让 agent 生成一组，或从设计文件里上传。
      </div>
    );
  }

  const pinCount = draftPins.filter((pin) => pin.note.trim()).length;

  const portal = (node: ReactNode, host: HTMLElement | null) => (
    host ? createPortal(node, host) : null
  );

  const canvasToolbar = (
    <div className="viewer-toolbar image-canvas-toolbar">
      <div className="viewer-toolbar-left">
        {/* Same segment shell the HTML canvas uses for 编辑 / 演示, so the two
            surfaces read as one product rather than two conventions. */}
        <div className="viewer-tabs viewer-mode-tabs canvas-mode-seg" role="tablist" aria-label="视图">
          <button
            type="button"
            role="tab"
            className={`viewer-tab ${mode === 'grid' ? 'active' : ''}`}
            aria-selected={mode === 'grid'}
            onClick={() => setMode('grid')}
          >
            <span className="viewer-tab-label">平铺</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`viewer-tab ${mode === 'focus' ? 'active' : ''}`}
            aria-selected={mode === 'focus'}
            onClick={() => setMode('focus')}
          >
            <span className="viewer-tab-label">详情</span>
          </button>
        </div>
      </div>
    </div>
  );

  const fileActions = (
    <>
      {/* Labelled rather than glyph-only: without the file viewer's crowded
          action row next door there is room for the words, and a bare arrow
          glyph does not say share. `.chrome-action` already lays out icon +
          text, so dropping `chrome-action-icon` is the whole change. */}
      <button
        type="button"
        className="chrome-action chrome-action-secondary"
        onClick={() => void shareCurrent()}
        disabled={!current}
      >
        <RemixIcon name="share-forward-line" size={15} />
        <span>分享</span>
      </button>
      {current ? (
        <a
          className="chrome-action chrome-action-secondary chrome-action-dark"
          href={projectFileUrl(projectId, current.file.name, workspaceContext)}
          download={current.file.name}
        >
          <RemixIcon name="download-line" size={15} />
          <span>导出</span>
        </a>
      ) : null}
      {viewerOnly ? null : (
        <HandoffButton
          projectId={projectId}
          projectName={projectName}
          projectDir={projectDir}
          agents={agents}
          artifactId={artifactId ?? undefined}
          artifactKind={artifactKind ?? undefined}
          metricsConsent={metricsConsent}
          installationId={installationId}
        />
      )}
    </>
  );

  return (
    <div className={`${styles.canvas} ${mode === 'grid' ? styles.modeGrid : styles.modeFocus}`}>
      {portal(canvasToolbar, toolbarHost)}
      {portal(fileActions, actionsHost)}
      {copiedToast ? <div className={styles.toast}>已复制图片链接</div> : null}
      {quotedToast ? <div className={styles.toast}>已加入输入框</div> : null}

      {mode === 'grid' ? (
        <div className={styles.gridWrap} ref={attachGrid}>
          {withRatio.map((item, i) => {
            const box = boxes[i];
            return (
              <button
                key={item.id}
                type="button"
                className={styles.card}
                style={box ? { width: box.width, height: box.height } : undefined}
                onClick={() => openFocus(item.id)}
              >
                <img
                  src={srcFor(item)}
                  alt={item.meta.title}
                  onLoad={(event) => onImageDecoded(
                    item.id,
                    event.currentTarget.naturalWidth,
                    event.currentTarget.naturalHeight,
                  )}
                />
                {/* Two lines: the model always shows, and a narrow portrait
                    card puts it on its own row rather than dropping it. */}
                <span className={styles.cardMeta}>
                  <span className={styles.cardMetaModel}>{item.meta.model}</span>
                  <span className={styles.cardMetaSpec}>
                    {item.meta.res} · {item.meta.ratio}
                  </span>
                </span>
              </button>
            );
          })}
          {rerunning ? (
            <div
              className={`${styles.card} ${styles.cardLoading}`}
              style={(() => {
                const box = boxes[withRatio.length];
                return box ? { width: box.width, height: box.height } : undefined;
              })()}
            >
              <span className={styles.loadingLabel}>
                <span className={styles.dots} aria-hidden="true" />
                重新生成中…
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'focus' && current ? (
        <>
          <div className={styles.thumbRail}>
            {withRatio.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.thumb} ${item.id === current.id ? styles.thumbOn : ''}`}
                onClick={() => setCurrentId(item.id)}
              >
                <img src={srcFor(item)} alt={item.meta.title} />
              </button>
            ))}
          </div>

          <div className={styles.stageWrap} ref={stageRef}>
            <div
              className={`${styles.stage} ${commenting ? styles.stageCommenting : ''}`}
              style={{ aspectRatio: String(current.ratio) }}
              onClick={dropPin}
            >
              <img
                src={srcFor(current)}
                alt={current.meta.title}
                onLoad={(event) => onImageDecoded(
                  current.id,
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                )}
              />
              {savedPins.map((comment, i) => (
                <span
                  key={comment.id}
                  className={`${styles.pin} ${styles.pinSaved}`}
                  style={{ left: `${comment.position.x}%`, top: `${comment.position.y}%` }}
                  title={comment.note}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onRemovePreviewComment) void onRemovePreviewComment(comment.id);
                  }}
                >
                  {i + 1}
                </span>
              ))}
              {draftPins.map((pin, i) => (
                <span
                  key={pin.key}
                  className={`${styles.pin} ${activePinKey === pin.key ? styles.pinActive : ''}`}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setActivePinKey(pin.key);
                  }}
                >
                  {savedPins.length + i + 1}
                </span>
              ))}
              {/* Hover reveals what produced the picture, nothing else. The
                  title/subtitle that used to lead here restated what you are
                  already looking at. */}
              <div className={styles.caption}>
                <div className={styles.captionMeta}>
                  {current.meta.model} · {current.meta.res} · {current.meta.ratio}
                </div>
              </div>
            </div>
          </div>

          {commenting && activePinKey ? (
            <div className={styles.pinComposer}>
              <textarea
                autoFocus
                value={draftPins.find((pin) => pin.key === activePinKey)?.note ?? ''}
                placeholder="这一处要怎么改…"
                onChange={(event) => {
                  const note = event.target.value;
                  setDraftPins((prev) => prev.map(
                    (pin) => (pin.key === activePinKey ? { ...pin, note } : pin),
                  ));
                }}
              />
              <div className={styles.pinComposerRow}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setDraftPins((prev) => prev.filter((pin) => pin.key !== activePinKey));
                    setActivePinKey(null);
                  }}
                >
                  删除
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setActivePinKey(null)}
                >
                  完成
                </button>
              </div>
            </div>
          ) : null}

          {/* Same floating dock the HTML canvas uses (`.canvas-dock` +
              `.viewer-action`), so both canvases share one control language —
              only the actions inside differ. */}
          <div className="canvas-dock" data-testid="image-canvas-dock">
            <div className="canvas-dock-inner">
              <button
                type="button"
                className={`viewer-action ${styles.dockAction}`}
                title="把这张图作为附件放进输入框"
                onClick={quoteCurrent}
              >
                <RemixIcon name="image-add-line" size={15} />
                <span>引用该图</span>
              </button>
              <span className="canvas-dock-divider" aria-hidden />
              <button
                type="button"
                className={`viewer-action ${styles.dockAction}${commenting ? ' active' : ''}`}
                aria-pressed={commenting}
                title="点图面任意位置落一条评论"
                onClick={() => {
                  setCommenting((prev) => !prev);
                  setActivePinKey(null);
                }}
              >
                <RemixIcon name="chat-1-line" size={15} />
                <span>评论</span>
              </button>
              <button
                type="button"
                className={`viewer-action ${styles.dockAction}`}
                title="按这张图已有的提示词重出一张"
                disabled={Boolean(rerunning)}
                onClick={rerun}
              >
                <RemixIcon name="refresh-line" size={15} />
                <span>再次生成</span>
              </button>
              {commenting ? (
                <>
                  <span className="canvas-dock-divider" aria-hidden />
                  <button
                    type="button"
                    className={styles.dockSend}
                    disabled={pinCount === 0 || sending}
                    onClick={() => void sendPins()}
                  >
                    <span>发送评论</span>
                    <span className={styles.dockCount}>{pinCount} 条</span>
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
