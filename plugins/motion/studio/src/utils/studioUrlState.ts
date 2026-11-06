import type { RightPanelTab } from "./studioHelpers";
import { buildProjectHash, parseProjectHashRoute } from "./projectRouting";
import { roundTo3 } from "./rounding";

export interface StudioUrlSelectionTarget {
  sourceFile?: string;
  id?: string;
  selector?: string;
  selectorIndex?: number;
}

export interface StudioUrlSelectionState extends StudioUrlSelectionTarget {
  /**
   * The other members of a multi-selection, primary excluded.
   * A link to a bug in a group edit is only reproducible if it carries the group;
   * without this, opening the URL lands on one element and the report reads as
   * "works for me".
   */
  group?: StudioUrlSelectionTarget[];
}

export interface StudioUrlState {
  activeCompPath: string | null;
  currentTime: number | null;
  rightPanelTab: RightPanelTab | null;
  rightCollapsed: boolean | null;
  timelineVisible: boolean | null;
  selection: StudioUrlSelectionState | null;
}

const VALID_TABS: RightPanelTab[] = [
  "layers",
  "design",
  "renders",
  "slideshow",
  "variables",
  "motionBlur",
];

/**
 * The composition auto-open and a schema-level panel (Variables / Slideshow)
 * target on the master view, where there is no explicit `activeCompPath`.
 * Prefer the `index.html` convention, but fall back to the first entry
 * (composition-browser order) so projects whose entry file is `card.html`,
 * `hero.html`, etc. don't silently mis-target a non-existent `index.html`.
 * Takes the server's filtered composition list, never the raw file tree —
 * a non-composition `.html` (a vendored preset, one with no
 * `data-composition-id`) must never become the target. Returns null when the
 * project carries no composition file at all.
 */
export function resolveMasterCompositionPath(compositions: string[]): string | null {
  if (compositions.includes("index.html")) return "index.html";
  return compositions.find((p) => p.endsWith(".html")) ?? null;
}

/** A URL with no `activeCompPath` needs no hydration step — there's nothing to apply. */
export function isHydratedFromUrlState(urlState: StudioUrlState): boolean {
  return urlState.activeCompPath == null;
}

export function normalizeStudioUrlPanelTab(tab: RightPanelTab | null): RightPanelTab | null {
  if (!tab) return null;
  if (!VALID_TABS.includes(tab)) return null;
  return tab;
}

export function normalizeStudioCompositionPath(
  activeCompPath: string | null,
  fileTree: string[],
): string | null {
  if (!activeCompPath || activeCompPath === "index.html") return null;
  return fileTree.includes(activeCompPath) ? activeCompPath : null;
}

function parseBoolean(value: string | null): boolean | null {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function parseNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTab(value: string | null): RightPanelTab | null {
  return VALID_TABS.includes(value as RightPanelTab) ? (value as RightPanelTab) : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizedIndex(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : undefined;
}

function parseSelectionTarget(value: unknown): StudioUrlSelectionTarget | null {
  if (!value || typeof value !== "object") return null;
  const sourceFile = optionalString(Reflect.get(value, "sourceFile"));
  const id = optionalString(Reflect.get(value, "id"));
  const selector = optionalString(Reflect.get(value, "selector"));
  if (!id && !selector) return null;
  return {
    sourceFile,
    id,
    selector,
    selectorIndex: normalizedIndex(Reflect.get(value, "selectorIndex")),
  };
}

/** The other members of a multi-selection, dropping invalid hand-edited entries. */
function parseGroup(value: string | null): StudioUrlSelectionTarget[] | undefined {
  if (!value) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // Compatibility with links produced by the first id-only implementation.
    const legacy = value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => ({ id }));
    return legacy.length > 0 ? legacy : undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const targets = parsed.map(parseSelectionTarget).filter((target) => target !== null);
  return targets.length > 0 ? targets : undefined;
}

function normalizeSelection(params: URLSearchParams): StudioUrlSelectionState | null {
  const sourceFile = params.get("selFile") || undefined;
  const id = params.get("selId") || undefined;
  const selector = params.get("selSelector") || undefined;
  if (!sourceFile && !id && !selector) return null;

  const selectorIndex = parseNumber(params.get("selIndex"));
  return {
    sourceFile,
    id,
    selector,
    selectorIndex: selectorIndex != null ? Math.max(0, Math.floor(selectorIndex)) : undefined,
    group: parseGroup(params.get("selGroup")),
  };
}

function defaultStudioUrlState(): StudioUrlState {
  return {
    activeCompPath: null,
    currentTime: null,
    rightPanelTab: null,
    rightCollapsed: null,
    timelineVisible: null,
    selection: null,
  };
}

export function parseStudioUrlStateFromHash(hash: string): StudioUrlState {
  const route = parseProjectHashRoute(hash);
  if (!route) return defaultStudioUrlState();

  const { params } = route;
  return {
    activeCompPath: params.get("comp") || null,
    currentTime: parseNumber(params.get("t")),
    rightPanelTab: normalizeStudioUrlPanelTab(parseTab(params.get("tab"))),
    rightCollapsed: parseBoolean(params.get("rc")),
    timelineVisible: parseBoolean(params.get("tv")),
    selection: normalizeSelection(params),
  };
}

export function readStudioUrlStateFromWindow(): StudioUrlState {
  if (typeof window === "undefined") return defaultStudioUrlState();
  return parseStudioUrlStateFromHash(window.location.hash);
}

// Pre-existing param-assembly complexity — surfaced by this PR's line shifts.
// fallow-ignore-next-line complexity
export function buildStudioHash(projectId: string, state: StudioUrlState): string {
  const params = new URLSearchParams();

  params.set("v", "1");
  if (state.activeCompPath) params.set("comp", state.activeCompPath);
  if (state.currentTime != null && Number.isFinite(state.currentTime)) {
    params.set("t", String(Math.max(0, roundTo3(state.currentTime))));
  }
  if (state.rightPanelTab) params.set("tab", state.rightPanelTab);
  if (state.rightCollapsed != null) params.set("rc", state.rightCollapsed ? "1" : "0");
  if (state.timelineVisible != null) params.set("tv", state.timelineVisible ? "1" : "0");
  if (state.selection) {
    if (state.selection.sourceFile) params.set("selFile", state.selection.sourceFile);
    if (state.selection.id) params.set("selId", state.selection.id);
    if (state.selection.selector) params.set("selSelector", state.selection.selector);
    if (typeof state.selection.selectorIndex === "number") {
      params.set("selIndex", String(Math.max(0, Math.floor(state.selection.selectorIndex))));
    }
    if (state.selection.group?.length) {
      params.set("selGroup", JSON.stringify(state.selection.group));
    }
  }

  return buildProjectHash(projectId, params);
}
