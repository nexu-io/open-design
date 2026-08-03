export type ManualEditKind = 'text' | 'link' | 'image' | 'container' | 'token';

export interface ManualEditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ManualEditFields {
  text?: string;
  href?: string;
  src?: string;
  alt?: string;
}

export interface ManualEditStyles {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textDecorationLine: string;
  color: string;
  textAlign: string;
  lineHeight: string;
  letterSpacing: string;
  whiteSpace: string;
  display: string;
  position: string;
  left: string;
  top: string;
  right: string;
  bottom: string;
  zIndex: string;
  width: string;
  height: string;
  minHeight: string;
  gap: string;
  flexDirection: string;
  justifyContent: string;
  alignItems: string;
  backgroundColor: string;
  opacity: string;
  transform: string;
  padding: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  margin: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  border: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  borderStyle: string;
  borderColor: string;
  borderRadius: string;
}

/**
 * Styles accepted by the live-preview channel (`od-edit-preview-style`).
 * Gesture previews additionally drive `transform` so a move never forces the
 * iframe to re-layout per frame; `transform` is preview-only and must never
 * reach a `set-style` patch (an empty string clears it on commit/cancel).
 */
export type ManualEditPreviewStyles = Partial<ManualEditStyles> & { transform?: string };

/**
 * Ratio between the viewport pixels `rect` is measured in and the CSS pixels
 * the element's own `left` / `top` / `width` are written in. Anything above
 * the element can scale that space — a deck stage fits a 1920x1080 slide by
 * scaling a wrapper — so gestures must divide screen deltas by this before
 * persisting them, or the element moves/resizes by only `scale` of what the
 * user dragged. `1` when nothing between the element and the viewport scales.
 */
export interface ManualEditSpaceScale {
  x: number;
  y: number;
}

export interface ManualEditTarget {
  id: string;
  kind: ManualEditKind;
  label: string;
  tagName: string;
  className: string;
  text: string;
  rect: ManualEditRect;
  /** Absent on targets from older bridges; treat as `{ x: 1, y: 1 }`. */
  scale?: ManualEditSpaceScale;
  fields: ManualEditFields;
  attributes: Record<string, string>;
  styles: ManualEditStyles;
  isLayoutContainer: boolean;
  isHidden?: boolean;
  outerHtml: string;
}

export type ManualEditPatch =
  | { id: string; kind: 'set-text'; value: string }
  | { id: string; kind: 'set-link'; text: string; href: string }
  | { id: string; kind: 'set-image'; src: string; alt: string }
  | { id: string; kind: 'remove-element' }
  | { id: string; kind: 'duplicate-element' }
  | { id: string; kind: 'set-inner-html'; html: string }
  | { id: string; kind: 'insert-html'; html: string }
  | { kind: 'set-token'; token: string; value: string }
  | { id: string; kind: 'set-style'; styles: Partial<ManualEditStyles> }
  | { id: string; kind: 'set-attributes'; attributes: Record<string, string> }
  | { id: string; kind: 'set-outer-html'; html: string }
  | { kind: 'set-full-source'; source: string };

export interface ManualEditHistoryEntry {
  id: string;
  label: string;
  patch: ManualEditPatch;
  beforeSource: string;
  afterSource: string;
  /**
   * Runtime-only targets have no element markup in before/afterSource. Keep
   * the live content snapshots that correspond to those source states so
   * undo/redo can replay them through the in-place bridge instead of forcing
   * a srcDoc reload.
   */
  runtimeBeforeFields?: Record<string, unknown>;
  runtimeAfterFields?: Record<string, unknown>;
  createdAt: number;
}

export interface ManualEditTargetMessage {
  type: 'od-edit-targets';
  targets: ManualEditTarget[];
}

export interface ManualEditSelectMessage {
  type: 'od-edit-select';
  target: ManualEditTarget;
}

export interface ManualEditHoverMessage {
  type: 'od-edit-hover';
  target: ManualEditTarget;
}

export interface ManualEditBackgroundMessage {
  type: 'od-edit-background';
}

export interface ManualEditPreviewAppliedMessage {
  type: 'od-edit-preview-style-applied';
  id: string;
  version: number;
  ok: boolean;
  error?: string;
  /**
   * The element's rect after the preview landed. Only measured for previews
   * that change layout (`width` / `height`), so a resize gesture can track the
   * height the reflowed content actually took instead of freezing the frame at
   * the pre-drag height. `null` for compositor-only previews.
   */
  rect?: ManualEditRect | null;
}

export interface ManualEditTextCommitMessage {
  type: 'od-edit-text-commit';
  id: string;
  value: string;
}

export interface ManualEditTextSessionMessage {
  type: 'od-edit-text-session';
  id: string;
  active: boolean;
  changed?: boolean;
  committed?: boolean;
}

/**
 * Commit for an inline text session whose element now carries inline markup
 * (e.g. a bold span produced by the floating toolbar). `set-text` would
 * collapse that markup, so the bridge escalates to an innerHTML commit and the
 * host persists it through the `set-inner-html` patch.
 */
export interface ManualEditHtmlCommitMessage {
  type: 'od-edit-html-commit';
  id: string;
  value: string;
}

/**
 * Character-run formatting state at the current caret/selection, queried from
 * the iframe so the floating toolbar can highlight B/I/U/S to match what the
 * text actually renders with — element-level `draftStyles` can't see a bold
 * span produced by range formatting.
 */
export interface ManualEditTextSelectionFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

/** Live caret/selection state inside the active inline text session. */
export interface ManualEditTextSelectionMessage {
  type: 'od-edit-text-selection';
  id: string;
  hasRange: boolean;
  /**
   * Formatting state of the current selection (null when the caret is not
   * inside the editing element). Drives the toolbar's active-button feedback.
   */
  format?: ManualEditTextSelectionFormat | null;
}

/** Keyboard shortcut forwarded from the iframe (Cmd/Ctrl+Z / Shift+Z). */
export interface ManualEditHistoryKeyMessage {
  type: 'od-edit-history';
  op: 'undo' | 'redo';
}

/** Delete/Backspace pressed with a selected (non-editing) target. */
export interface ManualEditDeleteRequestMessage {
  type: 'od-edit-delete-request';
  id: string;
}

/** Cmd/Ctrl+D pressed with a selected (non-editing) target. */
export interface ManualEditDuplicateRequestMessage {
  type: 'od-edit-duplicate-request';
  id: string;
}

/** Cmd/Ctrl+C with a selected (non-editing) target: copy the whole element. */
export interface ManualEditCopyRequestMessage {
  type: 'od-edit-copy-request';
  id: string;
}

/**
 * Cmd/Ctrl+V with no image on the clipboard: paste the copied element as a
 * NEW element block after the anchor (`id` is the current selection, or ''
 * when nothing is selected — the host falls back to the copied element).
 */
export interface ManualEditPasteRequestMessage {
  type: 'od-edit-paste-request';
  id: string;
}

/**
 * An image arrived via clipboard paste or an OS file drag-drop. The host
 * uploads it to the project and inserts a fresh `<img>` element after the
 * anchor (`id` is the selection / deepest element under the drop point; ''
 * appends to the end of the body).
 *
 * The bridge sends BYTES, not the `File` handle: clipboard/drag Files can be
 * neutered once the event turn ends, and uploading a postMessage-cloned
 * handle then fails with net::ERR_UPLOAD_FILE_CHANGED. The bridge reads the
 * payload into an ArrayBuffer inside the event turn; the host rebuilds a
 * fresh File for the upload pipeline.
 */
export interface ManualEditPasteImageMessage {
  type: 'od-edit-paste-image';
  id: string;
  name: string;
  mime: string;
  buffer: ArrayBuffer;
}

/**
 * Ack for `od-edit-apply-dom` — the in-place DOM restore used by undo/redo so
 * reverting a patch does not reload the iframe. `ok: false` tells the host to
 * fall back to a frozen-source reload.
 */
export interface ManualEditApplyDomResultMessage {
  type: 'od-edit-apply-dom-result';
  version: number;
  ok: boolean;
}

export type ManualEditBridgeMessage =
  | ManualEditTargetMessage
  | ManualEditSelectMessage
  | ManualEditHoverMessage
  | ManualEditBackgroundMessage
  | ManualEditPreviewAppliedMessage
  | ManualEditTextCommitMessage
  | ManualEditTextSessionMessage
  | ManualEditHtmlCommitMessage
  | ManualEditTextSelectionMessage
  | ManualEditHistoryKeyMessage
  | ManualEditDeleteRequestMessage
  | ManualEditDuplicateRequestMessage
  | ManualEditCopyRequestMessage
  | ManualEditPasteRequestMessage
  | ManualEditPasteImageMessage
  | ManualEditApplyDomResultMessage;

export const MANUAL_EDIT_STYLE_PROPS: readonly (keyof ManualEditStyles)[] = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecorationLine',
  'color', 'textAlign', 'lineHeight', 'letterSpacing', 'whiteSpace',
  'display', 'position', 'left', 'top', 'right', 'bottom', 'zIndex',
  'width', 'height', 'minHeight',
  'gap', 'flexDirection', 'justifyContent', 'alignItems',
  'backgroundColor', 'opacity', 'transform',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'border', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'borderColor', 'borderRadius',
];

export function emptyManualEditStyles(): ManualEditStyles {
  return MANUAL_EDIT_STYLE_PROPS.reduce<ManualEditStyles>((acc, key) => {
    acc[key] = '';
    return acc;
  }, {} as ManualEditStyles);
}

/**
 * Cheap equality over the fields the overlay chrome actually renders from a
 * targets broadcast (identity, geometry, label state). The bridge re-posts
 * targets on scroll settle, resize, and mutation-observer bursts; when nothing
 * the host renders has changed, the handler keeps the previous array identity
 * so a broadcast doesn't re-render the whole viewer for a no-op.
 */
export function manualEditTargetsLightEqual(
  a: readonly ManualEditTarget[],
  b: readonly ManualEditTarget[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.label !== y.label ||
      x.text !== y.text ||
      x.isHidden !== y.isHidden ||
      x.isLayoutContainer !== y.isLayoutContainer ||
      x.rect.x !== y.rect.x ||
      x.rect.y !== y.rect.y ||
      x.rect.width !== y.rect.width ||
      x.rect.height !== y.rect.height
    ) {
      return false;
    }
  }
  return true;
}
