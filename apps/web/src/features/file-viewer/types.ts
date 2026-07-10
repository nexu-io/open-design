// UI-only types for the file-viewer slice. Pure data shapes with no React,
// transport, or DOM dependency, so slice rules and their tests can import them
// without pulling in the orchestrator (ADR 0002).

/** A point in preview/board coordinate space (pointer path, lasso vertex). */
export type StrokePoint = { x: number; y: number };

/** An axis-aligned rectangle in `{ x, y, width, height }` form. */
export type Rect = { x: number; y: number; width: number; height: number };

/** An axis-aligned rectangle in `{ left, top, width, height }` form. */
export type RectLTWH = { left: number; top: number; width: number; height: number };

/**
 * Loosely-typed inbound shape of a single entry in an `od:inspect-overrides`
 * message. The host does not trust the iframe payload, so every field is
 * `unknown` until `serializeInspectOverrides` re-validates it.
 */
export type InspectOverridePayload = {
  selector?: unknown;
  props?: unknown;
};

/** One host-side inspect override: the selector plus its allow-listed props. */
export type InspectOverrideEntry = {
  selector: string;
  props: Record<string, string>;
};

/** Authoritative host-side override map: elementId -> { selector, props }. */
export type InspectOverrideMap = Record<string, InspectOverrideEntry>;

/**
 * Result of walking an HTML source to strip its persisted inspect-override
 * `<style>` blocks while recording where the real `<head>` boundaries land.
 */
export type InspectSpliceScan = {
  out: string;
  // Position in `out` immediately after the first top-level `<head ...>`
  // open tag, or -1 if no head was found outside raw-text content.
  headOpenEnd: number;
  // Position in `out` at the first top-level `</head>` close tag, or -1.
  headCloseStart: number;
  // Raw inner-text of every real `<style data-od-inspect-overrides>` element
  // discovered during the walk, in source order. Excludes occurrences inside
  // raw-text element contents and HTML comments. Hydration parses these
  // bodies for the host map; the splicer ignores them.
  bodies: string[];
};
