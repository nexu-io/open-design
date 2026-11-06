/* ── Public constants ──────────────────────────────────────────────── */
export {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_WIDTH_PROP,
  STUDIO_HEIGHT_PROP,
  STUDIO_MANUAL_EDIT_GESTURE_ATTR,
} from "@hyperframes/core/editing/draft-markers";
export const STUDIO_ROTATION_PROP = "--hf-studio-rotation";

/* ── Internal DOM attribute names ─────────────────────────────────── */
export const STUDIO_PATH_OFFSET_ATTR = "data-hf-studio-path-offset";
export const STUDIO_EDIT_MOMENT_ATTR = "data-hf-studio-edit-at";
export interface EditMoment {
  time: number;
  keyframePct: number | null;
}
export const STUDIO_BOX_SIZE_ATTR = "data-hf-studio-box-size";
export const STUDIO_ROTATION_ATTR = "data-hf-studio-rotation";
export const STUDIO_ORIGINAL_TRANSLATE_ATTR = "data-hf-studio-original-translate";
export const STUDIO_ORIGINAL_INLINE_TRANSLATE_ATTR = "data-hf-studio-original-inline-translate";
export const STUDIO_ORIGINAL_WIDTH_ATTR = "data-hf-studio-original-width";
export const STUDIO_ORIGINAL_HEIGHT_ATTR = "data-hf-studio-original-height";
/**
 * The element's laid-out box before a resize draft touched it, in CSS pixels.
 *
 * The two attributes above record the element's INLINE width and height so a
 * reset can put them back, and are empty for the usual case of an element sized
 * by the stylesheet. That made them useless as a measurement, and the resize
 * intercept, which needs the original box to work out a scale, fell back to a
 * hardcoded guess and produced a wildly wrong one. These record the measurement
 * instead, and restore nothing.
 */
export const STUDIO_ORIGINAL_BOX_WIDTH_ATTR = "data-hf-studio-original-box-width";
export const STUDIO_ORIGINAL_BOX_HEIGHT_ATTR = "data-hf-studio-original-box-height";
export const STUDIO_ORIGINAL_MIN_WIDTH_ATTR = "data-hf-studio-original-min-width";
export const STUDIO_ORIGINAL_MIN_HEIGHT_ATTR = "data-hf-studio-original-min-height";
export const STUDIO_ORIGINAL_MAX_WIDTH_ATTR = "data-hf-studio-original-max-width";
export const STUDIO_ORIGINAL_MAX_HEIGHT_ATTR = "data-hf-studio-original-max-height";
export const STUDIO_ORIGINAL_FLEX_BASIS_ATTR = "data-hf-studio-original-flex-basis";
export const STUDIO_ORIGINAL_FLEX_GROW_ATTR = "data-hf-studio-original-flex-grow";
export const STUDIO_ORIGINAL_FLEX_SHRINK_ATTR = "data-hf-studio-original-flex-shrink";
export const STUDIO_ORIGINAL_BOX_SIZING_ATTR = "data-hf-studio-original-box-sizing";
export const STUDIO_ORIGINAL_SCALE_ATTR = "data-hf-studio-original-scale";
export const STUDIO_ORIGINAL_TRANSFORM_ORIGIN_ATTR = "data-hf-studio-original-transform-origin";
export const STUDIO_ORIGINAL_DISPLAY_ATTR = "data-hf-studio-original-display";
export const STUDIO_ORIGINAL_ROTATE_ATTR = "data-hf-studio-original-rotate";
export const STUDIO_ORIGINAL_INLINE_ROTATE_ATTR = "data-hf-studio-original-inline-rotate";
export const STUDIO_ORIGINAL_ROTATION_TRANSFORM_ORIGIN_ATTR =
  "data-hf-studio-original-rotation-transform-origin";
export const STUDIO_ROTATION_DRAFT_ATTR = "data-hf-studio-rotation-draft";
export const STUDIO_ORIGINAL_TRANSFORM_DISPLAY_ATTR = "data-hf-studio-original-transform-display";

/* ── Internal window property names ──────────────────────────────── */
export const STUDIO_MANUAL_EDITS_APPLY_PROP = "__hfStudioManualEditsApply";
export const STUDIO_MANUAL_EDITS_WRAPPED_PROP = "__hfStudioManualEditsWrapped";
export const STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP = "__hfStudioManualEditsPlaybackFrame";

export const STUDIO_ROTATION_TRANSFORM_ORIGIN = "center center";

export type StudioManualEditSeekWindow = Window & {
  __hf?: Record<string, unknown>;
  __player?: Record<string, unknown>;
  __timeline?: Record<string, unknown>;
  __timelines?: Record<string, Record<string, unknown>>;
  __hfStudioManualEditsApply?: () => void;
  __hfStudioManualEditsPlaybackFrame?: number | null;
};

/* ── Snapshot types (used by drag/drop restore) ───────────────────── */
export interface StudioBoxSizeSnapshot {
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  flexBasis: string;
  flexGrow: string;
  flexShrink: string;
  boxSizing: string;
  scale: string;
  transformOrigin: string;
  display: string;
  studioWidth: string;
  studioHeight: string;
  marker: string | null;
  originalWidth: string | null;
  originalHeight: string | null;
  originalBoxWidth: string | null;
  originalBoxHeight: string | null;
  originalMinWidth: string | null;
  originalMinHeight: string | null;
  originalMaxWidth: string | null;
  originalMaxHeight: string | null;
  originalFlexBasis: string | null;
  originalFlexGrow: string | null;
  originalFlexShrink: string | null;
  originalBoxSizing: string | null;
  originalScale: string | null;
  originalTransformOrigin: string | null;
  originalDisplay: string | null;
}

export interface StudioRotationSnapshot {
  rotate: string;
  transform: string;
  display: string;
  transformOrigin: string;
  studioRotation: string;
  marker: string | null;
  draftMarker: string | null;
  originalRotate: string | null;
  originalInlineRotate: string | null;
  originalTransformOrigin: string | null;
}

export interface StudioPathOffsetSnapshot {
  translate: string;
  x: string;
  y: string;
  marker: string | null;
  originalTranslate: string | null;
  originalInlineTranslate: string | null;
}
