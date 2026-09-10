import { expect, it } from "vitest";
import { describeElectronStartupFeedback } from "@/adapters/standalone/startup-progress.js";
import type { StandaloneFeedbackEvent } from "@open-design/standalone";

const event: StandaloneFeedbackEvent = { schemaVersion: 1, operationId: "prepare", sequence: 1,
  channel: "betahyx", namespace: "test", phase: "blob-download", state: "progress",
  resourceId: "application-runtime", receivedBytes: 25, totalBytes: 100 };

it("translates actual bytes without converting them into an overall installation percentage", () => {
  expect(describeElectronStartupFeedback(event)).toEqual({ label: "Downloading components", state: "progress",
    detail: "application runtime", resourceId: "application-runtime", receivedBytes: 25, totalBytes: 100 });
});
it("does not reuse download percentages for unpacking and retains useful errors", () => {
  expect(describeElectronStartupFeedback({ ...event, phase: "blob-materialization" })).not.toHaveProperty("receivedBytes");
  expect(describeElectronStartupFeedback({ ...event, phase: "failure", state: "failed", error: { code: "disk", message: "Not enough disk space" } }))
    .toMatchObject({ label: "Installation could not complete", detail: "Not enough disk space", state: "failed" });
});
