import type { Direction, DockviewApi } from "dockview-react";
import { DOCK_PANEL_COMPONENT } from "./dockLayoutSchema";
import { PANEL_DEFINITIONS, PANEL_IDS, isPanelId, type PanelId } from "./panelRegistry";

const MIN_PREVIEW_W = 360;
const MIN_PREVIEW_H = 200;
const MIN_TIMELINE_H = 100;
const MIN_SIDE_W = 200;
const MIN_SIDE_W_FLOOR = 120;
const DEFAULT_TIMELINE_H = 360;
const DEFAULT_LEFT = ["compositions", "assets", "code", "catalog"] as const;
const DEFAULT_RIGHT = ["design", "layers", "renders", "variables", "motionBlur"] as const;

/** Preferred side widths; when they overflow the preview's floor the right yields first, then the left. */
export function defaultSideWidths(viewportWidth: number) {
  const floor = sideMinimumWidth(viewportWidth);
  const left = Math.max(floor, Math.min(384, Math.round(viewportWidth * 0.257)));
  const right = Math.max(Math.min(280, floor), Math.min(424, Math.round(viewportWidth * 0.284)));
  const excess = left + right - Math.max(0, viewportWidth - MIN_PREVIEW_W);
  if (excess <= 0) return { left, right };
  const shrunkRight = Math.max(floor, right - excess);
  return { left: Math.max(floor, left - (excess - (right - shrunkRight))), right: shrunkRight };
}

/**
 * Side groups keep MIN_SIDE_W while both fit beside the preview's floor, then shrink down to
 * MIN_SIDE_W_FLOOR; below that the dock overflows and clips rather than squeezing the preview.
 */
export function sideMinimumWidth(dockWidth: number): number {
  const fair = Math.floor((dockWidth - MIN_PREVIEW_W) / 2);
  return Math.min(MIN_SIDE_W, Math.max(MIN_SIDE_W_FLOOR, fair));
}

function holdsPreview(group: DockviewApi["groups"][number]) {
  return group.panels.some((panel) => panel.id === "preview");
}

/** The zone of a group whose every tab is a side panel, else null. */
function sideZone(group: DockviewApi["groups"][number]): "left" | "right" | null {
  const zones = group.panels.map((panel) =>
    isPanelId(panel.id) ? PANEL_DEFINITIONS[panel.id].zone : "center",
  );
  const first = zones[0];
  const allSide = zones.every((zone) => zone !== "center");
  return allSide && first && first !== "center" ? first : null;
}

/** Idempotent; rewrites every group's minimum, since dockview keeps a constraint once set. */
export function applySideMinimums(api: DockviewApi, dockWidth = window.innerWidth) {
  const minimumWidth = sideMinimumWidth(dockWidth);
  const cap = defaultSideWidths(dockWidth);
  for (const group of api.groups) {
    if (holdsPreview(group)) {
      group.api.setConstraints({ minimumWidth: MIN_PREVIEW_W });
      continue;
    }
    group.api.setConstraints({ minimumWidth });
    const zone = sideZone(group);
    const limit = zone === "right" ? cap.right : cap.left;
    if (zone && minimumWidth < MIN_SIDE_W && group.width > limit) {
      group.api.setSize({ width: limit });
    }
  }
}

function minimumSize(id: PanelId) {
  if (id === "preview") return { minimumWidth: MIN_PREVIEW_W, minimumHeight: MIN_PREVIEW_H };
  if (id === "timeline") return { minimumHeight: MIN_TIMELINE_H };
  return { minimumWidth: MIN_SIDE_W };
}

export function addRegisteredPanel(
  api: DockviewApi,
  id: PanelId,
  position?: { referencePanel?: PanelId; direction: Direction },
) {
  return api.addPanel({
    id,
    component: DOCK_PANEL_COMPONENT,
    title: PANEL_DEFINITIONS[id].title,
    renderer: "always",
    ...minimumSize(id),
    ...(position ? { position } : {}),
  });
}

function addSideColumn(
  api: DockviewApi,
  ids: readonly PanelId[],
  panels: readonly PanelId[],
  direction: "left" | "right",
) {
  const [first, ...rest] = ids.filter((id) => panels.includes(id));
  if (!first) return undefined;
  addRegisteredPanel(api, first, { referencePanel: "preview", direction });
  for (const id of rest)
    addRegisteredPanel(api, id, { referencePanel: first, direction: "within" });
  api.getPanel(first)?.api.setActive();
  return first;
}

/** The default Edit layout: [library | preview | inspector] over a full-width timeline. */
export function buildEditLayout(
  api: DockviewApi,
  viewportWidth: number,
  panels: readonly PanelId[] = PANEL_IDS,
) {
  api.clear();
  const widths = defaultSideWidths(viewportWidth);
  addRegisteredPanel(api, "preview");
  addRegisteredPanel(api, "timeline", { referencePanel: "preview", direction: "below" });
  const left = addSideColumn(api, DEFAULT_LEFT, panels, "left");
  const right = addSideColumn(api, DEFAULT_RIGHT, panels, "right");
  applySideMinimums(api, viewportWidth);
  if (left) api.getPanel(left)?.group.api.setSize({ width: widths.left });
  if (right) api.getPanel(right)?.group.api.setSize({ width: widths.right });
  api.getPanel("timeline")?.group.api.setSize({ height: DEFAULT_TIMELINE_H });
}
