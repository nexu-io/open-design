import { buildProjectApiPath } from "../../utils/projectRouting";
import { resolvePreviewRelative } from "../../utils/previewRelativePath";
import { authoredSrcPath, resolveMediaPreviewUrl } from "./thumbnailUtils";
import type { TimelineElement } from "../store/timelineElement";
import { parseAutomation, VOLUME_TARGET } from "@hyperframes/core/audio-automation";
import type { TimelineEditOutcome } from "../../hooks/timelineEditPermission";
import { studioApiFetch } from "../../utils/studioApiFetch";

export interface NormalizePlan {
  targetLufs: number;
  projectedLufs: number;
  volume: number;
  changeDb: number;
  limitedBy: "gain-ceiling" | "true-peak" | null;
}

export function clipHasSound(el: TimelineElement): boolean {
  if (el.tag === "audio") return true;
  return el.tag === "video" && el.hasAudio === true && el.muted !== true;
}

export const VOLUME_LANE_REFUSAL =
  "This clip's volume is automated. Remove its volume automation to normalize it.";

export function volumeLaneOwnsGain(el: TimelineElement): boolean {
  if (!el.automation) return false;
  try {
    return parseAutomation(el.automation).lanes.some(
      (lane) => lane.target === VOLUME_TARGET && lane.points.length > 0,
    );
  } catch {
    return false;
  }
}

export class TimelineSaveError extends Error {}

export function throwUnlessSaved(outcome: TimelineEditOutcome | void): void {
  if (outcome && outcome.status !== "saved") throw new TimelineSaveError(outcome.reason);
}

export function normalizeRequestBody(el: TimelineElement, projectRelativeSrc: string) {
  return {
    id: el.domId ?? el.id,
    src: projectRelativeSrc,
    mediaStart: el.playbackStart ?? 0,
    duration: el.duration > 0 ? el.duration : undefined,
    playbackRate: el.playbackRate ?? 1,
    volume: el.volume ?? 1,
  };
}

const signedDb = (db: number) => `${db >= 0 ? "+" : "−"}${Math.abs(db).toFixed(1)} dB`;
const lufsText = (lufs: number) => `${lufs < 0 ? "−" : ""}${Math.abs(lufs).toFixed(0)} LUFS`;

const LIMIT_SUFFIX = {
  "gain-ceiling": "the most the +12 dB ceiling allows",
  "true-peak": "held back to keep peaks under −1.5 dBTP",
} satisfies Record<NonNullable<NormalizePlan["limitedBy"]>, string>;

export function normalizeToastText(plan: NormalizePlan): string {
  if (!plan.limitedBy)
    return `Normalized to ${lufsText(plan.targetLufs)} (${signedDb(plan.changeDb)})`;
  const reached = `${lufsText(Math.round(plan.projectedLufs))}`;
  return `Raised to ${reached} (${signedDb(plan.changeDb)}), ${LIMIT_SUFFIX[plan.limitedBy]}`;
}

function isNormalizePlan(value: unknown): value is NormalizePlan {
  if (typeof value !== "object" || value === null) return false;
  return ["targetLufs", "projectedLufs", "volume", "changeDb"].every(
    (key) => typeof Reflect.get(value, key) === "number",
  );
}

export async function requestNormalizePlan(
  projectId: string,
  el: TimelineElement,
  fetchImpl: typeof studioApiFetch = studioApiFetch,
): Promise<NormalizePlan> {
  const origin = window.location.origin;
  const relative = resolvePreviewRelative(
    resolveMediaPreviewUrl(authoredSrcPath(el.src ?? ""), projectId, origin),
    projectId,
    origin,
  );
  if (!relative) throw new Error("Only project media can be normalized");
  const res = await fetchImpl(buildProjectApiPath(projectId, "/loudness/normalize"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(normalizeRequestBody(el, relative)),
  });
  const body: unknown = await res.json().catch(() => null);
  const plan = typeof body === "object" && body !== null ? Reflect.get(body, "plan") : null;
  if (res.ok && isNormalizePlan(plan)) return plan;
  const error = typeof body === "object" && body !== null ? Reflect.get(body, "error") : null;
  throw new Error(typeof error === "string" ? error : "Could not measure this clip");
}
