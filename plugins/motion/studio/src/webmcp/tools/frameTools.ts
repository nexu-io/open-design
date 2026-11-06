/**
 * `studio_frame`: the eyes.
 *
 * Without this the tool set is a remote control. With it an agent can author a
 * change, look at the instant it affects, judge it, and adjust. That loop is the
 * one thing source alone cannot support, because "what does this look like at
 * 2.4 seconds" is not a question a file can answer.
 *
 * Reuses Studio's existing capture endpoint (`utils/frameCapture`) rather than
 * inventing a second one. The server renders the composition with Puppeteer, so
 * the frame reflects the file on disk, not the live preview DOM.
 */

import { buildFrameCaptureUrl } from "../../utils/frameCapture";
import { toolFailure, toolOk, type ToolResult } from "../toolResult";

export interface FrameToolDeps {
  getProjectId: () => string | null;
  getCompositionPath: () => string | null;
  readPlayhead: () => { currentTime: number; duration: number; isPlaying: boolean };
  requestSeek: (time: number) => void;
  /** Confirms the URL renders. Injected so tests need no network. */
  probeFrame: (url: string) => Promise<{ ok: boolean; status: number }>;
  wait: (ms: number) => Promise<void>;
}

export interface StudioFrameResult {
  /** Fetch this to see the frame. A PNG of the composition at `time`. */
  url: string;
  time: number;
  compositionPath: string;
  /** How long the tool waited for a pending write to settle before capturing. */
  settledMs: number;
}

export interface StudioFrameInput {
  /** Seconds. Omit to capture wherever the playhead already is. */
  time?: number;
  /**
   * Milliseconds to wait before capturing, so a just-written edit is visible.
   * See the staleness note in the description.
   */
  settleMs?: number;
}

/**
 * Long enough to cover the project watcher's 40ms write-stability threshold
 * plus filesystem latency, short enough not to be felt. This is the mitigation
 * for a real, previously-fixed bug: the preview signature is invalidated by a
 * file watcher, and a capture that beats the watcher renders the PRE-edit
 * composition. An agent reading that as "my edit failed" would thrash.
 */
const DEFAULT_SETTLE_MS = 150;
const MAX_SETTLE_MS = 5_000;

export async function studioFrame(
  deps: FrameToolDeps,
  input: StudioFrameInput = {},
): Promise<ToolResult<StudioFrameResult>> {
  const projectId = deps.getProjectId();
  if (!projectId) {
    return toolFailure("blocked", "no project is open");
  }

  if (input.time !== undefined) {
    if (typeof input.time !== "number" || !Number.isFinite(input.time) || input.time < 0) {
      return toolFailure("invalid", "time must be a non-negative, finite number of seconds");
    }
    deps.requestSeek(input.time);
  }

  const settledMs = clampSettle(input.settleMs);
  if (settledMs > 0) await deps.wait(settledMs);

  // Capture whatever the playhead now reads, rather than what was requested:
  // the player clamps, so those can differ and the frame belongs to the former.
  const { currentTime } = deps.readPlayhead();
  const compositionPath = deps.getCompositionPath();
  const url = buildFrameCaptureUrl({ projectId, compositionPath, currentTime });

  const probe = await deps.probeFrame(url);
  if (!probe.ok) {
    return toolFailure(
      "failed",
      `the renderer returned ${probe.status} for this frame`,
      "The composition may not build. Try `hyperframes check`.",
    );
  }

  return toolOk<StudioFrameResult>({
    url,
    time: currentTime,
    compositionPath: compositionPath ?? "index.html",
    settledMs,
  });
}

function clampSettle(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_SETTLE_MS;
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested < 0) {
    return DEFAULT_SETTLE_MS;
  }
  return Math.min(requested, MAX_SETTLE_MS);
}

export const STUDIO_FRAME_INPUT_SCHEMA = {
  type: "object",
  properties: {
    time: {
      type: "number",
      minimum: 0,
      description: "Seconds. Omit to capture wherever the playhead already is.",
    },
    settleMs: {
      type: "integer",
      minimum: 0,
      maximum: MAX_SETTLE_MS,
      description: `Wait this long before capturing so a just-made edit is included. Default ${DEFAULT_SETTLE_MS}.`,
    },
  },
  additionalProperties: false,
} as const;

export const STUDIO_FRAME_DESCRIPTION = [
  "Render the composition to a PNG at a given time and return its URL, so you can",
  "SEE the result instead of inferring it from source. Use this to judge a change:",
  "edit, capture the instant it affects, look, adjust.",
  "The frame is rendered from the file on disk, not the live preview.",
  "A capture taken immediately after an edit can therefore predate that edit, because",
  "the render cache is cleared by a file watcher. The tool waits briefly to cover that;",
  "raise `settleMs` if a frame still looks stale, rather than concluding the edit failed.",
  "Returns `ok: true` with `url` and the `time` actually captured, or `ok: false`.",
].join(" ");
