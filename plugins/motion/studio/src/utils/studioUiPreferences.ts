import { isPreviewQuality, type PreviewQuality } from "@hyperframes/core/preview-quality";
import type { SerializedDockview } from "dockview-react";
import { parseDockLayout } from "../components/dock/dockLayoutSchema";

export type TimelineTimeDisplayMode = "time" | "frame";
export type StudioTheme = "light" | "dark";

export interface StudioUiPreferences {
  timelineVisible?: boolean;
  playbackRate?: number;
  previewQuality?: PreviewQuality;
  audioMuted?: boolean;
  audioVolume?: number;
  thumbnailMode?: "adaptive" | "hidden";
  recentBlocks?: string[];
  snapEnabled?: boolean;
  gridVisible?: boolean;
  rulerVisible?: boolean;
  safeMarginsVisible?: boolean;
  gridSpacing?: number;
  snapToGrid?: boolean;
  /** Timeline magnet: snap clip drags/trims/drops to playhead, clip edges, and beats. */
  timelineSnapEnabled?: boolean;
  /** Audio level meters at the timeline's right edge; hidden unless enabled here. */
  audioMetersVisible?: boolean;
  /** Keeps the main track gapless: deleting a clip closes the gap. Distinct
   *  from `timelineSnapEnabled` ("Magnet", drag/trim snapping). */
  rippleEditEnabled?: boolean;
  /** Transport + ruler readout mode: timecode or frame number. */
  timeDisplayMode?: TimelineTimeDisplayMode;
  /**
   * Timeline zoom mode. Persisted so a zoom PINNED on the first edit survives the
   * post-edit iframe reload — otherwise the store reset to "fit" and the duration
   * change rescaled every clip (the blink-fix's rescale symptom).
   */
  timelineZoomMode?: "fit" | "manual";
  /** Manual timeline zoom percent, paired with `timelineZoomMode: "manual"`. */
  timelineManualZoomPercent?: number;
  /**
   * Expose Studio's editing capabilities to an agentic browser as WebMCP tools.
   * Absent means on: the browser still gates every actual call behind its own
   * permission prompt, so "registered" is not "reachable without consent".
   * Changes take effect on the next Studio reload because registration is
   * intentionally scoped to one mount.
   */
  agentToolsEnabled?: boolean;
  theme?: StudioTheme;
  /** The dock's serialized panel tree; parsed by `parseDockLayout` on read. */
  dockLayout?: SerializedDockview;
  linkedSelectionEnabled?: boolean;
  syncIndicatorsVisible?: boolean;
}

const STUDIO_UI_PREFERENCES_KEY = "hf-studio-ui-preferences";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKeyFor(projectId: string | null, key: string): string {
  return projectId ? `${key}:${projectId}` : key;
}

// fallow-ignore-next-line complexity
function readStorage(storage: Storage | null, key: string): StudioUiPreferences {
  if (!storage) return {};
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const preferences: StudioUiPreferences = {};
    if (typeof parsed.timelineVisible === "boolean") {
      preferences.timelineVisible = parsed.timelineVisible;
    }
    if (typeof parsed.playbackRate === "number" && Number.isFinite(parsed.playbackRate)) {
      preferences.playbackRate = parsed.playbackRate;
    }
    if (isPreviewQuality(parsed.previewQuality)) {
      preferences.previewQuality = parsed.previewQuality;
    }
    if (typeof parsed.audioMuted === "boolean") {
      preferences.audioMuted = parsed.audioMuted;
    }
    if (
      typeof parsed.audioVolume === "number" &&
      Number.isFinite(parsed.audioVolume) &&
      parsed.audioVolume >= 0 &&
      parsed.audioVolume <= 1
    ) {
      preferences.audioVolume = parsed.audioVolume;
    }
    if (parsed.thumbnailMode === "adaptive" || parsed.thumbnailMode === "hidden") {
      preferences.thumbnailMode = parsed.thumbnailMode;
    } else if (typeof parsed.thumbnailsEnabled === "boolean") {
      preferences.thumbnailMode = parsed.thumbnailsEnabled ? "adaptive" : "hidden";
    }
    if (Array.isArray(parsed.recentBlocks)) {
      preferences.recentBlocks = parsed.recentBlocks.filter(
        (v: unknown): v is string => typeof v === "string",
      );
    }
    if (typeof parsed.snapEnabled === "boolean") {
      preferences.snapEnabled = parsed.snapEnabled;
    }
    if (typeof parsed.gridVisible === "boolean") {
      preferences.gridVisible = parsed.gridVisible;
    }
    if (typeof parsed.rulerVisible === "boolean") {
      preferences.rulerVisible = parsed.rulerVisible;
    }
    if (typeof parsed.safeMarginsVisible === "boolean") {
      preferences.safeMarginsVisible = parsed.safeMarginsVisible;
    }
    if (typeof parsed.gridSpacing === "number" && Number.isFinite(parsed.gridSpacing)) {
      preferences.gridSpacing = parsed.gridSpacing;
    }
    if (typeof parsed.snapToGrid === "boolean") {
      preferences.snapToGrid = parsed.snapToGrid;
    }
    if (typeof parsed.timelineSnapEnabled === "boolean") {
      preferences.timelineSnapEnabled = parsed.timelineSnapEnabled;
    }
    if (typeof parsed.audioMetersVisible === "boolean") {
      preferences.audioMetersVisible = parsed.audioMetersVisible;
    }
    if (typeof parsed.rippleEditEnabled === "boolean") {
      preferences.rippleEditEnabled = parsed.rippleEditEnabled;
    }
    if (parsed.theme === "light" || parsed.theme === "dark") preferences.theme = parsed.theme;
    if (parsed.timeDisplayMode === "time" || parsed.timeDisplayMode === "frame") {
      preferences.timeDisplayMode = parsed.timeDisplayMode;
    }
    if (parsed.timelineZoomMode === "fit" || parsed.timelineZoomMode === "manual") {
      preferences.timelineZoomMode = parsed.timelineZoomMode;
    }
    if (
      typeof parsed.timelineManualZoomPercent === "number" &&
      Number.isFinite(parsed.timelineManualZoomPercent)
    ) {
      preferences.timelineManualZoomPercent = parsed.timelineManualZoomPercent;
    }
    if (typeof parsed.agentToolsEnabled === "boolean") {
      preferences.agentToolsEnabled = parsed.agentToolsEnabled;
    }
    if (typeof parsed.linkedSelectionEnabled === "boolean") {
      preferences.linkedSelectionEnabled = parsed.linkedSelectionEnabled;
    }
    if (typeof parsed.syncIndicatorsVisible === "boolean") {
      preferences.syncIndicatorsVisible = parsed.syncIndicatorsVisible;
    }
    const dockLayout = parseDockLayout(parsed.dockLayout);
    if (dockLayout) preferences.dockLayout = dockLayout;
    return preferences;
  } catch {
    return {};
  }
}

/** `projectId` opts a caller into a per-project entry (falls back once to the
 *  shared entry so a project's first read isn't blank). Defaults to `null`:
 *  most callers read once at mount, never on a live project switch. */
export function readStudioUiPreferences(
  storage: Storage | null = getBrowserStorage(),
  projectId: string | null = null,
  key: string = STUDIO_UI_PREFERENCES_KEY,
): StudioUiPreferences {
  const scoped = readStorage(storage, storageKeyFor(projectId, key));
  if (!projectId || Object.keys(scoped).length > 0) return scoped;
  return readStorage(storage, key);
}

export function writeStudioUiPreferences(
  patch: StudioUiPreferences,
  storage: Storage | null = getBrowserStorage(),
  projectId: string | null = null,
  key: string = STUDIO_UI_PREFERENCES_KEY,
) {
  if (!storage) return;
  try {
    const next = {
      ...readStudioUiPreferences(storage, projectId, key),
      ...patch,
    };
    storage.setItem(storageKeyFor(projectId, key), JSON.stringify(next));
  } catch {
    /* localStorage may be unavailable or full */
  }
}
