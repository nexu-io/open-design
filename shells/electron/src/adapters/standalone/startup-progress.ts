import type { StandaloneFeedbackEvent } from "@open-design/standalone";
import type { ElectronStartupProgress } from "@open-design/electron-kit/contracts";

const labels: Record<StandaloneFeedbackEvent["phase"], string> = {
  "channel-discovery": "Checking available version",
  "metadata-verification": "Verifying installation information",
  "sync-planning": "Checking required components",
  "blob-resolution": "Checking local components",
  "blob-download": "Downloading components",
  "blob-verification": "Verifying downloaded components",
  "blob-materialization": "Unpacking and preparing components",
  "sync-ready": "Components ready",
  "generation-prepared": "Preparing the application",
  "closure-starting": "Starting local services",
  "closure-ready": "Local services ready",
  rollback: "Restoring the previous working version",
  failure: "Installation could not complete",
};

/** Product language over observation only; never another installation state machine. */
export function describeElectronStartupFeedback(event: StandaloneFeedbackEvent): ElectronStartupProgress {
  return {
    label: labels[event.phase], state: event.state,
    ...(event.phase === "rollback" ? { mode: "recovery" as const } : {}),
    detail: event.error?.message ?? (event.resourceId?.replaceAll("-", " ") ?? ""),
    resourceId: event.resourceId,
    ...(event.phase === "blob-download" ? { receivedBytes: event.receivedBytes, totalBytes: event.totalBytes } : {}),
  };
}
