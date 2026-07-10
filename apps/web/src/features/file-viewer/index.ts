// Public API of the file-viewer slice. Consumers (the FileViewer orchestrator,
// which lives outside the slice) import ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import that
// reaches past it (ADR 0002).

// Pure inspect-override rules: hostile-payload serialization, single-prop map
// updates, source hydration, and the idempotent <style> splicer.
export {
  serializeInspectOverrides,
  updateInspectOverride,
  parseInspectOverridesFromSource,
  applyInspectOverridesToSource,
} from './rules';

// Pure geometry + CSS-length helpers for the board/inspect overlays.
export {
  rgbToHex,
  pxToNumber,
  clamp,
  isClosedLoop,
  rectContains,
  pathIntersectsRect,
  pointInPolygon,
} from './rules';

// UI-only types the orchestrator reads back.
export type {
  InspectOverrideEntry,
  InspectOverrideMap,
  StrokePoint,
} from './types';
