// Orchestration functions for the chat-composer's staged-attachment /
// upload flows: attachment-order bookkeeping, the project-files and
// library-asset upload transports, clipboard-paste and drag-drop handlers,
// and per-attachment removal. Split out of actions.ts (Phase 6, cluster 7)
// because the combined file would exceed the slice's size budget — same
// deps-bag convention as actions.ts (each function takes every piece of
// orchestrator state/setter/callback it needs as an explicit parameter
// object instead of closing over component scope). No React, no transport,
// no DOM globals — only injected callbacks touch those.
import type { Dispatch, DragEvent, MutableRefObject, SetStateAction } from 'react';
import type { ChatAnalyticsEntryFrom, LibraryApplyResponse, LibraryAsset } from '@open-design/contracts';
import type { ComposerBarClickProps } from '@open-design/contracts/analytics';
import type { ChatAttachment, ChatCommentAttachment } from '../../types';
import { assetTitle, elementMetaOf } from '../../components/LibraryAssetMeta';
import { deriveUploadCohort } from '../../analytics/upload-tracking';
import { trackFileUploadResult } from '../../analytics/events';
import { buildVisualAnnotationAttachment } from '../../comments';
import type { AnnotationEventDetail } from '../../components/PreviewDrawOverlay';
import { looksLikeImage } from './formatters';
import {
  assignChatAttachmentOrders,
  formatElementHtmlBlock,
  isFiniteAttachmentOrder,
  nextChatAttachmentOrder,
  queueMeta,
  sortChatAttachmentsByOrder,
  stripInlineMentionToken,
} from './rules';
import { currentRunContextMeta, sendComposedTurn, type SendActionDeps } from './actions';
import type { ChatSendMeta, TranslateFn, UploadFilesResult } from './types';

/** Everything the attachment/upload cluster needs from the outside world:
 *  the staged-attachment list + its order-assignment ref, the already-landed
 *  upload UI-feedback hook's setters (`useComposerUpload`), the project
 *  lifecycle + transport calls (sourced from the orchestrator's own existing
 *  `providers/registry` imports, passed straight through — not wrapped in a
 *  new port, matching the `WorkingDirActionDeps` precedent), analytics, the
 *  Lexical editor operations these functions drive, and the cross-cluster
 *  visual-comment state `removeStaged` also clears. */
export interface UploadActionDeps {
  staged: ChatAttachment[];
  setStaged: Dispatch<SetStateAction<ChatAttachment[]>>;
  nextAttachmentOrderRef: MutableRefObject<number>;
  setUploading: (value: boolean) => void;
  setUploadError: (value: string | null) => void;
  setDragActive: (value: boolean) => void;
  projectId: string | null;
  onEnsureProject: () => Promise<string | null>;
  uploadProjectFiles: (projectId: string, files: File[]) => Promise<UploadFilesResult>;
  applyLibraryAsset: (assetId: string, projectId: string) => Promise<LibraryApplyResponse | null>;
  fetchLibraryAssetElementHtml: (assetId: string) => Promise<string | null>;
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { requestId?: string; insertId?: string },
  ) => void;
  getEditorText: () => string;
  insertEditorText: (text: string) => void;
  focusEditor: () => void;
  replaceEditorDraft: (text: string) => void;
  draft: string;
  setStagedVisualComments: Dispatch<SetStateAction<ChatCommentAttachment[]>>;
  trackComposerBar: (fields: Omit<ComposerBarClickProps, 'page_name' | 'area' | 'project_id'>) => void;
}

/**
 * Reserves `count` sequential attachment orders starting after both the
 * ref's high-water mark and the current staged list's own max order, so
 * concurrent staging paths (upload + library add + annotation) never
 * collide. Returns the first reserved order.
 */
export function reserveAttachmentOrders(
  count: number,
  deps: Pick<UploadActionDeps, 'staged' | 'nextAttachmentOrderRef'>,
): number {
  const orderStart = Math.max(deps.nextAttachmentOrderRef.current, nextChatAttachmentOrder(deps.staged));
  deps.nextAttachmentOrderRef.current = orderStart + count;
  return orderStart;
}

export function appendOrderedStagedAttachments(
  attachments: ChatAttachment[],
  deps: Pick<UploadActionDeps, 'setStaged' | 'nextAttachmentOrderRef'>,
) {
  if (attachments.length === 0) return;
  deps.setStaged((current) => {
    const knownPaths = new Set(current.map((attachment) => attachment.path));
    const nextAttachments = attachments.filter((attachment) => !knownPaths.has(attachment.path));
    if (nextAttachments.length === 0) return current;
    const next = sortChatAttachmentsByOrder([...current, ...nextAttachments]);
    deps.nextAttachmentOrderRef.current = Math.max(
      deps.nextAttachmentOrderRef.current,
      nextChatAttachmentOrder(next),
    );
    return next;
  });
}

export function appendContextAttachment(
  filePath: string,
  deps: Pick<UploadActionDeps, 'setStaged' | 'nextAttachmentOrderRef'>,
) {
  deps.setStaged((current) => {
    if (current.some((item) => item.path === filePath)) return current;
    const order = Math.max(deps.nextAttachmentOrderRef.current, nextChatAttachmentOrder(current));
    deps.nextAttachmentOrderRef.current = order + 1;
    return sortChatAttachmentsByOrder([
      ...current,
      {
        path: filePath,
        name: filePath.split('/').pop() || filePath,
        kind: looksLikeImage(filePath) ? 'image' : 'file',
        order,
      },
    ]);
  });
}

export async function ensureProject(
  deps: Pick<UploadActionDeps, 'projectId' | 'onEnsureProject'>,
): Promise<string | null> {
  if (deps.projectId) return deps.projectId;
  return deps.onEnsureProject();
}

type UploadTransportDeps = Pick<
  UploadActionDeps,
  | 'staged'
  | 'nextAttachmentOrderRef'
  | 'setStaged'
  | 'setUploading'
  | 'setUploadError'
  | 'projectId'
  | 'onEnsureProject'
  | 'uploadProjectFiles'
  | 'track'
>;

export async function uploadFiles(files: File[], deps: UploadTransportDeps) {
  if (files.length === 0) return;
  const id = await ensureProject(deps);
  if (!id) return;
  deps.setUploading(true);
  deps.setUploadError(null);
  // Cohort math is identical to the Design Files Upload button; see
  // `analytics/upload-tracking.ts`. v2 doc fires one
  // file_upload_result per surface so this path reports
  // `page_name='chat_panel'` / `area='chat_composer'`.
  const cohort = deriveUploadCohort(files);
  const orderStart = reserveAttachmentOrders(files.length, deps);
  try {
    const result = await deps.uploadProjectFiles(id, files);
    if (result.uploaded.length > 0) {
      const orderedUploaded = assignChatAttachmentOrders(result.uploaded, orderStart);
      appendOrderedStagedAttachments(orderedUploaded, deps);
    }
    const partial = result.failed.length > 0;
    if (partial) {
      const failedCount = result.failed.length;
      const uploadedCount = result.uploaded.length;
      const detail = result.error ? ` (${result.error})` : '';
      deps.setUploadError(
        uploadedCount > 0
          ? `Attached ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
          : `Attachment upload failed for ${failedCount} file(s)${detail}.`,
      );
      console.warn('Some attachments failed to upload', result.failed);
    }
    trackFileUploadResult(deps.track, {
      page_name: 'chat_panel',
      area: 'chat_composer',
      project_id: id,
      ...cohort,
      result: partial ? 'failed' : 'success',
      ...(partial && result.error ? { error_code: result.error } : {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    deps.setUploadError(`Attachment upload failed (${detail}).`);
    trackFileUploadResult(deps.track, {
      page_name: 'chat_panel',
      area: 'chat_composer',
      project_id: id,
      ...cohort,
      result: 'failed',
      error_code: detail,
    });
  } finally {
    deps.setUploading(false);
  }
}

// "Select from library" (资源库): copy each chosen asset into the project's
// design files and stage it as an attachment chip, mirroring how the native
// file picker materializes uploads into the project on attach. The apply
// call records a provenance back-link so the registry knows the asset was
// consumed.
export async function addAssetsFromLibrary(
  assets: LibraryAsset[],
  deps: Pick<
    UploadActionDeps,
    | 'staged'
    | 'nextAttachmentOrderRef'
    | 'setStaged'
    | 'setUploading'
    | 'setUploadError'
    | 'projectId'
    | 'onEnsureProject'
    | 'applyLibraryAsset'
    | 'fetchLibraryAssetElementHtml'
    | 'getEditorText'
    | 'insertEditorText'
    | 'focusEditor'
  >,
) {
  if (assets.length === 0) return;
  const id = await ensureProject(deps);
  if (!id) return;
  deps.setUploading(true);
  deps.setUploadError(null);
  const orderStart = reserveAttachmentOrders(assets.length, deps);
  try {
    const applied: ChatAttachment[] = [];
    // Element-pick captures carry their picked node's markup; collect it so
    // we can drop the HTML straight into the composer input (the image still
    // attaches as a normal reference).
    const elementBlocks: string[] = [];
    let failed = 0;
    for (const asset of assets) {
      const res = await deps.applyLibraryAsset(asset.id, id);
      if (!res?.relPath) {
        failed += 1;
        continue;
      }
      applied.push({
        path: res.relPath,
        name: assetTitle(asset),
        kind: asset.kind === 'image' ? 'image' : 'file',
      });
      const element = elementMetaOf(asset);
      if (element?.hasHtml) {
        const html = await deps.fetchLibraryAssetElementHtml(asset.id);
        if (html) elementBlocks.push(formatElementHtmlBlock(asset, element, html));
      }
    }
    if (applied.length > 0) {
      appendOrderedStagedAttachments(assignChatAttachmentOrders(applied, orderStart), deps);
    }
    if (elementBlocks.length > 0) {
      const existing = deps.getEditorText();
      deps.insertEditorText((existing.trim() ? '\n\n' : '') + elementBlocks.join('\n\n'));
      deps.focusEditor();
    }
    if (failed > 0) {
      deps.setUploadError(
        applied.length > 0
          ? `Added ${applied.length} item(s), but ${failed} failed.`
          : `Could not add ${failed} item(s) from the library.`,
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    deps.setUploadError(`Could not add from library (${detail}).`);
  } finally {
    deps.setUploading(false);
  }
}

export async function uploadClipboardImagesFromAsyncClipboard(
  deps: UploadTransportDeps,
): Promise<boolean> {
  if (!navigator.clipboard?.read) return false;
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    const stamp = Date.now();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith('image/'));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const extension = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      files.push(new File([blob], `clipboard-screenshot-${stamp}.${extension}`, { type: imageType }));
    }
    if (files.length === 0) return false;
    await uploadFiles(files, deps);
    return true;
  } catch (err) {
    console.warn('Could not read image from clipboard', err);
    return false;
  }
}

// Paste handler invoked by the editor's PastePlugin. `files` are the items
// the clipboard exposed synchronously; when empty we fall back to the async
// Clipboard API to recover pasted screenshots that some browsers only
// surface through `navigator.clipboard.read()`.
export function handlePasteFiles(files: File[], deps: UploadTransportDeps) {
  if (files.length > 0) {
    void uploadFiles(files, deps);
    return;
  }
  void uploadClipboardImagesFromAsyncClipboard(deps);
}

export function handleDrop(
  e: DragEvent<HTMLDivElement>,
  deps: UploadTransportDeps & Pick<UploadActionDeps, 'setDragActive'>,
) {
  e.preventDefault();
  deps.setDragActive(false);
  const files = Array.from(e.dataTransfer.files ?? []);
  if (files.length > 0) void uploadFiles(files, deps);
}

export function removeStaged(
  path: string,
  deps: Pick<
    UploadActionDeps,
    'setStaged' | 'setStagedVisualComments' | 'draft' | 'replaceEditorDraft' | 'trackComposerBar'
  >,
) {
  deps.trackComposerBar({ element: 'context_remove', resource_kind: 'attachment', resource_id: path });
  deps.setStaged((s) => s.filter((a) => a.path !== path));
  deps.setStagedVisualComments((current) => current.filter((attachment) => attachment.screenshotPath !== path));
  // Strip the `@<path>` token from the draft and push the result back into
  // the editor so the pill disappears in lockstep with the chip.
  deps.replaceEditorDraft(stripInlineMentionToken(deps.draft, path));
}

/** Everything the Mark draw-overlay's `ANNOTATION_EVENT` handler needs: the
 *  upload cluster's own deps bag (nested rather than re-flattened — every
 *  field is already `UploadActionDeps`-shaped), the send cluster's deps bag
 *  (ditto), i18n, and the streaming-deferred-send bookkeeping this handler
 *  shares with the deferred-send-flush effect. */
export interface AnnotationActionDeps {
  t: TranslateFn;
  uploadActionDeps: UploadActionDeps;
  sendActionDeps: SendActionDeps;
  draftRef: MutableRefObject<string>;
  setDraft: (text: string) => void;
  setEditorText: (text: string) => void;
  focusEditor: () => void;
  draft: string;
  staged: ChatAttachment[];
  currentCommentAttachments: (extra?: ChatCommentAttachment[]) => ChatCommentAttachment[];
  streaming: boolean;
  streamingAnnotationSendEntryFromRef: MutableRefObject<ChatAnalyticsEntryFrom | undefined>;
  setStreamingAnnotationSendPending: (value: boolean) => void;
}

/**
 * Handles one `ANNOTATION_EVENT` (the Mark draw-overlay's queue/send/draft
 * actions): uploads the screenshot + any attached images, builds the visual-
 * comment attachment when the mark has bounds, then either stages it into
 * the draft (`draft` action), composes + sends immediately (`send`, or
 * defers to the streaming-flush effect if a run is already in flight), or
 * composes + queues (`queue`, tagged `queueOnly`). `entry_from: 'mark'` on
 * every send/queue path separates Mark-driven runs from plain composer
 * sends on the analytics dashboard.
 */
export async function handleAnnotationEvent(
  detail: AnnotationEventDetail,
  deps: AnnotationActionDeps,
): Promise<void> {
  let acked = false;
  const ack = (result: { ok: boolean; message?: string }) => {
    if (acked) return;
    acked = true;
    detail.ack?.(result);
  };
  let uploaded: ChatAttachment[] = [];
  let visualAttachmentInput: Parameters<typeof buildVisualAnnotationAttachment>[0] | null = null;
  let visualAttachment: ChatCommentAttachment | null = null;
  try {
    // Upload the annotation screenshot together with any images the user
    // attached in the markup composer. The screenshot (when present) is
    // first so it keeps backing the structured visual comment; the rest ride
    // along as ordinary chat attachments.
    const annotationFiles = [detail.file, ...(detail.extraFiles ?? [])].filter(
      (f): f is File => Boolean(f),
    );
    if (annotationFiles.length > 0) {
      const orderStart = reserveAttachmentOrders(annotationFiles.length, deps.uploadActionDeps);
      const id = await ensureProject(deps.uploadActionDeps);
      if (!id) {
        ack({ ok: false, message: deps.t('chat.annotationProjectCreateFailed') });
        return;
      }
      deps.uploadActionDeps.setUploading(true);
      const result = await deps.uploadActionDeps.uploadProjectFiles(id, annotationFiles);
      if (result.uploaded.length > 0) {
        uploaded = assignChatAttachmentOrders(result.uploaded, orderStart);
        const screenshot = detail.file ? uploaded[0] : null;
        if (screenshot && detail.markKind && detail.bounds) {
          visualAttachmentInput = {
            order: isFiniteAttachmentOrder(screenshot.order) ? screenshot.order : orderStart,
            idSeed: screenshot.path,
            screenshotPath: screenshot.path,
            markKind: detail.markKind,
            note: detail.note,
            bounds: detail.bounds,
            target: detail.target
              ? {
                  filePath: detail.target.filePath || detail.filePath || screenshot.path,
                  elementId: detail.target.elementId,
                  selector: detail.target.selector,
                  label: detail.target.label,
                  text: detail.target.text,
                  position: detail.target.position,
                  htmlHint: detail.target.htmlHint,
                }
              : {
                  filePath: detail.filePath || screenshot.path,
                  position: detail.bounds,
                },
          };
        }
      }
      if (result.failed.length > 0) {
        const detailText = result.error ? ` (${result.error})` : '';
        deps.uploadActionDeps.setUploadError(`Attachment upload failed for ${result.failed.length} file(s)${detailText}.`);
        if (uploaded.length === 0) {
          ack({ ok: false, message: deps.t('chat.annotationUploadFailed') });
          return;
        }
      }
    }
    deps.uploadActionDeps.setUploading(false);

    const appendAnnotationToComposer = () => {
      if (uploaded.length > 0) {
        appendOrderedStagedAttachments(uploaded, deps.uploadActionDeps);
      }
      if (visualAttachmentInput) {
        deps.uploadActionDeps.setStagedVisualComments((current) => [
          ...current,
          buildVisualAnnotationAttachment({ ...visualAttachmentInput! }),
        ]);
      }
      if (detail.note) {
        // Accumulate through draftRef so two annotations resolving
        // concurrently compose (each reads the other's write) instead of
        // both starting from the same stale closure. Mirror the result into
        // the editor with setText so the now-non-empty editor does not fire
        // an onChange('') that would clobber the accumulated draft back to
        // empty.
        const nextDraft = deps.draftRef.current
          ? `${deps.draftRef.current}\n${detail.note}`
          : detail.note;
        deps.draftRef.current = nextDraft;
        deps.setDraft(nextDraft);
        deps.setEditorText(nextDraft);
      }
      deps.focusEditor();
    };

    if (detail.action === 'queue') {
      if (visualAttachmentInput) {
        visualAttachment = buildVisualAnnotationAttachment({ ...visualAttachmentInput });
      }
      const prompt = [deps.draft.trim(), detail.note].filter(Boolean).join('\n');
      const attachments = sortChatAttachmentsByOrder([...deps.staged, ...uploaded]);
      const nextCommentAttachments = deps.currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
      const meta: ChatSendMeta = { ...queueMeta(currentRunContextMeta(deps.sendActionDeps)), entryFrom: 'mark' };
      sendComposedTurn(prompt, attachments, nextCommentAttachments, meta, deps.sendActionDeps);
      ack({ ok: true });
      return;
    }

    if (detail.action === 'send') {
      if (deps.streaming) {
        appendAnnotationToComposer();
        // Carry entry_from='mark' through the deferred send so the flush
        // effect reports the run as a Mark annotation rather than the
        // default composer entry.
        deps.streamingAnnotationSendEntryFromRef.current = 'mark';
        deps.setStreamingAnnotationSendPending(true);
        ack({ ok: true });
        return;
      }
      if (visualAttachmentInput) {
        visualAttachment = buildVisualAnnotationAttachment({ ...visualAttachmentInput });
      }
      const prompt = [deps.draft.trim(), detail.note].filter(Boolean).join('\n');
      const attachments = sortChatAttachmentsByOrder([...deps.staged, ...uploaded]);
      const nextCommentAttachments = deps.currentCommentAttachments(visualAttachment ? [visualAttachment] : []);
      const meta: ChatSendMeta = { ...currentRunContextMeta(deps.sendActionDeps), entryFrom: 'mark' };
      sendComposedTurn(prompt, attachments, nextCommentAttachments, meta, deps.sendActionDeps);
      ack({ ok: true });
      return;
    }

    if (detail.action === 'draft') {
      appendAnnotationToComposer();
      ack({ ok: true });
      return;
    }

    ack({ ok: false, message: deps.t('chat.annotationFailed') });
  } catch (err) {
    console.warn('Could not send annotation', err);
    deps.uploadActionDeps.setUploadError(err instanceof Error ? err.message : deps.t('chat.annotationFailed'));
    ack({ ok: false, message: deps.t('chat.annotationFailed') });
  } finally {
    deps.uploadActionDeps.setUploading(false);
  }
}

/** Everything the deferred-send-flush effect needs: the "a Mark send arrived
 *  mid-stream" latch (state + its authoritative ref pair from
 *  `useCommentAttachments`), the entry_from carried through the deferral, and
 *  the send cluster's own deps bag. */
export interface DeferredAnnotationSendDeps {
  streamingAnnotationSendPending: boolean;
  streamingAnnotationSendPendingRef: MutableRefObject<boolean>;
  streaming: boolean;
  sendDisabled: boolean;
  draftRef: MutableRefObject<string>;
  streamingAnnotationSendEntryFromRef: MutableRefObject<ChatAnalyticsEntryFrom | undefined>;
  staged: ChatAttachment[];
  currentCommentAttachments: (extra?: ChatCommentAttachment[]) => ChatCommentAttachment[];
  sendActionDeps: SendActionDeps;
}

/**
 * Flushes a Mark draw-overlay send that arrived while a run was already
 * streaming, once that run finishes: reads `draftRef` (not a closed-over
 * `draft`) since the accumulating annotation handler writes it synchronously
 * and the ref stays authoritative even if this effect's render closure
 * predates the last accumulation, and restores the deferred send's
 * `entry_from: 'mark'` tag.
 */
export function flushDeferredAnnotationSend(deps: DeferredAnnotationSendDeps): void {
  if (!deps.streamingAnnotationSendPending || !deps.streamingAnnotationSendPendingRef.current) return;
  if (deps.streaming || deps.sendDisabled) return;
  const prompt = deps.draftRef.current.trim();
  const pendingEntryFrom = deps.streamingAnnotationSendEntryFromRef.current;
  deps.streamingAnnotationSendEntryFromRef.current = undefined;
  const baseMeta = currentRunContextMeta(deps.sendActionDeps);
  const meta = pendingEntryFrom ? { ...baseMeta, entryFrom: pendingEntryFrom } : baseMeta;
  sendComposedTurn(prompt, deps.staged, deps.currentCommentAttachments(), meta, deps.sendActionDeps);
}
