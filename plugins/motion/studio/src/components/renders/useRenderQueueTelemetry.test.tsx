// @vitest-environment happy-dom

// The render request body is the only place the browser can tell the CLI that
// this profile opted out. The CLI's own policy cannot see localStorage or
// DoNotTrack in someone else's browser, so if the body says nothing, the
// server emits render_complete / render_error anyway — attributed to the
// install id rather than the user's, which is worse than attributing it
// correctly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRenderAndReadBody, type MountedQueue } from "./renderQueueTestHarness";

const policyState = { allowed: true };
const mintCalls = vi.fn(() => "browser-user-123");

vi.mock("../../telemetry/policy", () => ({
  browserTelemetryAllowed: () => policyState.allowed,
}));
vi.mock("../../telemetry/config", () => ({
  getAnonymousId: () => mintCalls(),
}));
vi.mock("../../telemetry/events", () => ({
  trackStudioRenderStart: vi.fn(),
}));

const { useRenderQueue } = await import("./useRenderQueue");

let queue: MountedQueue | null = null;

/** Body of the POST the hook makes when a render is started. */
async function startRenderBody(): Promise<Record<string, unknown>> {
  const started = await startRenderAndReadBody(useRenderQueue, {
    opts: { fps: 30, quality: "standard", format: "mp4" },
  });
  queue = started.queue;
  return started.body;
}

beforeEach(() => {
  policyState.allowed = true;
  mintCalls.mockClear();
});

afterEach(() => {
  queue?.unmount();
  queue = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("render request telemetry fields", () => {
  it("sends the browser id when this profile allows telemetry", async () => {
    const body = await startRenderBody();
    expect(body["telemetryDistinctId"]).toBe("browser-user-123");
    expect(body["telemetryOptOut"]).toBeUndefined();
  });

  it("mints no id and says so explicitly when the profile opted out", async () => {
    policyState.allowed = false;
    const body = await startRenderBody();
    // Minting is itself the leak: getAnonymousId() CREATES and persists an
    // identity, so calling it for an opted-out profile is wrong even if the
    // value were never sent.
    expect(mintCalls).not.toHaveBeenCalled();
    expect(body["telemetryDistinctId"]).toBeUndefined();
    // Omission alone would be read as an old client and fall back to the
    // install id — the flag is what actually suppresses the server event.
    expect(body["telemetryOptOut"]).toBe(true);
  });
});
