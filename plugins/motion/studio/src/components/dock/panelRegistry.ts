import type { Direction } from "dockview-react";

export const PANEL_IDS = [
  "preview",
  "timeline",
  "compositions",
  "assets",
  "code",
  "catalog",
  "design",
  "layers",
  "renders",
  "variables",
  "slideshow",
  "motionBlur",
  "history",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];
export type PanelZone = "left" | "center" | "right";

export interface PanelDefinition {
  title: string;
  zone: PanelZone;
  /** Where Window > <panel> puts it when it has no saved place: next to `near`. */
  reopen: { near: PanelId; direction: Direction };
  /** Content stays mounted while its tab is hidden (the preview iframe must not reload). */
  keepMounted?: true;
}

export const PANEL_DEFINITIONS = {
  preview: {
    title: "Preview",
    zone: "center",
    reopen: { near: "timeline", direction: "above" },
    keepMounted: true,
  },
  timeline: {
    title: "Timeline",
    zone: "center",
    reopen: { near: "preview", direction: "below" },
    keepMounted: true,
  },
  compositions: {
    title: "Compositions",
    zone: "left",
    reopen: { near: "preview", direction: "left" },
  },
  assets: { title: "Assets", zone: "left", reopen: { near: "compositions", direction: "within" } },
  code: { title: "Code", zone: "left", reopen: { near: "compositions", direction: "within" } },
  catalog: {
    title: "Catalog",
    zone: "left",
    reopen: { near: "compositions", direction: "within" },
  },
  design: { title: "Design", zone: "right", reopen: { near: "preview", direction: "right" } },
  layers: { title: "Layers", zone: "right", reopen: { near: "design", direction: "within" } },
  renders: { title: "Renders", zone: "right", reopen: { near: "design", direction: "within" } },
  variables: { title: "Variables", zone: "right", reopen: { near: "design", direction: "within" } },
  slideshow: { title: "Slideshow", zone: "right", reopen: { near: "design", direction: "within" } },
  motionBlur: {
    title: "Blur",
    zone: "right",
    reopen: { near: "design", direction: "within" },
  },
  history: { title: "Version history", zone: "right", reopen: { near: "design", direction: "within" } },
} as const satisfies Record<PanelId, PanelDefinition>;

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && (PANEL_IDS as readonly string[]).includes(value);
}

export function panelsInZone(zone: PanelZone): PanelId[] {
  return PANEL_IDS.filter((id) => PANEL_DEFINITIONS[id].zone === zone);
}
