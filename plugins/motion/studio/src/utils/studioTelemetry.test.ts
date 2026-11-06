// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildProjectHash } from "./projectRouting";

// The `studio:*` path predates telemetry/config.ts and shipped its own
// opt-out key and its own send loop, so it sat outside both contracts the
// canary work established: the documented opt-out did not silence it, and its
// events carried no cohort assignment. These pin both.

vi.mock("../telemetry/canary", () => ({
  canaryEventProperties: () => ({ "$feature/canary-test-one": "true" }),
}));

// One shared policy now governs this transport, telemetry/client.ts and
// canary enrolment. Exercised directly here so each case names the control
// under test rather than relying on ambient import.meta.env.
const policyState = { allowed: true };
vi.mock("../telemetry/policy", () => ({
  browserTelemetryAllowed: () => policyState.allowed,
}));

describe("studioTelemetry — shared opt-out and canary properties", () => {
  let trackStudioEvent: typeof import("./studioTelemetry").trackStudioEvent;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    policyState.allowed = true;
    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = "";
    vi.resetModules();
    vi.useFakeTimers();
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    ({ trackStudioEvent } = await import("./studioTelemetry"));
  });

  afterEach(() => {
    window.location.hash = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Drain the queue and return the events the batch would have sent. */
  async function sentEvents(): Promise<Array<Record<string, unknown>>> {
    await vi.runOnlyPendingTimersAsync();
    if (fetchMock.mock.calls.length === 0) return [];
    const body = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    const parsed = JSON.parse(body?.body ?? "{}") as { batch?: Array<Record<string, unknown>> };
    return parsed.batch ?? [];
  }

  // Every control the shared policy enforces — documented key, legacy key,
  // navigator.doNotTrack, VITE_HYPERFRAMES_NO_TELEMETRY, Vite dev mode, API
  // key eligibility. Before the policy was shared this transport honoured
  // only the legacy key, so all of the others still emitted `studio:*`.
  it("sends nothing when the shared policy refuses", async () => {
    policyState.allowed = false;
    trackStudioEvent("thing_happened");
    expect(await sentEvents()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches canary assignments to every event", async () => {
    trackStudioEvent("thing_happened");
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.["properties"]).toMatchObject({
      "$feature/canary-test-one": "true",
    });
  });

  // The property is useless if the transport does not attach it: the module
  // has its own test, but nothing there fails if this line is deleted.
  it("stamps every event with a tab id that is stable within the page", async () => {
    trackStudioEvent("first");
    trackStudioEvent("second");
    const events = await sentEvents();
    expect(events).toHaveLength(2);
    const tabIds = events.map((e) => (e["properties"] as Record<string, unknown>)["tab_id"]);
    expect(typeof tabIds[0]).toBe("string");
    expect((tabIds[0] as string).length).toBeGreaterThan(0);
    // Same page, same id — otherwise a burst still reads as several sources.
    expect(tabIds[1]).toBe(tabIds[0]);
  });

  it("lets an explicit property win over the canary mixin", async () => {
    trackStudioEvent("thing_happened", { "$feature/canary-test-one": "false" });
    const events = await sentEvents();
    expect(events[0]?.["properties"]).toMatchObject({
      "$feature/canary-test-one": "false",
    });
  });

  it.each(["fetch", "beacon"] as const)(
    "excludes project names from the complete serialized %s batch",
    async (transport) => {
      const projectName = "Launch #1? v2";
      window.location.hash = buildProjectHash(projectName, { selSelector: "#private-element" });
      const beacon = vi.fn((_url: string, _body: string) => true);
      vi.stubGlobal("navigator", { userAgent: "test", sendBeacon: beacon });
      for (const event of ["feature_used", "keyframe", "design_input", "toolbar_action"]) {
        trackStudioEvent(event);
      }
      if (transport === "beacon") {
        const { flushViaBeacon } = await import("./studioTelemetry");
        flushViaBeacon();
      } else {
        await vi.runOnlyPendingTimersAsync();
      }
      const serialized =
        transport === "beacon"
          ? beacon.mock.calls[0]?.[1]
          : (fetchMock.mock.calls[0]?.[1] as RequestInit)?.body;
      expect(typeof serialized).toBe("string");
      const body = serialized as string;
      expect(body).not.toContain(projectName);
      expect(body).not.toContain(encodeURIComponent(projectName));
      expect(body).not.toContain("private-element");
      expect(body).not.toContain("7aef12cc");
      const payload = JSON.parse(body);
      expect(payload.batch).toHaveLength(4);
      for (const event of payload.batch) {
        expect(event.properties.url_hash).toBe("project");
        expect(event.properties.url_route_id).toMatch(/^[0-9a-f]{8}$/);
      }
    },
  );

  it.each([
    ["", "home"],
    ["#", "home"],
    ["#unknown/Launch%20%231%3F%20v2?selection=secret", "other"],
  ])("sends a finite route kind for %s", async (hash, routeKind) => {
    window.location.hash = hash;
    trackStudioEvent("thing_happened");
    const events = await sentEvents();
    expect(events[0]?.["properties"]).toMatchObject({ url_hash: routeKind });
  });

  it("keeps route identity stable across query changes and distinct across projects", async () => {
    window.location.hash = buildProjectHash("Launch #1? v2");
    trackStudioEvent("session_start");
    window.location.hash = buildProjectHash("Launch #1? v2", { selSelector: "#another-element" });
    trackStudioEvent("feature_used");
    window.location.hash = buildProjectHash("Another launch");
    trackStudioEvent("feature_used");
    const events = await sentEvents();
    const ids = events.map(
      (event) => (event["properties"] as Record<string, unknown>)["url_route_id"],
    );
    expect(ids[0]).toMatch(/^[0-9a-f]{8}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(ids[2]).toMatch(/^[0-9a-f]{8}$/);
  });
  it("reuses a route ID after reloading the same tab", async () => {
    window.location.hash = buildProjectHash("Launch #1? v2");
    trackStudioEvent("session_start");
    const first = (await sentEvents())[0]?.properties as Record<string, unknown>;
    vi.clearAllTimers();
    vi.resetModules();
    fetchMock.mockClear();
    ({ trackStudioEvent } = await import("./studioTelemetry"));
    trackStudioEvent("session_start");
    const second = (await sentEvents())[0]?.properties as Record<string, unknown>;
    expect(second.url_route_id).toBe(first.url_route_id);
  });

  it("assigns different random IDs to the same route in two tabs", async () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    random.mockImplementationOnce((bytes) => {
      (bytes as Uint8Array).set([1, 2, 3, 4]);
      return bytes;
    });
    window.location.hash = buildProjectHash("Launch #1? v2");
    trackStudioEvent("session_start");
    const first = (await sentEvents())[0]?.properties as Record<string, unknown>;
    // A second independent tab has its own sessionStorage and module instance.
    sessionStorage.clear();
    vi.clearAllTimers();
    vi.resetModules();
    fetchMock.mockClear();
    random.mockImplementationOnce((bytes) => {
      (bytes as Uint8Array).set([5, 6, 7, 8]);
      return bytes;
    });
    ({ trackStudioEvent } = await import("./studioTelemetry"));
    trackStudioEvent("session_start");
    const second = (await sentEvents())[0]?.properties as Record<string, unknown>;
    expect(first.url_route_id).toBe("01020304");
    expect(second.url_route_id).toBe("05060708");
    expect(second.url_route_id).not.toBe(first.url_route_id);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
