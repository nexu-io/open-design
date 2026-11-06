import { trackStudioEvent } from "./studioTelemetry";

export type PreviewFeature =
  | "move"
  | "resize"
  | "rotate"
  | "crop"
  | "nudge"
  | "multi_select"
  | "z_order"
  | "text_edit"
  | "motion_path"
  | "gesture_recording"
  | "snapping"
  | "grid"
  | "grid_spacing"
  | "snap_to_grid"
  | "ruler"
  | "safe_margins";

export type PreviewMethod = "drag" | "button" | "keyboard" | "field";

export interface GeometryCommitResult {
  ok: true;
  changed: boolean;
}

export function trackPreviewFeatureUsed(feature: PreviewFeature, method: PreviewMethod): void {
  trackStudioEvent("feature_used", { feature, surface: "preview", method });
}

export function trackPreviewEditResult(
  feature: PreviewFeature,
  method: PreviewMethod,
  result: unknown,
): void {
  if (typeof result !== "object" || result === null) return;
  if (Reflect.get(result, "ok") === false) return;
  const persistence = Reflect.get(result, "persistence");
  const changed =
    Reflect.get(result, "changed") === true ||
    (typeof persistence === "object" &&
      persistence !== null &&
      Reflect.get(persistence, "changed") === true);
  if (changed) trackPreviewFeatureUsed(feature, method);
}
